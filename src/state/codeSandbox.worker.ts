// ── Code-node preview sandbox worker ──────────────────────────────────────
// Runs the Code node's transpiled preview body off the main thread and out of
// the app's own JS realm. A Worker has no DOM/window/localStorage/cookies by
// spec and can't navigate the parent — but it *does* retain fetch, XHR,
// WebSocket, EventSource, importScripts, indexedDB, caches, BroadcastChannel,
// and the ability to spawn sub-workers, so those are explicitly closed below
// before anything else runs. Execution-time limits are enforced by the main
// thread (codeSandboxRuntime.ts) via a per-request timeout + worker.terminate()
// — this file has no cooperative timeout of its own, since untrusted code
// can't be trusted to yield.
//
// `new Function` is still used here to run the transpiled body — that's fine
// specifically *because* this is an isolated worker realm with the above
// closed off: there's nothing dangerous left for compiled code to reach.

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { hsv, palAt, CRGB_CONSTANTS, CODE_PALETTES, type RGB, type Palette } from './ledColor'
import { makeShims } from './fastledShims'

// ── Bootstrap: close network/storage/messaging/navigation before anything
// else runs. Capture postMessage first so this file can still reply. ────────
const realPostMessage = self.postMessage.bind(self)
const g = self as unknown as Record<string, unknown>
g.fetch = undefined
g.XMLHttpRequest = undefined
g.WebSocket = undefined
g.EventSource = undefined
g.importScripts = undefined
g.indexedDB = undefined
g.caches = undefined
g.BroadcastChannel = undefined
g.Worker = undefined
g.SharedWorker = undefined
g.postMessage = undefined
if (g.navigator) {
  (g.navigator as Record<string, unknown>).sendBeacon = undefined
}

// ── Worker message protocol ─────────────────────────────────────────────────
export interface RunRequest {
  id: number
  /** `globalCode + ' ' + code`, used only to detect when a recompile is needed. */
  cacheKey: string
  /** Already transpiled (C++-ish → JS) by the main thread; this worker only compiles/runs it. */
  body: string
  t: number
  W: number
  H: number
  /** Packed W×H×3 RGB bytes to seed `leds[]` from a wired frame input, or null if unwired. */
  seed: Uint8ClampedArray | null
}
export interface RunResponse {
  id: number
  /** Packed W×H×3 RGB bytes — the persistent leds[] buffer after this run (or the last-good one on error). */
  pixels: Uint8ClampedArray
  error: string | null
}

type CodeFn = (leds: RGB[], NUM_LEDS: number, WIDTH: number, HEIGHT: number, t: number, shim: Record<string, unknown>) => void

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ── Persistent per-worker state (this worker instance IS one Code-node
// instance's state — fade-trails accumulate across `run` messages the same
// way FastLED's global leds[] persists across loop() calls). ────────────────
let leds: RGB[] = []
let compiledKey: string | null = null
let compiledFn: CodeFn | null = null
let compileError: string | null = null

// FastLED vocabulary the transpiled body runs against — identical to the
// main-thread evaluator's former `makeCodeShim`, just relocated here.
function makeCodeShim(ledsRef: RGB[], t: number, W: number, H: number) {
  const N = ledsRef.length
  const c8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const inRange = (i: number) => i >= 0 && i < N
  return {
    ...makeShims(t),
    CHSV: (h: number, s = 255, v = 255) => hsv((h / 255) * 360, s / 255, v / 255),
    CRGB: (r: number, gr: number, b: number) => ({ r: c8(r), g: c8(gr), b: c8(b) }),
    beat8: (bpm: number) => Math.floor((t * bpm / 60) * 256) % 256,
    beat16: (bpm: number) => Math.floor((t * bpm / 60) * 65536) % 65536,
    random8: (lim?: number) => Math.floor(Math.random() * (lim ?? 256)),
    random16: (lim?: number) => Math.floor(Math.random() * (lim ?? 65536)),
    millis: () => t * 1000,
    XY: (x: number, y: number) =>
      Math.max(0, Math.min(H - 1, y | 0)) * W + Math.max(0, Math.min(W - 1, x | 0)),
    addLed: (i: number, c: RGB) => {
      i |= 0
      if (inRange(i) && c) ledsRef[i] = { r: Math.min(255, ledsRef[i].r + c.r), g: Math.min(255, ledsRef[i].g + c.g), b: Math.min(255, ledsRef[i].b + c.b) }
    },
    setLed: (i: number, c: RGB) => { i |= 0; if (inRange(i) && c) ledsRef[i] = { r: c8(c.r), g: c8(c.g), b: c8(c.b) } },
    fadeToBlackBy: (arr: RGB[], n: number, amount: number) => {
      const k = (255 - c8(amount)) / 255
      const m = Math.min(n | 0, arr.length)
      for (let i = 0; i < m; i++) arr[i] = { r: arr[i].r * k, g: arr[i].g * k, b: arr[i].b * k }
    },
    crgbConst: (name: string): RGB => CRGB_CONSTANTS[name] ?? { r: 0, g: 0, b: 0 },
    fill_solid: (arr: RGB[], n: number, c: RGB) => {
      const m = Math.min(n | 0, arr.length)
      for (let i = 0; i < m; i++) arr[i] = c ? { r: c8(c.r), g: c8(c.g), b: c8(c.b) } : { r: 0, g: 0, b: 0 }
    },
    fill_rainbow: (arr: RGB[], n: number, hue: number, dHue = 5) => {
      const m = Math.min(n | 0, arr.length)
      for (let i = 0; i < m; i++) arr[i] = hsv((((hue + i * dHue) % 256 + 256) % 256) / 255 * 360, 1, 1)
    },
    nblend: (a: RGB, b: RGB, amount: number) => {
      if (!a || !b) return a
      const k = c8(amount) / 255
      a.r = Math.round(a.r + (b.r - a.r) * k)
      a.g = Math.round(a.g + (b.g - a.g) * k)
      a.b = Math.round(a.b + (b.b - a.b) * k)
      return a
    },
    ...CODE_PALETTES,
    NOBLEND: 0, LINEARBLEND: 1, LINEARBLEND_NOWRAP: 2,
    CRGBPalette16: (...cols: unknown[]): Palette => {
      const stops = cols.filter((c): c is RGB => !!c && typeof c === 'object' && 'r' in (c as RGB))
      if (stops.length) return stops.map((c) => ({ r: c8(c.r), g: c8(c.g), b: c8(c.b) }))
      if (cols.length === 1 && (typeof cols[0] === 'string' || Array.isArray(cols[0]))) return cols[0] as Palette
      return 'rainbow'
    },
    ColorFromPalette: (pal: Palette, index: number, bright = 255): RGB => palAt(pal, index, bright),
    fill_palette: (arr: RGB[], n: number, startIndex: number, indexInc: number, pal: Palette, bright = 255): void => {
      const m = Math.min(n | 0, arr.length)
      for (let i = 0; i < m; i++) arr[i] = palAt(pal, startIndex + i * indexInc, bright)
    },
  }
}
/** Compile (if needed), run one tick against the persistent `leds[]`, and pack
 *  the result. Exported separately from the `self.onmessage` wiring below so
 *  it can be unit tested without invoking the module's bootstrap side effects. */
export function handleRunRequest(req: RunRequest): RunResponse {
  const { id, cacheKey, body, t, W, H, seed } = req
  const N = W * H

  if (compiledKey !== cacheKey) {
    compiledKey = cacheKey
    try {
      compiledFn = new Function('leds', 'NUM_LEDS', 'WIDTH', 'HEIGHT', 't', 'shim',
        '"use strict"; const { CHSV,CRGB,beatsin16,beatsin8,beat8,beat16,sin8,cos8,sin16,qadd8,qsub8,scale8,triwave8,quadwave8,cubicwave8,ease8InOutQuad,ease8InOutCubic,blend8,lerp8by8,lerp16by16,sqrt16,nscale8,random8,random16,millis,XY,addLed,setLed,fadeToBlackBy,crgbConst,fill_solid,fill_rainbow,nblend,ColorFromPalette,fill_palette,CRGBPalette16,NOBLEND,LINEARBLEND,LINEARBLEND_NOWRAP,RainbowColors_p,RainbowStripeColors_p,OceanColors_p,LavaColors_p,ForestColors_p,PartyColors_p,HeatColors_p,CloudColors_p } = shim; ' + body
      ) as CodeFn
      compileError = null
    } catch (err) {
      compiledFn = null
      compileError = errMsg(err)
    }
  }

  if (leds.length !== N) {
    leds = Array.from({ length: N }, () => ({ r: 0, g: 0, b: 0 }))
  }
  if (seed) {
    for (let i = 0; i < N; i++) {
      leds[i] = { r: seed[i * 3], g: seed[i * 3 + 1], b: seed[i * 3 + 2] }
    }
  }

  let error: string | null = null
  if (compiledFn) {
    try {
      compiledFn(leds, N, W, H, t, makeCodeShim(leds, t, W, H))
    } catch (err) {
      error = errMsg(err)
    }
  } else {
    error = compileError ?? 'compile error'
  }

  const pixels = new Uint8ClampedArray(N * 3)
  for (let i = 0; i < N; i++) {
    const px = leds[i]
    pixels[i * 3] = px.r; pixels[i * 3 + 1] = px.g; pixels[i * 3 + 2] = px.b
  }
  return { id, pixels, error }
}

self.onmessage = (e: MessageEvent<RunRequest>) => {
  const response = handleRunRequest(e.data)
  realPostMessage(response, [response.pixels.buffer])
}

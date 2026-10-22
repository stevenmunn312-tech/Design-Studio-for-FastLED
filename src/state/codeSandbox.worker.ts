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

import {
  hsv, palAt, gradientPaletteStops, CRGB_CONSTANTS, CODE_PALETTES, NOBLEND, LINEARBLEND, LINEARBLEND_NOWRAP,
  type RGB, type Palette,
} from './palettes/ledColor'
import { makeShims } from '../nodes/shared/fastledShims'

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
  /** The Global section, already transpiled (C++-ish → JS) by the main thread.
   *  Runs once per compile; its variables persist across frames like file-scope C++. */
  globalBody: string
  /** The Loop section, already transpiled; runs every frame. */
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

type Shim = Record<string, unknown>
type CodeFn = (leds: RGB[], NUM_LEDS: number, WIDTH: number, HEIGHT: number, t: number, shim: Shim) => void
/** Runs the Global section once and returns the per-frame loop function. */
type CodeFactory = (leds: RGB[], NUM_LEDS: number, WIDTH: number, HEIGHT: number, t: number, shim: Shim) => CodeFn

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ── Persistent per-worker state (this worker instance IS one Code-node
// instance's state — fade-trails accumulate across `run` messages the same
// way FastLED's global leds[] persists across loop() calls). ────────────────
let leds: RGB[] = []
let compiledKey: string | null = null
let compiledFn: CodeFn | null = null
let compileError: string | null = null
/** EVERY_N_* timers: last-fire time in evaluator milliseconds, keyed by the
 *  macro's number in the source. Reset on recompile, as fresh statics would be. */
let timers = new Map<number, number>()
/** Period overrides from `name.setPeriod(x)` on the named `_I` timers. */
let timerPeriods = new Map<number, number>()

// Every name the compiled code sees from the shim. Destructured once at
// global scope (so global helpers can call them) and rebound each frame,
// since the shim closes over that frame's `t` and `leds`. A name the pasted
// code declares itself — its own `XY`, a custom `fadeToBlackBy` — is left out
// of both lists, so the user's definition wins in both sections.
export const SHIM_NAMES = [
  'CHSV', 'CRGB', 'beatsin16', 'beatsin8', 'beat8', 'beat16', 'sin8', 'cos8', 'sin16', 'qadd8', 'qsub8', 'scale8',
  'triwave8', 'quadwave8', 'cubicwave8', 'ease8InOutQuad', 'ease8InOutCubic', 'blend8', 'lerp8by8', 'lerp16by16',
  'sqrt16', 'nscale8', 'scale8_video', 'HeatColor', 'random8', 'random16', 'millis', 'micros', 'XY', 'addLed', 'maxLed', 'subLed', 'setLed',
  'addPx', 'maxPx', 'subPx', 'setPx', 'rgbMethod', 'fadeToBlackBy', 'fadeLightBy', 'crgbConst', 'fill_solid',
  'fill_rainbow', 'nblend', 'blend', 'ColorFromPalette', 'fill_palette', 'CRGBPalette16', 'CRGBPalette32',
  'CRGBPalette256', 'gradientPalette', 'fill_gradient_RGB', 'fill_gradient', 'nblendPaletteTowardPalette',
  'NOBLEND', 'LINEARBLEND', 'LINEARBLEND_NOWRAP', 'FORWARD_HUES', 'BACKWARD_HUES', 'SHORTEST_HUES', 'LONGEST_HUES',
  'HUE_RED', 'HUE_ORANGE', 'HUE_YELLOW', 'HUE_GREEN', 'HUE_AQUA', 'HUE_BLUE', 'HUE_PURPLE', 'HUE_PINK',
  'RainbowColors_p', 'RainbowStripeColors_p', 'OceanColors_p', 'LavaColors_p', 'ForestColors_p', 'PartyColors_p',
  'HeatColors_p', 'CloudColors_p', 'everyN', 'everyNSetPeriod', 'everyNReset',
  'FastLED', 'Serial', 'delay', 'delayMicroseconds', 'random', 'map', 'constrain', 'min', 'max', 'abs',
  'pow', 'sqrt', 'sin', 'cos', 'tan', 'floor', 'ceil', 'round', 'PI', 'TWO_PI', 'HALF_PI', 'DEG_TO_RAD', 'RAD_TO_DEG',
]

/** Names the transpiled source declares itself (`function f`, `let`/`const`
 *  declarators), so the shim never binds over them. */
export function declaredNames(src: string): Set<string> {
  const names = new Set<string>()
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  const declRe = /\b(?:let|const|var)\s+/g
  for (let m = declRe.exec(src); m; m = declRe.exec(src)) {
    let i = m.index + m[0].length
    for (;;) {
      const nm = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))
      if (!nm) break
      names.add(nm[0])
      i += nm[0].length
      let depth = 0
      let sep = ''
      for (; i < src.length; i++) {
        const c = src[i]
        if (c === '(' || c === '[' || c === '{') depth++
        else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth-- }
        else if ((c === ';' || c === ',') && depth === 0) { sep = c; break }
      }
      if (sep !== ',') break
      i += 1 + (/^\s*/.exec(src.slice(i + 1))?.[0].length ?? 0)
    }
  }
  return names
}

/** Build the factory: the Global section runs in the factory body, so its
 *  variables and helpers live in the closure the loop function keeps. The
 *  loop function rebinds `leds`, the size constants, `t` and the shim names
 *  each frame before running the Loop section. */
function compileSections(globalBody: string, body: string): CodeFactory {
  const user = new Set([...declaredNames(globalBody), ...declaredNames(body)])
  const names = SHIM_NAMES.filter((n) => !user.has(n)).join(', ')
  return new Function('_leds', '_N', '_W', '_H', '_t', '_shim',
    '"use strict";\n' +
    'let leds = _leds, NUM_LEDS = _N, WIDTH = _W, HEIGHT = _H, t = _t;\n' +
    `let { ${names} } = _shim;\n` +
    globalBody + '\n' +
    'return function (_leds, _N, _W, _H, _t, _shim) {\n' +
    'leds = _leds; NUM_LEDS = _N; WIDTH = _W; HEIGHT = _H; t = _t;\n' +
    `({ ${names} } = _shim);\n` +
    body + '\n};',
  ) as CodeFactory
}

/** A CHSV value: the RGB the preview paints, carrying its hue/sat/val so
 *  `fill_gradient` can interpolate in HSV as FastLED does. */
interface HSVRGB extends RGB { h: number; s: number; v: number }

const c8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const isRGB = (c: unknown): c is RGB => !!c && typeof c === 'object' && 'r' in (c as RGB)
/** Any CRGB-ish argument to a plain RGB: an object (copied), a `0xRRGGBB` number, or black. */
function toRGB(c: unknown): RGB {
  if (isRGB(c)) return { r: c8(c.r), g: c8(c.g), b: c8(c.b) }
  if (typeof c === 'number') return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 }
  return { r: 0, g: 0, b: 0 }
}
function chsv(h: number, s = 255, v = 255): HSVRGB {
  // Hue is a uint8_t on the board: CHSV(300, …) wraps to 44, it does not clip.
  h = ((Math.round(h) % 256) + 256) % 256; s = c8(s); v = c8(v)
  return { ...hsv((h / 255) * 360, s / 255, v / 255), h, s, v }
}
function toHSV(c: unknown): { h: number; s: number; v: number } {
  if (c && typeof c === 'object' && 'h' in (c as HSVRGB)) { const x = c as HSVRGB; return { h: x.h, s: x.s, v: x.v } }
  const { r, g, b } = toRGB(c)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = ((h * 60 + 360) % 360) / 360 * 255
  }
  return { h: c8(h), s: max ? c8((d / max) * 255) : 0, v: c8(max) }
}
const lerpRGB = (a: RGB, b: RGB, f: number): RGB => ({
  r: Math.round(a.r + (b.r - a.r) * f), g: Math.round(a.g + (b.g - a.g) * f), b: Math.round(a.b + (b.b - a.b) * f),
})

/** `fill_gradient_RGB(arr, start, c1, end, c2)`: entries `start..end` inclusive, linear in RGB. */
function fillSpanRGB(arr: RGB[], start: number, c1: RGB, end: number, c2: RGB): void {
  if (end < start) { [start, end] = [end, start]; [c1, c2] = [c2, c1] }
  const span = end - start || 1
  for (let i = Math.max(0, start); i <= end && i < arr.length; i++) arr[i] = lerpRGB(c1, c2, (i - start) / span)
}

/** FastLED's `fill_gradient` hue walk: which way round the wheel, and how far. */
function hueWalk(h1: number, h2: number, dir: number): number {
  const forward = (h2 - h1 + 256) % 256
  const backward = (h1 - h2 + 256) % 256
  let d = dir
  if (d === 2) d = forward > 127 ? 1 : 0           // SHORTEST_HUES
  else if (d === 3) d = forward < 128 ? 1 : 0      // LONGEST_HUES
  return d === 1 ? -backward : forward             // BACKWARD_HUES / FORWARD_HUES
}

function fillSpanHSV(arr: RGB[], start: number, c1: unknown, end: number, c2: unknown, dir: number): void {
  if (end < start) { [start, end] = [end, start]; [c1, c2] = [c2, c1] }
  const a = toHSV(c1), b = toHSV(c2)
  const dh = hueWalk(a.h, b.h, dir)
  const span = end - start || 1
  for (let i = Math.max(0, start); i <= end && i < arr.length; i++) {
    const f = (i - start) / span
    arr[i] = chsv(((a.h + dh * f) % 256 + 256) % 256, a.s + (b.s - a.s) * f, a.v + (b.v - a.v) * f)
  }
}

/** The shared argument shapes of `fill_gradient_RGB` and `fill_gradient`:
 *  `(arr, n, c1, c2[, c3[, c4]][, dir])` or `(arr, start, c1, end, c2[, dir])`. */
function fillGradient(arr: RGB[], args: unknown[], span: (arr: RGB[], s: number, a: unknown, e: number, b: unknown, dir: number) => void): void {
  if (!Array.isArray(arr)) return
  const rest = [...args]
  let dirArg = 2
  if (rest.length > 3 && typeof rest[rest.length - 1] === 'number' && isRGB(rest[rest.length - 2])) dirArg = rest.pop() as number
  if (rest.length >= 4 && typeof rest[2] === 'number' && isRGB(rest[1]) && isRGB(rest[3])) {
    span(arr, (rest[0] as number) | 0, rest[1], rest[2] | 0, rest[3], dirArg)
    return
  }
  const n = Math.min((rest[0] as number) | 0, arr.length)
  const cols = rest.slice(1).filter((c) => isRGB(c) || typeof c === 'number')
  if (n <= 0 || cols.length === 0) return
  const last = n - 1
  if (cols.length === 1) { span(arr, 0, cols[0], last, cols[0], dirArg); return }
  if (cols.length === 2) { span(arr, 0, cols[0], last, cols[1], dirArg); return }
  if (cols.length === 3) {
    const half = Math.floor(n / 2)
    span(arr, 0, cols[0], half, cols[1], dirArg)
    span(arr, half, cols[1], last, cols[2], dirArg)
    return
  }
  const one = Math.floor(n / 3), two = Math.floor((n * 2) / 3)
  span(arr, 0, cols[0], one, cols[1], dirArg)
  span(arr, one, cols[1], two, cols[2], dirArg)
  span(arr, two, cols[2], last, cols[3], dirArg)
}

/** `CRGBPalette16(...)` and siblings: a preset or entry list is taken as is,
 *  one colour fills every entry, and two to four colours spread into a
 *  gradient over the `size` entries, as FastLED's constructors do. */
function makePalette(cols: unknown[], size: number): Palette {
  if (cols.length === 1) {
    const c = cols[0]
    if (typeof c === 'string') return c
    if (Array.isArray(c)) {
      // A brace initialiser lists the entries; C++ zero-fills the rest.
      const entries = c.map(toRGB)
      while (entries.length < size) entries.push({ r: 0, g: 0, b: 0 })
      return entries
    }
  }
  const entries = cols.filter((c) => isRGB(c) || typeof c === 'number').map(toRGB)
  if (entries.length === 0) return Array.from({ length: size }, () => ({ r: 0, g: 0, b: 0 }))
  if (entries.length === 1) return Array.from({ length: size }, () => ({ ...entries[0] }))
  if (entries.length <= 4) {
    const arr: RGB[] = Array.from({ length: size }, () => ({ r: 0, g: 0, b: 0 }))
    fillGradient(arr, [size, ...entries], (a, s, c1, e, c2) => fillSpanRGB(a, s, toRGB(c1), e, toRGB(c2)))
    return arr
  }
  return entries
}

/** The CRGB member functions the transpiler routes through `rgbMethod`. */
function rgbMethod(target: RGB, name: string, ...args: number[]): unknown {
  if (!isRGB(target)) return target
  const scale = (k: number) => { target.r = c8(target.r * k); target.g = c8(target.g * k); target.b = c8(target.b * k) }
  switch (name) {
    case 'nscale8': case 'nscale8_video': scale(c8(args[0]) / 255); return target
    case 'fadeToBlackBy': case 'fadeLightBy': scale((255 - c8(args[0])) / 255); return target
    case 'setHSV': Object.assign(target, toRGB(chsv(args[0], args[1], args[2]))); return target
    case 'setRGB': target.r = c8(args[0]); target.g = c8(args[1]); target.b = c8(args[2]); return target
    case 'addToRGB': target.r = c8(target.r + args[0]); target.g = c8(target.g + args[0]); target.b = c8(target.b + args[0]); return target
    case 'subtractFromRGB': target.r = c8(target.r - args[0]); target.g = c8(target.g - args[0]); target.b = c8(target.b - args[0]); return target
    case 'maximizeBrightness': {
      const m = Math.max(target.r, target.g, target.b)
      if (m) scale(c8(args[0] ?? 255) / m)
      return target
    }
    case 'getAverageLight': return Math.floor((target.r + target.g + target.b) / 3)
    case 'getLuma': return (target.r * 54 + target.g * 183 + target.b * 18) >> 8
  }
  return target
}

const noop = () => undefined
/** FastLED's scale8_video: scales but never drops a non-zero input to zero. */
const scale8Video = (i: number, scale: number): number => ((c8(i) * c8(scale)) >> 8) + (c8(i) && c8(scale) ? 1 : 0)
/** FastLED's HeatColor: black → red → yellow → white over a 0–255 temperature. */
function heatColor(temperature: number): RGB {
  const t192 = scale8Video(temperature, 191)
  const ramp = (t192 & 0x3F) << 2
  if (t192 & 0x80) return { r: 255, g: 255, b: ramp }
  if (t192 & 0x40) return { r: 255, g: ramp, b: 0 }
  return { r: ramp, g: 0, b: 0 }
}
/** FastLED/Arduino `random(lim)` or `random(min, lim)`, with the type's full range as the default limit. */
const randomIn = (a: number | undefined, b: number | undefined, full: number): number =>
  (b === undefined ? Math.floor(Math.random() * (a ?? full)) : (a ?? 0) + Math.floor(Math.random() * (b - (a ?? 0))))
const chain = { setCorrection() { return chain }, setTemperature() { return chain }, setDither() { return chain }, setRgbw() { return chain } }

// FastLED vocabulary the transpiled body runs against — identical to the
// main-thread evaluator's former `makeCodeShim`, just relocated here.
function makeCodeShim(ledsRef: RGB[], t: number, W: number, H: number): Shim {
  const N = ledsRef.length
  const inRange = (i: number) => i >= 0 && i < N
  const nowMs = t * 1000
  const write = (arr: RGB[], i: number, c: unknown, mix: (a: RGB, b: RGB) => RGB) => {
    i |= 0
    if (Array.isArray(arr) && i >= 0 && i < arr.length && c !== undefined && c !== null) arr[i] = mix(arr[i] ?? { r: 0, g: 0, b: 0 }, toRGB(c))
  }
  const add = (a: RGB, b: RGB): RGB => ({ r: Math.min(255, a.r + b.r), g: Math.min(255, a.g + b.g), b: Math.min(255, a.b + b.b) })
  const max = (a: RGB, b: RGB): RGB => ({ r: Math.max(a.r, b.r), g: Math.max(a.g, b.g), b: Math.max(a.b, b.b) })
  const sub = (a: RGB, b: RGB): RGB => ({ r: Math.max(0, a.r - b.r), g: Math.max(0, a.g - b.g), b: Math.max(0, a.b - b.b) })
  const set = (_a: RGB, b: RGB): RGB => b
  const fade = (arr: RGB[], n: number, amount: number) => {
    const k = (255 - c8(amount)) / 255
    const m = Math.min(n | 0, Array.isArray(arr) ? arr.length : 0)
    for (let i = 0; i < m; i++) arr[i] = { r: arr[i].r * k, g: arr[i].g * k, b: arr[i].b * k }
  }
  return {
    ...makeShims(t),
    // FastLED's CEveryNTime: created on first reach with its trigger time set
    // to now, fires once `period` has elapsed, and re-arms from the fire time.
    // `setPeriod` on a named (`_I`) timer overrides the period in the source.
    everyN: (key: number, periodMs: number): boolean => {
      const prev = timers.get(key)
      if (prev === undefined) { timers.set(key, nowMs); return false }
      if (nowMs - prev < (timerPeriods.get(key) ?? periodMs)) return false
      timers.set(key, nowMs)
      return true
    },
    everyNSetPeriod: (key: number, periodMs: number): void => { timerPeriods.set(key, periodMs) },
    everyNReset: (key: number): void => { timers.set(key, nowMs) },
    CHSV: chsv,
    CRGB: (r: unknown, gr?: number, b?: number): RGB => (gr === undefined ? toRGB(r) : { r: c8(r as number), g: c8(gr), b: c8(b ?? 0) }),
    beat8: (bpm: number) => Math.floor((t * bpm / 60) * 256) % 256,
    beat16: (bpm: number) => Math.floor((t * bpm / 60) * 65536) % 65536,
    random8: (a?: number, b?: number) => randomIn(a, b, 256),
    random16: (a?: number, b?: number) => randomIn(a, b, 65536),
    random: (a?: number, b?: number) => randomIn(a, b, 2147483647),
    scale8_video: scale8Video,
    HeatColor: heatColor,
    millis: () => t * 1000,
    micros: () => t * 1e6,
    XY: (x: number, y: number) =>
      Math.max(0, Math.min(H - 1, y | 0)) * W + Math.max(0, Math.min(W - 1, x | 0)),
    addLed: (i: number, c: RGB) => { i |= 0; if (inRange(i) && c) ledsRef[i] = add(ledsRef[i], toRGB(c)) },
    maxLed: (i: number, c: RGB) => { i |= 0; if (inRange(i) && c) ledsRef[i] = max(ledsRef[i], toRGB(c)) },
    subLed: (i: number, c: RGB) => { i |= 0; if (inRange(i) && c) ledsRef[i] = sub(ledsRef[i], toRGB(c)) },
    setLed: (i: number, c: RGB) => { i |= 0; if (inRange(i) && c) ledsRef[i] = toRGB(c) },
    addPx: (arr: RGB[], i: number, c: unknown) => write(arr, i, c, add),
    maxPx: (arr: RGB[], i: number, c: unknown) => write(arr, i, c, max),
    subPx: (arr: RGB[], i: number, c: unknown) => write(arr, i, c, sub),
    setPx: (arr: RGB[], i: number, c: unknown) => write(arr, i, c, set),
    rgbMethod,
    fadeToBlackBy: fade,
    fadeLightBy: fade,
    crgbConst: (name: string): RGB => ({ ...(CRGB_CONSTANTS[name] ?? { r: 0, g: 0, b: 0 }) }),
    fill_solid: (arr: RGB[], n: number, c: RGB) => {
      const m = Math.min(n | 0, arr.length)
      for (let i = 0; i < m; i++) arr[i] = toRGB(c)
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
    blend: (a: unknown, b: unknown, amount: number): RGB => lerpRGB(toRGB(a), toRGB(b), c8(amount) / 255),
    ...CODE_PALETTES,
    NOBLEND, LINEARBLEND, LINEARBLEND_NOWRAP,
    FORWARD_HUES: 0, BACKWARD_HUES: 1, SHORTEST_HUES: 2, LONGEST_HUES: 3,
    HUE_RED: 0, HUE_ORANGE: 32, HUE_YELLOW: 64, HUE_GREEN: 96, HUE_AQUA: 128, HUE_BLUE: 160, HUE_PURPLE: 192, HUE_PINK: 224,
    CRGBPalette16: (...cols: unknown[]): Palette => makePalette(cols, 16),
    CRGBPalette32: (...cols: unknown[]): Palette => makePalette(cols, 32),
    CRGBPalette256: (...cols: unknown[]): Palette => makePalette(cols, 256),
    gradientPalette: (bytes: number[]): Palette => gradientPaletteStops(bytes),
    ColorFromPalette: (pal: Palette, index: number, bright = 255, blend = LINEARBLEND): RGB => palAt(pal, index, bright, blend),
    fill_palette: (arr: RGB[], n: number, startIndex: number, indexInc: number, pal: Palette, bright = 255, blend = LINEARBLEND): void => {
      const m = Math.min(n | 0, arr.length)
      for (let i = 0; i < m; i++) arr[i] = palAt(pal, startIndex + i * indexInc, bright, blend)
    },
    fill_gradient_RGB: (arr: RGB[], ...args: unknown[]): void =>
      fillGradient(arr, args, (a, s, c1, e, c2) => fillSpanRGB(a, s, toRGB(c1), e, toRGB(c2))),
    fill_gradient: (arr: RGB[], ...args: unknown[]): void => fillGradient(arr, args, fillSpanHSV),
    // Each entry's channels step one unit toward the target, at most
    // `maxChanges` steps per call — FastLED's palette crossfade.
    nblendPaletteTowardPalette: (current: Palette, target: Palette, maxChanges = 24): void => {
      if (!Array.isArray(current) || !Array.isArray(target)) return
      let changes = 0
      for (let i = 0; i < current.length && i < target.length && changes < maxChanges; i++) {
        const c = current[i], tg = target[i]
        for (const k of ['r', 'g', 'b'] as const) {
          if (c[k] === tg[k]) continue
          c[k] += c[k] < tg[k] ? 1 : -1
          changes++
        }
      }
    },
    // Sketch plumbing that a pasted header or loop may call: harmless here.
    FastLED: {
      show: noop, delay: noop, clearData: noop, setBrightness: noop, getBrightness: () => 255, addLeds: () => chain,
      setCorrection: noop, setTemperature: noop, setDither: noop, setMaxPowerInVoltsAndMilliamps: noop,
      setMaxPowerInMilliWatts: noop, setMaxRefreshRate: noop, getFPS: () => 60, countFPS: noop,
      clear: () => { for (let i = 0; i < N; i++) ledsRef[i] = { r: 0, g: 0, b: 0 } },
    },
    Serial: { begin: noop, print: noop, println: noop, printf: noop, write: noop, flush: noop, available: () => 0, read: () => -1 },
    delay: noop, delayMicroseconds: noop,
    map: (x: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
      Math.trunc((x - inMin) * (outMax - outMin) / ((inMax - inMin) || 1) + outMin),
    constrain: (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x)),
    min: Math.min, max: Math.max, abs: Math.abs, pow: Math.pow, sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    PI: Math.PI, TWO_PI: Math.PI * 2, HALF_PI: Math.PI / 2, DEG_TO_RAD: Math.PI / 180, RAD_TO_DEG: 180 / Math.PI,
  }
}
/** Compile (if needed), run one tick against the persistent `leds[]`, and pack
 *  the result. Exported separately from the `self.onmessage` wiring below so
 *  it can be unit tested without invoking the module's bootstrap side effects. */
export function handleRunRequest(req: RunRequest): RunResponse {
  const { id, cacheKey, globalBody, body, t, W, H, seed } = req
  const N = W * H

  if (leds.length !== N) {
    leds = Array.from({ length: N }, () => ({ r: 0, g: 0, b: 0 }))
  }
  if (seed) {
    for (let i = 0; i < N; i++) {
      leds[i] = { r: seed[i * 3], g: seed[i * 3 + 1], b: seed[i * 3 + 2] }
    }
  }

  // Compile after leds[] is sized: the Global section runs here, and a
  // global initialiser may touch leds[] or NUM_LEDS.
  if (compiledKey !== cacheKey) {
    compiledKey = cacheKey
    timers = new Map()
    timerPeriods = new Map()
    try {
      compiledFn = compileSections(globalBody, body)(leds, N, W, H, t, makeCodeShim(leds, t, W, H))
      compileError = null
    } catch (err) {
      compiledFn = null
      compileError = errMsg(err)
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

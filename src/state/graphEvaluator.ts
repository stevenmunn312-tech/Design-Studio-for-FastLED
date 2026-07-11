import type { StudioNode, StudioEdge } from './graphStore'
import { useAudioStore } from './audioStore'
import { useUiStore } from './uiStore'
import { asFont, textColumns, type BitmapFont, DEFAULT_FONT } from './font'
import { animatedImageFrame, asAnimatedImage, asImage, sampleImageToFrame, type ImageData } from './image'
import { waveSample, combineWaves } from './wave'
import { polinePalette, hexToRgb } from './polinePalette'
import { inputClampRange } from './nodeLibrary'
import { makeShims, SHIM_NAMES } from './fastledShims'
import { sampleNamedPalette } from './paletteCatalog'
import { createBeatDetectorState, denormalizeBeatParam, updateBeatDetectorFromSpectrum } from '../audio/beatDetection'
import { denormalizeAudioFlowParam } from './audioFlowRange'
import { SPEED_MAX, SCALE_MAX, NOISE_SPEED_MAX, NOISE_SCALE_MAX, denormRate } from './speedRange'
import { particleRadius } from './particleScale'

export interface RGB { r: number; g: number; b: number }
export type Frame = RGB[][]   // row-major [y][x]
/** A per-pixel scalar grid, length W×H (row-major, index y*W+x), values 0–1. */
export type Field = Float32Array

// Default grid dimensions; overridden by evaluateGraph params
const DEFAULT_W = 16
const DEFAULT_H = 16

function normalizedCenterAxis(value: number, size: number, extent: number, wrap: boolean): number {
  if (wrap) return size * 0.5 - size + value * (size * 2)
  const margin = extent + 1
  return 0.5 - margin + value * (Math.max(0, size - 1) + 2 * margin)
}

// ── Persistent state for stateful pattern nodes ───────────────────────────────
const fireHeat    = new Map<string, number[][]>()
const flashLevel  = new Map<string, number>()
const counterVals = new Map<string, number>()
// Interval (metronome) node — last fire time in seconds, keyed by state id.
const intervalLast = new Map<string, number>()
// Smooth node — smoothed value + the time it was last advanced.
const smoothState = new Map<string, { v: number; t: number }>()
// SampleHold node — the latched value + previous trigger level (edge detect).
const holdState = new Map<string, { v: number; prev: boolean }>()
// Envelope node — trigger fire time (seconds) + previous trigger level.
const envState = new Map<string, { fire: number; prev: boolean }>()
// Trails node — the persisted, fading accumulator frame.
const trailState = new Map<string, Frame>()
const fftLevels   = new Map<string, { bass: number; mids: number; treble: number }>()
const beatLevels  = new Map<string, ReturnType<typeof createBeatDetectorState>>()
type AudioFeatureState = {
  prevSpectrum: number[]
  kick: number
  snare: number
  hihat: number
  vocals: number
  energy: number
  silence: boolean
}
const percussionLevels = new Map<string, AudioFeatureState>()
const audioFeatureLevels = new Map<string, AudioFeatureState>()

interface Particle { x: number; y: number; vx: number; vy: number; life: number; r: number; g: number; b: number; seed?: number }
const particleState = new Map<string, Particle[]>()
const patternShowState = new Map<string, ShowState>()

interface RDState { u: Float32Array; v: Float32Array; un: Float32Array; vn: Float32Array; w: number; h: number }
const rdState = new Map<string, RDState>()

interface GolState { cells: Uint8Array; next: Uint8Array; bright: Float32Array; w: number; h: number; lastStep: number; stale: number }
const golState = new Map<string, GolState>()

interface WaveSimState { prev: Float32Array; cur: Float32Array; next: Float32Array; w: number; h: number; prevTrigger: boolean; pulse: number }
const waveSimState = new Map<string, WaveSimState>()

interface FlowState { px: Float32Array; py: Float32Array; trail: Float32Array; w: number; h: number }
const flowState = new Map<string, FlowState>()

interface StarState { x: Float32Array; y: Float32Array; z: Float32Array; w: number; h: number }
const starState = new Map<string, StarState>()

interface BoidState { x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; w: number; h: number }
const boidState = new Map<string, BoidState>()

interface SparkState { frame: Frame; w: number; h: number }
const sparkState = new Map<string, SparkState>()

// ── New audio-reactive pattern state ──────────────────────────────────────
// KickShock — pool of expanding shockwave rings, spawned on kick/snare edges.
interface ShockRing { born: number; kind: 0 | 1 }
interface KickShockState { rings: (ShockRing | null)[]; next: number; prevKick: boolean; prevSnare: boolean }
const kickShockState = new Map<string, KickShockState>()
// BeatKaleidoscope — a decaying "punch" level, same shape as BeatFlash's flashLevel.
const kaleidoPunch = new Map<string, number>()
// PercussionBlobs — pool of metaball blobs, spawned on kick/snare/hihat edges.
interface Blob { x: number; y: number; born: number; kind: 0 | 1 | 2 }
interface PercussionBlobsState { blobs: (Blob | null)[]; next: number; prevKick: boolean; prevSnare: boolean; prevHihat: boolean }
const percussionBlobsState = new Map<string, PercussionBlobsState>()
// EmberPulse — a decaying beat-triggered "ember burst" level.
const emberBurst = new Map<string, number>()
// RainRipples — pool of expanding ripples, spawned on a trigger rising edge.
interface Ripple { x: number; y: number; born: number }
interface RainRipplesState { ripples: (Ripple | null)[]; next: number; prevTrig: boolean }
const rainRipplesState = new Map<string, RainRipplesState>()
// PrismStorm — held shard orientation (degrees), snapped on a hihat rising edge.
const prismOrientation = new Map<string, { v: number; prev: boolean }>()

// Per-pixel formula closure. Args are positional and shared by CustomFormula and
// FieldFormula: x, y, cx, cy, r, angle, t, W, H, a, b, fieldIn, then the FastLED
// shims (sin8, cos8, …) in SHIM_NAMES order.
type FormulaFn = (...args: unknown[]) => number
const FORMULA_ARG_NAMES = ['x', 'y', 'cx', 'cy', 'r', 'angle', 't', 'W', 'H', 'a', 'b', 'fieldIn', ...SHIM_NAMES]
const formulaCache = new Map<string, FormulaFn | null>()
const fieldFormulaCache = new Map<string, FormulaFn | null>()

function compileFormula(formula: string, cache: Map<string, FormulaFn | null>): FormulaFn | null {
  if (!cache.has(formula)) {
    if (cache.size > 50) cache.clear()
    try {
      const fn = new Function(...FORMULA_ARG_NAMES,
        `"use strict"; const {sin,cos,abs,sqrt,pow,floor,ceil,round,min,max,PI,tan,atan2,log,exp,hypot}=Math; return (${formula});`
      ) as FormulaFn
      cache.set(formula, fn)
    } catch {
      cache.set(formula, null)
    }
  }
  return cache.get(formula) ?? null
}

// Code node: compiled JS bodies (transpiled from pasted C++) keyed by source,
// plus a persistent flat leds[] per node-instance so fade-trails accumulate
// across frames the way FastLED's global leds[] does.
type CodeFn = (leds: RGB[], NUM_LEDS: number, WIDTH: number, HEIGHT: number, t: number, shim: Record<string, unknown>) => void
const codeCache = new Map<string, CodeFn | null>()
const codeLeds = new Map<string, RGB[]>()
// Compile error per source (cacheKey) and the latest error per node-instance
// (compile or runtime), surfaced on the node so a failing paste isn't a silent
// freeze. Cleared the moment a frame runs cleanly.
const codeCompileError = new Map<string, string>()
const codeError = new Map<string, string>()

// ── Frame / field buffer pool ─────────────────────────────────────────────────
// Per-pass frame and field outputs are drawn from a recycling pool instead of
// being freshly allocated: at 60 fps a moderate graph otherwise churns through
// millions of row arrays and pixel objects per second, which is the preview
// loop's dominant GC cost. A buffer handed out during pass N is only recycled
// at the start of pass N+2 (two-generation delay), so anything that reads a
// frame within its own pass — or compares consecutive passes — never sees a
// recycled buffer. The only cross-pass retainer is previewStore, which copies
// frames into its own buffers at publish time. Persistent per-node state
// (trailState, sparkState, codeLeds, …) must NOT store pooled buffers.
const framePoolFree = new Map<string, Frame[]>()
const fieldPoolFree = new Map<number, Field[]>()
let poolPrev: { frames: Frame[]; fields: Field[] } = { frames: [], fields: [] }
let poolCurr: { frames: Frame[]; fields: Field[] } = { frames: [], fields: [] }
const POOL_FREE_CAP = 256

/** Advance the pool generation — called once per top-level preview pass
 *  (evaluateGraphFull). Buffers from two passes ago become reusable. */
function advanceFramePool(): void {
  for (const frame of poolPrev.frames) {
    const key = `${frame[0]?.length ?? 0}x${frame.length}`
    let free = framePoolFree.get(key)
    if (!free) framePoolFree.set(key, (free = []))
    if (free.length < POOL_FREE_CAP) free.push(frame)
  }
  for (const field of poolPrev.fields) {
    let free = fieldPoolFree.get(field.length)
    if (!free) fieldPoolFree.set(field.length, (free = []))
    if (free.length < POOL_FREE_CAP) free.push(field)
  }
  poolPrev = poolCurr
  poolCurr = { frames: [], fields: [] }
}

// Pixel contents are NOT cleared — every caller overwrites all W×H pixels.
function allocFrame(W: number, H: number): Frame {
  const frame = framePoolFree.get(`${W}x${H}`)?.pop()
    ?? Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
  poolCurr.frames.push(frame)
  return frame
}

function allocField(len: number): Field {
  const field = fieldPoolFree.get(len)?.pop() ?? new Float32Array(len)
  field.fill(0)
  poolCurr.fields.push(field)
  return field
}

// Unpooled blank frame for persistent per-node state (trailState, sparkState):
// those buffers live across passes, so they must never enter the pool.
function rawBlankFrame(W: number, H: number): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
}

/** Fill a pooled frame from a per-pixel function, writing into the existing
 *  pixel objects — the pooled replacement for the nested Array.from pattern. */
export function buildFrame(W: number, H: number, fn: (x: number, y: number) => RGB): Frame {
  const frame = allocFrame(W, H)
  for (let y = 0; y < H; y++) {
    const row = frame[y]
    for (let x = 0; x < W; x++) {
      const c = fn(x, y)
      const px = row[x]
      px.r = c.r; px.g = c.g; px.b = c.b
    }
  }
  return frame
}

// Stateful previews intentionally survive between frames, but node and group
// ids are never reused. Track the last evaluation of each instance so buffers
// belonging to deleted or long-inactive graph instances can be reclaimed.
const stateLastUsed = new Map<string, number>()
const STATE_IDLE_TTL_MS = 30_000
const STATE_PRUNE_INTERVAL_MS = 5_000
let lastStatePrune = 0

const stateClock = () => typeof performance !== 'undefined' ? performance.now() : Date.now()

function markStateUsed(key: string): string {
  stateLastUsed.set(key, stateClock())
  return key
}

/** Drop persistent evaluator buffers that have not participated in a recent
 * evaluation. Exported so graph lifecycle code/tests can force an immediate
 * sweep; normal preview evaluation runs a throttled sweep automatically. */
export function pruneEvaluatorState(maxIdleMs = STATE_IDLE_TTL_MS, now = stateClock()): number {
  const cutoff = now - Math.max(0, maxIdleMs)
  const stale: string[] = []
  for (const [key, lastUsed] of stateLastUsed) {
    if (lastUsed < cutoff) stale.push(key)
  }
  if (stale.length === 0) return 0

  const maps: Array<{ delete: (key: string) => boolean }> = [
    fireHeat, flashLevel, counterVals, intervalLast, smoothState, holdState,
    envState, trailState, fftLevels, beatLevels,
    percussionLevels, audioFeatureLevels, particleState, patternShowState,
    rdState, golState, waveSimState, flowState, starState, boidState, sparkState, fire2012Heat,
    codeLeds, codeError,
    kickShockState, kaleidoPunch, percussionBlobsState, emberBurst,
    rainRipplesState, prismOrientation,
  ]
  for (const key of stale) {
    for (const map of maps) map.delete(key)
    stateLastUsed.delete(key)
  }
  return stale.length
}

function maybePruneEvaluatorState(): void {
  const now = stateClock()
  if (now - lastStatePrune < STATE_PRUNE_INTERVAL_MS) return
  pruneEvaluatorState(STATE_IDLE_TTL_MS, now)
  lastStatePrune = now
}

/** Latest Code-node error (compile or runtime) for a node, or null if clean. */
export function getCodeError(stateKey: string): string | null {
  return codeError.get(stateKey) ?? null
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function avgRange(values: readonly number[], start: number, end: number): number {
  const from = Math.max(0, Math.floor(start))
  const to = Math.max(from + 1, Math.min(values.length, Math.ceil(end)))
  if (from >= values.length) return 0
  let sum = 0
  for (let i = from; i < to; i++) sum += clamp01(Number(values[i]) || 0)
  return sum / Math.max(1, to - from)
}

function fluxRange(current: readonly number[], previous: readonly number[], start: number, end: number): number {
  const from = Math.max(0, Math.floor(start))
  const to = Math.max(from + 1, Math.min(current.length, previous.length || current.length, Math.ceil(end)))
  if (from >= current.length) return 0
  let sum = 0
  for (let i = from; i < to; i++) {
    const cur = clamp01(Number(current[i]) || 0)
    const prev = clamp01(Number(previous[i]) || 0)
    sum += Math.max(0, cur - prev)
  }
  return sum / Math.max(1, to - from)
}

function followLevel(prev: number, target: number, decay: number): number {
  if (target >= prev) return target
  return prev * decay + target * (1 - decay)
}

// ── Simplex noise 2D ─────────────────────────────────────────────────────────
const _PERM = (() => {
  const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180]
  const t = new Uint8Array(512); for (let i = 0; i < 512; i++) t[i] = p[i & 255]; return t
})()
const _G2 = [1,1, -1,1, 1,-1, -1,-1, 1,0, -1,0, 0,1, 0,-1]
function _snoise2(x: number, y: number): number {
  const F2 = (Math.sqrt(3) - 1) / 2, G2 = (3 - Math.sqrt(3)) / 6
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s)
  const t0 = (i + j) * G2, x0 = x - i + t0, y0 = y - j + t0
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2*G2, y2 = y0 - 1 + 2*G2
  const ii = i & 255, jj = j & 255
  function dot(h: number, gx: number, gy: number) { return _G2[(h&7)*2]*gx + _G2[(h&7)*2+1]*gy }
  let n0 = 0, n1 = 0, n2 = 0
  let a = 0.5 - x0*x0 - y0*y0; if (a > 0) { a *= a; n0 = a*a*dot(_PERM[ii+_PERM[jj]], x0, y0) }
  let b = 0.5 - x1*x1 - y1*y1; if (b > 0) { b *= b; n1 = b*b*dot(_PERM[ii+i1+_PERM[jj+j1]], x1, y1) }
  let c = 0.5 - x2*x2 - y2*y2; if (c > 0) { c *= c; n2 = c*c*dot(_PERM[ii+1+_PERM[jj+1]], x2, y2) }
  return 70 * (n0 + n1 + n2)
}

// ── Colour helpers ────────────────────────────────────────────────────────────
function hsv(h: number, s: number, v: number): RGB {
  h = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if      (h < 60)  { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else              { r = c; b = x }
  return { r: byte(r + m), g: byte(g + m), b: byte(b + m) }
}

function byte(v: number): number { return Math.max(0, Math.min(255, Math.round(v * 255))) }

// Approximate black-body white point for a colour temperature in Kelvin
// (Tanner Helland's approximation): ~1900K candle → ~6500K daylight → blue.
function kelvinToRgb(kelvin: number): RGB {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
  let r: number, g: number, b: number
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661 }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492) }
  if (t >= 66) b = 255
  else if (t <= 19) b = 0
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return { r: clamp(r), g: clamp(g), b: clamp(b) }
}

// Easing curves matching FastLED's lib8tion, on a normalised 0–1 value. Each
// maps 0–1 → 0–1 and mirrors the corresponding ease8/*wave8 firmware call so the
// preview matches on-device. Keep in sync with the `Ease` case in cppGenerator.
function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)
}
function easeInOutCubic(x: number): number {
  // smoothstep: 3x² − 2x³ (FastLED ease8InOutCubic)
  return x * x * (3 - 2 * x)
}
function triwave(x: number): number {
  const h = ((x % 1) + 1) % 1
  return h < 0.5 ? 2 * h : 2 * (1 - h)
}
function applyEase(type: string, x: number): number {
  const t = Math.max(0, Math.min(1, x))
  switch (type) {
    case 'inOutQuad':  return easeInOutQuad(t)
    case 'triwave':    return triwave(t)
    case 'quadwave':   return easeInOutQuad(triwave(t))
    case 'cubicwave':  return easeInOutCubic(triwave(t))
    case 'inOutCubic':
    default:           return easeInOutCubic(t)
  }
}

// FastLED fill_rainbow: a scrolling hue sweep across the strip (hue in 0–255
// units, +deltaHue per LED, animated by `start`). Index order matches the
// buffer's [y*W+x] layout so the preview lines up with the firmware.
function evalRainbow(start: number, deltaHue: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const hue = start + (y * W + x) * deltaHue
      return hsv((((hue % 256) + 256) % 256) / 256 * 360, 1, 1)
    })
}

function solidFrame(color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, () => color)
}

function blankFrame(W = DEFAULT_W, H = DEFAULT_H): Frame {
  const frame = allocFrame(W, H)
  for (let y = 0; y < H; y++) {
    const row = frame[y]
    for (let x = 0; x < W; x++) { const px = row[x]; px.r = 0; px.g = 0; px.b = 0 }
  }
  return frame
}

// Copy into a pooled frame so painting onto a base frame never mutates an
// upstream node's memoised output.
function cloneFrame(frame: Frame): Frame {
  const H = frame.length, W = frame[0]?.length ?? 0
  const out = allocFrame(W, H)
  for (let y = 0; y < H; y++) {
    const src = frame[y], dst = out[y]
    for (let x = 0; x < W; x++) {
      const s = src[x], d = dst[x]
      d.r = s.r; d.g = s.g; d.b = s.b
    }
  }
  return out
}

// Per-channel blend-mode math for the Blend node. `a`/`b` are 0–255 base/blend
// channel values; returns the blended channel (0–255) before opacity is mixed.
function blendChannel(mode: string, a: number, b: number): number {
  const an = a / 255, bn = b / 255
  let r: number
  switch (mode) {
    case 'multiply':   r = an * bn; break
    case 'screen':     r = 1 - (1 - an) * (1 - bn); break
    case 'overlay':    r = an < 0.5 ? 2 * an * bn : 1 - 2 * (1 - an) * (1 - bn); break
    case 'add':        r = Math.min(1, an + bn); break
    case 'difference': r = Math.abs(an - bn); break
    case 'normal':
    default:           r = bn; break
  }
  return r * 255
}

// Composite frame `b` over `a` with `mode` at `opacity` (0–1): the blended
// colour is cross-faded against the base by opacity, so 0 = base, 1 = full mode.
function blendPixel(mode: string, a: RGB, b: RGB, opacity: number): RGB {
  const mix = (av: number, bv: number) =>
    Math.round(av * (1 - opacity) + blendChannel(mode, av, bv) * opacity)
  return { r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) }
}

function scaleRgb(color: RGB, amount: number): RGB {
  const t = Math.max(0, amount)
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r * t))),
    g: Math.max(0, Math.min(255, Math.round(color.g * t))),
    b: Math.max(0, Math.min(255, Math.round(color.b * t))),
  }
}

function addRgb(a: RGB, b: RGB): RGB {
  return {
    r: Math.min(255, a.r + b.r),
    g: Math.min(255, a.g + b.g),
    b: Math.min(255, a.b + b.b),
  }
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const m = Math.max(0, Math.min(1, t))
  const mix = (av: number, bv: number) => Math.round(av * (1 - m) + bv * m)
  return { r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) }
}

function wrapUnit(v: number): number {
  return ((v % 1) + 1) % 1
}

function pathPoint(shape: string, t: number): { x: number; y: number } {
  const TAU = Math.PI * 2
  const ang = wrapUnit(t) * TAU
  switch (shape) {
    case 'heart': {
      const x = 16 * Math.sin(ang) ** 3 / 18
      const y = (13 * Math.cos(ang) - 5 * Math.cos(ang * 2) - 2 * Math.cos(ang * 3) - Math.cos(ang * 4)) / 18
      return { x, y }
    }
    case 'lissajous':
      return { x: Math.sin(ang + Math.PI / 2), y: Math.sin(ang * 2) }
    case 'rose': {
      const r = Math.cos(ang * 4)
      return { x: r * Math.cos(ang), y: r * Math.sin(ang) }
    }
    case 'circle':
    default:
      return { x: Math.cos(ang), y: Math.sin(ang) }
  }
}

// Soft circular splat centred at a subpixel coordinate. Coverage is based on
// the distance from each pixel centre to the splat centre, so animating the
// point across fractional coordinates yields smooth anti-aliased motion.
function splatDisc(frame: Frame, x: number, y: number, radius: number, color: RGB): void {
  const H = frame.length, W = frame[0]?.length ?? 0
  const x0 = Math.max(0, Math.floor(x - radius - 1))
  const x1 = Math.min(W - 1, Math.ceil(x + radius + 1))
  const y0 = Math.max(0, Math.floor(y - radius - 1))
  const y1 = Math.min(H - 1, Math.ceil(y + radius + 1))
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot((px + 0.5) - x, (py + 0.5) - y)
      const coverage = clamp01(radius + 0.5 - dist)
      if (coverage <= 0) continue
      frame[py][px] = addRgb(frame[py][px], scaleRgb(color, coverage))
    }
  }
}

function splatRing(frame: Frame, x: number, y: number, radius: number, color: RGB): void {
  const H = frame.length, W = frame[0]?.length ?? 0
  const x0 = Math.max(0, Math.floor(x - radius - 1.5))
  const x1 = Math.min(W - 1, Math.ceil(x + radius + 1.5))
  const y0 = Math.max(0, Math.floor(y - radius - 1.5))
  const y1 = Math.min(H - 1, Math.ceil(y + radius + 1.5))
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot((px + 0.5) - x, (py + 0.5) - y)
      const coverage = clamp01(0.5 - Math.abs(dist - radius))
      if (coverage <= 0) continue
      frame[py][px] = addRgb(frame[py][px], scaleRgb(color, coverage))
    }
  }
}

// Signed distance (negative inside) from a point to a regular polygon of
// `sides` sides and circumradius `size`, in the shape's local frame. Radial
// approximation (exact along apothems, softer near vertices) — good enough for
// 1px-band anti-aliasing and, crucially, continuous in `sides`.
function polygonSd(lx: number, ly: number, sides: number, size: number): number {
  const seg = (Math.PI * 2) / sides
  const apothem = Math.cos(Math.PI / sides)
  const r = Math.hypot(lx, ly)
  const a = Math.atan2(ly, lx)
  const folded = ((a % seg) + seg) % seg - seg / 2
  return r - (size * apothem) / Math.cos(folded)
}

// Draw a rect / ellipse / regular polygon onto `frame` (which already holds the
// base), over-composited with 1px anti-aliasing. `size` is the half-height
// (circumradius for polygons); `aspect` widens rect/ellipse. Fractional `sides`
// blends the floor/ceil polygon SDFs so the shape morphs seamlessly between
// vertex counts. Kept in lockstep with the Shape case in cppGenerator.ts.
function evalShape(
  frame: Frame, shape: string, cx: number, cy: number, size: number,
  aspect: number, sides: number, rotation: number, thickness: number,
  filled: boolean, fill: RGB, edge: RGB, W: number, H: number,
): void {
  const ax = Math.max(0.01, size * (shape === 'polygon' ? 1 : aspect))
  const ay = Math.max(0.01, size)
  const reach = Math.max(ax, ay) + thickness * 0.5 + 1
  const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(W - 1, Math.ceil(cx + reach))
  const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(H - 1, Math.ceil(cy + reach))
  const ra = (-rotation * Math.PI) / 180
  const cosR = Math.cos(ra), sinR = Math.sin(ra)
  const n = Math.max(3, sides)
  const nlo = Math.floor(n), nhi = Math.ceil(n), fr = n - nlo
  const half = thickness * 0.5
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5) - cx, dy = (y + 0.5) - cy
      const lx = dx * cosR - dy * sinR, ly = dx * sinR + dy * cosR
      let sd: number
      if (shape === 'rect') {
        const qx = Math.abs(lx) - ax, qy = Math.abs(ly) - ay
        sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
      } else if (shape === 'ellipse') {
        sd = (Math.hypot(lx / ax, ly / ay) - 1) * Math.min(ax, ay)
      } else {
        sd = nlo === nhi
          ? polygonSd(lx, ly, nlo, size)
          : polygonSd(lx, ly, nlo, size) * (1 - fr) + polygonSd(lx, ly, nhi, size) * fr
      }
      const fillCov = filled ? clamp01(0.5 - sd) : 0
      const edgeCov = thickness > 0 ? clamp01(half + 0.5 - Math.abs(sd)) : 0
      const alpha = Math.max(fillCov, edgeCov)
      if (alpha <= 0) continue
      const col = edgeCov > 0 ? mixRgb(fill, edge, edgeCov) : fill
      frame[y][x] = mixRgb(frame[y][x], col, alpha)
    }
  }
}

function evalWrappedShape(
  frame: Frame, shape: string, cx: number, cy: number, size: number,
  aspect: number, sides: number, rotation: number, thickness: number,
  filled: boolean, fill: RGB, edge: RGB, W: number, H: number, wrap: boolean,
): void {
  const xOffsets = wrap ? [-W, 0, W] : [0]
  const yOffsets = wrap ? [-H, 0, H] : [0]
  for (const ox of xOffsets) {
    for (const oy of yOffsets) {
      evalShape(frame, shape, cx + ox, cy + oy, size, aspect, sides, rotation, thickness, filled, fill, edge, W, H)
    }
  }
}

// Animated geometric transform of a frame, resampled nearest-neighbour about
// the matrix centre. `rotate` spins by rate°/s, `scale` zooms by rate%/s
// (clamped), `translate` shifts by rate px/s along `angle°` (toroidal wrap).
function evalTransform(src: Frame, mode: string, rate: number, angle: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const sample = (sx: number, sy: number): RGB => {
    const xi = Math.round(sx), yi = Math.round(sy)
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) return { r: 0, g: 0, b: 0 }
    return { ...src[yi][xi] }
  }
  if (mode === 'translate') {
    const a = (angle * Math.PI) / 180
    const dx = Math.cos(a) * rate * t, dy = Math.sin(a) * rate * t
    return buildFrame(W, H, (x, y) => {
        const sx = ((Math.round(x - dx) % W) + W) % W
        const sy = ((Math.round(y - dy) % H) + H) % H
        return { ...src[sy][sx] }
      })
  }
  if (mode === 'scale') {
    const s = Math.max(0.05, Math.min(20, 1 + (rate / 100) * t))
    return buildFrame(W, H, (x, y) => sample(cx + (x - cx) / s, cy + (y - cy) / s))
  }
  // rotate: sample the source under the inverse rotation
  const a = (rate * t * Math.PI) / 180
  const cosA = Math.cos(a), sinA = Math.sin(a)
  return buildFrame(W, H, (x, y) => {
      const rx = x - cx, ry = y - cy
      return sample(cx + rx * cosA + ry * sinA, cy - rx * sinA + ry * cosA)
    })
}

// Hard cap on Array copies (guards a garbage `count` from allocating a huge loop).
const ARRAY_MAX_COPIES = 32

// Blender-style array: composite `count` copies of `src`, copy i offset by
// (offsetX·i, offsetY·i), rotated by angle·i and scaled by scale^i about the
// matrix centre, dimmed by falloff^i. Copies paint high→low index so copy 0
// (the identity) lands on top for the `over` mode; `add`/`lighten` are order-
// independent. Kept in lockstep with the Array case in cppGenerator.ts.
function evalArray(
  src: Frame, count: number, offsetX: number, offsetY: number,
  angleDeg: number, scale: number, falloff: number, mode: string,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const out = rawBlankFrame(W, H)
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const n = Math.max(1, Math.min(ARRAY_MAX_COPIES, Math.round(count)))
  const sc0 = Math.max(0.05, scale)
  const fo = Math.max(0, Math.min(1, falloff))
  for (let i = n - 1; i >= 0; i--) {
    const ox = offsetX * i, oy = offsetY * i
    const ang = (angleDeg * i * Math.PI) / 180
    const co = Math.cos(ang), si = Math.sin(ang)
    const inv = 1 / Math.pow(sc0, i)
    const dim = Math.pow(fo, i)
    for (let y = 0; y < H; y++) {
      const orow = out[y]
      for (let x = 0; x < W; x++) {
        const px = x - ox - cx, py = y - oy - cy
        const rx = px * co + py * si, ry = -px * si + py * co
        const sx = Math.round(cx + rx * inv), sy = Math.round(cy + ry * inv)
        if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue
        const s = src[sy][sx]
        const r = s.r * dim, g = s.g * dim, b = s.b * dim
        const o = orow[x]
        if (mode === 'lighten') {
          o.r = Math.max(o.r, Math.round(r)); o.g = Math.max(o.g, Math.round(g)); o.b = Math.max(o.b, Math.round(b))
        } else if (mode === 'over') {
          const cov = Math.max(r, g, b) / 255
          o.r = Math.min(255, Math.round(o.r * (1 - cov) + r))
          o.g = Math.min(255, Math.round(o.g * (1 - cov) + g))
          o.b = Math.min(255, Math.round(o.b * (1 - cov) + b))
        } else {
          o.r = Math.min(255, o.r + Math.round(r)); o.g = Math.min(255, o.g + Math.round(g)); o.b = Math.min(255, o.b + Math.round(b))
        }
      }
    }
  }
  return out
}

function renderTextInto(frame: Frame, cols: number[], color: RGB, startX: number, startY: number, font: BitmapFont, W: number, H: number, offset: number): void {
  for (let x = 0; x < W; x++) {
    const ci = x - startX + offset
    if (ci < 0 || ci >= cols.length) continue
    const col = cols[ci]
    for (let r = 0; r < font.h; r++) {
      if (col & (1 << r)) {
        const y = startY + r
        if (y >= 0 && y < H) frame[y][x] = { ...color }
      }
    }
  }
}

// Render `text` onto a blank frame at (startX, startY), optionally scrolling
// left over time (scroll = columns/second). Shares textColumns() with codegen.
function renderText(text: string, color: RGB, startX: number, startY: number, scroll: number, t: number, font: BitmapFont = DEFAULT_FONT, W = DEFAULT_W, H = DEFAULT_H, wrap = false): Frame {
  const frame = blankFrame(W, H)
  const cols = textColumns(text, font)
  if (cols.length === 0) return frame
  const total = cols.length + W
  const offset = scroll !== 0 ? Math.floor((((t * scroll) % total) + total) % total) : 0
  const xOffsets = wrap ? [-W, 0, W] : [0]
  const yOffsets = wrap ? [-H, 0, H] : [0]
  for (const ox of xOffsets) {
    for (const oy of yOffsets) {
      renderTextInto(frame, cols, color, startX + ox, startY + oy, font, W, H, offset)
    }
  }
  return frame
}

function shapeExtents(shape: string, size: number, aspect: number, rotation: number, thickness: number): { x: number; y: number } {
  if (shape === 'polygon') {
    const extent = Math.max(0.01, size) + Math.max(0, thickness) * 0.5
    return { x: extent, y: extent }
  }
  const ax = Math.max(0.01, size * aspect)
  const ay = Math.max(0.01, size)
  const ra = (-rotation * Math.PI) / 180
  const cosR = Math.abs(Math.cos(ra)), sinR = Math.abs(Math.sin(ra))
  const edge = Math.max(0, thickness) * 0.5
  return {
    x: ax * cosR + ay * sinR + edge,
    y: ax * sinR + ay * cosR + edge,
  }
}

function textStartPosition(value: number, size: number, extent: number, wrap: boolean): number {
  return Math.floor(normalizedCenterAxis(value, size, extent, wrap) - extent)
}

// ── Pattern evaluators ────────────────────────────────────────────────────────
function evalPlasma(speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const v = Math.sin(x / 3 + t * speed)
              + Math.sin(y / 3 + t * speed * 0.8)
              + Math.sin((x + y) / 5 + t * speed * 0.6)
              + Math.sin(Math.hypot(x - W / 2, y - H / 2) / 3 + t * speed * 0.5)
      // Same shifting phase the old hue sweep used (v*45 + t*20), now mapped
      // through the palette — /256 so it wraps the same way ColorFromPalette's
      // uint8_t index does in codegen. The default 'rainbow' palette keeps the
      // classic full-spectrum look.
      return samplePalette(palette, (v * 45 + t * 20) / 256)
    })
}

// Homage to Mark Kriegsman's Pride2015 — a shifting full-spectrum rainbow with
// a breathing brightness wave along the strip. Same evocative-formula approach
// as Plasma above (identical trig on the preview and firmware side), not a
// literal port of the original's 16-bit fixed-point beatsin88 arithmetic.
function evalPride2015(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const out: Frame = []
  let i = 0
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    for (let x = 0; x < W; x++) {
      const hue = (i * scale * 6 + t * speed * 40) % 360
      const briTheta = i * scale * 3 + t * speed * 15
      const bri = 0.35 + 0.65 * (Math.sin(briTheta) * 0.5 + 0.5)
      row.push(hsv(hue, 0.9, bri))
      i++
    }
    out.push(row)
  }
  return out
}

// Homage to the FastLED "Pacifica" ocean-wave demo — several scrolling sine
// wave layers through an ocean palette, with a whitecap sparkle where a
// faster secondary wave crests. Same evocative-formula approach as Plasma,
// not a literal port of Pacifica's palette-blend/deepen/whitecap pipeline.
function evalPacifica(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const v = Math.sin(x * 0.3 * scale + t * speed)
              + Math.sin((x * 0.15 * scale - y * 0.1 * scale) + t * speed * 0.6) * 0.7
              + Math.sin((x + y) * 0.08 * scale + t * speed * 1.3) * 0.5
      const n = Math.max(0, Math.min(1, v / 2.2 * 0.5 + 0.5))
      const c = samplePalette(palette, n)
      const foam = Math.sin(x * 0.9 * scale + y * 0.4 * scale + t * speed * 2.2)
      if (foam > 0.85) {
        const w = (foam - 0.85) / 0.15
        return {
          r: Math.round(c.r + (255 - c.r) * w),
          g: Math.round(c.g + (255 - c.g) * w),
          b: Math.round(c.b + (255 - c.b) * w),
        }
      }
      return c
    })
}

// Deterministic per-index hash → [0,1). Shared verbatim with the codegen so a
// pixel twinkles identically on the preview and on hardware.
function twinkleHash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

// Homage to Mark Kriegsman's TwinkleFox — every pixel twinkles on its own
// deterministic schedule, coloured from a palette. Same evocative-formula
// approach as Pride2015/Pacifica (identical maths on both sides), not a literal
// port of the original's PRNG16 walk. `density` blends from sparse, sharp
// sparkles (low) to most pixels lit (high) by softening the brightness curve.
function evalTwinkleFox(speed: number, density: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const exponent = 6 - 5 * Math.max(0, Math.min(1, density))
  const out: Frame = []
  let i = 0
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    for (let x = 0; x < W; x++) {
      const phase = twinkleHash(i)
      const rate = 0.5 + twinkleHash(i + 11)
      const colorIdx = twinkleHash(i + 23)
      const cycle = (t * speed * rate + phase) % 1
      const tri = 1 - Math.abs(2 * cycle - 1)   // 0 → 1 → 0 across the cycle
      const bri = Math.pow(tri, exponent)
      const base = samplePalette(palette, colorIdx)
      row.push({
        r: Math.round(base.r * bri),
        g: Math.round(base.g * bri),
        b: Math.round(base.b * bri),
      })
      i++
    }
    out.push(row)
  }
  return out
}

function evalScanner(
  speed: number, width: number, fade: number, axis: string, t: number, palette: Palette,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const horizontal = axis !== 'vertical'
  const span = Math.max(1, horizontal ? W : H)
  const phase = ((t * speed) % 2 + 2) % 2
  const travel = phase <= 1 ? phase : 2 - phase
  const pos = travel * Math.max(0, span - 1)
  const core = Math.max(0.5, Number.isFinite(width) ? width * 0.5 : 1)
  const tail = core + clamp01(fade) * Math.max(1, span * 0.35)
  const tailDen = Math.max(1e-6, tail - core)
  const base = samplePalette(palette, travel)

  return buildFrame(W, H, (x, y) => {
    const coord = horizontal ? x : y
    const dist = Math.abs(coord - pos)
    let v = dist <= core ? 1 : Math.max(0, 1 - (dist - core) / tailDen)
    v *= v
    return {
      r: Math.round(base.r * v),
      g: Math.round(base.g * v),
      b: Math.round(base.b * v),
    }
  })
}

function evalConfetti(
  nodeId: string, speed: number, density: number, fade: number, t: number, palette: Palette,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let state = sparkState.get(nodeId)
  if (!state || state.w !== W || state.h !== H) {
    state = { frame: rawBlankFrame(W, H), w: W, h: H }
    sparkState.set(nodeId, state)
  }

  const frame = state.frame
  const retention = Math.max(0, Math.min(1, 1 - fade))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = frame[y][x]
      const faded = scaleRgb(px, retention)
      px.r = faded.r; px.g = faded.g; px.b = faded.b
    }
  }

  const area = W * H
  const amount = clamp01(density)
  const motion = Math.max(0, speed)
  let spawnCount = Math.round(amount * (0.08 + motion * 0.3) * Math.max(1, Math.sqrt(area)))
  if (spawnCount < 1 && amount * motion > 0.08) spawnCount = 1
  const hueDrift = t * motion * 0.08

  for (let i = 0; i < spawnCount; i++) {
    const x = Math.floor(Math.random() * W)
    const y = Math.floor(Math.random() * H)
    const v = ((Math.random() + hueDrift) % 1 + 1) % 1
    const spark = samplePalette(palette, v)
    const px = frame[y][x]
    const sum = addRgb(px, spark)
    px.r = sum.r; px.g = sum.g; px.b = sum.b
  }

  return frame
}

function evalJuggle(
  nodeId: string, speed: number, count: number, fade: number, t: number, palette: Palette,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let state = sparkState.get(nodeId)
  if (!state || state.w !== W || state.h !== H) {
    state = { frame: rawBlankFrame(W, H), w: W, h: H }
    sparkState.set(nodeId, state)
  }

  const frame = state.frame
  const retention = Math.max(0, Math.min(1, 1 - fade))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = frame[y][x]
      const faded = scaleRgb(px, retention)
      px.r = faded.r; px.g = faded.g; px.b = faded.b
    }
  }

  const dots = Math.max(1, Math.round(count))
  const laneY = (i: number) =>
    dots <= 1 ? Math.round((H - 1) / 2) : Math.round(((i + 0.5) * H) / dots - 0.5)
  const addDot = (x: number, y: number, color: RGB, strength: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H || strength <= 0) return
    const px = frame[y][x]
    const sum = addRgb(px, scaleRgb(color, strength))
    px.r = sum.r; px.g = sum.g; px.b = sum.b
  }

  for (let i = 0; i < dots; i++) {
    const travel = Math.sin(t * speed * (2.5 + i * 0.35) + i * 0.9) * 0.5 + 0.5
    const x = Math.round(travel * (W - 1))
    const y = laneY(i)
    const pulse = 0.75 + 0.25 * Math.sin(t * speed * 3 + i)
    const base = samplePalette(palette, (travel * 0.35 + i / dots) % 1)
    const dot = scaleRgb(base, pulse)
    addDot(x, y, dot, 1)
    addDot(x - 1, y, dot, 0.35)
    addDot(x + 1, y, dot, 0.35)
    addDot(x, y - 1, dot, 0.18)
    addDot(x, y + 1, dot, 0.18)
  }

  return frame
}

function evalFire(nodeId: string, intensity: number, cooling: number, sparking: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const stored = fireHeat.get(nodeId)
  if (!stored || stored.length !== H || stored[0].length !== W) {
    fireHeat.set(nodeId, Array.from({ length: H }, () => Array(W).fill(0)))
  }
  const heat = fireHeat.get(nodeId)!
  const cool = Math.max(0, Math.min(255, cooling)) / 255 * 0.18

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = Math.max(0, heat[y][x] - cool - Math.random() * cool)

  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = (
        heat[y][x] +
        heat[y + 1][Math.max(0, x - 1)] +
        heat[y + 1][x] +
        heat[y + 1][Math.min(W - 1, x + 1)]
      ) / 4

  const sparkChance = Math.max(0, Math.min(1, (Math.max(0, Math.min(255, sparking)) / 255) * (0.35 + Math.max(0, Math.min(1, intensity)) * 0.65)))
  for (let x = 0; x < W; x++)
    if (Math.random() < sparkChance)
      heat[H - 1][x] = Math.min(1, 0.75 + Math.random() * 0.25)

  return heat.map(row =>
    row.map(h => samplePalette(palette, h))
  )
}

function evalSpectrumBars(
  bass: number,
  mids: number,
  treble: number,
  intensity: number,
  speed: number,
  t: number,
  palette: Palette,
  mirror: boolean,
  W = DEFAULT_W,
  H = DEFAULT_H,
): Frame {
  const frame: Frame = blankFrame(W, H)
  const b = Math.max(0, Math.min(1, bass))
  const m = Math.max(0, Math.min(1, mids))
  const tr = Math.max(0, Math.min(1, treble))
  const strength = Math.max(0, Math.min(1, intensity))
  const spd = Math.max(0, Math.min(1, speed))
  const columns = Math.max(1, mirror ? Math.ceil(W / 2) : W)
  const levels = [b, m, tr]
  const geometryMotion = t * (0.45 + spd * 3.2)
  const paletteScroll = t * (0.08 + spd * 0.42)

  for (let x = 0; x < columns; x++) {
    const nx = columns <= 1 ? 0 : x / (columns - 1)
    const spectrumPos = nx * (levels.length - 1)
    const left = Math.floor(spectrumPos)
    const right = Math.min(levels.length - 1, left + 1)
    const blend = spectrumPos - left
    const baseLevel = levels[left] * (1 - blend) + levels[right] * blend
    const ripple = Math.sin(nx * 10.5 - geometryMotion * (1.1 + tr * 1.8)) * 0.08 * strength
    const shimmer = Math.max(0, Math.sin(nx * 21 + geometryMotion * (2 + m * 2.5))) * 0.06 * tr * strength
    const level = Math.max(0, Math.min(1, baseLevel * (0.45 + strength * 0.9) + ripple + shimmer))
    const barH = Math.max(0, Math.round(level * H))

    for (let row = 0; row < barH; row++) {
      const y = H - 1 - row
      const vertical = H <= 1 ? 0 : row / (H - 1)
      const pulse = 0.72 + 0.28 * Math.sin(vertical * 6.2 - geometryMotion * (1.4 + b * 1.6))
      const v = Math.max(0, Math.min(1, (0.28 + vertical * 0.72) * pulse))
      const colorPos = nx + paletteScroll + vertical * (0.12 + m * 0.12) + spectrumPos * 0.08
      const c = samplePalette(palette, colorPos)
      const px = {
        r: Math.round(c.r * v),
        g: Math.round(c.g * v),
        b: Math.round(c.b * v),
      }
      frame[y][x] = px
      if (mirror) frame[y][W - 1 - x] = { ...px }
    }

    if (barH > 0) {
      const peakY = Math.max(0, H - barH)
      const peak = samplePalette(palette, nx + paletteScroll + spectrumPos * 0.08)
      const glow = Math.min(1, 0.6 + tr * 0.35 + strength * 0.2)
      const cap = {
        r: Math.round(peak.r * glow),
        g: Math.round(peak.g * glow),
        b: Math.round(peak.b * glow),
      }
      frame[peakY][x] = cap
      if (mirror) frame[peakY][W - 1 - x] = { ...cap }
    }
  }

  return frame
}

function evalBassPulse(bass: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = clamp01(bass)
  const v = Math.pow(level, 0.5)
  // Bass level sweeps across the palette; brightness rises with it too.
  const lit = scaleRgb(samplePalette(palette, level), v)
  return solidFrame(lit, W, H)
}

function evalBassRings(bass: number, intensity: number, speed: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, bass))
  const strength = Math.max(0, Math.min(1, intensity))
  const cx = W / 2
  const cy = H / 2
  const maxD = Math.max(1e-6, Math.hypot(cx, cy))
  const motion = Math.max(0, speed) * (0.75 + level * 1.75 * strength)
  const phase = t * (1.2 + motion * 4.8)
  const ringCount = 4 + level * 8 * strength
  const floor = 0.04 + level * 0.1 * strength
  const gain = 0.16 + level * 0.84 * strength
  return buildFrame(W, H, (x, y) => {
      const dist = Math.hypot(x - cx, y - cy) / maxD
      const wave = Math.sin(dist * ringCount * Math.PI * 2 - phase)
      const crisp = Math.pow(Math.max(0, wave * 0.5 + 0.5), 2.4)
      const v = Math.min(1, floor + crisp * gain)
      // Concentric palette rings by distance from centre, brightness by the wave.
      return scaleRgb(samplePalette(palette, dist), v)
    })
}

function evalMidrangeWaves(mids: number, intensity: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const midsAmt = Math.min(1, Math.max(0, mids))
      const strength = Math.min(1, Math.max(0, intensity))
      const motion = speed * (1 + midsAmt * 1.5 * strength)
      const contrast = 0.7 + midsAmt * 1.8 * strength
      const waveBase = Math.sin(x * 0.8 + t * motion * 4) * Math.sin(y * 0.5 + t * motion * 2.5)
      const wave = Math.max(-1, Math.min(1, waveBase * contrast))
      const waveIntensity = Math.min(1, 0.1 + Math.pow(midsAmt, 0.65) * 1.25 * strength)
      const v = (wave + 1) / 2 * waveIntensity
      const c = samplePalette(palette, (wave + 1) / 2)
      return {
        r: Math.round(c.r * v),
        g: Math.round(c.g * v),
        b: Math.round(c.b * v),
      }
    })
}

function evalMidrangeBloom(mids: number, intensity: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, mids))
  const strength = Math.max(0, Math.min(1, intensity))
  const motion = Math.max(0, speed) * (0.8 + level * 2.2 * strength)
  const cx0 = (W - 1) / 2
  const cy0 = (H - 1) / 2
  const sx = Math.max(1, W / 2)
  const sy = Math.max(1, H / 2)
  return buildFrame(W, H, (x, y) => {
      const cx = (x - cx0) / sx
      const cy = (y - cy0) / sy
      const radial = Math.hypot(cx, cy)
      const swirl = Math.sin((cx * cx - cy * cy) * 6 + t * motion * 3.2)
        + Math.cos((cx + cy) * 4 - t * motion * 2.4)
      const bloom = Math.sin(radial * (5 + level * 8 * strength) * Math.PI - t * motion * 4 + swirl * 0.6)
      const crisp = Math.pow(Math.max(0, bloom * 0.5 + 0.5), 1.8)
      const v = Math.min(1, crisp * (0.22 + level * 0.78 * strength))
      const c = samplePalette(palette, radial * 0.6 + swirl * 0.12 + t * motion * 0.05)
      return {
        r: Math.round(c.r * v),
        g: Math.round(c.g * v),
        b: Math.round(c.b * v),
      }
    })
}

function evalTrebleSparks(nodeId: string, treble: number, density: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, treble))
  const amount = Math.max(0, Math.min(1, density))
  let state = sparkState.get(nodeId)
  if (!state || state.w !== W || state.h !== H) {
    // Persistent buffer, mutated in place each pass — never pool-allocated.
    state = { frame: rawBlankFrame(W, H), w: W, h: H }
    sparkState.set(nodeId, state)
  }

  const frame = state.frame
  const fade = 0.58 + (1 - level) * 0.16
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = frame[y][x]
      const faded = scaleRgb(px, fade)
      px.r = faded.r; px.g = faded.g; px.b = faded.b
    }
  }

  const spawnChance = 0.2 + level * 0.8
  let spawnCount = Math.round(W * H * amount * (0.03 + level * 0.12))
  if (spawnCount < 1 && amount * level > 0.05) spawnCount = 1

  const addSpark = (x: number, y: number, spark: RGB, strength: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H || strength <= 0) return
    const px = frame[y][x]
    const sum = addRgb(px, scaleRgb(spark, strength))
    px.r = sum.r; px.g = sum.g; px.b = sum.b
  }

  for (let i = 0; i < spawnCount; i++) {
    if (Math.random() > spawnChance) continue
    const x = Math.floor(Math.random() * W)
    const y = Math.floor(Math.random() * H)
    const flash = 0.55 + Math.random() * 0.45
    // Each spark draws a random point of the palette, then flashes toward white.
    const whiteHot = mixRgb(samplePalette(palette, Math.random()), { r: 255, g: 255, b: 255 }, 0.35 + level * 0.35)
    const spark = scaleRgb(whiteHot, (0.7 + level * 0.6) * flash)
    addSpark(x, y, spark, 1)
    addSpark(x - 1, y, spark, 0.42)
    addSpark(x + 1, y, spark, 0.42)
    addSpark(x, y - 1, spark, 0.42)
    addSpark(x, y + 1, spark, 0.42)
    addSpark(x - 1, y - 1, spark, 0.16)
    addSpark(x + 1, y - 1, spark, 0.16)
    addSpark(x - 1, y + 1, spark, 0.16)
    addSpark(x + 1, y + 1, spark, 0.16)
  }

  // `frame` IS the persistent state buffer (mutated in place above);
  // downstream consumers never mutate their inputs, so return it directly.
  return frame
}

function evalTreblePrism(treble: number, intensity: number, speed: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, treble))
  const strength = Math.max(0, Math.min(1, intensity))
  const motion = Math.max(0, speed) * (1.2 + level * 3.2 * strength)
  return buildFrame(W, H, (x, y) => {
      const diagA = x * 1.7 + y * 1.15
      const diagB = x * -1.1 + y * 1.9
      const waveA = Math.sin(diagA + t * motion * 7.5)
      const waveB = Math.sin(diagB - t * motion * 6.1)
      const prism = Math.max(0, waveA * 0.55 + waveB * 0.45)
      const shard = Math.pow(prism, 3.6)
      const flash = Math.pow(Math.max(0, Math.sin((x + y) * 2.4 - t * motion * 9) * 0.5 + 0.5), 10)
      const v = Math.min(1, shard * (0.3 + level * 0.7 * strength) + flash * level * 0.9 * strength)
      // Diagonal position spreads the palette across the shards, like a prism.
      const pt = (x + y) / (W + H)
      return scaleRgb(samplePalette(palette, pt), v)
    })
}

function evalAudioCascade(bass: number, mids: number, treble: number, intensity: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const b = Math.max(0, Math.min(1, bass))
  const m = Math.max(0, Math.min(1, mids))
  const tr = Math.max(0, Math.min(1, treble))
  const strength = Math.max(0, Math.min(1, intensity))
  const motion = Math.max(0, speed) * (0.8 + (b + m + tr) * 1.4 * strength)
  return buildFrame(W, H, (x, y) => {
      const nx = W > 1 ? x / (W - 1) : 0
      const ny = H > 1 ? y / (H - 1) : 0
      const ribbon = Math.sin((nx * 7 + ny * 2.5) + t * motion * (2 + m * 3 * strength))
      const sweep = Math.cos((ny * 9 - nx * 3) - t * motion * (1.4 + b * 2.2 * strength))
      const shimmer = Math.pow(Math.max(0, Math.sin((nx + ny) * 18 + t * motion * (4 + tr * 8 * strength)) * 0.5 + 0.5), 6)
      const body = Math.max(0, ribbon * 0.55 + sweep * 0.45)
      const v = Math.min(1, body * (0.18 + m * 0.52 * strength) + b * 0.24 * strength + shimmer * tr * 0.85 * strength)
      const pt = nx * (0.2 + b * 0.5) + ny * (0.35 + m * 0.45) + shimmer * 0.15 + t * motion * 0.03
      const c = samplePalette(palette, pt)
      return {
        r: Math.round(c.r * v),
        g: Math.round(c.g * v),
        b: Math.round(c.b * v),
      }
    })
}

function evalBeatFlash(nodeId: string, beat: boolean, base: Frame | null, decay: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  let level = flashLevel.get(nodeId) ?? 0
  if (beat) level = 1
  else level = level * decay
  flashLevel.set(nodeId, level)

  const src = base ?? blankFrame(W, H)
  if (level < 0.01) return src

  return src.map(row =>
    row.map(px => ({
      r: Math.min(255, Math.round(px.r + (255 - px.r) * level)),
      g: Math.min(255, Math.round(px.g + (255 - px.g) * level)),
      b: Math.min(255, Math.round(px.b + (255 - px.b) * level)),
    }))
  )
}

/** A palette is either a named preset or an ordered list of custom colors. */
export type Palette = string | RGB[]

function samplePalette(palette: Palette, t: number): RGB {
  const h = ((t % 1) + 1) % 1
  if (Array.isArray(palette)) {
    const stops = palette
    if (stops.length === 0) return { r: 0, g: 0, b: 0 }
    if (stops.length === 1) return { ...stops[0] }
    const scaled = h * (stops.length - 1)
    const i = Math.floor(scaled)
    const f = scaled - i
    const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)]
    return {
      r: Math.round(a.r * (1 - f) + b.r * f),
      g: Math.round(a.g * (1 - f) + b.g * f),
      b: Math.round(a.b * (1 - f) + b.b * f),
    }
  }
  return sampleNamedPalette(palette, h) ?? hsv(h * 360, 1, 1)
}

// ── New audio-reactive patterns ───────────────────────────────────────────

// Expanding shockwave rings triggered by kick (big/slow) and snare (small/fast),
// textured with hihat grain — a Particles-pool-style capped spawn array.
function evalKickShock(
  key: string, kick: number, snare: number, hihat: number, energy: number, speed: number,
  t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const CAP = 8
  let state = kickShockState.get(key)
  if (!state) { state = { rings: new Array(CAP).fill(null), next: 0, prevKick: false, prevSnare: false }; kickShockState.set(key, state) }
  const kickHit = kick > 0.5, snareHit = snare > 0.5
  if (kickHit && !state.prevKick) { state.rings[state.next] = { born: t, kind: 0 }; state.next = (state.next + 1) % CAP }
  if (snareHit && !state.prevSnare) { state.rings[state.next] = { born: t, kind: 1 }; state.next = (state.next + 1) % CAP }
  state.prevKick = kickHit; state.prevSnare = snareHit

  const strength = clamp01(energy)
  const spd = Math.max(0.2, speed)
  const speedK = (0.35 + strength * 0.5) * spd, speedS = speedK * 1.8
  const lifeK = 1.9, lifeS = 1.0, bandK = 0.10, bandS = 0.055
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const maxD = Math.max(1e-6, Math.hypot(cx, cy))
  const hihatAmt = clamp01(hihat)

  return buildFrame(W, H, (x, y) => {
    const dist = Math.hypot(x - cx, y - cy) / maxD
    let wave = 0
    for (const ring of state.rings) {
      if (!ring) continue
      const age = t - ring.born
      const isKick = ring.kind === 0
      const spdR = isKick ? speedK : speedS, life = isKick ? lifeK : lifeS, band = isKick ? bandK : bandS
      if (age < 0 || age > life) continue
      const front = Math.exp(-((dist - age * spdR) ** 2) / (2 * band * band))
      wave += front * (1 - age / life)
    }
    wave = Math.min(1, wave)
    const jitter = hihatAmt * 0.18 * (Math.sin(dist * 50 - t * speed * 22) * 0.5 + 0.5)
    const v = Math.min(1, wave * (0.5 + strength * 0.5) + jitter * wave + 0.03 * strength)
    const c = samplePalette(palette, dist * 0.5 + t * speed * 0.03)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Vertical aurora-borealis curtains shaped by vocal presence; dims toward black
// on silence.
function evalVocalAurora(
  vocals: number, energy: number, silence: boolean, speed: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const level = clamp01(vocals), strength = clamp01(energy)
  const gate = silence ? 0 : 1
  const drift = t * speed * (0.15 + level * 0.35)
  return buildFrame(W, H, (x, y) => {
    const ny = H > 1 ? y / (H - 1) : 0
    let curtain = 0
    for (let bnd = 0; bnd < 3; bnd++) {
      const bandPhase = ny * 3.0 + bnd * 2.1 + drift * (1 + bnd * 0.4)
      const xOff = Math.sin(bandPhase) * (1.2 + level * 1.8) + Math.sin(bandPhase * 0.5 + bnd) * 0.6
      const dx = (x - W / 2) / Math.max(1, W / 2) - xOff * 0.35
      curtain += Math.exp(-dx * dx * 3.0) * (0.5 + 0.5 * Math.sin(bandPhase * 1.7 + bnd * 1.3))
    }
    const vBrightness = Math.min(1, (0.12 + strength * 0.35 + level * 0.65) * gate)
    const v = Math.min(1, curtain * 0.6) * vBrightness
    const c = samplePalette(palette, ny * 0.6 + drift * 0.08 + level * 0.25)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Wedge-mirrored plasma that punches wider and spins harder on every beat
// (beat is already a one-frame pulse, so no separate edge tracking is needed —
// the punch level decays the same way BeatFlash's flashLevel does).
function evalBeatKaleidoscope(
  key: string, beat: boolean, hue: number, energy: number, speed: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let punch = kaleidoPunch.get(key) ?? 0
  punch = beat ? 1 : punch * 0.85
  kaleidoPunch.set(key, punch)

  const strength = clamp01(energy)
  const wedges = 6 + Math.round(punch * 6)
  const rot = t * speed * (0.15 + strength * 0.35) + punch * 0.8
  const wedgeAngle = (Math.PI * 2) / wedges
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const maxD = Math.max(1e-6, Math.hypot(cx, cy))

  return buildFrame(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy
    const dist = Math.hypot(dx, dy) / maxD
    const ang = Math.atan2(dy, dx) + rot
    let a = ((ang % wedgeAngle) + wedgeAngle) % wedgeAngle
    if (a > wedgeAngle / 2) a = wedgeAngle - a
    const tex = Math.sin(a * 10 + dist * 8 * (1 + punch * 0.6) - t * speed * 3) * Math.cos(dist * 5 * (1 + punch * 0.6) - a * 6)
    const v = Math.min(1, Math.max(0, tex * 0.5 + 0.5) * (0.35 + strength * 0.65) + punch * 0.25)
    const c = samplePalette(palette, dist * 0.5 + a * 0.3 + hue / 360 + t * speed * 0.05)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Tiled mosaic grid — bass/mids/treble sweep diagonally across the cells.
function evalSpectraMosaic(
  bass: number, mids: number, treble: number, energy: number, speed: number, tiles: number,
  t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const n = Math.max(2, Math.min(8, Math.round(tiles)))
  const strength = clamp01(energy)
  const cellW = W / n, cellH = H / n
  return buildFrame(W, H, (x, y) => {
    const cx = Math.floor(x / cellW), cy = Math.floor(y / cellH)
    const diag = (cx + cy) / (2 * Math.max(1, n - 1))
    const mix = bass * (1 - diag) + mids * 0.5 + treble * diag
    const phase = cx * 0.6 + cy * 0.9 + t * speed * (0.4 + strength * 0.8)
    const shimmer = Math.sin(phase) * 0.5 + 0.5
    const v = Math.min(1, 0.15 + mix * 0.6 * strength + shimmer * 0.25)
    const c = samplePalette(palette, diag * 0.6 + mix * 0.3 + t * speed * 0.04)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Three-tier metaball blobs — kick (large/slow), snare (medium/sharp), and
// hihat (tiny/fast) each spawn their own tier.
function evalPercussionBlobs(
  key: string, kick: number, snare: number, hihat: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const CAP = 12
  let state = percussionBlobsState.get(key)
  if (!state) { state = { blobs: new Array(CAP).fill(null), next: 0, prevKick: false, prevSnare: false, prevHihat: false }; percussionBlobsState.set(key, state) }
  const kickHit = kick > 0.5, snareHit = snare > 0.5, hihatHit = hihat > 0.55
  const spawn = (kind: 0 | 1 | 2) => {
    state.blobs[state.next] = { x: Math.random() * W, y: Math.random() * H, born: t, kind }
    state.next = (state.next + 1) % CAP
  }
  if (kickHit && !state.prevKick) spawn(0)
  if (snareHit && !state.prevSnare) spawn(1)
  if (hihatHit && !state.prevHihat) spawn(2)
  state.prevKick = kickHit; state.prevSnare = snareHit; state.prevHihat = hihatHit

  const PARAMS = { 0: { r: 0.34, life: 1.4 }, 1: { r: 0.20, life: 0.7 }, 2: { r: 0.10, life: 0.35 } } as const
  const minDim = Math.min(W, H)

  return buildFrame(W, H, (x, y) => {
    let field = 0
    for (const blob of state.blobs) {
      if (!blob) continue
      const age = t - blob.born
      const p = PARAMS[blob.kind]
      if (age < 0 || age > p.life) continue
      const lifeT = age / p.life
      const radius = p.r * minDim * (0.4 + 0.6 * Math.min(1, lifeT * 2))
      const decay = 1 - lifeT
      const dx = x - blob.x, dy = y - blob.y
      field += decay * (radius * radius) / (dx * dx + dy * dy + radius * radius * 0.15)
    }
    const v = Math.min(1, field / (field + 1.1))
    const c = samplePalette(palette, Math.min(1, field * 0.4))
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Bottom-up column fire (the shared black-body heatColor() ramp) — bass/mids/
// treble shape which columns run hot, with a beat-triggered ember burst.
function evalEmberPulse(
  key: string, bass: number, mids: number, treble: number, beat: boolean, energy: number,
  speed: number, t: number, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let burst = emberBurst.get(key) ?? 0
  burst = beat ? Math.min(1, burst + 0.6) : burst * 0.90
  emberBurst.set(key, burst)

  const strength = clamp01(energy)
  const flicker = t * speed * 3.0

  return buildFrame(W, H, (x, y) => {
    const nx = W > 1 ? x / (W - 1) : 0
    const heightFromBottom = H > 1 ? (H - 1 - y) / (H - 1) : 0   // 0 at bottom, 1 at top
    const centerDist = Math.abs(nx - 0.5) * 2
    const bandWeight = bass * (1 - centerDist) + mids * (1 - Math.abs(centerDist - 0.5) * 2) + treble * centerDist
    const flicker1 = Math.sin(nx * 17 + flicker + heightFromBottom * 4) * 0.5 + 0.5
    const flicker2 = Math.sin(nx * 29 - flicker * 1.3) * 0.5 + 0.5
    const heightFalloff = Math.max(0, 1 - heightFromBottom * (1.1 - bandWeight * 0.5 - strength * 0.3))
    let heat = heightFalloff * (0.35 + bandWeight * 0.65 * strength) * (0.7 + flicker1 * 0.2 + flicker2 * 0.1)
    heat = Math.min(1, heat + burst * Math.max(0, 1 - heightFromBottom * 0.6) * 0.8)
    return heatColor(heat * 255)
  })
}

// Radial bloom whose sample coordinates are pushed through noise turbulence
// before evaluating the bloom — treble drives fine/fast jitter, mids the
// slow/large-scale drift.
function evalTurbulentBloom(
  bass: number, mids: number, treble: number, energy: number, speed: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const strength = clamp01(energy)
  const trebleAmp = 0.15 + treble * 0.6, midsAmp = 0.3 + mids * 0.9
  const bassPulse = Math.min(1, 0.5 + bass * 0.9)
  const tFast = t * speed * (1.5 + treble * 2), tSlow = t * speed * (0.3 + mids * 0.6)

  return buildFrame(W, H, (x, y) => {
    const cx = (x - (W - 1) / 2) / Math.max(1, W / 2)
    const cy = (y - (H - 1) / 2) / Math.max(1, H / 2)
    const nOffX = _snoise2(cx * 3 + tFast, cy * 3 - tFast) * trebleAmp + _snoise2(cx * 0.6 + tSlow, cy * 0.6 + 50 + tSlow) * midsAmp
    const nOffY = _snoise2(cx * 3 + 50 + tFast, cy * 3 + 50 - tFast) * trebleAmp + _snoise2(cx * 0.6 + 50 + tSlow, cy * 0.6 + tSlow) * midsAmp
    const wx = cx + nOffX, wy = cy + nOffY
    const radial = Math.hypot(wx, wy)
    const bloom = Math.sin(radial * 6 - t * speed * 3) + Math.cos((wx + wy) * 3 + t * speed * 2)
    const crisp = Math.pow(Math.max(0, bloom * 0.5 + 0.5), 1.6)
    const v = Math.min(1, crisp * (0.2 + 0.8 * strength) * bassPulse)
    const c = samplePalette(palette, radial * 0.5 + tSlow * 0.05)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Gravitational-lensing rings around a drifting well — rings bunch up near the
// well instead of BassRings' evenly-spaced sine rings.
function evalGravityWell(
  bass: number, energy: number, speed: number, color: RGB, t: number,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const level = clamp01(bass), strength = clamp01(energy)
  const cx0 = (W - 1) / 2, cy0 = (H - 1) / 2
  const orbitR = Math.min(W, H) * 0.12 * (0.5 + strength * 0.5)
  const wellX = cx0 + Math.cos(t * speed * 0.25) * orbitR
  const wellY = cy0 + Math.sin(t * speed * 0.35) * orbitR
  const maxD = Math.max(1e-6, Math.hypot(cx0, cy0))
  const k = 5 + level * 10 * strength
  const phase = t * (1.0 + speed * 2.2)

  return buildFrame(W, H, (x, y) => {
    const dist = Math.hypot(x - wellX, y - wellY) / maxD
    const wave = Math.sin(k / (dist + 0.12) - phase)
    const crisp = Math.pow(Math.max(0, wave * 0.5 + 0.5), 2.2)
    const v = Math.min(1, 0.03 + level * 0.08 * strength + crisp * (0.15 + level * 0.85 * strength))
    return { r: Math.round(color.r * v), g: Math.round(color.g * v), b: Math.round(color.b * v) }
  })
}

// A pool of expanding, fading ripples — one born on each trigger rising edge,
// max-combined so overlapping ripples don't blow out.
function evalRainRipples(
  key: string, trigger: boolean, energy: number, speed: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const CAP = 8
  let state = rainRipplesState.get(key)
  if (!state) { state = { ripples: new Array(CAP).fill(null), next: 0, prevTrig: false }; rainRipplesState.set(key, state) }
  if (trigger && !state.prevTrig) {
    state.ripples[state.next] = { x: Math.random() * W, y: Math.random() * H, born: t }
    state.next = (state.next + 1) % CAP
  }
  state.prevTrig = trigger

  const strength = clamp01(energy)
  const spd = Math.max(0.2, speed)
  const life = 1.6 / spd
  const speedPx = Math.max(W, H) * 0.9 / life
  const band = 0.9 + (1 - strength) * 0.6

  return buildFrame(W, H, (x, y) => {
    let v = 0
    for (const ripple of state.ripples) {
      if (!ripple) continue
      const age = t - ripple.born
      if (age < 0 || age > life) continue
      const dist = Math.hypot(x - ripple.x, y - ripple.y)
      const ring = Math.exp(-((dist - age * speedPx) ** 2) / (2 * band * band))
      v = Math.max(v, ring * (1 - age / life))
    }
    v = Math.min(1, v * (0.6 + strength * 0.6))
    const c = samplePalette(palette, v * 0.5 + t * speed * 0.02)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Oriented Gabor-noise shards (same sparse-hash convolution as GaborNoise) that
// snap to a new pseudo-random orientation on every hihat rising edge.
function evalPrismStorm(
  key: string, treble: number, mids: number, hihat: number, energy: number, speed: number,
  t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let held = prismOrientation.get(key)
  if (!held) { held = { v: Math.random() * 360, prev: false }; prismOrientation.set(key, held) }
  const above = hihat > 0.55
  if (above && !held.prev) held.v = Math.random() * 360
  held.prev = above

  const strength = clamp01(energy)
  const drift = t * speed * (4 + mids * 8)
  const omega = ((held.v + drift) * Math.PI) / 180
  const cosO = Math.cos(omega), sinO = Math.sin(omega)
  const freq = 0.8 + treble * 2.5
  const scale = 0.5 + mids * 0.4
  const TAU = Math.PI * 2

  return buildFrame(W, H, (x, y) => {
    const px = x * scale, py = y * scale
    const xi = Math.floor(px), yi = Math.floor(py)
    let v = 0
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const cx = xi + di, cy = yi + dj
        const h = worleyHash(cx, cy)
        const h2 = worleyHash(cx + 31, cy - 17)
        const fx = cx + 0.5 + (h - 0.5), fy = cy + 0.5 + (h2 - 0.5)
        const dx = px - fx, dy = py - fy
        const gauss = Math.exp(-2.5 * (dx * dx + dy * dy))
        const proj = dx * cosO + dy * sinO
        const w = h2 < 0.5 ? 1 : -1
        v += w * gauss * Math.cos(TAU * freq * proj + t * speed * 2 + h * TAU)
      }
    }
    const shard = Math.pow(Math.max(0, v * 0.5 + 0.5), 1.4)
    const vv = Math.min(1, shard * (0.25 + strength * 0.75))
    const c = samplePalette(palette, v * 0.5 + 0.5 + mids * 0.2)
    return { r: Math.round(c.r * vv), g: Math.round(c.g * vv), b: Math.round(c.b * vv) }
  })
}

function evalSineField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * Math.sin(x * freq + t * speed + oct * 1.7) * Math.cos(y * freq * 1.3 + t * speed * 0.8 + oct * 2.3)
        amp *= 0.5; freq *= 2.1
      }
      out[y * W + x] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

function evalRadialBurst(speed: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxD = Math.hypot(cx, cy)
  return buildFrame(W, H, (x, y) => {
      const dist = Math.hypot(x - cx, y - cy) / maxD
      const wave = (Math.sin((dist * 8 - t * speed * 3) * Math.PI) + 1) / 2
      // Palette across the radius, ring brightness from the burst wave.
      return scaleRgb(samplePalette(palette, dist), wave)
    })
}

function evalSpiral(speed: number, arms: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxD = Math.hypot(cx, cy)
  return buildFrame(W, H, (x, y) => {
      const dx = x - cx, dy = y - cy
      const dist = Math.hypot(dx, dy) / maxD
      const angle = Math.atan2(dy, dx)
      const spiral = (angle + dist * Math.PI * 4 - t * speed * Math.PI) * arms
      const v = (Math.sin(spiral) + 1) / 2
      return scaleRgb(samplePalette(palette, dist + t * 0.083), v * 0.9)
    })
}

function evalKaleidoscope(src: Frame, segments: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const segAngle = (Math.PI * 2) / Math.max(2, segments)
  return buildFrame(W, H, (x, y) => {
      const dx = x - cx, dy = y - cy
      const dist = Math.hypot(dx, dy)
      let angle = ((Math.atan2(dy, dx) % segAngle) + segAngle) % segAngle
      if (angle > segAngle / 2) angle = segAngle - angle
      const sx = Math.round(cx + dist * Math.cos(angle))
      const sy = Math.round(cy + dist * Math.sin(angle))
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) return { r: 0, g: 0, b: 0 }
      return { ...src[sy][sx] }
    })
}

const MAX_PARTICLES = 600

// Bundled particle systems — `mode` picks the simulation. Each mode spawns and
// advances the persistent particle pool, then a shared pass renders every live
// particle additively at its `life` brightness. Keep the modes in sync with
// PROPERTY_META.particleType and cppGenerator's `Particles` case.
function evalParticles(nodeId: string, mode: string, rate: number, palette: Palette, decay: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  if (!particleState.has(nodeId)) particleState.set(nodeId, [])
  let particles = particleState.get(nodeId)!
  const rnd = Math.random
  // Spawn colour is a representative palette sample kept only so the pool objects
  // stay well-formed; every particle is actually rendered by its life (age)
  // through the palette below, so a palette change applies to live particles too.
  const color = samplePalette(palette, 0.8)

  switch (mode) {
    case 'gravity': {
      // Drops fall from the top and bounce off the floor, losing energy.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: 0, vx: (rnd() - 0.5) * 0.4, vy: rnd() * 0.2, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) {
        p.vy += 0.045; p.x += p.vx; p.y += p.vy
        if (p.y >= H - 1) { p.y = H - 1; p.vy *= -0.55; p.vx *= 0.8; p.life *= 0.9 }
        p.life *= decay
      }
      particles = particles.filter(p => p.life > 0.05)
      break
    }
    case 'fireworks': {
      // Occasional radial burst from a random point; gravity + drag pull it apart.
      if (rnd() < rate * 0.12) {
        const cx = rnd() * W, cy = rnd() * H * 0.5 + H * 0.1
        const hue = rnd() * 360, n = 14 + Math.floor(rnd() * 8)
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.3
          const spd = rnd() * 0.5 + 0.35
          const c = hsv(hue + (rnd() - 0.5) * 30, 1, 1)
          particles.push({ x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 1, r: c.r, g: c.g, b: c.b })
        }
      }
      for (const p of particles) { p.vy += 0.022; p.vx *= 0.965; p.vy *= 0.965; p.x += p.vx; p.y += p.vy; p.life *= decay * 0.985 }
      particles = particles.filter(p => p.life > 0.05)
      break
    }
    case 'sparkle': {
      // Sparkle rain — random twinkles drizzle down and fade.
      const spawn = Math.max(1, Math.round(rate * W * 0.8))
      for (let i = 0; i < spawn; i++) if (rnd() < rate) particles.push({ x: rnd() * W, y: rnd() * H * 0.3, vx: 0, vy: rnd() * 0.25 + 0.05, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.y += p.vy; p.life *= decay * 0.9 }
      particles = particles.filter(p => p.life > 0.05 && p.y < H)
      break
    }
    case 'comet': {
      // A head traces a Lissajous path; each frame drops a fading trail dot.
      const hx = (W - 1) * (0.5 + 0.45 * Math.sin(t * 0.9))
      const hy = (H - 1) * (0.5 + 0.45 * Math.sin(t * 0.6 + 1.3))
      particles.push({ x: hx, y: hy, vx: 0, vy: 0, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) p.life *= decay
      particles = particles.filter(p => p.life > 0.04)
      break
    }
    case 'snow': {
      // Snow drifts down with a gentle horizontal sway; recycles at the floor.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: 0, vx: 0, vy: rnd() * 0.12 + 0.05, life: 0.7 + rnd() * 0.3, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      for (const p of particles) { p.y += p.vy; p.x += Math.sin(t * 1.5 + (p.seed ?? 0)) * 0.12 }
      particles = particles.filter(p => p.y < H)
      break
    }
    case 'swarm': {
      // Boids — cohesion, alignment, separation; wrap at the edges.
      const N = Math.max(6, Math.min(60, Math.round(8 + rate * 60)))
      while (particles.length < N) particles.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.6, vy: (rnd() - 0.5) * 0.6, life: 1, r: color.r, g: color.g, b: color.b })
      if (particles.length > N) particles = particles.slice(0, N)
      const R = Math.max(3, Math.min(W, H) * 0.5)
      particles = particles.map(p => {
        let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0
        for (const q of particles) {
          if (q === p) continue
          const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy)
          if (d < R && d > 0) {
            cx += q.x; cy += q.y; ax += q.vx; ay += q.vy; n++
            if (d < R * 0.4) { sx -= dx / d; sy -= dy / d }
          }
        }
        let vx = p.vx, vy = p.vy
        if (n > 0) {
          vx += (cx / n - p.x) * 0.0008 + (ax / n - p.vx) * 0.05 + sx * 0.04
          vy += (cy / n - p.y) * 0.0008 + (ay / n - p.vy) * 0.05 + sy * 0.04
        }
        const sp = Math.hypot(vx, vy), max = 0.7
        if (sp > max) { vx = (vx / sp) * max; vy = (vy / sp) * max }
        return { ...p, x: (p.x + vx + W) % W, y: (p.y + vy + H) % H, vx, vy }
      })
      break
    }
    case 'rain': {
      // Fast wind-blown streaks from the top.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: 0, vx: (rnd() - 0.5) * 0.18, vy: rnd() * 0.45 + 0.35, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.life *= decay * 0.995 }
      particles = particles.filter(p => p.y < H && p.life > 0.05)
      break
    }
    case 'embers': {
      // Warm motes lift from the floor and wander as they cool.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: H - 1, vx: (rnd() - 0.5) * 0.12, vy: -(rnd() * 0.18 + 0.04), life: 1, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      for (const p of particles) { p.x += p.vx + Math.sin(t * 2 + (p.seed ?? 0)) * 0.05; p.y += p.vy; p.life *= decay * 0.985 }
      particles = particles.filter(p => p.y >= 0 && p.life > 0.05)
      break
    }
    case 'bubbles': {
      // Buoyant dots rise from below with a broad side-to-side wobble.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: H - 1, vx: 0, vy: -(rnd() * 0.16 + 0.06), life: 1, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      for (const p of particles) { p.x += Math.sin(t * 3 + (p.seed ?? 0)) * 0.1; p.y += p.vy }
      particles = particles.filter(p => p.y >= 0)
      break
    }
    case 'vortex': {
      // Particles spiral around the centre while being pulled slowly inward.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: rnd() * H, vx: 0, vy: 0, life: 1, r: color.r, g: color.g, b: color.b })
      const cx = (W - 1) / 2, cy = (H - 1) / 2
      for (const p of particles) {
        const dx = p.x - cx, dy = p.y - cy, d = Math.max(0.5, Math.hypot(dx, dy))
        p.x += (-dy / d) * 0.24 - dx * 0.006; p.y += (dx / d) * 0.24 - dy * 0.006; p.life *= decay * 0.995
      }
      particles = particles.filter(p => p.life > 0.05)
      break
    }
    case 'orbit': {
      // A stable constellation of dots circles the matrix centre.
      const N = Math.max(4, Math.min(48, Math.round(4 + rate * 44)))
      while (particles.length < N) particles.push({ x: rnd() * W, y: rnd() * H, vx: 0, vy: 0, life: 1, r: color.r, g: color.g, b: color.b, seed: rnd() * 0.08 + 0.025 })
      if (particles.length > N) particles = particles.slice(0, N)
      const cx = (W - 1) / 2, cy = (H - 1) / 2
      for (const p of particles) {
        const dx = p.x - cx, dy = p.y - cy, a = p.seed ?? 0.04
        p.x = cx + dx * Math.cos(a) - dy * Math.sin(a); p.y = cy + dx * Math.sin(a) + dy * Math.cos(a); p.life = 1
      }
      break
    }
    case 'confetti': {
      // Short-lived flecks appear throughout the matrix and drift downward.
      const spawn = Math.max(1, Math.round(rate * 4))
      for (let i = 0; i < spawn; i++) if (rnd() < rate) particles.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.16, vy: rnd() * 0.08 + 0.02, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.life *= decay * 0.94 }
      particles = particles.filter(p => p.life > 0.05 && p.y < H)
      break
    }
    case 'fireflies': {
      // A persistent cloud meanders in smoothly changing directions.
      const N = Math.max(5, Math.min(50, Math.round(5 + rate * 45)))
      while (particles.length < N) particles.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.12, vy: (rnd() - 0.5) * 0.12, life: 0.45 + rnd() * 0.55, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      if (particles.length > N) particles = particles.slice(0, N)
      const spanX = Math.max(1, W - 1), spanY = Math.max(1, H - 1)
      for (const p of particles) { p.x = (p.x + p.vx + Math.sin(t + (p.seed ?? 0)) * 0.035 + spanX) % spanX; p.y = (p.y + p.vy + Math.cos(t * 0.8 + (p.seed ?? 0)) * 0.035 + spanY) % spanY; p.life = 0.65 + Math.sin(t * 3 + (p.seed ?? 0)) * 0.35 }
      break
    }
    case 'meteor': {
      // A bright diagonal head continuously lays down a fading tail.
      const span = Math.max(1, Math.max(W, H) - 1), phase = (t * Math.max(2, W * 0.45)) % span
      particles.push({ x: phase * (W - 1) / span, y: phase * (H - 1) / span, vx: 0, vy: 0, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) p.life *= decay * 0.96
      particles = particles.filter(p => p.life > 0.04)
      break
    }
    case 'tornado': {
      // Rising motes tighten into a rotating funnel.
      if (rnd() < rate) particles.push({ x: W / 2, y: H - 1, vx: 0, vy: -(rnd() * 0.16 + 0.06), life: 1, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      for (const p of particles) { p.y += p.vy; const h = Math.max(0, Math.min(1, 1 - p.y / H)); p.x = W / 2 + Math.sin(t * 5 + (p.seed ?? 0) + p.y * 0.7) * (0.5 + h * W * 0.35); p.life *= decay * 0.995 }
      particles = particles.filter(p => p.y >= 0 && p.life > 0.05)
      break
    }
    case 'pinwheel': {
      // Curved spokes stream out from the centre.
      if (rnd() < rate) {
        const a = rnd() * Math.PI * 2
        particles.push({ x: W / 2, y: H / 2, vx: Math.cos(a) * 0.18, vy: Math.sin(a) * 0.18, life: 1, r: color.r, g: color.g, b: color.b })
      }
      for (const p of particles) { const vx = p.vx - p.vy * 0.035, vy = p.vy + p.vx * 0.035; p.vx = vx; p.vy = vy; p.x += vx; p.y += vy; p.life *= decay * 0.99 }
      particles = particles.filter(p => p.life > 0.05 && p.x >= 0 && p.x < W && p.y >= 0 && p.y < H)
      break
    }
    case 'bounce': {
      // A rate-controlled set of particles ricochets around the panel.
      const N = Math.max(4, Math.min(50, Math.round(4 + rate * 46)))
      while (particles.length < N) particles.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.5, vy: (rnd() - 0.5) * 0.5, life: 1, r: color.r, g: color.g, b: color.b })
      if (particles.length > N) particles = particles.slice(0, N)
      for (const p of particles) { p.x += p.vx; p.y += p.vy; if (p.x <= 0 || p.x >= W - 1) { p.x = Math.max(0, Math.min(W - 1, p.x)); p.vx *= -1 } if (p.y <= 0 || p.y >= H - 1) { p.y = Math.max(0, Math.min(H - 1, p.y)); p.vy *= -1 } p.life = 1 }
      break
    }
    case 'attractor': {
      // Particles chase a moving attractor, overshooting into loose loops.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.1, vy: (rnd() - 0.5) * 0.1, life: 1, r: color.r, g: color.g, b: color.b })
      const ax = (W - 1) * (0.5 + 0.35 * Math.sin(t * 0.7)), ay = (H - 1) * (0.5 + 0.35 * Math.cos(t * 0.9))
      for (const p of particles) { const dx = ax - p.x, dy = ay - p.y, d = Math.max(1, Math.hypot(dx, dy)); p.vx = p.vx * 0.97 + dx / d * 0.025; p.vy = p.vy * 0.97 + dy / d * 0.025; p.x += p.vx; p.y += p.vy; p.life *= decay * 0.998 }
      particles = particles.filter(p => p.life > 0.05)
      break
    }
    case 'waterfall': {
      // Dense drops accelerate down a narrow central stream and splash outward.
      const spawn = Math.max(1, Math.round(rate * 3))
      for (let i = 0; i < spawn; i++) if (rnd() < rate) particles.push({ x: W * (0.35 + rnd() * 0.3), y: 0, vx: (rnd() - 0.5) * 0.08, vy: rnd() * 0.2 + 0.12, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.vy += 0.025; p.x += p.vx; p.y += p.vy; if (p.y >= H - 1) { p.y = H - 1; p.vy *= -0.3; p.vx += (rnd() - 0.5) * 0.35; p.life *= 0.7 } p.life *= decay * 0.995 }
      particles = particles.filter(p => p.life > 0.05 && p.y < H)
      break
    }
    case 'fountain':
    default: {
      // Sparks rise from the bottom, arc under gravity, and fade.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: H - 1, vx: (rnd() - 0.5) * 0.6, vy: -(rnd() * 0.5 + 0.1), life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.life *= decay }
      particles = particles.filter(p => p.life > 0.04 && p.y >= 0)
      break
    }
  }

  if (particles.length > MAX_PARTICLES) particles = particles.slice(particles.length - MAX_PARTICLES)
  particleState.set(nodeId, particles)

  const frame = blankFrame(W, H)
  // Particles render as a soft circular blob whose radius scales with matrix
  // size (see particleScale.ts) so a spark reads at roughly the same visual
  // size on a 64x64 panel as on the reference 16x16 one, instead of shrinking
  // to a single near-invisible pixel.
  const radius = Math.max(0.5, particleRadius(W, H))
  for (const p of particles) {
    const k = Math.min(1, p.life)
    // Colour each particle by its life through the palette — young/bright
    // particles land at the palette's hot end and cool toward its start as they fade.
    splatDisc(frame, p.x, p.y, radius, scaleRgb(samplePalette(palette, k), k))
  }
  return frame
}

function evalGradientFrame(cA: RGB, cB: RGB, vertical: boolean, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const t = vertical ? y / (H - 1) : x / (W - 1)
      return { r: Math.round(cA.r * (1-t) + cB.r * t), g: Math.round(cA.g * (1-t) + cB.g * t), b: Math.round(cA.b * (1-t) + cB.b * t) }
    })
}

function wrap01(v: number): number {
  return ((v % 1) + 1) % 1
}

// Dispatch for the bundled `Noise` node — `noiseType` picks the algorithm.
// All variants share the (speed, scale)→field signature, then the node maps
// that field through a palette for its normal `frame` output. Keep the cases
// in sync with PROPERTY_META.noiseType and cppGenerator's `Noise` case.
function evalNoiseFieldByType(noiseType: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  switch (noiseType) {
    case 'simplex': return evalSimplex2DField(speed, scale, t, W, H)
    case 'noise3d': return evalNoise3DField(speed, scale, t, W, H)
    case 'noise4d': return evalNoise4DField(speed, scale, t, W, H)
    case 'worley':  return evalWorleyField(speed, scale, t, W, H)
    case 'plasma':  return evalPlasmaFractalField(speed, scale, t, W, H)
    case 'sine':    return evalSineField(speed, scale, t, W, H)
    case 'field':
    default:        return evalNoiseFieldRaw(speed, scale, t, W, H)
  }
}

function evalNoiseFieldRaw(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = (Math.sin(x * scale * 0.5 + t * speed) +
                 Math.cos(y * scale * 0.5 + t * speed * 0.7)) / 2
      out[y * W + x] = Math.max(0, Math.min(1, (v + 1) / 2))
    }
  }
  return out
}

function evalSimplex2DField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 4; oct++) {
        v += amp * _snoise2(x * freq + t * speed * 0.13, y * freq + t * speed * 0.1)
        amp *= 0.5; freq *= 2
      }
      out[y * W + x] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

function evalNoise3DField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  // 3D via two orthogonal 2D slices animated along the z (time) axis
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = t * speed * 0.08
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * (_snoise2(x * freq + z * 0.37, y * freq) * 0.6 +
                    _snoise2(x * freq * 0.9, y * freq + z * 0.61) * 0.4)
        amp *= 0.5; freq *= 2.1
      }
      out[y * W + x] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

// Looping "4D" noise approximation for the browser preview: animate around a
// circle in two hidden dimensions so the pattern returns to its starting point
// every cycle, matching the firmware variant's circular z/t path through
// FastLED's real inoise16(x, y, z, t).
function evalNoise4DField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const ang = t * speed * Math.PI * 2
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        const ox = Math.cos(ang + oct * 0.9) * 0.8
        const oy = Math.sin(ang + oct * 1.1) * 0.8
        const a = _snoise2(x * freq + ox, y * freq + oy)
        const b = _snoise2(x * freq + oy * 0.7 + 11.3, y * freq + ox * 0.7 - 7.1)
        v += amp * (a * 0.65 + b * 0.35)
        amp *= 0.5; freq *= 2
      }
      out[y * W + x] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

// Integer hash → [0,1), used to place a feature point per cell for Worley noise.
function worleyHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Worley (cellular) noise: distance to the nearest animated feature point,
// coloured through a palette. Feature points jitter on a circle over time.
function evalWorleyField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x * scale, py = y * scale
      const xi = Math.floor(px), yi = Math.floor(py)
      let f1 = Infinity
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const cx = xi + di, cy = yi + dj
          const hh = worleyHash(cx, cy)
          const fx = cx + 0.5 + 0.45 * Math.sin(t * speed + hh * 6.2831)
          const fy = cy + 0.5 + 0.45 * Math.cos(t * speed * 1.1 + hh * 6.2831)
          const d = Math.hypot(px - fx, py - fy)
          if (d < f1) f1 = d
        }
      out[y * W + x] = Math.min(1, f1)
    }
  }
  return out
}

// Gabor noise: sparse-convolution noise summing one Gaussian-windowed cosine
// (Gabor) kernel per grid cell. `orientation` fixes the band direction (the
// anisotropic variant) and `frequency` the band spacing; phase animates over
// time. Coloured through a palette.
function evalGaborNoise(speed: number, scale: number, frequency: number, orientation: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const omega = (orientation * Math.PI) / 180
  const cosO = Math.cos(omega), sinO = Math.sin(omega)
  const TAU = Math.PI * 2
  return buildFrame(W, H, (x, y) => {
      const px = x * scale, py = y * scale
      const xi = Math.floor(px), yi = Math.floor(py)
      let v = 0
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const cx = xi + di, cy = yi + dj
          const h = worleyHash(cx, cy)
          const h2 = worleyHash(cx + 31, cy - 17)
          const fx = cx + 0.5 + (h - 0.5)
          const fy = cy + 0.5 + (h2 - 0.5)
          const dx = px - fx, dy = py - fy
          const gauss = Math.exp(-2.5 * (dx * dx + dy * dy))
          const proj = dx * cosO + dy * sinO
          const w = h2 < 0.5 ? 1 : -1
          v += w * gauss * Math.cos(TAU * frequency * proj + t * speed + h * TAU)
        }
      return samplePalette(palette, v * 0.5 + 0.5)
    })
}

// Angled palette gradient: project each pixel onto a direction set by `angle`,
// normalise across the matrix to 0–1, then sample the palette (with `repeat`
// cycles and an optional time-scrolling offset).
function evalPaletteGradient(angle: number, repeat: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const a = (angle * Math.PI) / 180
  const cosA = Math.cos(a), sinA = Math.sin(a)
  const projMin = (cosA < 0 ? (W - 1) * cosA : 0) + (sinA < 0 ? (H - 1) * sinA : 0)
  const projMax = (cosA > 0 ? (W - 1) * cosA : 0) + (sinA > 0 ? (H - 1) * sinA : 0)
  const range = Math.max(1e-6, projMax - projMin)
  return buildFrame(W, H, (x, y) => {
      const tnorm = (x * cosA + y * sinA - projMin) / range
      return samplePalette(palette, tnorm * repeat + t * speed)
    })
}

// Fractal (fBm) noise: sum simplex octaves at doubling frequency / halving
// amplitude for a detailed, cloud-like field, coloured through a palette.
function evalFractalNoise(speed: number, scale: number, octaves: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const z = t * speed * 0.15
  const oct = Math.max(1, Math.min(6, Math.floor(octaves)))
  return buildFrame(W, H, (x, y) => {
      let v = 0, amp = 0.5, freq = scale, norm = 0
      for (let o = 0; o < oct; o++) {
        v += amp * _snoise2(x * freq + z, y * freq - z * 0.5)
        norm += amp; amp *= 0.5; freq *= 2
      }
      const n = (v / norm) * 0.5 + 0.5
      return samplePalette(palette, ((n % 1) + 1) % 1)
    })
}

// Same fBm construction as evalFractalNoise, but returns the raw 0–1 scalar
// field instead of sampling it through a palette — the noise-driven Field
// source, alongside FieldFormula's hand-written expressions.
function evalFieldNoise(speed: number, scale: number, octaves: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const z = t * speed * 0.15
  const oct = Math.max(1, Math.min(6, Math.floor(octaves)))
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0, amp = 0.5, freq = scale, norm = 0
      for (let o = 0; o < oct; o++) {
        v += amp * _snoise2(x * freq + z, y * freq - z * 0.5)
        norm += amp; amp *= 0.5; freq *= 2
      }
      out[y * W + x] = Math.max(0, Math.min(1, (v / norm) * 0.5 + 0.5))
    }
  }
  return out
}

// Metaballs: several moving charges; each pixel's field is the summed inverse-
// square influence, mapped smoothly to a palette (lava-lamp blobs).
function evalBlobs(speed: number, scale: number, count: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const n = Math.max(1, Math.min(6, Math.floor(count)))
  const r2 = (scale * Math.min(W, H)) ** 2
  const bx: number[] = [], by: number[] = []
  for (let i = 0; i < n; i++) {
    bx.push(W * (0.5 + 0.4 * Math.sin(t * speed * (0.7 + i * 0.13) + i * 1.7)))
    by.push(H * (0.5 + 0.4 * Math.cos(t * speed * (0.6 + i * 0.17) + i * 2.3)))
  }
  return buildFrame(W, H, (x, y) => {
      let f = 0
      for (let i = 0; i < n; i++) { const dx = x - bx[i], dy = y - by[i]; f += r2 / (dx * dx + dy * dy + 1) }
      return samplePalette(palette, f / (f + 1))
    })
}

// Flow field: particles drift along a simplex-noise direction field, depositing
// fading trails that are coloured through a palette. Stateful.
function evalFlowField(nodeId: string, speed: number, scale: number, count: number, fade: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const N = W * H
  const pc = Math.max(8, Math.min(400, Math.floor(count)))
  let s = flowState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.px.length !== pc) {
    const px = new Float32Array(pc), py = new Float32Array(pc)
    for (let i = 0; i < pc; i++) { px[i] = Math.random() * W; py[i] = Math.random() * H }
    s = { px, py, trail: new Float32Array(N), w: W, h: H }
    flowState.set(nodeId, s)
  }
  const { px, py, trail } = s
  const f = Math.max(0, Math.min(1, fade))
  for (let i = 0; i < N; i++) trail[i] *= f
  const z = t * 0.1
  for (let i = 0; i < pc; i++) {
    const a = _snoise2(px[i] * scale + z, py[i] * scale) * Math.PI * 4
    px[i] = ((px[i] + Math.cos(a) * speed * 0.6) % W + W) % W
    py[i] = ((py[i] + Math.sin(a) * speed * 0.6) % H + H) % H
    const idx = Math.floor(py[i]) * W + Math.floor(px[i])
    trail[idx] = Math.min(1, trail[idx] + 0.5)
  }
  return buildFrame(W, H, (x, y) => samplePalette(palette, trail[y * W + x]))
}

// Warp starfield: stars fly outward from the centre; nearer stars are brighter.
function evalStarfield(nodeId: string, speed: number, count: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const pc = Math.max(8, Math.min(300, Math.floor(count)))
  let s = starState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.x.length !== pc) {
    const x = new Float32Array(pc), y = new Float32Array(pc), z = new Float32Array(pc)
    for (let i = 0; i < pc; i++) { x[i] = Math.random() * 2 - 1; y[i] = Math.random() * 2 - 1; z[i] = Math.random() * 0.9 + 0.1 }
    s = { x, y, z, w: W, h: H }; starState.set(nodeId, s)
  }
  const { x, y, z } = s
  const frame = blankFrame(W, H)
  for (let i = 0; i < pc; i++) {
    z[i] -= speed * 0.015
    if (z[i] <= 0.02) { x[i] = Math.random() * 2 - 1; y[i] = Math.random() * 2 - 1; z[i] = 1 }
    const px = Math.round(W / 2 + (x[i] / z[i]) * W * 0.35), py = Math.round(H / 2 + (y[i] / z[i]) * H * 0.35)
    if (px >= 0 && px < W && py >= 0 && py < H) {
      const b = Math.min(1, 1 - z[i])
      // Depth (near = 1) picks the palette colour and the brightness.
      frame[py][px] = scaleRgb(samplePalette(palette, b), b)
    }
  }
  return frame
}

// Boids — Reynolds flocking. Each agent steers by three weighted rules over the
// neighbours inside `range` px: separation (push off close ones), alignment
// (match average heading), cohesion (drift toward the local centre of mass).
// Velocities update simultaneously (read old, write new), then are renormalised
// to a constant speed so the swarm stays bounded; positions wrap toroidally.
// Rendered as a bright head pixel plus a dim one-pixel tail along the heading.
// `colorMode` tints each boid: 'solid' (the wired/prop colour), 'palette' (a
// fixed per-boid position across the wired palette), 'heading' (hue from
// movement direction), 'spectrum' (a fixed per-boid hue across the wheel),
// 'density' (hue by local neighbour count — warm where the flock clusters),
// 'position' (a spatial hue gradient the flock moves through), 'cycle' (the whole
// flock breathing through the wheel over time), or 'radial' (hue by distance from
// the matrix centre — concentric rings the flock crosses).
// Kept a faithful mirror of the C++ emitter in cppGenerator.ts.
function evalBoids(nodeId: string, speed: number, count: number, sep: number, ali: number, coh: number, range: number, color: RGB, palette: Palette, colorMode: string, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const n = Math.max(2, Math.min(80, Math.floor(count)))
  let s = boidState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.x.length !== n) {
    const x = new Float32Array(n), y = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      x[i] = Math.random() * W; y[i] = Math.random() * H
      const a = Math.random() * Math.PI * 2; vx[i] = Math.cos(a); vy[i] = Math.sin(a)
    }
    s = { x, y, vx, vy, w: W, h: H }; boidState.set(nodeId, s)
  }
  const { x, y, vx, vy } = s
  const maxSpeed = Math.max(0.1, speed)
  const range2 = range * range
  const sepR2 = (range * 0.5) * (range * 0.5)
  const nvx = new Float32Array(n), nvy = new Float32Array(n), nn = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, avx = 0, avy = 0, cx = 0, cy = 0, near = 0, sc = 0
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const dx = x[j] - x[i], dy = y[j] - y[i]
      const d2 = dx * dx + dy * dy
      if (d2 < range2) {
        avx += vx[j]; avy += vy[j]; cx += x[j]; cy += y[j]; near++
        if (d2 < sepR2 && d2 > 0) { sx -= dx; sy -= dy; sc++ }
      }
    }
    nn[i] = near
    let stx = 0, sty = 0
    if (near > 0) {
      stx += (avx / near - vx[i]) * ali * 0.08
      sty += (avy / near - vy[i]) * ali * 0.08
      stx += (cx / near - x[i]) * coh * 0.005
      sty += (cy / near - y[i]) * coh * 0.005
    }
    if (sc > 0) { stx += sx * sep * 0.05; sty += sy * sep * 0.05 }
    nvx[i] = vx[i] + stx; nvy[i] = vy[i] + sty
  }
  const frame = blankFrame(W, H)
  for (let i = 0; i < n; i++) {
    const sp = Math.hypot(nvx[i], nvy[i]) || 1
    const dirx = nvx[i] / sp, diry = nvy[i] / sp
    vx[i] = dirx * maxSpeed; vy[i] = diry * maxSpeed
    x[i] = (x[i] + vx[i] + W) % W; y[i] = (y[i] + vy[i] + H) % H
    const bc = colorMode === 'palette' ? samplePalette(palette, i / n)
      : colorMode === 'heading' ? hsv((Math.atan2(diry, dirx) / (Math.PI * 2) + 0.5) * 360, 1, 1)
      : colorMode === 'spectrum' ? hsv((i / n) * 360, 1, 1)
      : colorMode === 'density' ? hsv((1 - Math.min(1, nn[i] / 8)) * 0.7 * 360, 1, 1)
      : colorMode === 'position' ? hsv((x[i] / W + y[i] / H) * 0.5 * 360, 1, 1)
      : colorMode === 'cycle' ? hsv(t * 0.1 * 360, 1, 1)
      : colorMode === 'radial' ? hsv(Math.hypot(x[i] - W / 2, y[i] - H / 2) / (Math.hypot(W / 2, H / 2) || 1) * 360, 1, 1)
      : color
    const tr = bc.r >> 2, tg = bc.g >> 2, tb = bc.b >> 2
    const px = Math.floor(x[i]), py = Math.floor(y[i])
    if (px >= 0 && px < W && py >= 0 && py < H) frame[py][px] = bc
    const tx = Math.floor((x[i] - dirx + W) % W), ty = Math.floor((y[i] - diry + H) % H)
    if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
      const c = frame[ty][tx]
      frame[ty][tx] = { r: Math.max(c.r, tr), g: Math.max(c.g, tg), b: Math.max(c.b, tb) }
    }
  }
  return frame
}

// Plasma blended with fractal (simplex) noise for an organic flowing field.
function evalPlasmaFractalField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = Math.sin(x * 0.2 + t * speed) + Math.sin(y * 0.25 + t * speed * 0.8) + Math.sin((x + y) * 0.15 + t * speed * 0.6)
      let amp = 1, freq = scale, fn = 0
      for (let o = 0; o < 3; o++) { fn += amp * _snoise2(x * freq + t * speed * 0.1, y * freq); amp *= 0.5; freq *= 2 }
      v += fn * 2.5
      out[y * W + x] = wrap01(v * 0.15)
    }
  }
  return out
}

// Audio-reactive flow: a simplex band field scrolling at a speed set by mids,
// brightness pulsed by bass, hue nudged by treble.
function evalAudioFlow(bass: number, mids: number, treble: number, speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const flow = t * speed * (0.2 + mids * 1.5)
  // Random vertical drift: a slow noise wander (random up/down direction) whose
  // reach grows with treble/bass, so the field bobs vertically in time with the
  // music while `flow` scrolls it horizontally.
  const vAmp = 0.2 + treble * 0.7 + bass * 0.3
  const vflow = _snoise2(t * speed * 4 + 50, 17.3) * vAmp
  const bright = Math.min(1, 0.3 + bass)
  return buildFrame(W, H, (x, y) => {
      const v = _snoise2(x * scale + flow, y * scale * 0.6 + vflow) * 0.5 + 0.5
      const c = samplePalette(palette, (((v + treble * 0.3) % 1) + 1) % 1)
      return { r: Math.round(c.r * bright), g: Math.round(c.g * bright), b: Math.round(c.b * bright) }
    })
}

// Gray-Scott reaction-diffusion. Two chemicals U, V diffuse on a toroidal grid
// and react; V is coloured through a palette. Stateful — steps each frame.
function evalReactionDiffusion(nodeId: string, feed: number, kill: number, iters: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const N = W * H
  let s = rdState.get(nodeId)
  if (!s || s.w !== W || s.h !== H) {
    const u = new Float32Array(N).fill(1), v = new Float32Array(N)
    // Seed a small central patch of V to kick off the reaction.
    for (let y = (H >> 1) - 2; y <= (H >> 1) + 1; y++)
      for (let x = (W >> 1) - 2; x <= (W >> 1) + 1; x++)
        if (x >= 0 && x < W && y >= 0 && y < H) { u[y * W + x] = 0.5; v[y * W + x] = 0.25 + worleyHash(x, y) * 0.5 }
    s = { u, v, un: new Float32Array(N), vn: new Float32Array(N), w: W, h: H }
    rdState.set(nodeId, s)
  }
  const Du = 0.16, Dv = 0.08
  for (let it = 0; it < iters; it++) {
    const { u, v, un, vn } = s
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yr = y * W
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W, xp = (x + 1) % W, i = yr + x
        const lapU = (u[ym + x] + u[yp + x] + u[yr + xm] + u[yr + xp]) * 0.2
          + (u[ym + xm] + u[ym + xp] + u[yp + xm] + u[yp + xp]) * 0.05 - u[i]
        const lapV = (v[ym + x] + v[yp + x] + v[yr + xm] + v[yr + xp]) * 0.2
          + (v[ym + xm] + v[ym + xp] + v[yp + xm] + v[yp + xp]) * 0.05 - v[i]
        const uvv = u[i] * v[i] * v[i]
        un[i] = Math.max(0, Math.min(1, u[i] + Du * lapU - uvv + feed * (1 - u[i])))
        vn[i] = Math.max(0, Math.min(1, v[i] + Dv * lapV + uvv - (kill + feed) * v[i]))
      }
    }
    s.u = un; s.un = u; s.v = vn; s.vn = v   // swap front/back buffers
  }
  const v = s.v
  return buildFrame(W, H, (x, y) => samplePalette(palette, v[y * W + x]))
}

// Conway's Game of Life on a toroidal grid. Live cells glow at the palette's hot
// end; dead cells fade out (trails), cooling toward the palette start. Steps at
// `speed`/sec and reseeds when it stagnates.
function evalGameOfLife(nodeId: string, palette: Palette, speed: number, fade: number, tick: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const N = W * H
  const seed = (cells: Uint8Array) => { for (let i = 0; i < N; i++) cells[i] = Math.random() < 0.3 ? 1 : 0 }
  let s = golState.get(nodeId)
  if (!s || s.w !== W || s.h !== H) {
    const cells = new Uint8Array(N); seed(cells)
    s = { cells, next: new Uint8Array(N), bright: new Float32Array(N), w: W, h: H, lastStep: -1e9, stale: 0 }
    golState.set(nodeId, s)
  }
  const interval = Math.max(1, Math.round(60 / Math.max(1, Math.min(60, speed))))
  if (tick - s.lastStep >= interval) {
    const { cells, next } = s
    let pop = 0, changed = false
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yr = y * W
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W, xp = (x + 1) % W, i = yr + x
        const n = cells[ym + xm] + cells[ym + x] + cells[ym + xp] + cells[yr + xm]
          + cells[yr + xp] + cells[yp + xm] + cells[yp + x] + cells[yp + xp]
        const nv = cells[i] ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0)
        next[i] = nv; pop += nv; if (nv !== cells[i]) changed = true
      }
    }
    s.cells = next; s.next = cells   // swap
    s.stale = (pop === 0 || !changed) ? s.stale + 1 : 0
    if (s.stale > 3) { seed(s.cells); s.stale = 0 }
    s.lastStep = tick
  }
  const { cells, bright } = s
  const f = Math.max(0, Math.min(1, fade))
  for (let i = 0; i < N; i++) bright[i] = cells[i] ? 1 : bright[i] * f
  return buildFrame(W, H, (x, y) => {
      const b = bright[y * W + x]
      return scaleRgb(samplePalette(palette, b), b)
    })
}

function heatColor(temperature: number): RGB {
  const t192 = Math.floor(temperature * 191 / 255)
  const ramp = (t192 & 0x3F) << 2
  if (t192 > 0x80) return { r: 255, g: 255, b: ramp }
  if (t192 > 0x40) return { r: 255, g: ramp, b: 0 }
  return { r: ramp, g: 0, b: 0 }
}

const fire2012Heat = new Map<string, Uint8Array[]>()

function evalFire2012(nodeId: string, cooling: number, sparking: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const stored = fire2012Heat.get(nodeId)
  let heat: Uint8Array[]
  if (!stored || stored.length !== H || stored[0].length !== W) {
    heat = Array.from({ length: H }, () => new Uint8Array(W))
    fire2012Heat.set(nodeId, heat)
  } else {
    heat = stored
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cool = Math.floor(Math.random() * ((cooling * 10 / H) + 2))
      heat[y][x] = Math.max(0, heat[y][x] - cool)
    }
  for (let y = 0; y < H - 2; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = Math.floor(
        (heat[y+1][x] + heat[y+2][Math.max(0,x-1)] + heat[y+2][x] + heat[y+2][Math.min(W-1,x+1)]) / 4
      )
  for (let x = 0; x < W; x++)
    if (Math.random() * 255 < sparking)
      heat[H-1][x] = Math.min(255, heat[H-1][x] + Math.floor(Math.random() * 95) + 160)
  // Heat (0–255) indexes the palette; the default 'heat' palette reproduces the
  // classic FastLED HeatColors fire ramp.
  return heat.map(row => Array.from(row).map(h => samplePalette(palette, h / 255)))
}

function evalBlur2D(src: Frame, amount: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const radius = Math.max(1, Math.round(amount / 255 * 3))
  return buildFrame(W, H, (x, y) => {
      let r = 0, g = 0, b = 0, count = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.max(0, Math.min(W-1, x+dx))
          const ny = Math.max(0, Math.min(H-1, y+dy))
          r += src[ny][nx].r; g += src[ny][nx].g; b += src[ny][nx].b; count++
        }
      }
      return { r: Math.round(r/count), g: Math.round(g/count), b: Math.round(b/count) }
    })
}

function evalWipe(a: Frame, b: Frame, tt: number, direction: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      let revealed: boolean
      switch (direction) {
        case 'left':  revealed = x > W * (1 - tt); break
        case 'up':    revealed = y > H * (1 - tt); break
        case 'down':  revealed = y < H * tt;       break
        default:      revealed = x < W * tt;       break // 'right'
      }
      return revealed ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalDissolve(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const hash = (((x * 1664525 + y * 1013904223) >>> 0) / 0xffffffff)
      return hash < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

// ── Extra transition variants (bundled into the `Transition` node) ───────────
// All blend frame A→B by `tt` (0–1); keep in sync with cppGenerator's
// `Transition` case.

function evalIris(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const r = tt * Math.hypot(cx, cy)
  return buildFrame(W, H, (x, y) => Math.hypot(x - cx, y - cy) < r ? { ...b[y][x] } : { ...a[y][x] })
}

function evalClockWipe(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  return buildFrame(W, H, (x, y) => {
      // atan2 shifted so 12 o'clock = 0 and the sweep goes clockwise
      const norm = (Math.atan2(x - cx, -(y - cy)) + Math.PI) / (2 * Math.PI)
      return norm < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalPush(a: Frame, b: Frame, tt: number, direction: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      let ax: number, ay: number, bx: number, by: number
      switch (direction) {
        case 'left':
          ax = Math.round(x - tt * W); ay = y; bx = Math.round(x + (1 - tt) * W); by = y; break
        case 'up':
          ax = x; ay = Math.round(y - tt * H); bx = x; by = Math.round(y + (1 - tt) * H); break
        case 'down':
          ax = x; ay = Math.round(y + tt * H); bx = x; by = Math.round(y - (1 - tt) * H); break
        default: // 'right'
          ax = Math.round(x + tt * W); ay = y; bx = Math.round(x - (1 - tt) * W); by = y
      }
      if (bx >= 0 && bx < W && by >= 0 && by < H) return { ...b[by][bx] }
      if (ax >= 0 && ax < W && ay >= 0 && ay < H) return { ...a[ay][ax] }
      return { r: 0, g: 0, b: 0 }
    })
}

function evalCheckerboard(a: Frame, b: Frame, tt: number, tileSize: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const isEven = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0
      const threshold = isEven ? tt * 2 : tt * 2 - 1
      return threshold >= 1 ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalDiagonal(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => (x / W + y / H) / 2 < tt ? { ...b[y][x] } : { ...a[y][x] })
}

function evalFadeThroughBlack(a: Frame, b: Frame, tt: number): Frame {
  const [src, alpha] = tt < 0.5 ? [a, 1 - tt * 2] : [b, (tt - 0.5) * 2]
  return buildFrame(src[0]?.length ?? 0, src.length, (x, y) => {
    const px = src[y][x]
    return { r: Math.round(px.r * alpha), g: Math.round(px.g * alpha), b: Math.round(px.b * alpha) }
  })
}

function evalFadeThroughWhite(a: Frame, b: Frame, tt: number): Frame {
  const [src, alpha] = tt < 0.5 ? [a, 1 - tt * 2] : [b, (tt - 0.5) * 2]
  const w = (1 - alpha) * 255
  return buildFrame(src[0]?.length ?? 0, src.length, (x, y) => {
    const px = src[y][x]
    return { r: Math.round(px.r * alpha + w), g: Math.round(px.g * alpha + w), b: Math.round(px.b * alpha + w) }
  })
}

function evalBlinds(a: Frame, b: Frame, tt: number, count: number, axis: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const slatSize = Math.max(1, Math.floor((axis === 'horizontal' ? H : W) / count))
  return buildFrame(W, H, (x, y) => {
      const pos = axis === 'horizontal' ? y : x
      return (pos % slatSize) / slatSize < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalRippleWipe(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy), edge = 0.08
  return buildFrame(W, H, (x, y) => {
      const norm = Math.hypot(x - cx, y - cy) / maxR
      if (norm < tt - edge) return { ...b[y][x] }
      if (norm >= tt) return { ...a[y][x] }
      const blend = (tt - norm) / edge, pa = a[y][x], pb = b[y][x]
      return {
        r: Math.round(pa.r * (1 - blend) + pb.r * blend),
        g: Math.round(pa.g * (1 - blend) + pb.g * blend),
        b: Math.round(pa.b * (1 - blend) + pb.b * blend),
      }
    })
}

function evalSpiralWipe(a: Frame, b: Frame, tt: number, turns: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy)
  return buildFrame(W, H, (x, y) => {
      const r = Math.hypot(x - cx, y - cy) / maxR
      const normAngle = (Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)
      return (r + normAngle / turns) / (1 + 1 / turns) < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalCurtain(a: Frame, b: Frame, tt: number, axis: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      // distance from the centre axis: reveals the centre gap first
      const dist = axis === 'horizontal' ? Math.abs(2 * y / H - 1) : Math.abs(2 * x / W - 1)
      return dist < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalScanLines(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
    // even rows complete in [0, 0.5), odd rows in [0.5, 1.0)
    const threshold = y % 2 === 0 ? (y / H) * 0.5 : 0.5 + ((y - 1) / H) * 0.5
    return tt > threshold ? b[y][x] : a[y][x]
  })
}

function evalZoom(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  return buildFrame(W, H, (x, y) => {
      const pa = a[y][x]
      if (tt <= 0) return { ...pa }
      if (tt >= 1) return { ...b[y][x] }
      const scale = Math.max(0.01, tt)
      const bx = Math.round((x - cx) / scale + cx), by = Math.round((y - cy) / scale + cy)
      if (bx >= 0 && bx < W && by >= 0 && by < H) {
        const pb = b[by][bx]
        return {
          r: Math.round(pa.r * (1 - tt) + pb.r * tt),
          g: Math.round(pa.g * (1 - tt) + pb.g * tt),
          b: Math.round(pa.b * (1 - tt) + pb.b * tt),
        }
      }
      return { r: Math.round(pa.r * (1 - tt)), g: Math.round(pa.g * (1 - tt)), b: Math.round(pa.b * (1 - tt)) }
    })
}

// Dispatch one of the 16 A→B transition styles (the Transition node + the
// Pattern Master both composite through this). Unknown type → crossfade.
export function compositeTransition(
  type: string, a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H,
  opts: { dir?: string; axis?: string; tileSize?: number; count?: number; turns?: number } = {},
): Frame {
  const dir = opts.dir ?? 'right'
  const axis = opts.axis ?? 'horizontal'
  const tileSize = Math.max(1, Math.round(opts.tileSize ?? 4))
  const count = Math.max(1, Math.round(opts.count ?? 4))
  const turns = Math.max(1, opts.turns ?? 2)
  switch (type) {
    case 'wipe':         return evalWipe(a, b, tt, dir, W, H)
    case 'dissolve':     return evalDissolve(a, b, tt, W, H)
    case 'iris':         return evalIris(a, b, tt, W, H)
    case 'clockwipe':    return evalClockWipe(a, b, tt, W, H)
    case 'push':         return evalPush(a, b, tt, dir, W, H)
    case 'checkerboard': return evalCheckerboard(a, b, tt, tileSize, W, H)
    case 'diagonal':     return evalDiagonal(a, b, tt, W, H)
    case 'fadeblack':    return evalFadeThroughBlack(a, b, tt)
    case 'fadewhite':    return evalFadeThroughWhite(a, b, tt)
    case 'blinds':       return evalBlinds(a, b, tt, count, axis, W, H)
    case 'ripple':       return evalRippleWipe(a, b, tt, W, H)
    case 'spiral':       return evalSpiralWipe(a, b, tt, turns, W, H)
    case 'curtain':      return evalCurtain(a, b, tt, axis, W, H)
    case 'scanlines':    return evalScanLines(a, b, tt, W, H)
    case 'zoom':         return evalZoom(a, b, tt, W, H)
    default:             return blendFrame(a, b, tt, W, H)   // crossfade
  }
}

interface ShowState {
  cur: number; nxt: number; phase: 'hold' | 'trans'
  start: number; dwell: number; trans: string; lastBeat: boolean; n: number
  /** ms of the most recent beat-triggered particle burst, if any. */
  burstT?: number
}
export interface PatternShowSelection {
  currentIndex: number
  nextIndex: number
  transitioning: boolean
}
interface ShowOpts {
  minTime: number; maxTime: number; transSec: number; pool: string[]; beatEnabled: boolean
  particles: boolean; particleStyle: number; particleHue: number; particleIntensity: number
}

/** Read the current selection of a live PatternMaster by its evaluator state key.
 *  Root-level PatternMaster nodes use their node id as the key. */
export function getPatternShowSelection(key: string): PatternShowSelection | null {
  const st = patternShowState.get(key)
  if (!st) return null
  return {
    currentIndex: st.cur,
    nextIndex: st.nxt,
    transitioning: st.phase === 'trans',
  }
}

// The generative show: hold a random pattern for a random dwell in
// [minTime, maxTime], then transition (a random style from `pool`) into another
// random pattern. A wired beat advances early, once at least minTime has passed.
// `render(groupId)` rasterises a pattern's subgraph to a frame.
// ── Particle-burst overlay ────────────────────────────────────────────────────
// A burst spawns PARTICLE_COUNT short-lived colored sparks that fade out, in one
// of seventeen motion styles. The motion is a pure function of burst time + spark
// index (deterministic), so the browser preview (showPreview re-exports this) and
// the firmware (the switch in playerSketchGenerator / showGenerator) spawn the
// same sparks. Keep the three switches in sync.
export const PARTICLE_LIFE_MS = 600
export const PARTICLE_COUNT = 16
const P_TAU = Math.PI * 2

function particlePrnd(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

function particleHsv(hue: number): RGB {
  const h = ((hue / 255) * 360) % 360
  const c = 1, x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return { r: r * 255, g: g * 255, b: b * 255 }
}

/** Additive spark overlay (0–255 per channel, pre-brightness) for a burst that
 *  started at `burstTms`, or null when outside its lifetime. `intensity` 0–1. */
export function renderParticleBurst(
  burstTms: number, timeMs: number, intensity: number, style: number, hue: number,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame | null {
  if (timeMs < burstTms || timeMs >= burstTms + PARTICLE_LIFE_MS) return null
  const ov = blankFrame(W, H)
  const ageSec = (timeMs - burstTms) / 1000
  const f = (timeMs - burstTms) / PARTICLE_LIFE_MS
  const col = particleHsv(hue)
  const cx = W * 0.5, cy = H * 0.5, maxR = Math.min(W, H) * 0.5
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const base = burstTms * 0.001 + i * 7.13
    const r1 = particlePrnd(base + 1), r2 = particlePrnd(base + 2), r3 = particlePrnd(base + 3), r4 = particlePrnd(base + 4)
    let x: number, y: number, bri = 1 - f
    switch (style) {
      case 1:  // rain
        x = r1 * W + (r4 - 0.5) * 2 * ageSec
        y = r2 * H * 0.5 + (4 + r3 * 6) * ageSec
        break
      case 2: {  // explode
        const a = r1 * P_TAU, sp = 2 + r2 * 6
        x = cx + Math.cos(a) * sp * ageSec; y = cy + Math.sin(a) * sp * ageSec
        break
      }
      case 3: {  // fireworks
        const a = r1 * P_TAU, sp = 3 + r2 * 5
        x = cx + (r3 - 0.5) * W * 0.3 + Math.cos(a) * sp * ageSec
        y = cy + Math.sin(a) * sp * ageSec + 4 * ageSec * ageSec
        bri = (1 - f) * (1 - f)
        break
      }
      case 4: {  // swirl
        const a = r1 * P_TAU + 6 * ageSec, rad = (0.15 + f * 0.85) * maxR
        x = cx + Math.cos(a) * rad; y = cy + Math.sin(a) * rad
        break
      }
      case 5:  // twinkle
        x = r1 * W; y = r2 * H
        bri = Math.max(0, 1 - Math.abs(f - r3) * 3)
        break
      case 6: {  // ring
        const a = r1 * P_TAU, rad = f * maxR
        x = cx + Math.cos(a) * rad; y = cy + Math.sin(a) * rad
        bri = (1 - f) * 1.25
        break
      }
      case 7:  // fountain
        x = cx + (r1 - 0.5) * 10 * ageSec
        y = H - 1 - (3 + r2 * 6) * ageSec + 5 * ageSec * ageSec
        break
      case 8: {  // helix
        const a = (i % 2) * Math.PI + r1 * 0.7 + ageSec * 9
        x = cx + Math.cos(a) * maxR * 0.55
        y = H - 1 - f * (H + 2) + (r2 - 0.5) * 2
        break
      }
      case 9:  // meteor
        x = -2 + f * (W + 6) - r1 * 5
        y = r2 * H + x * 0.35 + (r3 - 0.5) * 2
        bri = (1 - r1 * 0.7) * (1 - f * 0.5)
        break
      case 10:  // confetti
        x = r1 * W + Math.sin(ageSec * 7 + r3 * P_TAU) * 1.5
        y = (r2 * H + ageSec * (2 + r4 * 4)) % H
        bri = (1 - f) * (0.55 + 0.45 * Math.sin(ageSec * 12 + r3 * P_TAU) ** 2)
        break
      case 11:  // sparkle — fast twinkle drizzling slowly down
        x = r1 * W + (r4 - 0.5)
        y = r2 * H * 0.3 + ageSec * (2 + r3 * 3)
        bri = Math.max(0, Math.sin(ageSec * (30 + r3 * 30) + r4 * P_TAU)) * (1 - f)
        break
      case 12: {  // comet — one shared Lissajous head with a fading trail of sparks
        const trailT = ageSec - (i / PARTICLE_COUNT) * 0.4
        const tt = Math.max(0, trailT)
        x = W * 0.5 + 0.42 * (W - 1) * Math.sin(tt * 8.0)
        y = H * 0.5 + 0.42 * (H - 1) * Math.sin(tt * 5.5 + 1.3)
        bri = trailT < 0 ? 0 : (1 - f) * (1 - i / PARTICLE_COUNT)
        break
      }
      case 13:  // snow — slow fall with a gentle horizontal sway
        x = r1 * W + Math.sin(ageSec * 1.5 + r4 * P_TAU) * 1.3
        y = r2 * H * 0.5 + ageSec * (1.2 + r3 * 1.3)
        bri = (1 - f) * (0.6 + 0.4 * r4)
        break
      case 14:  // gravity — drops from the top, accelerating as they fall
        x = r1 * W + (r4 - 0.5)
        y = r2 * H * 0.35 + 5.5 * ageSec * ageSec
        break
      case 15: {  // bubbles — buoyant rise with a wobble, popping partway up
        x = r1 * W + Math.sin(ageSec * 3 + r4 * P_TAU)
        y = (H - 1) - ageSec * (2 + r2 * 2)
        const popT = 0.3 + r3 * 0.5
        bri = f < popT ? 1 - f : 0
        break
      }
      case 16: {  // vortex — spirals inward toward the centre, spinning faster as it collapses
        const a = r1 * P_TAU + (2 + f * 10) * ageSec, rad = (1 - f * 0.85) * maxR
        x = cx + Math.cos(a) * rad; y = cy + Math.sin(a) * rad
        break
      }
      default:  // rise
        x = r1 * W + (r3 - 0.5) * 8 * ageSec
        y = r2 * H + (-(1 + r4 * 3)) * ageSec + 3 * ageSec * ageSec
        break
    }
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) continue
    const b = intensity * Math.max(0, Math.min(1, bri))
    const cell = ov[yi][xi]
    cell.r = Math.min(255, cell.r + col.r * b)
    cell.g = Math.min(255, cell.g + col.g * b)
    cell.b = Math.min(255, cell.b + col.b * b)
  }
  return ov
}

function evalPatternShow(
  key: string, ids: string[], render: (groupId: string) => Frame,
  beat: boolean, o: ShowOpts, t: number, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const n = ids.length
  if (n === 0) return blankFrame(W, H)
  const pickDwell = () => o.minTime + Math.random() * Math.max(0, o.maxTime - o.minTime)

  let st = patternShowState.get(key)
  if (!st || st.n !== n) {
    st = { cur: Math.min(st?.cur ?? Math.floor(Math.random() * n), n - 1), nxt: 0,
           phase: 'hold', start: t, dwell: pickDwell(), trans: 'crossfade', lastBeat: beat, n }
  }

  const beatEdge = o.beatEnabled && beat && !st.lastBeat
  st.lastBeat = beat
  // Each beat also fires a particle burst (independent of the dwell-gated
  // pattern advance), if the node has particles enabled.
  if (beatEdge && o.particles) st.burstT = t * 1000

  if (st.phase === 'hold' && n > 1) {
    const timeUp = t >= st.start + st.dwell
    const beatTrig = beatEdge && t >= st.start + o.minTime
    if (timeUp || beatTrig) {
      st.nxt = (st.cur + 1 + Math.floor(Math.random() * (n - 1))) % n   // uniform, ≠ cur
      st.trans = o.pool.length ? o.pool[Math.floor(Math.random() * o.pool.length)] : 'crossfade'
      st.phase = 'trans'
      st.start = t
    }
  }

  let frame: Frame
  if (st.phase === 'trans') {
    const prog = o.transSec <= 0 ? 1 : Math.min(1, (t - st.start) / o.transSec)
    frame = compositeTransition(st.trans, render(ids[st.cur]), render(ids[st.nxt]), prog, W, H)
    if (prog >= 1) {
      st.cur = st.nxt
      st.phase = 'hold'
      st.start = t
      st.dwell = pickDwell()
    }
  } else {
    frame = render(ids[st.cur])
  }

  // Overlay a beat-triggered particle burst additively (pre-brightness), the
  // same sparks the firmware spawns on _audioBeat.
  if (o.particles && st.burstT != null) {
    const ov = renderParticleBurst(st.burstT, t * 1000, o.particleIntensity, o.particleStyle, o.particleHue, W, H)
    if (ov) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = ov[y][x], px = frame[y][x]
        px.r = Math.min(255, px.r + s.r); px.g = Math.min(255, px.g + s.g); px.b = Math.min(255, px.b + s.b)
      }
    }
  }

  patternShowState.set(key, st)
  return frame
}

/** Per-pixel linear blend of two frames, m=0 → a, m=1 → b. */
function blendFrame(a: Frame, b: Frame, m: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const k = Math.max(0, Math.min(1, m))
  return buildFrame(W, H, (x, y) => {
      const pa = a[y]?.[x] ?? { r: 0, g: 0, b: 0 }
      const pb = b[y]?.[x] ?? { r: 0, g: 0, b: 0 }
      return {
        r: Math.round(pa.r * (1 - k) + pb.r * k),
        g: Math.round(pa.g * (1 - k) + pb.g * k),
        b: Math.round(pa.b * (1 - k) + pb.b * k),
      }
    })
}

/**
 * Timeline-as-a-node: cycles through its frame inputs, holding each for
 * `interval` seconds and crossfading into the next over the trailing `fade`
 * seconds. Stateless — fully determined by `t`.
 */
function evalSequencer(frames: (Frame | null)[], interval: number, fade: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const valid = frames.filter((f): f is Frame => f !== null)
  if (valid.length === 0) return blankFrame(W, H)
  if (valid.length === 1) return valid[0]

  const iv = Math.max(0.1, interval)
  const phase = t / iv
  const idx = Math.floor(phase) % valid.length
  const into = (phase - Math.floor(phase)) * iv          // seconds into this slot
  const fadeDur = Math.max(0, Math.min(fade, iv))
  if (fadeDur <= 0 || into < iv - fadeDur) return valid[idx]

  const m = (into - (iv - fadeDur)) / fadeDur            // 0 → 1 across the fade
  return blendFrame(valid[idx], valid[(idx + 1) % valid.length], m, W, H)
}

// Centred / polar coordinate helpers, shared by CustomFormula and FieldFormula.
// cx,cy range -1..1; r is 0 at centre (~1.41 at the corners); angle is -π..π.
function centeredX(xi: number, W: number): number { return (xi - W / 2) / (W / 2 || 1) }
function centeredY(yi: number, H: number): number { return (yi - H / 2) / (H / 2 || 1) }

function evalCustomFormula(formula: string, a: number, b: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const fn = compileFormula(formula, formulaCache)
  if (!fn) return blankFrame(W, H)
  const shims = makeShims(t)
  const sv = SHIM_NAMES.map((n) => shims[n])

  return buildFrame(W, H, (xi, yi) => {
      try {
        const cx = centeredX(xi, W), cy = centeredY(yi, H)
        const r = Math.sqrt(cx * cx + cy * cy), angle = Math.atan2(cy, cx)
        // x,y stay normalised 0..1 for backward compatibility; cx/cy/r/angle are new.
        const v = fn(xi / (W - 1 || 1), yi / (H - 1 || 1), cx, cy, r, angle, t, W, H, a, b, 0, ...sv)
        return samplePalette(palette, ((v % 1) + 1) % 1)
      } catch {
        return { r: 0, g: 0, b: 0 }
      }
    })
}

function evalFieldFormula(formula: string, a: number, b: number, fieldIn: Field | null, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  const fn = compileFormula(formula, fieldFormulaCache)
  if (!fn) return out
  const shims = makeShims(t)
  const sv = SHIM_NAMES.map((n) => shims[n])

  for (let yi = 0; yi < H; yi++) {
    for (let xi = 0; xi < W; xi++) {
      const cx = centeredX(xi, W), cy = centeredY(yi, H)
      const r = Math.sqrt(cx * cx + cy * cy), angle = Math.atan2(cy, cx)
      const fin = fieldIn ? fieldIn[yi * W + xi] : 0
      let v = 0
      // FieldFormula uses integer pixel coords for x,y (ANIMartRIX convention).
      try { v = fn(xi, yi, cx, cy, r, angle, t, W, H, a, b, fin, ...sv) } catch { v = 0 }
      out[yi * W + xi] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
    }
  }
  return out
}

const WAVE_SIM_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.5],
  [0.26, 0.34],
  [0.74, 0.4],
  [0.34, 0.76],
  [0.7, 0.7],
]

function injectWaveSimRipple(field: Float32Array, pulse: number, impulse: number, W: number, H: number): void {
  const [px, py] = WAVE_SIM_POINTS[pulse % WAVE_SIM_POINTS.length]
  const cx = px * (W - 1), cy = py * (H - 1)
  const radius = Math.max(1.5, Math.min(W, H) * 0.12)
  const x0 = Math.max(0, Math.floor(cx - radius - 1))
  const x1 = Math.min(W - 1, Math.ceil(cx + radius + 1))
  const y0 = Math.max(0, Math.floor(cy - radius - 1))
  const y1 = Math.min(H - 1, Math.ceil(cy + radius + 1))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy)
      const falloff = Math.max(0, 1 - dist / radius)
      if (falloff <= 0) continue
      const i = y * W + x
      field[i] = Math.max(-1, Math.min(1, field[i] + impulse * falloff * falloff))
    }
  }
}

function evalWaveSim(nodeId: string, trigger: boolean, speed: number, damping: number, impulse: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const N = W * H
  let s = waveSimState.get(nodeId)
  if (!s || s.w !== W || s.h !== H) {
    s = {
      prev: new Float32Array(N),
      cur: new Float32Array(N),
      next: new Float32Array(N),
      w: W,
      h: H,
      prevTrigger: false,
      pulse: 1,
    }
    injectWaveSimRipple(s.cur, 0, impulse, W, H)
    waveSimState.set(nodeId, s)
  }

  if (trigger && !s.prevTrigger) {
    injectWaveSimRipple(s.cur, s.pulse, impulse, W, H)
    s.pulse++
  }
  s.prevTrigger = trigger

  const iters = Math.max(1, Math.min(12, Math.floor(speed)))
  const damp = Math.max(0.8, Math.min(0.999, damping))
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yr = y * W
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W, xp = (x + 1) % W, i = yr + x
        const neighbourAvg = (s.cur[ym + x] + s.cur[yp + x] + s.cur[yr + xm] + s.cur[yr + xp]) * 0.5
        s.next[i] = Math.max(-1, Math.min(1, (neighbourAvg - s.prev[i]) * damp))
      }
    }
    const swap = s.prev
    s.prev = s.cur
    s.cur = s.next
    s.next = swap
  }

  let peak = 0
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(s.cur[i]))
  if (peak < 0.002) {
    injectWaveSimRipple(s.cur, s.pulse, impulse * 0.6, W, H)
    s.pulse++
  }

  const out = allocField(N)
  for (let i = 0; i < N; i++) out[i] = Math.max(0, Math.min(1, Math.abs(s.cur[i]) * 1.5))
  return out
}

function evalFieldToFrame(field: Field | null, palette: Palette, brightness: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const bv = Math.max(0, Math.min(1, brightness))
  const b8 = (v: number) => Math.max(0, Math.min(255, Math.round(v * bv)))
  return buildFrame(W, H, (x, y) => {
      if (!field) return { r: 0, g: 0, b: 0 }
      const c = samplePalette(palette, field[y * W + x])
      return { r: b8(c.r), g: b8(c.g), b: b8(c.b) }
    })
}

// ── Code node ─────────────────────────────────────────────────────────────────
// Lightweight, best-effort C++→JS transpile so pasted FastLED loop bodies can be
// approximated in the live preview. Strips C++ type keywords from declarations
// and rewrites leds[] writes to shim calls (JS can't overload |=). The pasted
// text is still emitted verbatim into the firmware. See
// docs/development/design/code-node.md for the rules and known divergences.
const FN_RET_TYPES = 'void|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int|long|float|double|bool|byte|CRGB|CHSV|fract8|fract16|accum88'

// `fract8 chance, uint8_t x` → `chance, x` (keep the last token of each arg).
function stripArgTypes(args: string): string {
  return args.split(',').map((a) => a.trim()).filter(Boolean)
    .map((a) => (a.split(/\s+/).pop() ?? a).replace(/[*&]/g, ''))
    .join(', ')
}

function transpileCode(code: string): string {
  return code
    // Drop C++ storage qualifiers JS doesn't have (`static uint8_t x` → `x`).
    .replace(/\bstatic\s+/g, '')
    // C++ function definition → JS function (strip return type and arg types).
    // Runs before the declaration rule so `CRGB foo(...) {` isn't mangled.
    .replace(new RegExp(`\\b(?:${FN_RET_TYPES})\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`, 'g'),
      (_m, name, args) => `function ${name}(${stripArgTypes(args)}) {`)
    // A C++ type keyword introducing a local (declaration position only —
    // followed by an identifier). Casts like `(uint8_t)x` have `)` after the
    // keyword, so they're left untouched.
    .replace(/\b(?:uint8_t|uint16_t|uint32_t|int8_t|int16_t|int|long|float|double|bool|byte|CRGBPalette16|CRGBPalette256|TBlendType)\s+(?=[A-Za-z_])/g, 'let ')
    // Named colour constants: `CRGB::Red` (invalid JS `::`) → crgbConst('Red').
    .replace(/\b(?:CRGB|CHSV)::(\w+)/g, "crgbConst('$1')")
    // leds[i] |= rgb  → additive blend; leds[i] = rgb → overwrite. |= first.
    .replace(/leds\s*\[([^\]]*)\]\s*\|=\s*([^;]+);/g, 'addLed($1, $2);')
    .replace(/leds\s*\[([^\]]*)\]\s*=\s*([^;]+);/g, 'setLed($1, $2);')
}

// FastLED vocabulary the transpiled body runs against. Closures capture this
// frame's leds[] and t, so the compiled function (cached) stays stateless.
function makeCodeShim(leds: RGB[], t: number, W: number, H: number) {
  const N = leds.length
  const c8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const inRange = (i: number) => i >= 0 && i < N
  return {
    // Shared FastLED fixed-point shims (sin8/cos8/sin16/beatsin8/beatsin16/
    // scale8/qadd8/qsub8) — the same module the ANIMartRIX field nodes use, so
    // the Code node and field formulas behave identically.
    ...makeShims(t),
    CHSV: (h: number, s = 255, v = 255) => hsv((h / 255) * 360, s / 255, v / 255),
    CRGB: (r: number, g: number, b: number) => ({ r: c8(r), g: c8(g), b: c8(b) }),
    // beat8/beat16 (sawtooth ramps) aren't in the shared shim set; keep local.
    beat8: (bpm: number) => Math.floor((t * bpm / 60) * 256) % 256,
    beat16: (bpm: number) => Math.floor((t * bpm / 60) * 65536) % 65536,
    random8: (lim?: number) => Math.floor(Math.random() * (lim ?? 256)),
    random16: (lim?: number) => Math.floor(Math.random() * (lim ?? 65536)),
    millis: () => t * 1000,
    XY: (x: number, y: number) =>
      Math.max(0, Math.min(H - 1, y | 0)) * W + Math.max(0, Math.min(W - 1, x | 0)),
    addLed: (i: number, c: RGB) => {
      i |= 0
      if (inRange(i) && c) leds[i] = { r: Math.min(255, leds[i].r + c.r), g: Math.min(255, leds[i].g + c.g), b: Math.min(255, leds[i].b + c.b) }
    },
    setLed: (i: number, c: RGB) => { i |= 0; if (inRange(i) && c) leds[i] = { r: c8(c.r), g: c8(c.g), b: c8(c.b) } },
    fadeToBlackBy: (arr: RGB[], n: number, amount: number) => {
      const k = (255 - c8(amount)) / 255
      const m = Math.min(n | 0, arr.length)
      for (let i = 0; i < m; i++) arr[i] = { r: arr[i].r * k, g: arr[i].g * k, b: arr[i].b * k }
    },
    // Named CRGB colour constants (CRGB::Red etc., rewritten from `::` by the
    // transpile). A small common subset; unknown names fall back to black.
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
    // ── Palettes ──────────────────────────────────────────────────────────
    // FastLED preset palette constants → the evaluator's own palette model.
    ...CODE_PALETTES,
    // Blend-type enum values (ignored, but must be defined so they don't throw).
    NOBLEND: 0, LINEARBLEND: 1, LINEARBLEND_NOWRAP: 2,
    // CRGBPalette16(c0, c1, …) builds a stop list; from a preset token it passes
    // it through. The declaration form (`CRGBPalette16 p = …`) is type-stripped.
    CRGBPalette16: (...cols: unknown[]): Palette => {
      const stops = cols.filter((c): c is RGB => !!c && typeof c === 'object' && 'r' in (c as RGB))
      if (stops.length) return stops.map((c) => ({ r: c8(c.r), g: c8(c.g), b: c8(c.b) }))
      if (cols.length === 1 && (typeof cols[0] === 'string' || Array.isArray(cols[0]))) return cols[0] as Palette
      return 'rainbow'
    },
    // ColorFromPalette(pal, index0-255, brightness0-255) — blendType ignored.
    ColorFromPalette: (pal: Palette, index: number, bright = 255): RGB =>
      palAt(pal, index, bright),
    // fill_palette(arr, n, startIndex, indexInc, pal, brightness) — blendType ignored.
    fill_palette: (arr: RGB[], n: number, startIndex: number, indexInc: number, pal: Palette, bright = 255): void => {
      const m = Math.min(n | 0, arr.length)
      for (let i = 0; i < m; i++) arr[i] = palAt(pal, startIndex + i * indexInc, bright)
    },
  }
}

// Sample a palette at a 0–255 index, scaled by 0–255 brightness (FastLED's
// ColorFromPalette semantics) — shared by ColorFromPalette and fill_palette.
function palAt(pal: Palette, index: number, bright: number): RGB {
  const c8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const c = samplePalette(pal ?? 'rainbow', ((((index | 0) % 256) + 256) % 256) / 255)
  const k = c8(bright) / 255
  return { r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k) }
}

// Common FastLED named colours for `CRGB::<Name>` (extend as needed).
const CRGB_CONSTANTS: Record<string, RGB> = {
  Black: { r: 0, g: 0, b: 0 }, White: { r: 255, g: 255, b: 255 },
  Red: { r: 255, g: 0, b: 0 }, Green: { r: 0, g: 255, b: 0 }, Blue: { r: 0, g: 0, b: 255 },
  Yellow: { r: 255, g: 255, b: 0 }, Cyan: { r: 0, g: 255, b: 255 }, Magenta: { r: 255, g: 0, b: 255 },
  Orange: { r: 255, g: 165, b: 0 }, Purple: { r: 128, g: 0, b: 128 }, Pink: { r: 255, g: 192, b: 203 },
  Gold: { r: 255, g: 215, b: 0 }, Aqua: { r: 0, g: 255, b: 255 }, Lime: { r: 0, g: 255, b: 0 },
}

// FastLED preset palette constants mapped onto the evaluator's palette model
// (named presets where samplePalette has them, RGB stops otherwise).
const CLOUD_STOPS: RGB[] = [
  { r: 0, g: 0, b: 255 }, { r: 0, g: 0, b: 139 }, { r: 135, g: 206, b: 235 }, { r: 255, g: 255, b: 255 },
]
const CODE_PALETTES: Record<string, Palette> = {
  RainbowColors_p: 'rainbow', RainbowStripeColors_p: 'rainbow',
  OceanColors_p: 'ocean', LavaColors_p: 'lava', ForestColors_p: 'forest',
  PartyColors_p: 'party', HeatColors_p: 'heat', CloudColors_p: CLOUD_STOPS,
}

function evalCode(key: string, globalCode: string, code: string, seed: Frame | null, t: number, W: number, H: number): Frame {
  // Global section runs each frame above the loop body, so helper functions and
  // constants are in scope. (Mutable global state re-inits per frame in the
  // preview — it persists on-device; see docs/development/design/code-node.md.)
  const cacheKey = globalCode + ' ' + code
  if (!codeCache.has(cacheKey)) {
    if (codeCache.size > 50) {
      codeCache.clear()
      codeCompileError.clear()
    }
    try {
      const body = transpileCode(globalCode) + '\n' + transpileCode(code)
      const fn = new Function('leds', 'NUM_LEDS', 'WIDTH', 'HEIGHT', 't', 'shim',
        '"use strict"; const { CHSV,CRGB,beatsin16,beatsin8,beat8,beat16,sin8,cos8,sin16,qadd8,qsub8,scale8,triwave8,quadwave8,cubicwave8,ease8InOutQuad,ease8InOutCubic,blend8,lerp8by8,lerp16by16,sqrt16,nscale8,random8,random16,millis,XY,addLed,setLed,fadeToBlackBy,crgbConst,fill_solid,fill_rainbow,nblend,ColorFromPalette,fill_palette,CRGBPalette16,NOBLEND,LINEARBLEND,LINEARBLEND_NOWRAP,RainbowColors_p,RainbowStripeColors_p,OceanColors_p,LavaColors_p,ForestColors_p,PartyColors_p,HeatColors_p,CloudColors_p } = shim; ' + body
      ) as CodeFn
      codeCache.set(cacheKey, fn)
      codeCompileError.delete(cacheKey)
    } catch (e) {
      codeCache.set(cacheKey, null)
      codeCompileError.set(cacheKey, errMsg(e))
    }
  }
  const fn = codeCache.get(cacheKey)
  const N = W * H

  // Persistent leds[] per node-instance (fade-trails accumulate across frames).
  // A wired frame input overwrites it each frame; unwired, it persists.
  let leds = codeLeds.get(key)
  if (!leds || leds.length !== N) {
    leds = Array.from({ length: N }, () => ({ r: 0, g: 0, b: 0 }))
    codeLeds.set(key, leds)
  }
  if (seed) {
    for (let i = 0; i < N; i++) {
      const px = seed[Math.floor(i / W)]?.[i % W]
      leds[i] = px ? { ...px } : { r: 0, g: 0, b: 0 }
    }
  }
  if (fn) {
    try {
      fn(leds, N, W, H, t, makeCodeShim(leds, t, W, H))
      codeError.delete(key)   // ran cleanly — clear any prior error
    } catch (e) {
      // Keep the last good leds and surface the error; the loop keeps running so
      // it recovers automatically once the code (or its state) stops throwing.
      codeError.set(key, errMsg(e))
    }
  } else {
    codeError.set(key, codeCompileError.get(cacheKey) ?? 'compile error')
  }
  return buildFrame(W, H, (x, y) => {
      const px = leds![y * W + x]
      return { r: Math.max(0, Math.min(255, Math.round(px.r))), g: Math.max(0, Math.min(255, Math.round(px.g))), b: Math.max(0, Math.min(255, Math.round(px.b))) }
    })
}

// Distance from each pixel to a movable point (px,py in normalised 0–1 space).
// Output is 0 at the point, rising to 1; `scale` (≥1) stretches the ramp so it
// reaches 1 sooner. The diagonal of the unit square (√2) is the 1.0 reference.
function evalDistanceField(px: number, py: number, scale: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  const sc = Math.max(0.0001, scale)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = x / (W - 1 || 1), ny = y / (H - 1 || 1)
      const dx = nx - px, dy = ny - py
      const d = (Math.sqrt(dx * dx + dy * dy) / Math.SQRT2) * sc
      out[y * W + x] = Math.max(0, Math.min(1, d))
    }
  }
  return out
}

// Combine two fields pixel-by-pixel. An unwired input is a zero field, so unary
// ops (e.g. `subtract` from 0 to negate, clamped) still behave sensibly.
function evalFieldMath(a: Field | null, b: Field | null, op: string, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let i = 0; i < W * H; i++) {
    const x = a ? a[i] : 0, y = b ? b[i] : 0
    let v: number
    switch (op) {
      case 'subtract':   v = x - y; break
      case 'multiply':   v = x * y; break
      case 'mix':        v = (x + y) * 0.5; break
      case 'min':        v = Math.min(x, y); break
      case 'max':        v = Math.max(x, y); break
      case 'difference': v = Math.abs(x - y); break
      case 'add':
      default:           v = x + y; break
    }
    out[i] = Math.max(0, Math.min(1, v))
  }
  return out
}

// Sample `field` at coordinates pushed by the dx/dy offset fields. Offsets map
// 0–1 → −strength…+strength pixels (an unwired offset field = no push). Sample
// is nearest-neighbour, clamped to the matrix edges.
function evalFieldWarp(field: Field | null, dx: Field | null, dy: Field | null, strength: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  if (!field) return out
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ox = dx ? (2 * dx[y * W + x] - 1) * strength : 0
      const oy = dy ? (2 * dy[y * W + x] - 1) * strength : 0
      const sx = Math.max(0, Math.min(W - 1, Math.round(x + ox)))
      const sy = Math.max(0, Math.min(H - 1, Math.round(y + oy)))
      out[y * W + x] = field[sy * W + sx]
    }
  }
  return out
}

// Rotate a field around its centre by `angleRad`. Samples the source at the
// inverse-rotated coordinate (nearest-neighbour), wrapping at the matrix edges.
function evalFieldRotate(field: Field | null, angleRad: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  if (!field) return out
  const cxc = (W - 1) / 2, cyc = (H - 1) / 2
  const ca = Math.cos(-angleRad), sa = Math.sin(-angleRad)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cxc, dy = y - cyc
      const sx = ((Math.round(dx * ca - dy * sa + cxc) % W) + W) % W
      const sy = ((Math.round(dx * sa + dy * ca + cyc) % H) + H) % H
      out[y * W + x] = field[sy * W + sx]
    }
  }
  return out
}

// Tile/repeat a field `tilesX`×`tilesY` times across the matrix (nearest sample).
function evalFieldTile(field: Field | null, tilesX: number, tilesY: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  if (!field) return out
  const tx = Math.max(1, Math.round(tilesX)), ty = Math.max(1, Math.round(tilesY))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      out[y * W + x] = field[((y * ty) % H) * W + ((x * tx) % W)]
    }
  }
  return out
}

// ── Main entry point ──────────────────────────────────────────────────────────

export type PortValue = number | boolean | string | string[] | RGB | RGB[] | Frame | Field | null

/** A reusable pattern group: a named subgraph that a `Group` node evaluates. */
export interface GroupDef { nodes: StudioNode[]; edges: StudioEdge[] }
export type GroupRegistry = Record<string, GroupDef>

/** Audio values fed to reactive nodes in place of the live mic store. The field
 *  set mirrors exactly what the audio cases read from `useAudioStore`. */
export interface AudioOverride {
  active: boolean
  micActive: boolean
  bass?: number
  mids?: number
  treble?: number
  micBass: number
  micMids: number
  micTreble: number
  spectrum: number[]
  detectorSpectrum: number[]
}

function semanticAudioInputs(audio: Pick<AudioOverride, 'micBass' | 'micMids' | 'micTreble'>): Record<string, PortValue> {
  return {
    bass: audio.micBass,
    mids: audio.micMids,
    treble: audio.micTreble,
    kick: audio.micBass,
    snare: audio.micMids,
    hihat: audio.micTreble,
    vocals: audio.micMids,
    energy: (audio.micBass + audio.micMids + audio.micTreble) / 3,
    beat: false,
    silence: audio.micBass + audio.micMids + audio.micTreble < 0.03,
  }
}

// Build the memoised evaluator closure for one graph (or group subgraph) at a
// given tick. `instancePrefix` namespaces stateful-node state per group
// instance; `groupStack` breaks group-level recursion; `groupInputs` carries
// the values bound to the current group's exposed parameters.
interface EvalMaps {
  nodeMap: Map<string, StudioNode>
  incoming: Map<string, { srcId: string; srcPort: string }>
}

// The per-evaluator lookup tables: node id → node, and
// "targetNodeId:targetPortId" → upstream {srcId, srcPort}.
function buildEvalMaps(nodes: StudioNode[], edges: StudioEdge[]): EvalMaps {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const incoming = new Map<string, { srcId: string; srcPort: string }>()
  for (const edge of edges) {
    if (edge.source && edge.target && edge.sourceHandle && edge.targetHandle)
      incoming.set(`${edge.target}:${edge.targetHandle}`, {
        srcId: edge.source,
        srcPort: edge.sourceHandle,
      })
  }
  return { nodeMap, incoming }
}

function createEvalNode(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  W: number,
  H: number,
  groups: GroupRegistry,
  instancePrefix: string,
  groupStack: ReadonlySet<string>,
  groupInputs: Record<string, PortValue>,
  // When set, audio-reactive nodes read from this instead of the live mic store
  // — the show preview uses it to feed a group's FFTAnalyzer/BeatDetect the
  // song's baked bass/mids/treble, matching what firmware plays back on-device.
  audioOverride: AudioOverride | null = null,
  // Prebuilt lookup maps for callers that create many evaluators over the same
  // graph (e.g. sampling a scope across a tick series) — see buildEvalMaps.
  shared: EvalMaps | null = null,
) {
  const t = tick / 60   // seconds at assumed 60 fps

  // State maps are module-level and keyed by node id; prefix with the group
  // instance path so two instances of the same group don't share state.
  const stateKey = (id: string) => markStateUsed(instancePrefix + id)

  const { nodeMap, incoming } = shared ?? buildEvalMaps(nodes, edges)

  const memo = new Map<string, Record<string, PortValue>>()
  // Nodes currently on the evaluation stack — used to break graph cycles.
  const inProgress = new Set<string>()

  // Resolve one input port: walk the edge map, fall back to `fallback`
  function input(nodeId: string, portId: string, fallback: PortValue): PortValue {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (!up) return fallback
    return evalNode(up.srcId)[up.srcPort] ?? fallback
  }

  function num(nodeId: string, portId: string, props: Record<string, unknown>, propKey: string, def = 0): number {
    const v = Number(input(nodeId, portId, Number(props[propKey] ?? def)))
    // With the node's `clampInputs` toggle on, clamp a *wired* signal to the
    // control's slider range (an unwired value already comes from a bounded
    // slider) — the inline alternative to a Clamp node on every connection.
    if (props.clampInputs && incoming.has(`${nodeId}:${portId}`)) {
      const r = inputClampRange(nodeMap.get(nodeId)?.data.nodeType as string, propKey)
      if (r) return Math.max(r.min, Math.min(r.max, v))
    }
    return v
  }

  // Resolve a palette: prefer a connected `palette` port (a preset name from
  // PaletteSelector or custom colors from CustomPalette), else the node's
  // property (a preset name).
  function pal(nodeId: string, portId: string, props: Record<string, unknown>, propKey: string, def: string): Palette {
    const fallback = String(props[propKey] ?? def)
    const v = input(nodeId, portId, fallback)
    if (Array.isArray(v)) return v as RGB[]
    return typeof v === 'string' ? v : fallback
  }

  function normProp(value: unknown, fallback: number): number {
    const n = Number(value)
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
  }

  function evalNode(id: string): Record<string, PortValue> {
    if (memo.has(id)) return memo.get(id)!
    // Re-entering a node still on the stack means the graph has a cycle.
    // Return empty so the upstream input falls back to its default instead
    // of recursing forever and overflowing the stack.
    if (inProgress.has(id)) return {}
    const node = nodeMap.get(id)
    if (!node) return {}
    inProgress.add(id)

    const props = node.data.properties as Record<string, unknown>
    const type  = node.data.nodeType as string
    let out: Record<string, PortValue> = {}

    switch (type) {
      // ── Math ───────────────────────────────────────────────────────────
      case 'TimeNode':
        out = { time: t, dt: 1 / 60 }
        break

      // Bundled binary math (Add / Subtract / Multiply / Divide / Min / Max),
      // selected by `mathOp`. Missing inputs default to the operation's identity
      // (1 for multiply/divide, else 0). Keep in sync with cppGenerator's `Math`.
      case 'Math': {
        const op = String(props.mathOp ?? 'add')
        const idn = op === 'multiply' || op === 'divide' ? 1 : 0
        const a = num(id, 'a', props, 'a', idn)
        const b = num(id, 'b', props, 'b', idn)
        let r: number
        switch (op) {
          case 'subtract': r = a - b; break
          case 'multiply': r = a * b; break
          case 'divide':   r = b === 0 ? 0 : a / b; break
          case 'min':      r = Math.min(a, b); break
          case 'max':      r = Math.max(a, b); break
          case 'add':
          default:         r = a + b; break
        }
        out = { result: r }
        break
      }

      case 'Lerp': {
        const a  = num(id, 'a', props, 'a', 0)
        const b  = num(id, 'b', props, 'b', 1)
        const tt = num(id, 't', props, 't', 0.5)
        out = { result: a + (b - a) * tt }
        break
      }

      case 'Clamp': {
        const val = num(id, 'value', props, 'value', 0)
        const lo  = num(id, 'min',   props, 'min',   0)
        const hi  = num(id, 'max',   props, 'max',   1)
        out = { result: Math.max(lo, Math.min(hi, val)) }
        break
      }

      case 'MapRange': {
        const val   = num(id, 'value', props, 'value', 0)
        const inLo  = num(id, 'inMin', props, 'inMin', 0)
        const inHi  = num(id, 'inMax', props, 'inMax', 1)
        const outLo = Number(props.outMin ?? 0)
        const outHi = Number(props.outMax ?? 1)
        const t2 = inHi === inLo ? 0 : (val - inLo) / (inHi - inLo)
        out = { result: outLo + t2 * (outHi - outLo) }
        break
      }

      case 'Sin':
        out = { result: Math.sin(num(id, 'x', props, 'x', 0) * Math.PI * 2) }
        break

      case 'Cos':
        out = { result: Math.cos(num(id, 'x', props, 'x', 0) * Math.PI * 2) }
        break

      case 'Wave': {
        const amplitude = num(id, 'amplitude', props, 'amplitude', 1)
        const frequency = num(id, 'frequency', props, 'frequency', 1)
        const phase     = num(id, 'phase', props, 'phase', 0)
        const waveform  = String(props.waveform ?? 'sine')
        out = { result: waveSample(waveform, amplitude, frequency, phase, t) }
        break
      }

      case 'ComplexWave': {
        const a = num(id, 'a', props, 'a', 0)
        const b = num(id, 'b', props, 'b', 0)
        const operation = String(props.operation ?? 'add')
        out = { result: combineWaves(operation, a, b) }
        break
      }

      // ── Audio ─────────────────────────────────────────────────────────
      case 'MicInput':
        // Carries an explicit "audio signal is present" token through the graph.
        // Audio-reactive nodes still read their band values from the live store
        // (or a show override), but this token lets grouped subgraphs tell the
        // difference between a real wired mic path and an unbound GroupInput.
        out = { audio: true }
        break

      case 'FFTAnalyzer': {
        const audio = audioOverride ?? useAudioStore.getState()
        const audioConnected = audioOverride !== null || input(id, 'audio', null) !== null
        // No live audio source → no signal, unless the Test Signal toggle is on
        // (a synthetic oscillation for previewing motion without a microphone).
        // It's off by default so unwired/grouped patterns aren't driven into
        // "hyperdrive" and stay tunable.
        const hasLiveAudio = audioConnected && Boolean(audio.active || audio.micActive)
        const band = (value: number | undefined, fallback: number | undefined) =>
          clamp01(Number.isFinite(value) ? Number(value) : Number(fallback ?? 0))
        const raw = hasLiveAudio
          ? {
              bass: band(audio.bass, audio.micBass),
              mids: band(audio.mids, audio.micMids),
              treble: band(audio.treble, audio.micTreble),
            }
          : useUiStore.getState().testSignal
            ? {
                bass:   (Math.sin(t * 2.1) + 1) / 2,
                mids:   (Math.sin(t * 3.7 + 1.0) + 1) / 2,
                treble: (Math.sin(t * 5.3 + 2.0) + 1) / 2,
              }
            : { bass: 0, mids: 0, treble: 0 }
        const gain = Math.max(0.25, Math.min(4, Number(props.gain ?? 1)))
        // Early builds stored smoothing as an integer (default 3) but never
        // used it. Interpret that legacy value as quarters so saved graphs get
        // the intended 0.75 response instead of becoming almost frozen.
        const smoothingProp = Number(props.smoothing ?? 0.72)
        const smoothing = Math.max(0, Math.min(0.95, smoothingProp > 1 ? smoothingProp / 4 : smoothingProp))
        // Real-world audio (and raw, unweighted FFT magnitude) carries far more
        // energy in the bass than the treble, so treble reads weak by default.
        // `tilt` (0–1) counteracts that with a rising per-band boost — bass is
        // left alone, mids get a partial lift, treble gets the most.
        const tilt = Math.max(0, Math.min(1, Number(props.tilt ?? 0)))
        const target = {
          bass: Math.min(1, raw.bass * gain),
          mids: Math.min(1, raw.mids * gain * (1 + tilt * 0.6)),
          treble: Math.min(1, raw.treble * gain * (1 + tilt * 1.8)),
        }
        const key = stateKey(id)
        const prev = fftLevels.get(key) ?? target
        const levels = {
          bass: prev.bass * smoothing + target.bass * (1 - smoothing),
          mids: prev.mids * smoothing + target.mids * (1 - smoothing),
          treble: prev.treble * smoothing + target.treble * (1 - smoothing),
        }
        fftLevels.set(key, levels)
        out = levels
        break
      }

      case 'BeatDetect': {
        const key = stateKey(id)
        const audio = audioOverride ?? useAudioStore.getState()
        const audioConnected = audioOverride !== null || input(id, 'audio', null) !== null
        if (audioConnected && audio.active) {
          const threshold = denormalizeBeatParam('threshold', normProp(props.threshold, 0.2))
          const attack = denormalizeBeatParam('attack', normProp(props.attack, 0.55))
          const decay = denormalizeBeatParam('decay', normProp(props.decay, 0.25))
          const prev = beatLevels.get(key) ?? createBeatDetectorState()
          const result = updateBeatDetectorFromSpectrum(audio.detectorSpectrum ?? audio.spectrum ?? [], t * 1000, prev, { threshold, attack, decay })
          beatLevels.set(key, result.state)
          out = {
            beat: result.beat,
            bpm: result.bpm,
            flux: result.state.lastFlux,
            onset: result.state.lastOnset,
            contrast: result.state.lastContrast,
            threshold: result.state.lastThreshold,
            cooldownMs: result.state.lastCooldownMs,
          }
        } else {
          beatLevels.delete(key)
          out = { beat: false, bpm: 120, flux: 0, onset: 0, contrast: 0, threshold: 0, cooldownMs: 0 }
        }
        break
      }

      case 'PercussionDetect': {
        const key = stateKey(id)
        const sensitivity = normProp(props.sensitivity, 0.55)
        const decay = Math.max(0, Math.min(0.98, Number(props.decay ?? 0.72)))
        const separation = normProp(props.separation, 0.4)
        const audio = audioOverride ?? useAudioStore.getState()
        const audioConnected = audioOverride !== null || input(id, 'audio', null) !== null
        if (audioConnected && audio.active) {
          const spectrum = (audio.detectorSpectrum ?? audio.spectrum ?? []).map((v) => clamp01(Number(v) || 0))
          const prev = percussionLevels.get(key) ?? {
            prevSpectrum: spectrum,
            kick: 0,
            snare: 0,
            hihat: 0,
            vocals: 0,
            energy: 0,
            silence: false,
          }
          const low = avgRange(spectrum, 0, 4)
          const lowMid = avgRange(spectrum, 4, 9)
          const mids = avgRange(spectrum, 8, 16)
          const highs = avgRange(spectrum, 20, spectrum.length)
          const lowFlux = fluxRange(spectrum, prev.prevSpectrum, 0, 5)
          const midFlux = fluxRange(spectrum, prev.prevSpectrum, 6, 17)
          const highFlux = fluxRange(spectrum, prev.prevSpectrum, 18, spectrum.length)
          const threshold = 0.06 + (1 - sensitivity) * 0.18
          const kickTarget = clamp01(lowFlux * 3.1 + low * 0.9 - lowMid * (0.3 + separation * 0.45) - threshold)
          const snareTarget = clamp01(midFlux * 2.6 + mids * 0.55 - low * (0.18 + separation * 0.22) - highs * 0.08 - threshold * 0.8)
          const hihatTarget = clamp01(highFlux * 3.2 + highs * 0.45 - mids * (0.08 + separation * 0.18) - threshold * 0.65)
          const next = {
            ...prev,
            prevSpectrum: spectrum,
            kick: followLevel(prev.kick, kickTarget, decay),
            snare: followLevel(prev.snare, snareTarget, decay),
            hihat: followLevel(prev.hihat, hihatTarget, decay),
          }
          percussionLevels.set(key, next)
          out = { kick: next.kick, snare: next.snare, hihat: next.hihat }
        } else {
          percussionLevels.delete(key)
          out = useUiStore.getState().testSignal
            ? {
                kick: clamp01(Math.sin(t * 2.1) * 0.5 + 0.5),
                snare: clamp01(Math.sin(t * 4.0 + 1.2) * 0.5 + 0.5),
                hihat: clamp01(Math.sin(t * 7.5 + 2.1) * 0.5 + 0.5),
              }
            : { kick: 0, snare: 0, hihat: 0 }
        }
        break
      }

      case 'AudioFeatures': {
        const key = stateKey(id)
        const sensitivity = normProp(props.sensitivity, 0.5)
        const gate = normProp(props.gate, 0.12)
        const smoothing = Math.max(0, Math.min(0.95, Number(props.smoothing ?? 0.8)))
        const audio = audioOverride ?? useAudioStore.getState()
        const audioConnected = audioOverride !== null || input(id, 'audio', null) !== null
        if (audioConnected && audio.active) {
          const spectrum = (audio.detectorSpectrum ?? audio.spectrum ?? []).map((v) => clamp01(Number(v) || 0))
          const prev = audioFeatureLevels.get(key) ?? {
            prevSpectrum: spectrum,
            kick: 0,
            snare: 0,
            hihat: 0,
            vocals: 0,
            energy: 0,
            silence: false,
          }
          const low = avgRange(spectrum, 0, 5)
          const presence = avgRange(spectrum, 9, 18)
          const air = avgRange(spectrum, 18, spectrum.length)
          const presenceFlux = fluxRange(spectrum, prev.prevSpectrum, 9, 18)
          const total = avgRange(spectrum, 0, spectrum.length)
          const energyTarget = clamp01((total * 0.7 + low * 0.2 + presence * 0.1) * (0.8 + sensitivity * 0.6))
          const vocalsTarget = clamp01((presence * 1.35 + presenceFlux * 2.1 - low * 0.3 - air * 0.12) * (0.75 + sensitivity * 0.7) - gate * 0.35)
          const energy = prev.energy * smoothing + energyTarget * (1 - smoothing)
          const vocals = prev.vocals * smoothing + vocalsTarget * (1 - smoothing)
          const silenceThreshold = 0.015 + gate * 0.35
          const silence = energy < silenceThreshold
          const next = { ...prev, prevSpectrum: spectrum, vocals, energy, silence }
          audioFeatureLevels.set(key, next)
          out = { vocals, energy, silence }
        } else {
          audioFeatureLevels.delete(key)
          if (useUiStore.getState().testSignal) {
            const energy = clamp01((Math.sin(t * 0.8) + 1) / 2)
            out = { vocals: clamp01((Math.sin(t * 1.6 + 0.8) + 1) / 2), energy, silence: energy < 0.2 }
          } else {
            out = { vocals: 0, energy: 0, silence: true }
          }
        }
        break
      }

      // ── Pattern ────────────────────────────────────────────────────────
      case 'SolidColor': {
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 255) / 255),
          g: byte(Number(props.g ?? 0)   / 255),
          b: byte(Number(props.b ?? 128) / 255),
        }
        out = { frame: solidFrame(color, W, H) }
        break
      }

      case 'Text': {
        const text = String(props.text ?? 'HELLO')
        const font = asFont(props.font)
        const cols = textColumns(text, font)
        const wrap = Boolean(props.wrap)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 255) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        const sx = textStartPosition(num(id, 'x', props, 'x', 0.5), W, cols.length * 0.5, wrap)
        const sy = textStartPosition(num(id, 'y', props, 'y', 0.5), H, font.h * 0.5, wrap)
        const scroll = num(id, 'scroll', props, 'scroll', 0)
        out = { frame: renderText(text, color, sx, sy, scroll, t, font, W, H, wrap) }
        break
      }

      case 'Circle': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 255) / 255),
          g: byte(Number(props.g ?? 0)   / 255),
          b: byte(Number(props.b ?? 128) / 255),
        }
        const fill = (input(id, 'fill', null) as RGB | null) ?? hexToRgb(String(props.fill ?? '#ff0080'))
        const rad = num(id, 'radius', props, 'radius', 4)
        const filled = Boolean(props.filled)
        const wrap = Boolean(props.wrap)
        const cx = normalizedCenterAxis(num(id, 'cx', props, 'cx', 0.5), W, rad, wrap)
        const cy = normalizedCenterAxis(num(id, 'cy', props, 'cy', 0.5), H, rad, wrap)
        const xOffsets = wrap ? [-W, 0, W] : [0]
        const yOffsets = wrap ? [-H, 0, H] : [0]
        for (const ox of xOffsets) {
          for (const oy of yOffsets) {
            const drawX = cx + ox
            const drawY = cy + oy
            if (filled) {
              splatDisc(frame, drawX, drawY, rad, fill)
              splatRing(frame, drawX, drawY, rad, color)
            } else {
              splatRing(frame, drawX, drawY, rad, color)
            }
          }
        }
        out = { frame }
        break
      }

      case 'Line': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 200) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        const x0 = num(id, 'x1', props, 'x1', 0), y0 = num(id, 'y1', props, 'y1', 0)
        const x1 = num(id, 'x2', props, 'x2', 0), y1 = num(id, 'y2', props, 'y2', 0)
        const len = Math.hypot(x1 - x0, y1 - y0)
        const steps = Math.max(1, Math.ceil(len * 2))
        for (let i = 0; i <= steps; i++) {
          const u = i / steps
          splatDisc(frame, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0.5, color)
        }
        out = { frame }
        break
      }

      case 'Shape': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const shape = String(props.shape ?? 'polygon')
        const size = Math.max(0.5, num(id, 'size', props, 'size', 6))
        const aspect = Math.max(0.01, num(id, 'aspect', props, 'aspect', 1))
        const thickness = Math.max(0, num(id, 'thickness', props, 'thickness', 1.5))
        const wrap = Boolean(props.wrap)
        const fill = (input(id, 'fill', null) as RGB | null) ?? hexToRgb(String(props.fill ?? '#ff3080'))
        const edge = (input(id, 'edge', null) as RGB | null) ?? hexToRgb(String(props.edge ?? '#00e0ff'))
        const extent = shapeExtents(shape, size, aspect, num(id, 'rotation', props, 'rotation', 0), thickness)
        evalWrappedShape(
          frame,
          shape,
          normalizedCenterAxis(num(id, 'cx', props, 'cx', 0.5), W, extent.x, wrap),
          normalizedCenterAxis(num(id, 'cy', props, 'cy', 0.5), H, extent.y, wrap),
          size,
          aspect,
          num(id, 'sides', props, 'sides', 5),
          num(id, 'rotation', props, 'rotation', 0),
          thickness,
          Boolean(props.filled ?? true),
          fill, edge, W, H,
          wrap,
        )
        out = { frame }
        break
      }

      case 'Path': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 255) / 255),
          g: byte(Number(props.g ?? 220) / 255),
          b: byte(Number(props.b ?? 80)  / 255),
        }
        const tt = clamp01(num(id, 't', props, 't', 0))
        const scale = Math.max(0, num(id, 'scale', props, 'scale', 0.8))
        const thickness = Math.max(0.5, num(id, 'thickness', props, 'thickness', 1.25))
        const shape = String(props.pathShape ?? 'circle')
        const p = pathPoint(shape, tt)
        const cx = (W - 1) / 2, cy = (H - 1) / 2
        const radius = thickness * 0.5
        const extent = Math.max(0, Math.min(W, H) * 0.5 * scale - radius)
        splatDisc(frame, cx + p.x * extent, cy - p.y * extent, radius, color)
        out = { frame }
        break
      }

      // Bundled noise generators (NoiseField / Simplex2D / Noise3D / Noise4D /
      // Worley / PlasmaFractal). All share the same scalar-field core; the
      // node exposes that raw `field` output and also maps it through a palette
      // to its normal `frame` output. Keep in sync with PROPERTY_META.noiseType
      // and the `Noise` case in cppGenerator.ts.
      case 'Noise': {
        const noiseType = String(props.noiseType ?? 'field')
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), NOISE_SPEED_MAX[noiseType] ?? 1)
        const scale = denormRate(num(id, 'scale', props, 'scale', 0.5), NOISE_SCALE_MAX[noiseType] ?? 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        const field = evalNoiseFieldByType(noiseType, speed, scale, t, W, H)
        out = { field, frame: evalFieldToFrame(field, palette, 1, W, H) }
        break
      }

      case 'Plasma': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Plasma)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalPlasma(speed, t, palette, W, H) }
        break
      }

      case 'Rainbow': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.3), SPEED_MAX.Rainbow)
        const deltaHue = Number(props.deltaHue ?? 6)
        out = { frame: evalRainbow(t * speed, deltaHue, W, H) }
        break
      }

      case 'Pride2015': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.4), SPEED_MAX.Pride2015)
        const scale = denormRate(num(id, 'scale', props, 'scale', 0.4), SCALE_MAX.Pride2015)
        out = { frame: evalPride2015(speed, scale, t, W, H) }
        break
      }

      case 'Pacifica': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.35), SPEED_MAX.Pacifica)
        const scale = denormRate(num(id, 'scale', props, 'scale', 0.5), SCALE_MAX.Pacifica)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalPacifica(speed, scale, t, palette, W, H) }
        break
      }

      case 'TwinkleFox': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.TwinkleFox)
        const density = num(id, 'density', props, 'density', 0.5)
        const palette = pal(id, 'paletteIn', props, 'palette', 'party')
        out = { frame: evalTwinkleFox(speed, density, t, palette, W, H) }
        break
      }

      case 'Scanner': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.45), SPEED_MAX.Scanner)
        const width = Math.max(1, Number(props.width ?? 2))
        const fade = num(id, 'fade', props, 'fade', 0.6)
        const axis = String(props.axis ?? 'horizontal')
        const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
        out = { frame: evalScanner(speed, width, fade, axis, t, palette, W, H) }
        break
      }

      case 'Confetti': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.45), SPEED_MAX.Confetti)
        const density = num(id, 'density', props, 'density', 0.45)
        const fade = num(id, 'fade', props, 'fade', 0.28)
        const palette = pal(id, 'paletteIn', props, 'palette', 'party')
        out = { frame: evalConfetti(stateKey(id), speed, density, fade, t, palette, W, H) }
        break
      }

      case 'Juggle': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Juggle)
        const count = Number(props.count ?? 4)
        const fade = num(id, 'fade', props, 'fade', 0.22)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalJuggle(stateKey(id), speed, count, fade, t, palette, W, H) }
        break
      }

      case 'Fire': {
        const intensity = num(id, 'intensity', props, 'intensity', 0.7)
        const cooling = num(id, 'cooling', props, 'cooling', 55)
        const sparking = num(id, 'sparking', props, 'sparking', 120)
        const palette = pal(id, 'paletteIn', props, 'palette', 'fire')
        out = { frame: evalFire(stateKey(id), intensity, cooling, sparking, palette, W, H) }
        break
      }

      case 'SpectrumBars': {
        // Unwired bands rest at 0 unless the Test Signal toggle drives a demo.
        const demo = useUiStore.getState().testSignal
        const bass   = num(id, 'bass',   props, 'bass',   demo ? (Math.sin(t * 2.1) + 1) / 2 : 0)
        const mids   = num(id, 'mids',   props, 'mids',   demo ? (Math.sin(t * 3.7 + 1) + 1) / 2 : 0)
        const treble = num(id, 'treble', props, 'treble', demo ? (Math.sin(t * 5.3 + 2) + 1) / 2 : 0)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 0.6)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        const mirror = !!props.mirror
        out = { frame: evalSpectrumBars(bass, mids, treble, energy, speed, t, palette, mirror, W, H) }
        break
      }

      // Frame blend with real blend modes — composites B over A per `blendMode`,
      // mixed by `amount` (opacity, 0–255). Keep in sync with cppGenerator's `Blend`.
      case 'Blend': {
        const fa = input(id, 'a', null) as Frame | null
        const fb = input(id, 'b', null) as Frame | null
        if (!fa && !fb) { out = { frame: null }; break }
        const a = fa ?? blankFrame(W, H)
        const b = fb ?? blankFrame(W, H)
        const opacity = Math.max(0, Math.min(1, num(id, 'amount', props, 'amount', 0.5)))
        const mode = String(props.blendMode ?? 'normal')
        out = { frame: a.map((row, y) => row.map((px, x) => blendPixel(mode, px, b[y][x], opacity))) }
        break
      }

      case 'BrightnessMod': {
        const src = input(id, 'frame', null) as Frame | null
        const br = num(id, 'brightness', props, 'brightness', 1)
        if (!src) { out = { frame: null }; break }
        out = {
          frame: src.map(row =>
            row.map(px => ({
              r: Math.min(255, Math.round(px.r * br)),
              g: Math.min(255, Math.round(px.g * br)),
              b: Math.min(255, Math.round(px.b * br)),
            }))
          ),
        }
        break
      }

      case 'Fade': {
        const src = input(id, 'frame', null) as Frame | null
        const fade = num(id, 'fade', props, 'fade', 0.5)
        const scale = Math.max(0, Math.min(1, 1 - fade))
        if (!src) { out = { frame: null }; break }
        out = {
          frame: src.map(row =>
            row.map(px => ({
              r: Math.round(px.r * scale),
              g: Math.round(px.g * scale),
              b: Math.round(px.b * scale),
            }))
          ),
        }
        break
      }

      case 'Transform': {
        const src = input(id, 'frame', null) as Frame | null
        if (!src) { out = { frame: null }; break }
        const mode = String(props.transform ?? 'rotate')
        const rate = num(id, 'rate', props, 'rate', 90)
        const angle = num(id, 'angle', props, 'angle', 0)
        out = { frame: evalTransform(src, mode, rate, angle, t, W, H) }
        break
      }

      case 'Array': {
        const src = input(id, 'frame', null) as Frame | null
        if (!src) { out = { frame: null }; break }
        out = { frame: evalArray(
          src,
          num(id, 'count', props, 'count', 5),
          num(id, 'offsetX', props, 'offsetX', 3),
          num(id, 'offsetY', props, 'offsetY', 0),
          num(id, 'angle', props, 'angle', 0),
          num(id, 'scale', props, 'scale', 1),
          num(id, 'falloff', props, 'falloff', 0.7),
          String(props.blendMode ?? 'add'),
          W, H,
        ) }
        break
      }

      // Manual A/B frame selector; falls back to the wired side when the
      // selected one is empty. Both inputs are evaluated every frame so a
      // stateful upstream pattern keeps advancing while hidden.
      case 'FrameSwitch': {
        const a = input(id, 'a', null) as Frame | null
        const b = input(id, 'b', null) as Frame | null
        const sel = Boolean(input(id, 'sel', false))
        out = { frame: (sel ? b : a) ?? (sel ? a : b) }
        break
      }

      // Feedback/trails buffer — the persistent accumulator fades by `decay`
      // each tick, then re-lightens per-channel wherever the incoming frame is
      // brighter (fadeToBlackBy()-and-accumulate, generalised to any upstream
      // pattern). Left untouched while unwired so it resumes cleanly.
      case 'Trails': {
        const src = input(id, 'frame', null) as Frame | null
        if (!src) { out = { frame: null }; break }
        const decay = Math.max(0, Math.min(1, num(id, 'decay', props, 'decay', 0.15)))
        const key = stateKey(id)
        const prev = trailState.get(key)
        // Persistent buffer, faded + re-lightened in place each pass — never
        // pool-allocated. Consumers don't mutate inputs, so it's returned as-is.
        const buf = prev && prev.length === H && prev[0]?.length === W
          ? prev
          : rawBlankFrame(W, H)
        const s = 1 - decay
        for (let y = 0; y < H; y++) {
          const row = buf[y], srcRow = src[y]
          for (let x = 0; x < W; x++) {
            const px = row[x], inpx = srcRow[x]
            px.r = Math.max(Math.round(px.r * s), inpx.r)
            px.g = Math.max(Math.round(px.g * s), inpx.g)
            px.b = Math.max(Math.round(px.b * s), inpx.b)
          }
        }
        trailState.set(key, buf)
        out = { frame: buf }
        break
      }

      case 'Mask': {
        const src = input(id, 'frame', null) as Frame | null
        const maskF = input(id, 'mask', null) as Frame | null
        if (!src) { out = { frame: null }; break }
        out = {
          frame: src.map((row, y) =>
            row.map((px, x) => {
              const m = maskF?.[y]?.[x]
              const a = m ? (m.r + m.g + m.b) / 3 / 255 : 1
              return { r: Math.round(px.r * a), g: Math.round(px.g * a), b: Math.round(px.b * a) }
            })
          ),
        }
        break
      }

      case 'HueShift': {
        const src = input(id, 'frame', null) as Frame | null
        const shift = num(id, 'shift', props, 'shift', 0)
        if (!src) { out = { frame: null }; break }
        out = {
          frame: src.map(row =>
            row.map(px => {
              // Convert RGB→HSV, shift H, convert back
              const r = px.r / 255, g = px.g / 255, b = px.b / 255
              const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
              let h = 0
              if (d > 0) {
                if (max === r) h = ((g - b) / d) % 6
                else if (max === g) h = (b - r) / d + 2
                else h = (r - g) / d + 4
                h = h * 60
              }
              return hsv((h + shift + 360) % 360, max > 0 ? d / max : 0, max)
            })
          ),
        }
        break
      }

      // RGB→HSV→scale saturation→RGB; shares HueShift's inline extraction.
      case 'Saturation': {
        const src = input(id, 'frame', null) as Frame | null
        const amount = num(id, 'amount', props, 'amount', 1)
        if (!src) { out = { frame: null }; break }
        out = {
          frame: src.map(row =>
            row.map(px => {
              const r = px.r / 255, g = px.g / 255, b = px.b / 255
              const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
              let h = 0
              if (d > 0) {
                if (max === r) h = ((g - b) / d) % 6
                else if (max === g) h = (b - r) / d + 2
                else h = (r - g) / d + 4
                h = h * 60
              }
              const s = max > 0 ? d / max : 0
              const s2 = Math.max(0, Math.min(1, s * amount))
              return hsv((h + 360) % 360, s2, max)
            })
          ),
        }
        break
      }

      case 'ColorBoost': {
        const src = input(id, 'frame', null) as Frame | null
        const boost = Math.max(0, Math.min(1, num(id, 'boost', props, 'boost', 0.5)))
        if (!src) { out = { frame: null }; break }
        const scale = 1 + boost * 1.5
        const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
        out = {
          frame: src.map(row =>
            row.map(px => {
              const luma = px.r * 0.2126 + px.g * 0.7152 + px.b * 0.0722
              return {
                r: clamp255(luma + (px.r - luma) * scale),
                g: clamp255(luma + (px.g - luma) * scale),
                b: clamp255(luma + (px.b - luma) * scale),
              }
            })
          ),
        }
        break
      }

      case 'Gamma': {
        const src = input(id, 'frame', null) as Frame | null
        const g = Math.max(0.1, num(id, 'gamma', props, 'gamma', 2.2))
        if (!src) { out = { frame: null }; break }
        const corr = (c: number) => Math.round(255 * Math.pow(c / 255, g))
        out = { frame: buildFrame(W, H, (x, y) => { const px = src[y][x]; return { r: corr(px.r), g: corr(px.g), b: corr(px.b) } }) }
        break
      }

      case 'BassPulse': {
        const bass = num(id, 'bass', props, 'bass', 0)
        const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
        out = { frame: evalBassPulse(bass, palette, W, H) }
        break
      }

      case 'BassRings': {
        const bass = num(id, 'bass', props, 'bass', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
        out = { frame: evalBassRings(bass, energy, speed, palette, t, W, H) }
        break
      }

      case 'MidrangeWaves': {
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalMidrangeWaves(mids, energy, speed, t, palette, W, H) }
        break
      }

      case 'MidrangeBloom': {
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'party')
        out = { frame: evalMidrangeBloom(mids, energy, speed, t, palette, W, H) }
        break
      }

      case 'TrebleSparks': {
        const treble = num(id, 'treble', props, 'treble', 0.5)
        const density = num(id, 'density', props, 'density', 0.5)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ice')
        out = { frame: evalTrebleSparks(stateKey(id), treble, density, palette, W, H) }
        break
      }

      case 'TreblePrism': {
        const treble = num(id, 'treble', props, 'treble', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'amethyst')
        out = { frame: evalTreblePrism(treble, energy, speed, palette, t, W, H) }
        break
      }

      case 'AudioCascade': {
        const bass = num(id, 'bass', props, 'bass', 0.5)
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const treble = num(id, 'treble', props, 'treble', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalAudioCascade(bass, mids, treble, energy, speed, t, palette, W, H) }
        break
      }

      case 'BeatFlash': {
        const beatVal = input(id, 'beat', false) as boolean
        const baseFrame = input(id, 'frame', null) as Frame | null
        const decay = num(id, 'decay', props, 'decay', 0.85)
        out = { frame: evalBeatFlash(stateKey(id), beatVal, baseFrame, decay, W, H) }
        break
      }

      case 'KickShock': {
        const kick = num(id, 'kick', props, 'kick', 0)
        const snare = num(id, 'snare', props, 'snare', 0)
        const hihat = num(id, 'hihat', props, 'hihat', 0)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'volcano')
        out = { frame: evalKickShock(stateKey(id), kick, snare, hihat, energy, speed, t, palette, W, H) }
        break
      }

      case 'VocalAurora': {
        const vocals = num(id, 'vocals', props, 'vocals', 0)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const silence = input(id, 'silence', false) as boolean
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'aurora')
        out = { frame: evalVocalAurora(vocals, energy, silence, speed, t, palette, W, H) }
        break
      }

      case 'BeatKaleidoscope': {
        const beatVal = input(id, 'beat', false) as boolean
        const hue = num(id, 'hue', props, 'hue', 0)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ultraviolet')
        out = { frame: evalBeatKaleidoscope(stateKey(id), beatVal, hue, energy, speed, t, palette, W, H) }
        break
      }

      case 'SpectraMosaic': {
        const bass = num(id, 'bass', props, 'bass', 0.5)
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const treble = num(id, 'treble', props, 'treble', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const tiles = num(id, 'tiles', props, 'tiles', 4)
        const palette = pal(id, 'paletteIn', props, 'palette', 'peacock')
        out = { frame: evalSpectraMosaic(bass, mids, treble, energy, speed, tiles, t, palette, W, H) }
        break
      }

      case 'PercussionBlobs': {
        const kick = num(id, 'kick', props, 'kick', 0)
        const snare = num(id, 'snare', props, 'snare', 0)
        const hihat = num(id, 'hihat', props, 'hihat', 0)
        const palette = pal(id, 'paletteIn', props, 'palette', 'party')
        out = { frame: evalPercussionBlobs(stateKey(id), kick, snare, hihat, t, palette, W, H) }
        break
      }

      case 'EmberPulse': {
        const bass = num(id, 'bass', props, 'bass', 0.5)
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const treble = num(id, 'treble', props, 'treble', 0.5)
        const beatVal = input(id, 'beat', false) as boolean
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        out = { frame: evalEmberPulse(stateKey(id), bass, mids, treble, beatVal, energy, speed, t, W, H) }
        break
      }

      case 'TurbulentBloom': {
        const bass = num(id, 'bass', props, 'bass', 0.5)
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const treble = num(id, 'treble', props, 'treble', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'deepsea')
        out = { frame: evalTurbulentBloom(bass, mids, treble, energy, speed, t, palette, W, H) }
        break
      }

      case 'GravityWell': {
        const bass = num(id, 'bass', props, 'bass', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? { r: Number(props.r ?? 80), g: Number(props.g ?? 160), b: Number(props.b ?? 255) }
        out = { frame: evalGravityWell(bass, energy, speed, color, t, W, H) }
        break
      }

      case 'RainRipples': {
        const trigger = input(id, 'trigger', false) as boolean
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'laguna')
        out = { frame: evalRainRipples(stateKey(id), trigger, energy, speed, t, palette, W, H) }
        break
      }

      case 'PrismStorm': {
        const treble = num(id, 'treble', props, 'treble', 0.5)
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const hihat = num(id, 'hihat', props, 'hihat', 0)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'amethyst')
        out = { frame: evalPrismStorm(stateKey(id), treble, mids, hihat, energy, speed, t, palette, W, H) }
        break
      }

      // ── Color math ─────────────────────────────────────────────────────
      case 'HSVToRGB': {
        const h = num(id, 'h', props, 'h', 0)
        const s = num(id, 's', props, 's', 1)
        const v = num(id, 'v', props, 'v', 1)
        out = { color: hsv(h, s, v) }
        break
      }

      // The inverse of HSVToRGB — shares HueShift/Saturation's inline extraction.
      case 'RGBToHSV': {
        const c = (input(id, 'rgb', null) as RGB | null) ?? { r: 0, g: 0, b: 0 }
        const r = c.r / 255, g = c.g / 255, b = c.b / 255
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
        let h = 0
        if (d > 0) {
          if (max === r) h = ((g - b) / d) % 6
          else if (max === g) h = (b - r) / d + 2
          else h = (r - g) / d + 4
          h = h * 60
        }
        const s = max > 0 ? d / max : 0
        out = { h: (h + 360) % 360, s, v: max }
        break
      }

      case 'Temperature': {
        out = { color: kelvinToRgb(num(id, 'kelvin', props, 'kelvin', 4000)) }
        break
      }

      case 'HeatColor': {
        // heatColor() takes a 0–255 temperature (shared with Fire2012); the node
        // input is a normalised 0–1 heat.
        const heat = Math.max(0, Math.min(1, num(id, 'heat', props, 'heat', 0.5)))
        out = { color: heatColor(heat * 255) }
        break
      }

      case 'BlendColors': {
        const ca = input(id, 'a', null) as RGB | null
        const cb = input(id, 'b', null) as RGB | null
        const mix = num(id, 't', props, 't', 0.5)
        const a = ca ?? { r: 255, g: 0, b: 0 }
        const b = cb ?? { r: 0, g: 0, b: 255 }
        out = {
          color: {
            r: Math.round(a.r * (1 - mix) + b.r * mix),
            g: Math.round(a.g * (1 - mix) + b.g * mix),
            b: Math.round(a.b * (1 - mix) + b.b * mix),
          },
        }
        break
      }

      // ── New pattern nodes ──────────────────────────────────────────────
      case 'RadialBurst': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.RadialBurst)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalRadialBurst(speed, palette, t, W, H) }
        break
      }

      case 'Spiral': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Spiral)
        const arms = num(id, 'arms', props, 'arms', 2)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalSpiral(speed, arms, palette, t, W, H) }
        break
      }

      case 'Kaleidoscope': {
        const src = input(id, 'frame', null) as Frame | null
        const segments = num(id, 'segments', props, 'segments', 6)
        if (!src) { out = { frame: blankFrame(W, H) }; break }
        out = { frame: evalKaleidoscope(src, segments, W, H) }
        break
      }

      case 'Particles': {
        const mode = String(props.particleType ?? 'fountain')
        const rate = num(id, 'rate', props, 'rate', 0.3)
        const decay = num(id, 'decay', props, 'decay', 0.92)
        const palette = pal(id, 'paletteIn', props, 'palette', 'party')
        out = { frame: evalParticles(stateKey(id), mode, rate, palette, decay, t, W, H) }
        break
      }

      case 'Invert': {
        const src = input(id, 'frame', null) as Frame | null
        if (!src) { out = { frame: blankFrame(W, H) }; break }
        out = { frame: buildFrame(W, H, (x, y) => { const px = src[y][x]; return { r: 255 - px.r, g: 255 - px.g, b: 255 - px.b } }) }
        break
      }

      case 'Mirror': {
        const src = input(id, 'frame', null) as Frame | null
        if (!src) { out = { frame: blankFrame(W, H) }; break }
        const mode = String(props.mirrorMode ?? 'horizontal')
        const glow = Boolean(props.glow)
        // Additive bloom: the plain mirror (base) plus a `glowAmount` fraction of
        // the discarded partner, tinted per-channel by the `color` input (white =
        // neutral). 0 = clean mirror, 1 = full add. Both coords are symmetric under
        // the reflection. Kept in lockstep with cppGenerator.
        const glowAmt = Math.max(0, Math.min(1, num(id, 'glowAmount', props, 'glowAmount', 0.35)))
        const tint = (input(id, 'color', null) as RGB | null)
          ?? { r: Number(props.r ?? 255), g: Number(props.g ?? 255), b: Number(props.b ?? 255) }
        const gCh = (base: number, add: number, tintCh: number) => Math.min(255, base + add * (tintCh / 255) * glowAmt)
        out = { frame: buildFrame(W, H, (x, y) => {
          // base = the mirrored source pixel (min-side of the reflection)
          let bx = x, by = y
          if (mode === 'horizontal' || mode === 'quad') bx = Math.min(x, W - 1 - x)
          if (mode === 'vertical' || mode === 'quad') by = Math.min(y, H - 1 - y)
          if (mode === 'diagonal') { bx = Math.min(Math.min(x, y), W - 1); by = Math.min(Math.max(x, y), H - 1) }
          const b = src[by][bx]
          if (!glow) return { r: b.r, g: b.g, b: b.b }
          // add = the opposite (discarded) partner (max-side of the reflection)
          let ax = x, ay = y
          if (mode === 'horizontal' || mode === 'quad') ax = Math.max(x, W - 1 - x)
          if (mode === 'vertical' || mode === 'quad') ay = Math.max(y, H - 1 - y)
          if (mode === 'diagonal') { ax = Math.min(Math.max(x, y), W - 1); ay = Math.min(Math.min(x, y), H - 1) }
          const a = src[ay][ax]
          return { r: gCh(b.r, a.r, tint.r), g: gCh(b.g, a.g, tint.g), b: gCh(b.b, a.b, tint.b) }
        }) }
        break
      }

      case 'GradientFrame': {
        const cA = (input(id, 'colorA', null) as RGB | null) ?? { r: Number(props.rA ?? 0), g: Number(props.gA ?? 200), b: Number(props.bA ?? 255) }
        const cB = (input(id, 'colorB', null) as RGB | null) ?? { r: Number(props.rB ?? 255), g: Number(props.gB ?? 0), b: Number(props.bB ?? 255) }
        out = { frame: evalGradientFrame(cA, cB, Boolean(input(id, 'vertical', Boolean(props.vertical))), W, H) }
        break
      }

      case 'GradientSampler': {
        const tt = num(id, 't', props, 't', 0)
        const cA = (input(id, 'colorA', null) as RGB | null) ?? { r: Number(props.rA ?? 0), g: Number(props.gA ?? 200), b: Number(props.bA ?? 255) }
        const cB = (input(id, 'colorB', null) as RGB | null) ?? { r: Number(props.rB ?? 255), g: Number(props.gB ?? 0), b: Number(props.bB ?? 255) }
        out = { color: { r: Math.round(cA.r*(1-tt)+cB.r*tt), g: Math.round(cA.g*(1-tt)+cB.g*tt), b: Math.round(cA.b*(1-tt)+cB.b*tt) } }
        break
      }

      case 'PaletteSampler': {
        const tt = num(id, 't', props, 't', 0)
        const palName = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { color: samplePalette(palName, tt) }
        break
      }

      // ── Logic / Control ────────────────────────────────────────────────
      case 'Abs':
        out = { result: Math.abs(num(id, 'x', props, 'x', 0)) }
        break

      case 'Mod': {
        const x = num(id, 'x', props, 'x', 0)
        const m = num(id, 'm', props, 'm', 1)
        out = { result: m !== 0 ? ((x % m) + m) % m : 0 }
        break
      }

      case 'Random': {
        const lo = Number(props.min ?? 0), hi = Number(props.max ?? 1)
        out = { value: lo + Math.random() * (hi - lo) }
        break
      }

      case 'Counter': {
        const rate = num(id, 'rate', props, 'rate', 0.5)
        const prev = counterVals.get(stateKey(id)) ?? 0
        const next = (prev + rate / 60) % 1
        counterVals.set(stateKey(id), next)
        out = { value: next }
        break
      }

      case 'Gate': {
        const val = num(id, 'value', props, 'value', 0)
        const gate = input(id, 'gate', false) as boolean
        out = { result: gate ? val : Number(props.fallback ?? 0) }
        break
      }

      // Low-pass smoothing — EMA toward the input with time constant `response`
      // (seconds to ~63% of a step; ≤0.01 = passthrough). dt comes from the
      // wall-clock t so smoothing speed is framerate-independent, mirroring the
      // millis()-based version the C++ generator emits.
      case 'Smooth': {
        const value = num(id, 'value', props, 'value', 0)
        const response = Math.max(0, Number(props.response ?? 0.25))
        const key = stateKey(id)
        const prev = smoothState.get(key)
        let v = value
        if (prev && t >= prev.t && response > 0.01) {
          const alpha = 1 - Math.exp(-(t - prev.t) / response)
          v = prev.v + (value - prev.v) * alpha
        }
        smoothState.set(key, { v, t })
        out = { result: v }
        break
      }

      // Sample & hold — latches `value` on each rising edge of `trigger`,
      // initialised to the first value seen so it never emits a stale 0.
      case 'SampleHold': {
        const value = num(id, 'value', props, 'value', 0)
        const trig = Boolean(input(id, 'trigger', false))
        const key = stateKey(id)
        const prev = holdState.get(key)
        const held = !prev || (trig && !prev.prev) ? value : prev.v
        holdState.set(key, { v: held, prev: trig })
        out = { result: held }
        break
      }

      // A/B selector — unlike Gate (value vs. constant fallback), both sides
      // are live inputs.
      case 'Switch': {
        const a = num(id, 'a', props, 'a', 0)
        const b = num(id, 'b', props, 'b', 1)
        const sel = Boolean(input(id, 'sel', false))
        out = { result: sel ? b : a }
        break
      }

      // Trigger envelope — 1 on a rising edge of `trigger`, decaying linearly
      // to 0 over `decay` seconds (wire through Ease for a shaped curve).
      case 'Envelope': {
        const trig = Boolean(input(id, 'trigger', false))
        const decay = Math.max(0.05, Number(props.decay ?? 0.5))
        const key = stateKey(id)
        const prev = envState.get(key)
        // Forget the fire time on a clock reset (t jumped backwards).
        let fire = prev && prev.fire <= t ? prev.fire : -Infinity
        if (trig && !prev?.prev) fire = t
        envState.set(key, { fire, prev: trig })
        out = { result: Math.max(0, Math.min(1, 1 - (t - fire) / decay)) }
        break
      }

      case 'Not': {
        const x = input(id, 'x', false) as boolean
        out = { result: !x }
        break
      }

      case 'Compare': {
        const a = num(id, 'a', props, 'a', 0)
        const b = num(id, 'b', props, 'b', 0.5)
        out = { result: a > b }
        break
      }

      // ── Proper noise nodes ────────────────────────────────────────────
      case 'FractalNoise': {
        const speed   = denormRate(num(id, 'speed', props, 'speed', 0.25), SPEED_MAX.FractalNoise)
        const scale   = denormRate(num(id, 'scale', props, 'scale', 0.3), SCALE_MAX.FractalNoise)
        const octaves = Number(props.octaves ?? 4)
        const palette = pal(id, 'paletteIn', props, 'palette', 'forest')
        out = { frame: evalFractalNoise(speed, scale, octaves, t, palette, W, H) }
        break
      }

      case 'GaborNoise': {
        const speed       = denormRate(num(id, 'speed', props, 'speed', 0.33), SPEED_MAX.GaborNoise)
        const scale       = denormRate(num(id, 'scale', props, 'scale', 0.7), SCALE_MAX.GaborNoise)
        const frequency   = num(id, 'frequency', props, 'frequency', 1.2)
        const orientation = num(id, 'orientation', props, 'orientation', 45)
        const palette     = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalGaborNoise(speed, scale, frequency, orientation, t, palette, W, H) }
        break
      }

      case 'PaletteGradient': {
        const angle   = num(id, 'angle', props, 'angle', 45)
        const repeat  = num(id, 'repeat', props, 'repeat', 1)
        const speed   = denormRate(num(id, 'speed', props, 'speed', 0), SPEED_MAX.PaletteGradient)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalPaletteGradient(angle, repeat, speed, t, palette, W, H) }
        break
      }

      case 'Image': {
        // A loaded animation takes precedence over a still; a node has one or
        // the other (ImageNodeBody clears whichever it isn't).
        const animation = asAnimatedImage(props.animation)
        let img: ImageData | null
        if (animation) {
          const rawRate = num(id, 'playbackRate', props, 'playbackRate', 1)
          const rate = Number.isFinite(rawRate) ? Math.max(0.25, Math.min(4, rawRate)) : 1
          img = animatedImageFrame(animation, t * 1000 * rate, Boolean(props.loop ?? true))
        } else {
          img = asImage(props.image)
        }
        out = { frame: img ? sampleImageToFrame(img, W, H, {
          fit: props.fit as 'stretch' | 'contain' | 'cover' | 'original',
          positionX: num(id, 'positionX', props, 'positionX', 0.5),
          positionY: num(id, 'positionY', props, 'positionY', 0.5),
          rotation: num(id, 'rotation', props, 'rotation', Number(props.rotation ?? 0)),
          flipX: Boolean(props.flipX),
          flipY: Boolean(props.flipY),
          sampling: props.sampling === 'smooth' ? 'smooth' : 'nearest',
          brightness: num(id, 'brightness', props, 'brightness', 1),
          background: hexToRgb(String(props.background ?? '#000000')),
          zoom: num(id, 'zoom', props, 'zoom', 1),
          cropX: num(id, 'cropX', props, 'cropX', 0.5),
          cropY: num(id, 'cropY', props, 'cropY', 0.5),
          saturation: num(id, 'saturation', props, 'saturation', 1),
          contrast: num(id, 'contrast', props, 'contrast', 1),
          hueShift: num(id, 'hueShift', props, 'hueShift', 0),
          monochrome: Boolean(props.monochrome),
          gamma: num(id, 'gamma', props, 'gamma', 1),
          paletteLevels: props.paletteLevels as number | string,
          dithering: props.dithering === 'ordered2x2' || props.dithering === 'ordered4x4' ? props.dithering : 'none',
        }) : blankFrame(W, H) }
        break
      }

      case 'Blobs': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.3), SPEED_MAX.Blobs)
        const scale = denormRate(num(id, 'scale', props, 'scale', 0.44), SCALE_MAX.Blobs)
        const count = num(id, 'count', props, 'count', 3)
        const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
        out = { frame: evalBlobs(speed, scale, count, t, palette, W, H) }
        break
      }

      case 'FlowField': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.67), SPEED_MAX.FlowField)
        const scale = denormRate(num(id, 'scale', props, 'scale', 0.08), SCALE_MAX.FlowField)
        const count = num(id, 'count', props, 'count', 80)
        const fade = num(id, 'fade', props, 'fade', 0.9)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalFlowField(stateKey(id), speed, scale, count, fade, t, palette, W, H) }
        break
      }

      case 'Starfield': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.33), SPEED_MAX.Starfield)
        const count = num(id, 'count', props, 'count', 60)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ice')
        out = { frame: evalStarfield(stateKey(id), speed, count, palette, W, H) }
        break
      }

      case 'Boids': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Boids)
        const count = num(id, 'count', props, 'count', 24)
        const sep = num(id, 'separation', props, 'separation', 0.6)
        const ali = num(id, 'alignment', props, 'alignment', 0.5)
        const coh = num(id, 'cohesion', props, 'cohesion', 0.4)
        const range = num(id, 'visualRange', props, 'visualRange', 4)
        const colorMode = String(props.colorMode ?? 'solid')
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 120) / 255),
          g: byte(Number(props.g ?? 200) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalBoids(stateKey(id), speed, count, sep, ali, coh, range, color, palette, colorMode, t, W, H) }
        break
      }

      case 'AudioFlow': {
        const bass = num(id, 'bass', props, 'bass', 0.5)
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const treble = num(id, 'treble', props, 'treble', 0.3)
        const speed = denormalizeAudioFlowParam('speed', num(id, 'speed', props, 'speed', 0.5))
        const scale = denormalizeAudioFlowParam('scale', num(id, 'scale', props, 'scale', 0.5))
        const palette = pal(id, 'paletteIn', props, 'palette', 'party')
        out = { frame: evalAudioFlow(bass, mids, treble, speed, scale, t, palette, W, H) }
        break
      }

      case 'ReactionDiffusion': {
        const feed  = num(id, 'feed', props, 'feed', 0.055)
        const kill  = num(id, 'kill', props, 'kill', 0.062)
        const iters = Math.max(1, Math.min(20, Math.floor(num(id, 'speed', props, 'speed', 8))))
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalReactionDiffusion(stateKey(id), feed, kill, iters, palette, W, H) }
        break
      }

      case 'GameOfLife': {
        const palette = pal(id, 'paletteIn', props, 'palette', 'mojito')
        const speed = num(id, 'speed', props, 'speed', 8)
        const fade = num(id, 'fade', props, 'fade', 0.75)
        out = { frame: evalGameOfLife(stateKey(id), palette, speed, fade, tick, W, H) }
        break
      }

      // ── Transition nodes ──────────────────────────────────────────────
      // Bundled transitions (Crossfade / Wipe / Dissolve), selected by
      // `transitionType`. All blend frame A→B by `t`; `direction` only applies to
      // wipe. Keep in sync with cppGenerator's `Transition`.
      case 'Transition': {
        const fa = input(id, 'a', null) as Frame | null
        const fb = input(id, 'b', null) as Frame | null
        const tt = num(id, 't', props, 't', 0.5)
        const ca = fa ?? blankFrame(W, H)
        const cb = fb ?? blankFrame(W, H)
        out = {
          frame: compositeTransition(String(props.transitionType ?? 'crossfade'), ca, cb, tt, W, H, {
            dir: String(props.direction ?? 'right'),
            axis: String(props.axis ?? 'horizontal'),
            tileSize: Number(props.tileSize ?? 4),
            count: Number(props.count ?? 4),
            turns: Number(props.turns ?? 2),
          }),
        }
        break
      }

      case 'PatternMaster': {
        const ids = (input(id, 'patternset', null) as string[] | null) ?? []
        const audioSignal = input(id, 'audio', null)
        const beat = input(id, 'beat', false) as boolean
        const liveAudio = useAudioStore.getState()
        const liveGroupAudio = audioSignal !== null
          ? semanticAudioInputs({
              micBass: clamp01(Number(liveAudio.bass ?? liveAudio.micBass ?? 0)),
              micMids: clamp01(Number(liveAudio.mids ?? liveAudio.micMids ?? 0)),
              micTreble: clamp01(Number(liveAudio.treble ?? liveAudio.micTreble ?? 0)),
            })
          : {}
        // Rasterise a collected pattern (a group) to a frame, the same way the
        // Group case does — namespaced per pattern so stateful nodes don't clash.
        const render = (gid: string): Frame => {
          const def = groups[gid]
          if (!def || groupStack.has(gid)) return blankFrame(W, H)
          const groupInputs: Record<string, PortValue> = { ...liveGroupAudio }
          if (audioSignal !== null) {
            for (const groupNode of def.nodes) {
              if (String(groupNode.data.nodeType ?? '') !== 'GroupInput') continue
              const paramId = String((groupNode.data.properties as { paramId?: string } | undefined)?.paramId ?? '')
              const outputType = ((groupNode.data.outputs as { dataType?: string }[] | undefined)?.[0]?.dataType) ?? ''
              if (paramId && outputType === 'audio') groupInputs[paramId] = audioSignal
            }
          }
          return evaluateGraph(
            def.nodes, def.edges, tick, W, H, groups,
            `${instancePrefix}${id}/${gid}/`,
            new Set([...groupStack, gid]), groupInputs, audioOverride,
          ) ?? blankFrame(W, H)
        }
        // Transitions come from a wired TransitionSet (the same node type feeds
        // PerformanceGenerator); with nothing wired the show just crossfades.
        const wiredPool = input(id, 'transitions', null) as string[] | null
        const pool = wiredPool && wiredPool.length ? wiredPool : ['crossfade']
        const o = {
          minTime: num(id, 'minTime', props, 'minTime', 4),
          maxTime: num(id, 'maxTime', props, 'maxTime', 12),
          transSec: num(id, 'transitionSec', props, 'transitionSec', 1),
          pool,
          beatEnabled: incoming.has(`${id}:beat`),
          particles: Boolean(input(id, 'particles', Boolean(props.particles))),
          particleStyle: Number(props.particleStyle ?? 0),
          particleHue: num(id, 'particleHue', props, 'particleHue', 0),
          particleIntensity: num(id, 'particleIntensity', props, 'particleIntensity', 1),
        }
        out = { frame: evalPatternShow(stateKey(id), ids, render, beat, o, t, W, H) }
        break
      }

      case 'Sequencer': {
        const frames = [
          input(id, 'p0', null) as Frame | null,
          input(id, 'p1', null) as Frame | null,
          input(id, 'p2', null) as Frame | null,
          input(id, 'p3', null) as Frame | null,
        ]
        const interval = Number(props.interval ?? 4)
        const fade = Number(props.fade ?? 1)
        out = { frame: evalSequencer(frames, interval, fade, t, W, H) }
        break
      }

      case 'CustomFormula': {
        const a = num(id, 'a', props, 'a', 0)
        const b = num(id, 'b', props, 'b', 0)
        const formula = String(props.formula ?? 'sin(x*6+t)*0.5+0.5')
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalCustomFormula(formula, a, b, palette, t, W, H) }
        break
      }

      // ── Float Field ────────────────────────────────────────────────────
      case 'FieldFormula': {
        const a = num(id, 'a', props, 'a', 0)
        const b = num(id, 'b', props, 'b', 0)
        const fin = input(id, 'fieldIn', null)
        const fieldIn = fin instanceof Float32Array ? fin : null
        const formula = String(props.formula ?? 'sin8(r*200 + t*60)/255')
        out = { field: evalFieldFormula(formula, a, b, fieldIn, t, W, H) }
        break
      }

      case 'FieldNoise': {
        const speed   = denormRate(num(id, 'speed', props, 'speed', 0.25), SPEED_MAX.FieldNoise)
        const scale   = denormRate(num(id, 'scale', props, 'scale', 0.3), SCALE_MAX.FieldNoise)
        const octaves = Number(props.octaves ?? 4)
        out = { field: evalFieldNoise(speed, scale, octaves, t, W, H) }
        break
      }

      case 'WaveSim': {
        const trigger = Boolean(input(id, 'trigger', false))
        const speed = num(id, 'speed', props, 'speed', 4)
        const damping = num(id, 'damping', props, 'damping', 0.985)
        const impulse = num(id, 'impulse', props, 'impulse', 1)
        out = { field: evalWaveSim(stateKey(id), trigger, speed, damping, impulse, W, H) }
        break
      }

      case 'FieldToFrame': {
        const fv = input(id, 'field', null)
        const field = fv instanceof Float32Array ? fv : null
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        const brightness = num(id, 'brightness', props, 'brightness', 1)
        out = { frame: evalFieldToFrame(field, palette, brightness, W, H) }
        break
      }

      // The inverse of FieldToFrame: a 0–1 brightness field from a rendered
      // frame (average of r,g,b — the same convention Mask uses for a mask
      // frame's opacity).
      case 'FrameToField': {
        const src = input(id, 'frame', null) as Frame | null
        const out2 = allocField(W * H)
        if (src) {
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const px = src[y][x]
              out2[y * W + x] = (px.r + px.g + px.b) / 3 / 255
            }
          }
        }
        out = { field: out2 }
        break
      }

      case 'DistanceField': {
        const px = num(id, 'px', props, 'px', 0.5)
        const py = num(id, 'py', props, 'py', 0.5)
        const scale = num(id, 'scale', props, 'scale', 1)
        out = { field: evalDistanceField(px, py, scale, W, H) }
        break
      }

      case 'FieldMath': {
        const av = input(id, 'a', null)
        const bv = input(id, 'b', null)
        const op = String(props.fieldOp ?? 'add')
        out = { field: evalFieldMath(
          av instanceof Float32Array ? av : null,
          bv instanceof Float32Array ? bv : null,
          op, W, H,
        ) }
        break
      }

      case 'FieldWarp': {
        const fv = input(id, 'field', null)
        const dxv = input(id, 'dx', null)
        const dyv = input(id, 'dy', null)
        const strength = num(id, 'strength', props, 'strength', 1)
        out = { field: evalFieldWarp(
          fv instanceof Float32Array ? fv : null,
          dxv instanceof Float32Array ? dxv : null,
          dyv instanceof Float32Array ? dyv : null,
          strength, W, H,
        ) }
        break
      }

      case 'FieldRotate': {
        const fv = input(id, 'field', null)
        const field = fv instanceof Float32Array ? fv : null
        // angle (degrees) plus an optional continuous spin (degrees/sec).
        const deg = num(id, 'angle', props, 'angle', 0) + t * num(id, 'spin', props, 'spin', 0)
        out = { field: evalFieldRotate(field, (deg * Math.PI) / 180, W, H) }
        break
      }

      case 'FieldTile': {
        const fv = input(id, 'field', null)
        const field = fv instanceof Float32Array ? fv : null
        const tx = num(id, 'tilesX', props, 'tilesX', 2)
        const ty = num(id, 'tilesY', props, 'tilesY', 2)
        out = { field: evalFieldTile(field, tx, ty, W, H) }
        break
      }

      case 'Code': {
        const seed = input(id, 'frame', null) as Frame | null
        const code = String(props.code ?? '')
        const globalCode = String(props.globalCode ?? '')
        out = { frame: evalCode(stateKey(id), globalCode, code, seed, t, W, H) }
        break
      }

      // ── New FastLED spec nodes ────────────────────────────────────────
      case 'CHSV': {
        const hue = num(id, 'hue', props, 'hue', 128)
        const sat = num(id, 'sat', props, 'sat', 255)
        const val = num(id, 'val', props, 'val', 255)
        out = { rgb: hsv(hue / 255 * 360, sat / 255, val / 255) }
        break
      }

      case 'PaletteSelector':
        out = { palette: String(props.palette ?? 'rainbow').toLowerCase() }
        break

      // Outputs its absorbed patterns (group ids) as a patternset; the Show
      // Engine resolves each id via the group registry.
      case 'PatternCollection':
        out = { patternset: (props.patternIds as string[] | undefined) ?? [] }
        break

      // Outputs its toggled pool of extra transition styles; a Performance
      // Generator wired to it mixes them into its rule-based picks (resolved
      // live from the graph by musicStore, not through this frame-eval path —
      // this case just keeps the port well-defined for any generic probe).
      case 'TransitionSet':
        out = { transitions: (props.transitions as string[] | undefined) ?? [] }
        break

      case 'CustomPalette': {
        // Build a palette from connected color inputs (in order); unconnected
        // slots are skipped. Falls back to rainbow when nothing is wired.
        const colors: RGB[] = []
        for (const port of ['color0', 'color1', 'color2', 'color3']) {
          const c = input(id, port, null) as RGB | null
          if (c) colors.push(c)
        }
        out = { palette: colors.length > 0 ? colors : 'rainbow' }
        break
      }

      case 'Poline': {
        // Polar-interpolated palette between up to three anchor colours
        // (poline). Wired colours override the per-anchor hex defaults.
        const a = (input(id, 'colorA', null) as RGB | null) ?? hexToRgb(String(props.anchorA ?? '#1020ff'))
        const b = (input(id, 'colorB', null) as RGB | null) ?? hexToRgb(String(props.anchorB ?? '#ff20a0'))
        const c = (input(id, 'colorC', null) as RGB | null) ?? hexToRgb(String(props.anchorC ?? '#20ffd0'))
        const points = Number(props.points ?? 4)
        const position = String(props.position ?? 'sinusoidal')
        out = { palette: polinePalette([a, b, c], points, position) }
        break
      }

      case 'PaletteBlend': {
        // Sample both palettes at 16 stops and lerp per entry → a real blend.
        const amount = Math.max(0, Math.min(1, num(id, 'amount', props, 'amount', 0.5)))
        const palA = pal(id, 'paletteA', props, 'paletteA', 'rainbow')
        const palB = pal(id, 'paletteB', props, 'paletteB', 'ocean')
        const stops: RGB[] = []
        for (let i = 0; i < 16; i++) {
          const ti = i / 15
          const ca = samplePalette(palA, ti), cb = samplePalette(palB, ti)
          stops.push({
            r: Math.round(ca.r * (1 - amount) + cb.r * amount),
            g: Math.round(ca.g * (1 - amount) + cb.g * amount),
            b: Math.round(ca.b * (1 - amount) + cb.b * amount),
          })
        }
        out = { palette: stops }
        break
      }

      case 'BeatSin': {
        const bpm = Number(props.bpm ?? 60)
        const lo  = Number(props.low  ?? 0)
        const hi  = Number(props.high ?? 255)
        const phase = (t * bpm / 60) % 1
        out = { value: lo + ((Math.sin(phase * Math.PI * 2) + 1) / 2) * (hi - lo) }
        break
      }

      case 'Ease': {
        const type = String(props.easeType ?? 'inOutCubic')
        const tin = num(id, 't', props, 't', 0)
        out = { result: applyEase(type, tin) }
        break
      }

      // Metronome — fires a boolean pulse once every `interval` seconds. Stateful
      // (module-level intervalLast), keyed per group instance like other stateful
      // nodes. Mirrors the millis()-based timer the C++ generator emits.
      case 'Interval': {
        const interval = Math.max(0.05, Number(props.interval ?? 0.5))
        const key = stateKey(id)
        const last = intervalLast.get(key)
        let pulse = false
        if (last === undefined || t < last) {
          intervalLast.set(key, t)          // first tick, or clock reset
        } else if (t - last >= interval) {
          intervalLast.set(key, last + interval)
          pulse = true
        }
        out = { pulse }
        break
      }

      case 'Fire2012': {
        const cooling  = num(id, 'cooling', props, 'cooling', 55)
        const sparking = num(id, 'sparking', props, 'sparking', 120)
        const palette = pal(id, 'paletteIn', props, 'palette', 'heat')
        out = { frame: evalFire2012(id, cooling, sparking, palette, W, H) }
        break
      }

      case 'Blur2D': {
        const src = input(id, 'frame', null) as Frame | null
        // `amount` is a 0–1 strength; FastLED's blur2d takes a 0–255 blur amount.
        const amount = Math.max(0, Math.min(1, num(id, 'amount', props, 'amount', 0.15)))
        if (!src) { out = { frame: blankFrame(W, H) }; break }
        out = { frame: evalBlur2D(src, amount * 255, W, H) }
        break
      }

      case 'XYMapper': {
        const x = num(id, 'x', props, 'x', 0)
        const y = num(id, 'y', props, 'y', 0)
        out = { index: Math.floor(x) + Math.floor(y) * W }
        break
      }

      case 'AudioHue': {
        const bass   = num(id, 'bass',   props, 'bass',   0.5)
        const mids   = num(id, 'mids',   props, 'mids',   0.5)
        const treble = num(id, 'treble', props, 'treble', 0.5)
        out = { hue: (bass * 0.5 + mids * 0.3 + treble * 0.2) * 360 }
        break
      }

      // ── Hardware (stubs) ───────────────────────────────────────────────
      case 'ButtonInput':
        out = { pressed: false }
        break

      case 'PotInput':
        out = { value: 0.5 }
        break

      // Preview stub — same inert convention as ButtonInput/PotInput; the
      // meaningful quadrature-decode behavior only exists in firmware.
      case 'EncoderInput':
        out = { position: 0, pressed: false }
        break

      // ── Groups ─────────────────────────────────────────────────────────
      case 'Group': {
        const groupId = String(props.groupId ?? '')
        const def = groups[groupId]
        // Missing group, or a group that (transitively) contains itself —
        // emit a blank frame rather than recursing forever.
        if (!def || groupStack.has(groupId)) {
          out = { frame: blankFrame(W, H) }
          break
        }
        // Bind the group's exposed parameters from its connected input ports.
        const boundInputs: Record<string, PortValue> = {}
        for (const port of (node.data.inputs as { id: string }[] | undefined) ?? []) {
          boundInputs[port.id] = input(id, port.id, null)
        }
        const frame = evaluateGraph(
          def.nodes, def.edges, tick, W, H, groups,
          `${instancePrefix}${id}/`,
          new Set([...groupStack, groupId]),
          boundInputs, audioOverride,
        ) ?? blankFrame(W, H)
        out = { frame }
        break
      }

      // Carries a bound parameter value into a group subgraph.
      case 'GroupInput':
        out = { out: groupInputs[String(props.paramId ?? '')] ?? null }
        break

      // The frame terminal inside a group subgraph (analogous to MatrixOutput).
      case 'GroupOutput':
        out = { frame: input(id, 'frame', null) }
        break

      // ── Music-sync pipeline (data managed by musicStore, not frame graph) ──
      case 'MusicLibrary':
        out = { music: true }
        break

      case 'PerformanceGenerator':
        // The timed-show player lives in the node body. Its graph output is a
        // safe black frame when that player is not actively supplying pixels,
        // allowing the generator to terminate the main MatrixOutput graph.
        out = { shows: null, frame: blankFrame(W, H) }
        break

      case 'SDCard':
        out = {}
        break

      // ── Output ─────────────────────────────────────────────────────────
      case 'MatrixOutput':
        out = { frame: input(id, 'frame', null) }
        break

      // Canvas-only annotation — no ports, nothing to evaluate.
      case 'Comment':
        out = {}
        break

      default:
        out = {}
    }

    memo.set(id, out)
    inProgress.delete(id)
    return out
  }

  return evalNode
}

// ── Public entry points ───────────────────────────────────────────────────────

export function evaluateGraph(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
  groups: GroupRegistry = {},
  // Internal recursion bookkeeping for nested groups — callers leave these defaulted.
  instancePrefix = '',
  groupStack: ReadonlySet<string> = new Set(),
  groupInputs: Record<string, PortValue> = {},
  audioOverride: AudioOverride | null = null,
): Frame | null {
  maybePruneEvaluatorState()
  if (nodes.length === 0) return null
  const evalNode = createEvalNode(nodes, edges, tick, gridW, gridH, groups, instancePrefix, groupStack, groupInputs, audioOverride)
  // Render only what reaches an explicit terminal: a GroupOutput inside a group
  // subgraph, or a MatrixOutput at the root, each passing through its `frame`
  // input. A graph with no terminal previews nothing — the canvas falls back to
  // its idle animation — so the preview always matches what would be flashed.
  const outputNode = nodes.find(n => {
    const nt = (n.data as { nodeType?: string }).nodeType
    return nt === 'GroupOutput' || nt === 'MatrixOutput'
  })
  if (outputNode) {
    const frame = evalNode(outputNode.id).frame
    if (frame) return frame as Frame
  }
  return null
}

/**
 * Probe a single node's scalar output port at one tick, reusing the full
 * evaluator so the value matches what the graph actually computes (e.g. a
 * ComplexWave's `result` reflects its real upstream inputs). Stateful upstream
 * nodes run under a reserved state namespace so the probe never disturbs the
 * live render. Returns 0 for missing/non-numeric ports (booleans → 0/1).
 */
export function evaluateScalar(
  nodes: StudioNode[],
  edges: StudioEdge[],
  nodeId: string,
  portId: string,
  tick: number,
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
): number {
  return evaluateScalarSeries(nodes, edges, nodeId, portId, [tick], gridW, gridH)[0]
}

/**
 * `evaluateScalar` across a series of ticks in one call: the graph lookup maps
 * are built once and shared by every per-tick evaluator, so sampling a scope
 * window costs one graph walk per tick instead of one full setup per tick.
 */
export function evaluateScalarSeries(
  nodes: StudioNode[],
  edges: StudioEdge[],
  nodeId: string,
  portId: string,
  ticks: readonly number[],
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
): number[] {
  if (nodes.length === 0) return ticks.map(() => 0)
  const shared = buildEvalMaps(nodes, edges)
  return ticks.map((tick) => {
    const evalNode = createEvalNode(nodes, edges, tick, gridW, gridH, {}, '__scope__/', new Set(), {}, null, shared)
    const v = evalNode(nodeId)?.[portId]
    return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0
  })
}

// Node types every frame pass must evaluate even when skipping auxiliary
// nodes: the terminals (they define the rendered frame) and BeatDetect, whose
// one-frame beat pulse triggers the preview loop's early publish — sampling it
// only on publish frames would miss most beats.
const HOT_NODE_TYPES = new Set(['GroupOutput', 'MatrixOutput', 'BeatDetect'])

// Single-entry cache of the "hot" node set — the upstream closure of the
// terminals and beat emitters — recomputed only when the graph arrays change
// (the preview loop asks for it 60×/s with stable references between edits).
let hotIdsNodes: StudioNode[] | null = null
let hotIdsEdges: StudioEdge[] | null = null
let hotIdsCache = new Set<string>()

function hotNodeIds(nodes: StudioNode[], edges: StudioEdge[]): Set<string> {
  if (nodes === hotIdsNodes && edges === hotIdsEdges) return hotIdsCache
  hotIdsNodes = nodes
  hotIdsEdges = edges
  const byTarget = new Map<string, string[]>()
  for (const e of edges) {
    if (!e.source || !e.target) continue
    const into = byTarget.get(e.target)
    if (into) into.push(e.source)
    else byTarget.set(e.target, [e.source])
  }
  const hot = new Set<string>()
  const pending: string[] = []
  for (const n of nodes) {
    if (HOT_NODE_TYPES.has(String((n.data as { nodeType?: unknown }).nodeType))) {
      hot.add(n.id)
      pending.push(n.id)
    }
  }
  while (pending.length) {
    const id = pending.pop()!
    for (const src of byTarget.get(id) ?? []) {
      if (hot.has(src)) continue
      hot.add(src)
      pending.push(src)
    }
  }
  hotIdsCache = hot
  return hot
}

/**
 * Evaluate the whole graph once, returning the terminal frame (as
 * `evaluateGraph` would) plus every node's output ports — so per-node previews
 * can be driven from the same single pass without double-advancing stateful
 * nodes. Outputs are keyed by node id; each is a `{ portId: value }` record.
 *
 * With `auxNodes` false, only the hot set is evaluated: nodes feeding a
 * terminal, plus beat emitters and their upstream chains. Nodes disconnected
 * from the output only feed previews published at ~8 fps, so the preview loop
 * passes false on non-publish frames and their evaluation cost drops to the
 * publish cadence (their per-call stateful simulations advance at that rate —
 * the same trade-off the hidden-panel throttle already makes graph-wide).
 */
export function evaluateGraphFull(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
  groups: GroupRegistry = {},
  auxNodes = true,
): { frame: Frame | null; outputs: Map<string, Record<string, unknown>> } {
  maybePruneEvaluatorState()
  advanceFramePool()
  const outputs = new Map<string, Record<string, unknown>>()
  if (nodes.length === 0) return { frame: null, outputs }
  const evalNode = createEvalNode(nodes, edges, tick, gridW, gridH, groups, '', new Set(), {})
  const hot = auxNodes ? null : hotNodeIds(nodes, edges)
  for (const n of nodes) {
    if (hot && !hot.has(n.id)) continue
    outputs.set(n.id, evalNode(n.id))
  }
  const outputNode = nodes.find(n => {
    const nt = (n.data as { nodeType?: string }).nodeType
    return nt === 'GroupOutput' || nt === 'MatrixOutput'
  })
  const frame = outputNode ? ((outputs.get(outputNode.id)?.frame as Frame | undefined) ?? null) : null
  return { frame, outputs }
}

/** Sample a palette into `n` evenly-spaced RGB stops (for a gradient strip). */
export function paletteStops(palette: Palette, n: number): RGB[] {
  const out: RGB[] = []
  for (let i = 0; i < n; i++) out.push(samplePalette(palette, n === 1 ? 0 : i / (n - 1)))
  return out
}

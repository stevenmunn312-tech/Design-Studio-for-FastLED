import type { StudioNode, StudioEdge } from './graphStore'
import { useAudioStore } from './audioStore'
import { asFont, textColumns, type BitmapFont, DEFAULT_FONT } from './font'
import { asImage, sampleImageToFrame } from './image'
import { waveSample, combineWaves } from './wave'
import { polinePalette, hexToRgb } from './polinePalette'
import { inputClampRange } from './nodeLibrary'
import { makeShims, SHIM_NAMES } from './fastledShims'
import { createBeatDetectorState, denormalizeBeatParam, updateBeatDetectorFromSpectrum } from '../audio/beatDetection'
import { denormalizeAudioFlowParam } from './audioFlowRange'
import { SPEED_MAX, SCALE_MAX, NOISE_SPEED_MAX, NOISE_SCALE_MAX, denormRate } from './speedRange'

export interface RGB { r: number; g: number; b: number }
export type Frame = RGB[][]   // row-major [y][x]
/** A per-pixel scalar grid, length W×H (row-major, index y*W+x), values 0–1. */
export type Field = Float32Array

// Default grid dimensions; overridden by evaluateGraph params
const DEFAULT_W = 16
const DEFAULT_H = 16

// ── Persistent state for stateful pattern nodes ───────────────────────────────
const fireHeat    = new Map<string, number[][]>()
const flashLevel  = new Map<string, number>()
const counterVals = new Map<string, number>()
// Interval (metronome) node — last fire time in seconds, keyed by state id.
const intervalLast = new Map<string, number>()
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

interface FlowState { px: Float32Array; py: Float32Array; trail: Float32Array; w: number; h: number }
const flowState = new Map<string, FlowState>()

interface StarState { x: Float32Array; y: Float32Array; z: Float32Array; w: number; h: number }
const starState = new Map<string, StarState>()

interface SparkState { frame: Frame; w: number; h: number }
const sparkState = new Map<string, SparkState>()

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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const hue = start + (y * W + x) * deltaHue
      return hsv((((hue % 256) + 256) % 256) / 256 * 360, 1, 1)
    })
  )
}

function solidFrame(color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ ...color })))
}

function blankFrame(W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
}

// Deep copy so painting onto a base frame never mutates an upstream node's
// memoised output.
function cloneFrame(frame: Frame): Frame {
  return frame.map(row => row.map(px => ({ ...px })))
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
    return Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => {
        const sx = ((Math.round(x - dx) % W) + W) % W
        const sy = ((Math.round(y - dy) % H) + H) % H
        return { ...src[sy][sx] }
      })
    )
  }
  if (mode === 'scale') {
    const s = Math.max(0.05, Math.min(20, 1 + (rate / 100) * t))
    return Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => sample(cx + (x - cx) / s, cy + (y - cy) / s))
    )
  }
  // rotate: sample the source under the inverse rotation
  const a = (rate * t * Math.PI) / 180
  const cosA = Math.cos(a), sinA = Math.sin(a)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const rx = x - cx, ry = y - cy
      return sample(cx + rx * cosA + ry * sinA, cy - rx * sinA + ry * cosA)
    })
  )
}

// Render `text` onto a blank frame at (startX, startY), optionally scrolling
// left over time (scroll = columns/second). Shares textColumns() with codegen.
function renderText(text: string, color: RGB, startX: number, startY: number, scroll: number, t: number, font: BitmapFont = DEFAULT_FONT, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const frame = blankFrame(W, H)
  const cols = textColumns(text, font)
  if (cols.length === 0) return frame
  const total = cols.length + W
  const offset = scroll !== 0 ? Math.floor((((t * scroll) % total) + total) % total) : 0
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
  return frame
}

// ── Pattern evaluators ────────────────────────────────────────────────────────
function evalNoiseField(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const v = (Math.sin(x * scale * 0.5 + t * speed) +
                 Math.cos(y * scale * 0.5 + t * speed * 0.7)) / 2
      return samplePalette(palette, (v + 1) / 2)
    })
  )
}

function evalPlasma(speed: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const v = Math.sin(x / 3 + t * speed)
              + Math.sin(y / 3 + t * speed * 0.8)
              + Math.sin((x + y) / 5 + t * speed * 0.6)
              + Math.sin(Math.hypot(x - W / 2, y - H / 2) / 3 + t * speed * 0.5)
      return hsv(v * 45 + t * 20, 1, 0.9)
    })
  )
}

function evalFire(nodeId: string, intensity: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const stored = fireHeat.get(nodeId)
  if (!stored || stored.length !== H || stored[0].length !== W) {
    fireHeat.set(nodeId, Array.from({ length: H }, () => Array(W).fill(0)))
  }
  const heat = fireHeat.get(nodeId)!
  const cooling = 0.05

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = Math.max(0, heat[y][x] - cooling - Math.random() * cooling)

  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = (
        heat[y][x] +
        heat[y + 1][Math.max(0, x - 1)] +
        heat[y + 1][x] +
        heat[y + 1][Math.min(W - 1, x + 1)]
      ) / 4

  const sparking = 0.4 + intensity * 0.55
  for (let x = 0; x < W; x++)
    if (Math.random() < sparking)
      heat[H - 1][x] = Math.min(1, 0.75 + Math.random() * 0.25)

  return heat.map(row =>
    row.map(h => {
      if (h < 0.33) return { r: byte(h * 3),       g: 0,               b: 0 }
      if (h < 0.66) return { r: 255,                g: byte((h - 0.33) * 3), b: 0 }
                    return { r: 255,                g: 255,             b: byte((h - 0.66) * 3) }
    })
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
      if (mirror) frame[y][W - 1 - x] = px
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
      if (mirror) frame[peakY][W - 1 - x] = cap
    }
  }

  return frame
}

function evalBassPulse(bass: number, color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const v = Math.pow(bass, 0.5)
  const lit: RGB = { r: Math.round(color.r * v), g: Math.round(color.g * v), b: Math.round(color.b * v) }
  return solidFrame(lit, W, H)
}

function evalBassRings(bass: number, intensity: number, speed: number, color: RGB, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const dist = Math.hypot(x - cx, y - cy) / maxD
      const wave = Math.sin(dist * ringCount * Math.PI * 2 - phase)
      const crisp = Math.pow(Math.max(0, wave * 0.5 + 0.5), 2.4)
      const v = Math.min(1, floor + crisp * gain)
      return {
        r: Math.round(color.r * v),
        g: Math.round(color.g * v),
        b: Math.round(color.b * v),
      }
    })
  )
}

function evalMidrangeWaves(mids: number, intensity: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
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
  )
}

function evalMidrangeBloom(mids: number, intensity: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, mids))
  const strength = Math.max(0, Math.min(1, intensity))
  const motion = Math.max(0, speed) * (0.8 + level * 2.2 * strength)
  const cx0 = (W - 1) / 2
  const cy0 = (H - 1) / 2
  const sx = Math.max(1, W / 2)
  const sy = Math.max(1, H / 2)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
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
  )
}

function evalTrebleSparks(nodeId: string, treble: number, density: number, color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, treble))
  const amount = Math.max(0, Math.min(1, density))
  let state = sparkState.get(nodeId)
  if (!state || state.w !== W || state.h !== H) {
    state = { frame: blankFrame(W, H), w: W, h: H }
    sparkState.set(nodeId, state)
  }

  const frame = cloneFrame(state.frame)
  const fade = 0.58 + (1 - level) * 0.16
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      frame[y][x] = scaleRgb(frame[y][x], fade)
    }
  }

  const whiteHot = mixRgb(color, { r: 255, g: 255, b: 255 }, 0.35 + level * 0.35)
  const spawnChance = 0.2 + level * 0.8
  let spawnCount = Math.round(W * H * amount * (0.03 + level * 0.12))
  if (spawnCount < 1 && amount * level > 0.05) spawnCount = 1

  const addSpark = (x: number, y: number, spark: RGB, strength: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H || strength <= 0) return
    frame[y][x] = addRgb(frame[y][x], scaleRgb(spark, strength))
  }

  for (let i = 0; i < spawnCount; i++) {
    if (Math.random() > spawnChance) continue
    const x = Math.floor(Math.random() * W)
    const y = Math.floor(Math.random() * H)
    const flash = 0.55 + Math.random() * 0.45
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

  state.frame = cloneFrame(frame)
  return frame
}

function evalTreblePrism(treble: number, intensity: number, speed: number, color: RGB, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, treble))
  const strength = Math.max(0, Math.min(1, intensity))
  const motion = Math.max(0, speed) * (1.2 + level * 3.2 * strength)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const diagA = x * 1.7 + y * 1.15
      const diagB = x * -1.1 + y * 1.9
      const waveA = Math.sin(diagA + t * motion * 7.5)
      const waveB = Math.sin(diagB - t * motion * 6.1)
      const prism = Math.max(0, waveA * 0.55 + waveB * 0.45)
      const shard = Math.pow(prism, 3.6)
      const flash = Math.pow(Math.max(0, Math.sin((x + y) * 2.4 - t * motion * 9) * 0.5 + 0.5), 10)
      const v = Math.min(1, shard * (0.3 + level * 0.7 * strength) + flash * level * 0.9 * strength)
      return {
        r: Math.round(color.r * v),
        g: Math.round(color.g * v),
        b: Math.round(color.b * v),
      }
    })
  )
}

function evalAudioCascade(bass: number, mids: number, treble: number, intensity: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const b = Math.max(0, Math.min(1, bass))
  const m = Math.max(0, Math.min(1, mids))
  const tr = Math.max(0, Math.min(1, treble))
  const strength = Math.max(0, Math.min(1, intensity))
  const motion = Math.max(0, speed) * (0.8 + (b + m + tr) * 1.4 * strength)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
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
  )
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
  switch (palette) {
    case 'heat':
      if (h < 0.33) return { r: Math.round(h * 3 * 255), g: 0, b: 0 }
      if (h < 0.66) return { r: 255, g: Math.round(((h - 0.33) / 0.33) * 255), b: 0 }
      return { r: 255, g: 255, b: Math.round(((h - 0.66) / 0.34) * 255) }
    case 'ocean':
      return hsv(200 + h * 40, 0.8 + h * 0.2, h * 0.9 + 0.1)
    case 'lava':
      return hsv(h * 40, 1, h > 0.08 ? 0.9 : h * 11)
    case 'forest':
      return hsv(90 + h * 60, 0.7 + h * 0.3, 0.4 + h * 0.6)
    case 'party':
      return hsv(((h * 360 * 6.7) % 360 + 360) % 360, 1, 1)
    default: // rainbow
      return hsv(h * 360, 1, 1)
  }
}

function evalNoise2D(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * Math.sin(x * freq + t * speed + oct * 1.7) * Math.cos(y * freq * 1.3 + t * speed * 0.8 + oct * 2.3)
        amp *= 0.5; freq *= 2.1
      }
      return hsv((v * 0.5 + 0.5) * 360, 1, 0.85)
    })
  )
}

function evalRadialBurst(speed: number, color: RGB, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxD = Math.hypot(cx, cy)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const dist = Math.hypot(x - cx, y - cy) / maxD
      const wave = (Math.sin((dist * 8 - t * speed * 3) * Math.PI) + 1) / 2
      return { r: Math.round(color.r * wave), g: Math.round(color.g * wave), b: Math.round(color.b * wave) }
    })
  )
}

function evalSpiral(speed: number, arms: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxD = Math.hypot(cx, cy)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const dx = x - cx, dy = y - cy
      const dist = Math.hypot(dx, dy) / maxD
      const angle = Math.atan2(dy, dx)
      const spiral = (angle + dist * Math.PI * 4 - t * speed * Math.PI) * arms
      const v = (Math.sin(spiral) + 1) / 2
      return hsv(dist * 360 + t * 30, 1, v * 0.9)
    })
  )
}

function evalKaleidoscope(src: Frame, segments: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const segAngle = (Math.PI * 2) / Math.max(2, segments)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const dx = x - cx, dy = y - cy
      const dist = Math.hypot(dx, dy)
      let angle = ((Math.atan2(dy, dx) % segAngle) + segAngle) % segAngle
      if (angle > segAngle / 2) angle = segAngle - angle
      const sx = Math.round(cx + dist * Math.cos(angle))
      const sy = Math.round(cy + dist * Math.sin(angle))
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) return { r: 0, g: 0, b: 0 }
      return { ...src[sy][sx] }
    })
  )
}

const MAX_PARTICLES = 600

// Bundled particle systems — `mode` picks the simulation. Each mode spawns and
// advances the persistent particle pool, then a shared pass renders every live
// particle additively at its `life` brightness. Keep the modes in sync with
// PROPERTY_META.particleType and cppGenerator's `Particles` case.
function evalParticles(nodeId: string, mode: string, rate: number, color: RGB, decay: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  if (!particleState.has(nodeId)) particleState.set(nodeId, [])
  let particles = particleState.get(nodeId)!
  const rnd = Math.random

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

  // fireworks gives each burst its own random hue, so it renders the stored
  // per-particle colour; every other mode shares the node colour, so it renders
  // the *live* colour — letting a colour change apply to existing particles too.
  const perParticle = mode === 'fireworks'
  const frame = blankFrame(W, H)
  for (const p of particles) {
    const px = Math.round(p.x), py = Math.round(p.y)
    if (px >= 0 && px < W && py >= 0 && py < H) {
      const cur = frame[py][px], k = Math.min(1, p.life)
      const cr = perParticle ? p.r : color.r, cg = perParticle ? p.g : color.g, cb = perParticle ? p.b : color.b
      cur.r = Math.min(255, cur.r + Math.round(cr * k))
      cur.g = Math.min(255, cur.g + Math.round(cg * k))
      cur.b = Math.min(255, cur.b + Math.round(cb * k))
    }
  }
  return frame
}

function evalGradientFrame(cA: RGB, cB: RGB, vertical: boolean, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const t = vertical ? y / (H - 1) : x / (W - 1)
      return { r: Math.round(cA.r * (1-t) + cB.r * t), g: Math.round(cA.g * (1-t) + cB.g * t), b: Math.round(cA.b * (1-t) + cB.b * t) }
    })
  )
}

// Dispatch for the bundled `Noise` node — `noiseType` picks the algorithm.
// All variants share the (speed, scale, palette)→frame signature. Keep the
// cases in sync with PROPERTY_META.noiseType and cppGenerator's `Noise` case.
function evalNoiseByType(noiseType: string, speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  switch (noiseType) {
    case 'simplex': return evalSimplex2D(speed, scale, t, palette, W, H)
    case 'noise3d': return evalNoise3D(speed, scale, t, palette, W, H)
    case 'worley':  return evalWorley(speed, scale, t, palette, W, H)
    case 'plasma':  return evalPlasmaFractal(speed, scale, t, palette, W, H)
    case 'field':
    default:        return evalNoiseField(speed, scale, t, palette, W, H)
  }
}

function evalSimplex2D(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 4; oct++) {
        v += amp * _snoise2(x * freq + t * speed * 0.13, y * freq + t * speed * 0.1)
        amp *= 0.5; freq *= 2
      }
      return samplePalette(palette, (v * 0.5 + 0.5) % 1)
    })
  )
}

function evalNoise3D(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  // 3D via two orthogonal 2D slices animated along the z (time) axis
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const z = t * speed * 0.08
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * (_snoise2(x * freq + z * 0.37, y * freq) * 0.6 +
                    _snoise2(x * freq * 0.9, y * freq + z * 0.61) * 0.4)
        amp *= 0.5; freq *= 2.1
      }
      return samplePalette(palette, ((v * 0.5 + 0.5) % 1 + 1) % 1)
    })
  )
}

// Integer hash → [0,1), used to place a feature point per cell for Worley noise.
function worleyHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Worley (cellular) noise: distance to the nearest animated feature point,
// coloured through a palette. Feature points jitter on a circle over time.
function evalWorley(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
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
      return samplePalette(palette, Math.min(1, f1))
    })
  )
}

// Gabor noise: sparse-convolution noise summing one Gaussian-windowed cosine
// (Gabor) kernel per grid cell. `orientation` fixes the band direction (the
// anisotropic variant) and `frequency` the band spacing; phase animates over
// time. Coloured through a palette.
function evalGaborNoise(speed: number, scale: number, frequency: number, orientation: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const omega = (orientation * Math.PI) / 180
  const cosO = Math.cos(omega), sinO = Math.sin(omega)
  const TAU = Math.PI * 2
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
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
  )
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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const tnorm = (x * cosA + y * sinA - projMin) / range
      return samplePalette(palette, tnorm * repeat + t * speed)
    })
  )
}

// Fractal (fBm) noise: sum simplex octaves at doubling frequency / halving
// amplitude for a detailed, cloud-like field, coloured through a palette.
function evalFractalNoise(speed: number, scale: number, octaves: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const z = t * speed * 0.15
  const oct = Math.max(1, Math.min(6, Math.floor(octaves)))
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let v = 0, amp = 0.5, freq = scale, norm = 0
      for (let o = 0; o < oct; o++) {
        v += amp * _snoise2(x * freq + z, y * freq - z * 0.5)
        norm += amp; amp *= 0.5; freq *= 2
      }
      const n = (v / norm) * 0.5 + 0.5
      return samplePalette(palette, ((n % 1) + 1) % 1)
    })
  )
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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let f = 0
      for (let i = 0; i < n; i++) { const dx = x - bx[i], dy = y - by[i]; f += r2 / (dx * dx + dy * dy + 1) }
      return samplePalette(palette, f / (f + 1))
    })
  )
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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => samplePalette(palette, trail[y * W + x]))
  )
}

// Warp starfield: stars fly outward from the centre; nearer stars are brighter.
function evalStarfield(nodeId: string, speed: number, count: number, color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
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
      frame[py][px] = { r: Math.round(color.r * b), g: Math.round(color.g * b), b: Math.round(color.b * b) }
    }
  }
  return frame
}

// Plasma blended with fractal (simplex) noise for an organic flowing field.
function evalPlasmaFractal(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let v = Math.sin(x * 0.2 + t * speed) + Math.sin(y * 0.25 + t * speed * 0.8) + Math.sin((x + y) * 0.15 + t * speed * 0.6)
      let amp = 1, freq = scale, fn = 0
      for (let o = 0; o < 3; o++) { fn += amp * _snoise2(x * freq + t * speed * 0.1, y * freq); amp *= 0.5; freq *= 2 }
      v += fn * 2.5
      return samplePalette(palette, (((v * 0.15) % 1) + 1) % 1)
    })
  )
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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const v = _snoise2(x * scale + flow, y * scale * 0.6 + vflow) * 0.5 + 0.5
      const c = samplePalette(palette, (((v + treble * 0.3) % 1) + 1) % 1)
      return { r: Math.round(c.r * bright), g: Math.round(c.g * bright), b: Math.round(c.b * bright) }
    })
  )
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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => samplePalette(palette, v[y * W + x]))
  )
}

// Conway's Game of Life on a toroidal grid. Live cells glow in `color`; dead
// cells fade out (trails). Steps at `speed`/sec and reseeds when it stagnates.
function evalGameOfLife(nodeId: string, color: RGB, speed: number, fade: number, tick: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const b = bright[y * W + x]
      return { r: Math.round(color.r * b), g: Math.round(color.g * b), b: Math.round(color.b * b) }
    })
  )
}

function heatColor(temperature: number): RGB {
  const t192 = Math.floor(temperature * 191 / 255)
  const ramp = (t192 & 0x3F) << 2
  if (t192 > 0x80) return { r: 255, g: 255, b: ramp }
  if (t192 > 0x40) return { r: 255, g: ramp, b: 0 }
  return { r: ramp, g: 0, b: 0 }
}

const fire2012Heat = new Map<string, Uint8Array[]>()

function evalFire2012(nodeId: string, cooling: number, sparking: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
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
  return heat.map(row => Array.from(row).map(h => heatColor(h)))
}

function evalBlur2D(src: Frame, amount: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const radius = Math.max(1, Math.round(amount / 255 * 3))
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
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
  )
}

function evalWipe(a: Frame, b: Frame, tt: number, direction: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let revealed: boolean
      switch (direction) {
        case 'left':  revealed = x > W * (1 - tt); break
        case 'up':    revealed = y > H * (1 - tt); break
        case 'down':  revealed = y < H * tt;       break
        default:      revealed = x < W * tt;       break // 'right'
      }
      return revealed ? { ...b[y][x] } : { ...a[y][x] }
    })
  )
}

function evalDissolve(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const hash = (((x * 1664525 + y * 1013904223) >>> 0) / 0xffffffff)
      return hash < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
  )
}

// ── Extra transition variants (bundled into the `Transition` node) ───────────
// All blend frame A→B by `tt` (0–1); keep in sync with cppGenerator's
// `Transition` case.

function evalIris(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const r = tt * Math.hypot(cx, cy)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) =>
      Math.hypot(x - cx, y - cy) < r ? { ...b[y][x] } : { ...a[y][x] }))
}

function evalClockWipe(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      // atan2 shifted so 12 o'clock = 0 and the sweep goes clockwise
      const norm = (Math.atan2(x - cx, -(y - cy)) + Math.PI) / (2 * Math.PI)
      return norm < tt ? { ...b[y][x] } : { ...a[y][x] }
    }))
}

function evalPush(a: Frame, b: Frame, tt: number, direction: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
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
    }))
}

function evalCheckerboard(a: Frame, b: Frame, tt: number, tileSize: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const isEven = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0
      const threshold = isEven ? tt * 2 : tt * 2 - 1
      return threshold >= 1 ? { ...b[y][x] } : { ...a[y][x] }
    }))
}

function evalDiagonal(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) =>
      (x / W + y / H) / 2 < tt ? { ...b[y][x] } : { ...a[y][x] }))
}

function evalFadeThroughBlack(a: Frame, b: Frame, tt: number): Frame {
  const [src, alpha] = tt < 0.5 ? [a, 1 - tt * 2] : [b, (tt - 0.5) * 2]
  return src.map(row => row.map(px => ({
    r: Math.round(px.r * alpha), g: Math.round(px.g * alpha), b: Math.round(px.b * alpha),
  })))
}

function evalFadeThroughWhite(a: Frame, b: Frame, tt: number): Frame {
  const [src, alpha] = tt < 0.5 ? [a, 1 - tt * 2] : [b, (tt - 0.5) * 2]
  const w = (1 - alpha) * 255
  return src.map(row => row.map(px => ({
    r: Math.round(px.r * alpha + w), g: Math.round(px.g * alpha + w), b: Math.round(px.b * alpha + w),
  })))
}

function evalBlinds(a: Frame, b: Frame, tt: number, count: number, axis: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const slatSize = Math.max(1, Math.floor((axis === 'horizontal' ? H : W) / count))
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const pos = axis === 'horizontal' ? y : x
      return (pos % slatSize) / slatSize < tt ? { ...b[y][x] } : { ...a[y][x] }
    }))
}

function evalRippleWipe(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy), edge = 0.08
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const norm = Math.hypot(x - cx, y - cy) / maxR
      if (norm < tt - edge) return { ...b[y][x] }
      if (norm >= tt) return { ...a[y][x] }
      const blend = (tt - norm) / edge, pa = a[y][x], pb = b[y][x]
      return {
        r: Math.round(pa.r * (1 - blend) + pb.r * blend),
        g: Math.round(pa.g * (1 - blend) + pb.g * blend),
        b: Math.round(pa.b * (1 - blend) + pb.b * blend),
      }
    }))
}

function evalSpiralWipe(a: Frame, b: Frame, tt: number, turns: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const r = Math.hypot(x - cx, y - cy) / maxR
      const normAngle = (Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)
      return (r + normAngle / turns) / (1 + 1 / turns) < tt ? { ...b[y][x] } : { ...a[y][x] }
    }))
}

function evalCurtain(a: Frame, b: Frame, tt: number, axis: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      // distance from the centre axis: reveals the centre gap first
      const dist = axis === 'horizontal' ? Math.abs(2 * y / H - 1) : Math.abs(2 * x / W - 1)
      return dist < tt ? { ...b[y][x] } : { ...a[y][x] }
    }))
}

function evalScanLines(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) => {
    // even rows complete in [0, 0.5), odd rows in [0.5, 1.0)
    const threshold = y % 2 === 0 ? (y / H) * 0.5 : 0.5 + ((y - 1) / H) * 0.5
    return Array.from({ length: W }, (_, x) =>
      tt > threshold ? { ...b[y][x] } : { ...a[y][x] })
  })
}

function evalZoom(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
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
    }))
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
}
interface ShowOpts { minTime: number; maxTime: number; transSec: number; pool: string[]; beatEnabled: boolean }

// The generative show: hold a random pattern for a random dwell in
// [minTime, maxTime], then transition (a random style from `pool`) into another
// random pattern. A wired beat advances early, once at least minTime has passed.
// `render(groupId)` rasterises a pattern's subgraph to a frame.
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

  patternShowState.set(key, st)
  return frame
}

/** Per-pixel linear blend of two frames, m=0 → a, m=1 → b. */
function blendFrame(a: Frame, b: Frame, m: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const k = Math.max(0, Math.min(1, m))
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const pa = a[y]?.[x] ?? { r: 0, g: 0, b: 0 }
      const pb = b[y]?.[x] ?? { r: 0, g: 0, b: 0 }
      return {
        r: Math.round(pa.r * (1 - k) + pb.r * k),
        g: Math.round(pa.g * (1 - k) + pb.g * k),
        b: Math.round(pa.b * (1 - k) + pb.b * k),
      }
    })
  )
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

  return Array.from({ length: H }, (_, yi) =>
    Array.from({ length: W }, (_, xi) => {
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
  )
}

function evalFieldFormula(formula: string, a: number, b: number, fieldIn: Field | null, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = new Float32Array(W * H)
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

function evalFieldToFrame(field: Field | null, palette: Palette, brightness: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const bv = Math.max(0, Math.min(1, brightness))
  const b8 = (v: number) => Math.max(0, Math.min(255, Math.round(v * bv)))
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      if (!field) return { r: 0, g: 0, b: 0 }
      const c = samplePalette(palette, field[y * W + x])
      return { r: b8(c.r), g: b8(c.g), b: b8(c.b) }
    })
  )
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
    if (codeCache.size > 50) codeCache.clear()
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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const px = leds![y * W + x]
      return { r: Math.max(0, Math.min(255, Math.round(px.r))), g: Math.max(0, Math.min(255, Math.round(px.g))), b: Math.max(0, Math.min(255, Math.round(px.b))) }
    })
  )
}

// Distance from each pixel to a movable point (px,py in normalised 0–1 space).
// Output is 0 at the point, rising to 1; `scale` (≥1) stretches the ramp so it
// reaches 1 sooner. The diagonal of the unit square (√2) is the 1.0 reference.
function evalDistanceField(px: number, py: number, scale: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = new Float32Array(W * H)
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
  const out = new Float32Array(W * H)
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
  const out = new Float32Array(W * H)
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
  const out = new Float32Array(W * H)
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
  const out = new Float32Array(W * H)
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

// Build the memoised evaluator closure for one graph (or group subgraph) at a
// given tick. `instancePrefix` namespaces stateful-node state per group
// instance; `groupStack` breaks group-level recursion; `groupInputs` carries
// the values bound to the current group's exposed parameters.
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
) {
  const t = tick / 60   // seconds at assumed 60 fps

  // State maps are module-level and keyed by node id; prefix with the group
  // instance path so two instances of the same group don't share state.
  const stateKey = (id: string) => instancePrefix + id

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Map "targetNodeId:targetPortId" → upstream {srcId, srcPort}
  const incoming = new Map<string, { srcId: string; srcPort: string }>()
  for (const edge of edges) {
    if (edge.source && edge.target && edge.sourceHandle && edge.targetHandle)
      incoming.set(`${edge.target}:${edge.targetHandle}`, {
        srcId: edge.source,
        srcPort: edge.sourceHandle,
      })
  }

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
        out = { audio: null }
        break

      case 'FFTAnalyzer': {
        const audio = useAudioStore.getState()
        const raw = audio.active
          ? { bass: audio.bass, mids: audio.mids, treble: audio.treble }
          : {
              bass:   (Math.sin(t * 2.1) + 1) / 2,
              mids:   (Math.sin(t * 3.7 + 1.0) + 1) / 2,
              treble: (Math.sin(t * 5.3 + 2.0) + 1) / 2,
            }
        const gain = Math.max(0.25, Math.min(4, Number(props.gain ?? 1)))
        // Early builds stored smoothing as an integer (default 3) but never
        // used it. Interpret that legacy value as quarters so saved graphs get
        // the intended 0.75 response instead of becoming almost frozen.
        const smoothingProp = Number(props.smoothing ?? 0.72)
        const smoothing = Math.max(0, Math.min(0.95, smoothingProp > 1 ? smoothingProp / 4 : smoothingProp))
        const target = {
          bass: Math.min(1, raw.bass * gain),
          mids: Math.min(1, raw.mids * gain),
          treble: Math.min(1, raw.treble * gain),
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
        const audio = useAudioStore.getState()
        if (audio.active) {
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
        const audio = useAudioStore.getState()
        if (audio.active) {
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
          out = {
            kick: clamp01(Math.sin(t * 2.1) * 0.5 + 0.5),
            snare: clamp01(Math.sin(t * 4.0 + 1.2) * 0.5 + 0.5),
            hihat: clamp01(Math.sin(t * 7.5 + 2.1) * 0.5 + 0.5),
          }
        }
        break
      }

      case 'AudioFeatures': {
        const key = stateKey(id)
        const sensitivity = normProp(props.sensitivity, 0.5)
        const gate = normProp(props.gate, 0.12)
        const smoothing = Math.max(0, Math.min(0.95, Number(props.smoothing ?? 0.8)))
        const audio = useAudioStore.getState()
        if (audio.active) {
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
          const energy = clamp01((Math.sin(t * 0.8) + 1) / 2)
          out = {
            vocals: clamp01((Math.sin(t * 1.6 + 0.8) + 1) / 2),
            energy,
            silence: energy < 0.2,
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

      case 'Span': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 128) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        const row   = Math.floor(Number(props.row   ?? 0))
        const start = Math.floor(Number(props.start ?? 0))
        const count = Math.floor(Number(props.count ?? W))
        if (row >= 0 && row < H)
          for (let x = start; x < start + count; x++)
            if (x >= 0 && x < W) frame[row][x] = { ...color }
        out = { frame }
        break
      }

      case 'Rect': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 128) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        const rx = Math.floor(Number(props.x ?? 0))
        const ry = Math.floor(Number(props.y ?? 0))
        const rw = Math.floor(Number(props.w ?? W))
        const rh = Math.floor(Number(props.h ?? H))
        for (let yy = ry; yy < ry + rh; yy++)
          for (let xx = rx; xx < rx + rw; xx++)
            if (xx >= 0 && xx < W && yy >= 0 && yy < H) frame[yy][xx] = { ...color }
        out = { frame }
        break
      }

      case 'Text': {
        const text = String(props.text ?? 'HELLO')
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 255) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        const sx = Math.floor(Number(props.x ?? 0))
        const sy = Math.floor(Number(props.y ?? 0))
        const scroll = num(id, 'scroll', props, 'scroll', 0)
        out = { frame: renderText(text, color, sx, sy, scroll, t, asFont(props.font), W, H) }
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
        const cx = Number(props.cx ?? W / 2), cy = Number(props.cy ?? H / 2)
        const rad = Number(props.radius ?? 4)
        const filled = Boolean(props.filled)
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const d = Math.hypot(x - cx, y - cy)
            if (filled ? d <= rad + 0.5 : Math.abs(d - rad) < 0.5) frame[y][x] = { ...color }
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
        let x0 = Math.round(Number(props.x1 ?? 0)), y0 = Math.round(Number(props.y1 ?? 0))
        const x1 = Math.round(Number(props.x2 ?? 0)), y1 = Math.round(Number(props.y2 ?? 0))
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
        let err = dx + dy
        for (;;) {
          if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) frame[y0][x0] = { ...color }
          if (x0 === x1 && y0 === y1) break
          const e2 = 2 * err
          if (e2 >= dy) { err += dy; x0 += sx }
          if (e2 <= dx) { err += dx; y0 += sy }
        }
        out = { frame }
        break
      }

      // Bundled noise generators (NoiseField / Simplex2D / Noise3D / Worley /
      // PlasmaFractal). All share the (speed, scale, palette)→frame signature;
      // `noiseType` picks the algorithm. Keep in sync with PROPERTY_META.noiseType
      // and the `Noise` case in cppGenerator.ts.
      case 'Noise': {
        const noiseType = String(props.noiseType ?? 'field')
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), NOISE_SPEED_MAX[noiseType] ?? 1)
        const scale = denormRate(num(id, 'scale', props, 'scale', 0.5), NOISE_SCALE_MAX[noiseType] ?? 1)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalNoiseByType(noiseType, speed, scale, t, palette, W, H) }
        break
      }

      case 'Plasma': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Plasma)
        out = { frame: evalPlasma(speed, t, W, H) }
        break
      }

      case 'Rainbow': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.3), SPEED_MAX.Rainbow)
        const deltaHue = Number(props.deltaHue ?? 6)
        out = { frame: evalRainbow(t * speed, deltaHue, W, H) }
        break
      }

      case 'Fire': {
        const intensity = num(id, 'intensity', props, 'intensity', 0.7)
        out = { frame: evalFire(stateKey(id), intensity, W, H) }
        break
      }

      case 'SpectrumBars': {
        const bass   = num(id, 'bass',   props, 'bass',   (Math.sin(t * 2.1) + 1) / 2)
        const mids   = num(id, 'mids',   props, 'mids',   (Math.sin(t * 3.7 + 1) + 1) / 2)
        const treble = num(id, 'treble', props, 'treble', (Math.sin(t * 5.3 + 2) + 1) / 2)
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
        const angle = Number(props.angle ?? 0)
        out = { frame: evalTransform(src, mode, rate, angle, t, W, H) }
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

      case 'Gamma': {
        const src = input(id, 'frame', null) as Frame | null
        const g = Math.max(0.1, Number(props.gamma ?? 2.2))
        if (!src) { out = { frame: null }; break }
        const corr = (c: number) => Math.round(255 * Math.pow(c / 255, g))
        out = { frame: src.map(row => row.map(px => ({ r: corr(px.r), g: corr(px.g), b: corr(px.b) }))) }
        break
      }

      case 'BassPulse': {
        const bass = num(id, 'bass', props, 'bass', 0)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? { r: Number(props.r ?? 255), g: Number(props.g ?? 0), b: Number(props.b ?? 80) }
        out = { frame: evalBassPulse(bass, color, W, H) }
        break
      }

      case 'BassRings': {
        const bass = num(id, 'bass', props, 'bass', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? { r: Number(props.r ?? 255), g: Number(props.g ?? 120), b: Number(props.b ?? 32) }
        out = { frame: evalBassRings(bass, energy, speed, color, t, W, H) }
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
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: Number(props.r ?? 180),
          g: Number(props.g ?? 220),
          b: Number(props.b ?? 255),
        }
        out = { frame: evalTrebleSparks(stateKey(id), treble, density, color, W, H) }
        break
      }

      case 'TreblePrism': {
        const treble = num(id, 'treble', props, 'treble', 0.5)
        const energy = num(id, 'energy', props, 'energy', 0.7)
        const speed = num(id, 'speed', props, 'speed', 1)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? { r: Number(props.r ?? 200), g: Number(props.g ?? 120), b: Number(props.b ?? 255) }
        out = { frame: evalTreblePrism(treble, energy, speed, color, t, W, H) }
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

      // ── Color math ─────────────────────────────────────────────────────
      case 'HSVToRGB': {
        const h = num(id, 'h', props, 'h', 0)
        const s = num(id, 's', props, 's', 1)
        const v = num(id, 'v', props, 'v', 1)
        out = { color: hsv(h, s, v) }
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
      case 'Noise2D': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.4), SPEED_MAX.Noise2D)
        const scale = denormRate(num(id, 'scale', props, 'scale', 0.4), SCALE_MAX.Noise2D)
        out = { frame: evalNoise2D(speed, scale, t, W, H) }
        break
      }

      case 'RadialBurst': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.RadialBurst)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? { r: Number(props.r ?? 0), g: Number(props.g ?? 200), b: Number(props.b ?? 255) }
        out = { frame: evalRadialBurst(speed, color, t, W, H) }
        break
      }

      case 'Spiral': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Spiral)
        const arms = Number(props.arms ?? 2)
        out = { frame: evalSpiral(speed, arms, t, W, H) }
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
        const decay = Number(props.decay ?? 0.92)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? { r: Number(props.r ?? 100), g: Number(props.g ?? 200), b: Number(props.b ?? 255) }
        out = { frame: evalParticles(stateKey(id), mode, rate, color, decay, t, W, H) }
        break
      }

      case 'Invert': {
        const src = input(id, 'frame', null) as Frame | null
        if (!src) { out = { frame: blankFrame(W, H) }; break }
        out = { frame: src.map(row => row.map(px => ({ r: 255 - px.r, g: 255 - px.g, b: 255 - px.b }))) }
        break
      }

      case 'GradientFrame': {
        const cA = (input(id, 'colorA', null) as RGB | null) ?? { r: Number(props.rA ?? 0), g: Number(props.gA ?? 200), b: Number(props.bA ?? 255) }
        const cB = (input(id, 'colorB', null) as RGB | null) ?? { r: Number(props.rB ?? 255), g: Number(props.gB ?? 0), b: Number(props.bB ?? 255) }
        out = { frame: evalGradientFrame(cA, cB, Boolean(props.vertical), W, H) }
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
        const orientation = Number(props.orientation ?? 45)
        const palette     = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalGaborNoise(speed, scale, frequency, orientation, t, palette, W, H) }
        break
      }

      case 'PaletteGradient': {
        const angle   = Number(props.angle ?? 45)
        const repeat  = Number(props.repeat ?? 1)
        const speed   = denormRate(num(id, 'speed', props, 'speed', 0), SPEED_MAX.PaletteGradient)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalPaletteGradient(angle, repeat, speed, t, palette, W, H) }
        break
      }

      case 'Image': {
        const img = asImage(props.image)
        out = { frame: img ? sampleImageToFrame(img, W, H) : blankFrame(W, H) }
        break
      }

      case 'Blobs': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.3), SPEED_MAX.Blobs)
        const scale = denormRate(num(id, 'scale', props, 'scale', 0.44), SCALE_MAX.Blobs)
        const count = Number(props.count ?? 3)
        const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
        out = { frame: evalBlobs(speed, scale, count, t, palette, W, H) }
        break
      }

      case 'FlowField': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.67), SPEED_MAX.FlowField)
        const scale = denormRate(num(id, 'scale', props, 'scale', 0.08), SCALE_MAX.FlowField)
        const count = Number(props.count ?? 80)
        const fade = Number(props.fade ?? 0.9)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalFlowField(stateKey(id), speed, scale, count, fade, t, palette, W, H) }
        break
      }

      case 'Starfield': {
        const speed = denormRate(num(id, 'speed', props, 'speed', 0.33), SPEED_MAX.Starfield)
        const count = Number(props.count ?? 60)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 255) / 255),
          g: byte(Number(props.g ?? 255) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        out = { frame: evalStarfield(stateKey(id), speed, count, color, W, H) }
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
        const iters = Math.max(1, Math.min(20, Math.floor(Number(props.speed ?? 8))))
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalReactionDiffusion(stateKey(id), feed, kill, iters, palette, W, H) }
        break
      }

      case 'GameOfLife': {
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 255) / 255),
          b: byte(Number(props.b ?? 70)  / 255),
        }
        const speed = num(id, 'speed', props, 'speed', 8)
        const fade = Number(props.fade ?? 0.75)
        out = { frame: evalGameOfLife(stateKey(id), color, speed, fade, tick, W, H) }
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
        const beat = input(id, 'beat', false) as boolean
        // Rasterise a collected pattern (a group) to a frame, the same way the
        // Group case does — namespaced per pattern so stateful nodes don't clash.
        const render = (gid: string): Frame => {
          const def = groups[gid]
          if (!def || groupStack.has(gid)) return blankFrame(W, H)
          return evaluateGraph(
            def.nodes, def.edges, tick, W, H, groups,
            `${instancePrefix}${id}/${gid}/`,
            new Set([...groupStack, gid]), {},
          ) ?? blankFrame(W, H)
        }
        const o = {
          minTime: Number(props.minTime ?? 4),
          maxTime: Number(props.maxTime ?? 12),
          transSec: Number(props.transitionSec ?? 1),
          pool: (props.transitions as string[] | undefined) ?? ['crossfade'],
          beatEnabled: incoming.has(`${id}:beat`),
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

      case 'FieldToFrame': {
        const fv = input(id, 'field', null)
        const field = fv instanceof Float32Array ? fv : null
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        const brightness = num(id, 'brightness', props, 'brightness', 1)
        out = { frame: evalFieldToFrame(field, palette, brightness, W, H) }
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
        const deg = num(id, 'angle', props, 'angle', 0) + t * Number(props.spin ?? 0)
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

      // Outputs its absorbed patterns (group ids) as a patternset; the Pattern
      // Master (a later phase) resolves each id via the group registry.
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
        const cooling  = Number(props.cooling  ?? 55)
        const sparking = Number(props.sparking ?? 120)
        out = { frame: evalFire2012(id, cooling, sparking, W, H) }
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
          boundInputs,
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
        out = { songs: null }
        break

      case 'PerformanceGenerator':
        out = { shows: null }
        break

      case 'SDCard':
        out = {}
        break

      // ── Output ─────────────────────────────────────────────────────────
      case 'MatrixOutput':
        out = { frame: input(id, 'frame', null) }
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
): Frame | null {
  if (nodes.length === 0) return null
  const evalNode = createEvalNode(nodes, edges, tick, gridW, gridH, groups, instancePrefix, groupStack, groupInputs)
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
  if (nodes.length === 0) return 0
  const evalNode = createEvalNode(nodes, edges, tick, gridW, gridH, {}, '__scope__/', new Set(), {})
  const v = evalNode(nodeId)?.[portId]
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0
}

/**
 * Evaluate the whole graph once, returning the terminal frame (as
 * `evaluateGraph` would) plus every node's output ports — so per-node previews
 * can be driven from the same single pass without double-advancing stateful
 * nodes. Outputs are keyed by node id; each is a `{ portId: value }` record.
 */
export function evaluateGraphFull(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
  groups: GroupRegistry = {},
): { frame: Frame | null; outputs: Map<string, Record<string, unknown>> } {
  const outputs = new Map<string, Record<string, unknown>>()
  if (nodes.length === 0) return { frame: null, outputs }
  const evalNode = createEvalNode(nodes, edges, tick, gridW, gridH, groups, '', new Set(), {})
  for (const n of nodes) outputs.set(n.id, evalNode(n.id))
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

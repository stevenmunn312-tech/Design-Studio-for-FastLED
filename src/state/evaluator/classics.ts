// Shared maths for the small "classic" generative nodes: Candle, Lightning,
// Heartbeat, Sunrise and TV Simulator. Everything here is a pure function of
// integers and time, so the C++ twins in src/nodes/generative/codegen.ts can
// repeat it line for line. The hash is integer-only, so the two sides agree
// exactly; only sinf/expf/powf differ, by rounding.

/** Wang-style integer hash to [0, 1). 24 bits, exact in float32 and float64. */
export function classicHash(n: number): number {
  let x = n >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return (x & 0xffffff) / 16777216
}

/** C++ lambda that matches `classicHash`. */
export const CLASSIC_HASH_CPP =
  'auto _h=[](uint32_t x)->float{ x^=x>>16; x*=0x7feb352dU; x^=x>>15; x*=0x846ca68bU; x^=x>>16; return (x&0xFFFFFFU)/16777216.0f; };'

/** Smooth 1-D value noise in [0, 1], one lattice cell per unit of `x`. */
export function valueNoise(x: number, salt: number): number {
  const i = Math.floor(x), f = x - i
  const u = f * f * (3 - 2 * f)
  const a = classicHash(i * 7919 + salt), b = classicHash((i + 1) * 7919 + salt)
  return a + (b - a) * u
}

export const CLASSIC_VALUE_NOISE_CPP =
  'auto _vn=[&](float x,uint32_t salt)->float{ float fl=floorf(x); int32_t i=(int32_t)fl; float f=x-fl; float u=f*f*(3.0f-2.0f*f); float a=_h((uint32_t)(i*7919)+salt),b=_h((uint32_t)((i+1)*7919)+salt); return a+(b-a)*u; };'

// ── Candle ─────────────────────────────────────────────────────────────────
export const CANDLE_MODES = ['single', 'perPixel'] as const
export type CandleMode = typeof CANDLE_MODES[number]
export const candleMode = (v: unknown): CandleMode => (v === 'perPixel' ? 'perPixel' : 'single')

/** Flame colour and brightness for one flicker source, as bytes. */
export function candleColor(t: number, salt: number, flicker: number, warmth: number): { r: number; g: number; b: number } {
  const fl = Math.max(0, Math.min(1, flicker)), wm = Math.max(0, Math.min(1, warmth))
  const n = 0.6 * valueNoise(t * 7, salt) + 0.4 * valueNoise(t * 17 + 31, salt + 101)
  const v = 1 - fl * (1 - n)
  const mix = Math.max(0, Math.min(1, wm + (n - 0.5) * 0.3 * fl))
  const g = 60 + 100 * mix, b = 20 * mix
  return { r: Math.floor(255 * v), g: Math.floor(g * v), b: Math.floor(b * v) }
}

// ── Heartbeat ──────────────────────────────────────────────────────────────
export const HEARTBEAT_BPM_MIN = 20
export const HEARTBEAT_BPM_MAX = 240

/** The lub-dub envelope at `phase` in [0, 1): a strong beat, then a softer one. */
export function heartbeatEnvelope(phase: number): number {
  const lub = Math.exp(-(((phase - 0.05) / 0.04) ** 2))
  const dub = 0.7 * Math.exp(-(((phase - 0.3) / 0.05) ** 2))
  return Math.min(1, lub + dub)
}

export function heartbeatPhase(t: number, bpm: number): number {
  const b = Math.max(HEARTBEAT_BPM_MIN, Math.min(HEARTBEAT_BPM_MAX, Number.isFinite(bpm) ? bpm : 72))
  const period = 60 / b
  return (((t % period) + period) % period) / period
}

// ── Sunrise ────────────────────────────────────────────────────────────────
export const SUNRISE_MODES = ['timed', 'manual'] as const
export const sunriseMode = (v: unknown): 'timed' | 'manual' => (v === 'manual' ? 'manual' : 'timed')

/** Night blue, deep red, orange, warm white: position then colour. */
export const SUNRISE_STOPS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 24],
  [0.35, 96, 8, 8],
  [0.65, 255, 110, 10],
  [1, 255, 224, 168],
]
export const SUNRISE_GAMMA = 1.6

export function sunriseProgress(mode: 'timed' | 'manual', t: number, start: number, duration: number, manual: number): number {
  const p = mode === 'manual' ? manual : (t - start) / Math.max(0.001, duration)
  return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0
}

export function sunriseColor(progress: number): { r: number; g: number; b: number } {
  const p = Math.max(0, Math.min(1, progress))
  let k = 0
  while (k < SUNRISE_STOPS.length - 2 && p > SUNRISE_STOPS[k + 1][0]) k++
  const a = SUNRISE_STOPS[k], b = SUNRISE_STOPS[k + 1]
  const u = Math.max(0, Math.min(1, (p - a[0]) / (b[0] - a[0])))
  const v = Math.pow(p, SUNRISE_GAMMA)
  const ch = (i: 1 | 2 | 3) => Math.floor((a[i] + (b[i] - a[i]) * u) * v)
  return { r: ch(1), g: ch(2), b: ch(3) }
}

// ── Lightning ──────────────────────────────────────────────────────────────
export const LIGHTNING_FLASH_LEN = 0.06
export const LIGHTNING_AFTERGLOW_TAU = 0.5
export const LIGHTNING_AFTERGLOW = 0.15

/** Brightness 0–1 of strike `id` at `dt` seconds after it began: 2–5 flashes, then a glow. */
export function lightningLevel(id: number, dt: number): number {
  if (dt < 0) return 0
  const flashes = 2 + Math.floor(classicHash(id * 31 + 1) * 4)
  let start = 0, level = 0, lastEnd = 0
  for (let i = 0; i < flashes; i++) {
    if (dt >= start && dt < start + LIGHTNING_FLASH_LEN) level = 1 - 0.55 * (i / flashes)
    lastEnd = start + LIGHTNING_FLASH_LEN
    start = lastEnd + 0.04 + classicHash(id * 31 + 2 + i) * 0.16
  }
  if (level > 0) return level
  return dt >= lastEnd ? LIGHTNING_AFTERGLOW * Math.exp(-(dt - lastEnd) / LIGHTNING_AFTERGLOW_TAU) : 0
}

export interface LightningState { nextAt: number; start: number; id: number; prev: boolean; last: number }

/** Advance a strike schedule to `t`. Returns the strike's brightness. */
export function stepLightning(s: LightningState, t: number, rate: number, trigger: boolean): number {
  if (t < s.last - 0.001) { s.nextAt = -1; s.start = -1e9; s.id = 0; s.prev = trigger }
  s.last = t
  const interval = 60 / Math.max(0.1, Number.isFinite(rate) ? rate : 6)
  if (s.nextAt < 0) s.nextAt = t + interval
  if (trigger && !s.prev) { s.id++; s.start = t; s.nextAt = t + interval * (0.5 + classicHash(s.id * 17 + 5)) }
  else if (t >= s.nextAt) { s.id++; s.start = t; s.nextAt = t + interval * (0.5 + classicHash(s.id * 17 + 5)) }
  s.prev = trigger
  return lightningLevel(s.id, t - s.start)
}

// ── TV simulator ───────────────────────────────────────────────────────────
/** One block's channel value 0–1 for scene `slot`, block `blk`, channel `c`. */
export function tvChannel(slot: number, blk: number, c: number): number {
  return 0.15 + 0.85 * classicHash(slot * 131 + blk * 17 + c + 3)
}
export function tvLayout(slot: number): { cols: number; rows: number } {
  return { cols: 1 + Math.floor(classicHash(slot * 131 + 1) * 3), rows: 1 + Math.floor(classicHash(slot * 131 + 2) * 2) }
}
export function tvColor(t: number, slot: number, blk: number, brightness: number): { r: number; g: number; b: number } {
  const v = Math.max(0, Math.min(1, brightness)) * (0.25 + 0.75 * classicHash(slot * 131 + blk * 17 + 9)) * (0.92 + 0.08 * Math.sin(t * 0.8 + slot))
  return {
    r: Math.floor(255 * v * tvChannel(slot, blk, 0)),
    g: Math.floor(255 * v * tvChannel(slot, blk, 1)),
    b: Math.floor(255 * v * tvChannel(slot, blk, 2)),
  }
}

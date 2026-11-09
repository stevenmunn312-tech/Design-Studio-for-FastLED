/**
 * FastLED 3.10.8's `applyGamma_video` (fl/gfx/colorutils.cpp.hpp), byte for
 * byte, so the Gamma node's preview shows what `napplyGamma_video` sends to
 * the LEDs. FastLED raises in s16.16 fixed point (`s16x16::pow`, a minimax
 * log2 and exp2 in fl/math/fixed_point/s16x16.h) rather than calling libm,
 * rounds half up, and never takes a lit channel to 0: at gamma 2.2 the dim
 * levels a float `Math.round` blacked out (up to about 12) glow at 1.
 *
 * Every product here stays below 2^53, so plain numbers hold the i64 maths
 * exactly; `shr` is C's arithmetic shift on them.
 */

const SCALE = 65536
const shr = (value: number, bits: number) => Math.floor(value / 2 ** bits)

/** s16x16 log2 of a positive raw value, as `log2_fp`. */
function log2Raw(raw: number): number {
  const msb = 31 - Math.clz32(raw)
  const t = (msb >= 16 ? raw >>> (msb - 16) : (raw << (16 - msb)) >>> 0) - SCALE
  const t24 = t * 256
  let acc = -1788416
  acc = 6098176 + shr(acc * t24, 24)
  acc = -11728384 + shr(acc * t24, 24)
  acc = 24189248 + shr(acc * t24, 24)
  return (msb - 16) * SCALE + shr(shr(acc * t24, 24), 8)
}

/** s16x16 2^x of a raw value, as `exp2_fp`. */
function exp2Raw(raw: number): number {
  const floorRaw = raw & ~(SCALE - 1)
  const fr = raw - floorRaw
  const n = floorRaw >> 16
  if (n >= 15) return 0x7fffffff
  if (n < -16) return 0
  const intPow = n >= 0 ? SCALE * 2 ** n : SCALE >> -n
  const fr24 = fr * 256
  let acc = 214016
  acc = 895232 + shr(acc * fr24, 24)
  acc = 4038400 + shr(acc * fr24, 24)
  acc = 11629376 + shr(acc * fr24, 24)
  const fracPow16 = shr(2 ** 24 + shr(acc * fr24, 24), 8)
  return shr(intPow * fracPow16, 16)
}

/** `s16x16::pow` for a base in (0, 1] and a positive exponent, raw in and out. */
function powRaw(base: number, exponent: number): number {
  if (base <= 0) return 0
  if (exponent === 0 || base >= SCALE - 2) return SCALE
  return exp2Raw(shr(exponent * log2Raw(base), 16))
}

/** One channel through FastLED's `applyGamma_video(u8, float)`. */
export function applyGammaVideo(brightness: number, gamma: number): number {
  if (brightness <= 0) return 0
  // s16x16(1.0f / 255.0f) truncates to 257 raw; the gamma is a float.
  const x = brightness * 257
  const g = Math.trunc(Math.fround(gamma) * SCALE)
  const r = powRaw(x, g)
  const scaled = Math.floor((r * 255 + 0x8000) / SCALE)
  return Math.max(1, Math.min(255, scaled))
}

let cached: { gamma: number; table: Uint8Array } | null = null

/** The 256-entry table for one gamma; a frame reuses the last one. */
export function gammaVideoTable(gamma: number): Uint8Array {
  if (cached?.gamma === gamma) return cached.table
  const table = new Uint8Array(256)
  for (let i = 0; i < 256; i++) table[i] = applyGammaVideo(i, gamma)
  cached = { gamma, table }
  return table
}

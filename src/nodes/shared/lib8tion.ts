// Exact ports of the FastLED 3.10.5 integer helpers the integer pattern
// kernels use (integerPatterns.ts). The sketch calls FastLED's own functions;
// the preview calls these, so the same integer inputs give the same bytes on
// both sides. Sources: platforms/shared/trig8.h (sin16_C) and
// platforms/scale8.h (scale8 with FASTLED_SCALE8_FIXED, nscale8x3_video).

const SIN16_BASE = [0, 6393, 12539, 18204, 23170, 27245, 30273, 32137]
const SIN16_SLOPE = [49, 48, 44, 38, 31, 23, 14, 4]

/** FastLED `sin16`: a 16-bit angle (65536 per turn) to -32767..32767. */
export function sin16(theta: number): number {
  theta &= 0xffff
  let offset = (theta & 0x3fff) >> 3
  if (theta & 0x4000) offset = 2047 - offset
  const section = offset >> 8
  const y = SIN16_SLOPE[section] * ((offset & 0xff) >> 1) + SIN16_BASE[section]
  return theta & 0x8000 ? -y : y
}

/** FastLED `scale8` with FASTLED_SCALE8_FIXED (its default). */
export function scale8(value: number, scale: number): number {
  return (value * (scale + 1)) >> 8
}

/** FastLED `CRGB::nscale8_video`, channel by channel. */
export function scale8Video(value: number, scale: number): number {
  return value === 0 ? 0 : ((value * scale) >> 8) + (scale !== 0 ? 1 : 0)
}

/** Radians per 16-bit angle unit, inverted: a sketch's `_A16` factor. */
export const A16_PER_RADIAN = 10430.378

/**
 * A phase in radians as a 16-bit angle, the way the sketches convert it once
 * a frame (`(int32_t)(fmodf(r, 6.2831853f) * 10430.378f)`). Only the low 16
 * bits matter to `sin16`.
 */
export function angle16(radians: number): number {
  return Math.trunc((radians % 6.2831853) * A16_PER_RADIAN)
}

/** Chris Wellons' lowbias32 integer hash, as `_lowbias32` in the sketches. */
export function lowbias32(n: number): number {
  let x = n >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return x >>> 0
}

/** Floor square root of an unsigned 32-bit value, as `_isqrt32` in the sketches. */
export function isqrt32(n: number): number {
  let value = n >>> 0, root = 0, bit = 1 << 30
  while (bit > value) bit >>>= 2
  while (bit !== 0) {
    if (value >= root + bit) { value -= root + bit; root = (root >>> 1) + bit } else root >>>= 1
    bit >>>= 2
  }
  return root
}

/** The C++ twins of `lowbias32` and `isqrt32`, emitted once per sketch that uses them. */
export const LOWBIAS32_CPP = 'static inline uint32_t _lowbias32(uint32_t x) { x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16; return x; }'
export const ISQRT32_CPP = 'static inline uint32_t _isqrt32(uint32_t v) { uint32_t r = 0, b = 1UL << 30; while (b > v) b >>= 2; while (b) { if (v >= r + b) { v -= r + b; r = (r >> 1) + b; } else r >>= 1; b >>= 2; } return r; }'

/**
 * FastLED's own `sin16`, `scale8` and `nscale8x3_video` for host builds of the
 * native parity tests, copied from the pinned library so a host `g++` can run
 * the sketch's kernel lines without FastLED.
 */
export const LIB8TION_HOST_CPP = String.raw`static inline int16_t sin16(uint16_t theta) {
  static const uint16_t base[] = {0, 6393, 12539, 18204, 23170, 27245, 30273, 32137};
  static const uint8_t slope[] = {49, 48, 44, 38, 31, 23, 14, 4};
  uint16_t offset = (theta & 0x3FFF) >> 3; if (theta & 0x4000) offset = 2047 - offset;
  uint8_t section = offset / 256; uint16_t b = base[section]; uint8_t m = slope[section];
  uint8_t secoffset8 = (uint8_t)(offset) / 2; uint16_t mx = m * secoffset8; int16_t y = mx + b;
  if (theta & 0x8000) y = -y;
  return y;
}
static inline uint8_t scale8(uint8_t i, uint8_t scale) { return (((uint16_t)i) * ((uint16_t)(scale) + 1)) >> 8; }
static inline uint8_t pgm_read_byte(const uint8_t *p) { return *p; }
static inline uint16_t pgm_read_word(const uint16_t *p) { return *p; }
#define PROGMEM`

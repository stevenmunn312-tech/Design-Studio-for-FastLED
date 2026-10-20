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

// FastLED noise_detail::p, the 257-byte permutation table inoise8 hashes with.
const NOISE_P = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,151]

const i8 = (v: number) => (v << 24) >> 24

function ease8InOutQuad(i: number): number {
  let j = i
  if (j & 0x80) j = 255 - j
  let jj2 = (scale8(j, j) << 1) & 0xff
  if (i & 0x80) jj2 = 255 - jj2
  return jj2
}

function grad8(hash: number, x: number, y: number): number {
  let u = x, v = y
  if (hash & 4) { u = y; v = x }
  if (hash & 1) u = i8(-u)
  if (hash & 2) v = i8(-v)
  return i8((u >> 1) + (v >> 1) + (u & 1))
}

function lerp7by8(a: number, b: number, frac: number): number {
  return b > a ? i8(a + scale8((b - a) & 0xff, frac)) : i8(a - scale8((a - b) & 0xff, frac))
}

/** FastLED `inoise8(x, y)`, 8.8 fixed-point coordinates to 0–255, bit for bit. */
export function inoise8(x: number, y: number): number {
  x &= 0xffff; y &= 0xffff
  const X = x >> 8, Y = y >> 8
  const A = (NOISE_P[X] + Y) & 0xff, AA = NOISE_P[A], AB = NOISE_P[A + 1]
  const B = (NOISE_P[X + 1] + Y) & 0xff, BA = NOISE_P[B], BB = NOISE_P[B + 1]
  const u = ease8InOutQuad(x & 0xff), v = ease8InOutQuad(y & 0xff)
  const xx = (x & 0xff) >> 1, yy = (y & 0xff) >> 1
  const X1 = lerp7by8(grad8(NOISE_P[AA], xx, yy), grad8(NOISE_P[BA], i8(xx - 128), yy), u)
  const X2 = lerp7by8(grad8(NOISE_P[AB], xx, i8(yy - 128)), grad8(NOISE_P[BB], i8(xx - 128), i8(yy - 128)), u)
  const n = i8(lerp7by8(X1, X2, v) + 64) & 0xff
  return Math.min(255, n + n)
}

/**
 * FastLED 3.10.5's 2-D `inoise8` (noise.cpp.hpp, with lib8tion's C
 * `ease8InOutQuad`, `avg7` and `qadd8`), copied for host builds of the
 * native parity tests. Needs `LIB8TION_HOST_CPP` first, for `scale8`.
 */
export const INOISE8_HOST_CPP = String.raw`static const uint8_t _np[] = {151, 160, 137,  91,  90,  15, 131,  13, 201,  95,  96,  53, 194, 233,   7, 225,    140,  36, 103,  30,  69, 142,   8,  99,  37, 240,  21,  10,  23, 190,   6, 148,    247, 120, 234,  75,   0,  26, 197,  62,  94, 252, 219, 203, 117,  35,  11,  32,     57, 177,  33,  88, 237, 149,  56,  87, 174,  20, 125, 136, 171, 168,  68, 175,     74, 165,  71, 134, 139,  48,  27, 166,  77, 146, 158, 231,  83, 111, 229, 122,     60, 211, 133, 230, 220, 105,  92,  41,  55,  46, 245,  40, 244, 102, 143,  54,     65,  25,  63, 161,   1, 216,  80,  73, 209,  76, 132, 187, 208,  89,  18, 169,    200, 196, 135, 130, 116, 188, 159,  86, 164, 100, 109, 198, 173, 186,   3,  64,     52, 217, 226, 250, 124, 123,   5, 202,  38, 147, 118, 126, 255,  82,  85, 212,    207, 206,  59, 227,  47,  16,  58,  17, 182, 189,  28,  42, 223, 183, 170, 213,    119, 248, 152,   2,  44, 154, 163,  70, 221, 153, 101, 155, 167,  43, 172,   9,    129,  22,  39, 253,  19,  98, 108, 110,  79, 113, 224, 232, 178, 185, 112, 104,    218, 246,  97, 228, 251,  34, 242, 193, 238, 210, 144,  12, 191, 179, 162, 241,     81,  51, 145, 235, 249,  14, 239, 107,  49, 192, 214,  31, 181, 199, 106, 157,    184,  84, 204, 176, 115, 121,  50,  45, 127,   4, 150, 254, 138, 236, 205,  93,    222, 114,  67,  29,  24,  72, 243, 141, 128, 195,  78,  66, 215,  61, 156, 180,    151};
static inline uint8_t ease8InOutQuad(uint8_t i) { uint8_t j = i; if (j & 0x80) j = 255 - j; uint8_t jj = scale8(j, j); uint8_t jj2 = jj << 1; if (i & 0x80) jj2 = 255 - jj2; return jj2; }
static inline int8_t avg7(int8_t i, int8_t j) { return (i >> 1) + (j >> 1) + (i & 0x1); }
static inline int8_t grad8(uint8_t hash, int8_t x, int8_t y) { int8_t u, v; if (hash & 4) { u = y; v = x; } else { u = x; v = y; } if (hash & 1) { u = -u; } if (hash & 2) { v = -v; } return avg7(u, v); }
static inline int8_t lerp7by8(int8_t a, int8_t b, uint8_t frac) { int8_t result; if (b > a) { uint8_t delta = b - a; uint8_t scaled = scale8(delta, frac); result = a + scaled; } else { uint8_t delta = a - b; uint8_t scaled = scale8(delta, frac); result = a - scaled; } return result; }
static inline uint8_t inoise8(uint16_t x, uint16_t y) {
  uint8_t X = x >> 8, Y = y >> 8;
  uint8_t A = _np[X] + Y, AA = _np[A], AB = _np[A + 1], B = _np[X + 1] + Y, BA = _np[B], BB = _np[B + 1];
  uint8_t u = x, v = y; int8_t xx = ((uint8_t)(x) >> 1) & 0x7F, yy = ((uint8_t)(y) >> 1) & 0x7F; uint8_t N = 0x80;
  u = ease8InOutQuad(u); v = ease8InOutQuad(v);
  int8_t X1 = lerp7by8(grad8(_np[AA], xx, yy), grad8(_np[BA], xx - N, yy), u);
  int8_t X2 = lerp7by8(grad8(_np[AB], xx, yy - N), grad8(_np[BB], xx - N, yy - N), u);
  int8_t n = lerp7by8(X1, X2, v); n += 64; uint32_t t = (uint8_t)n + (uint8_t)n; return t > 255 ? 255 : (uint8_t)t;
}`

const avg7 = (i: number, j: number) => i8((i >> 1) + (j >> 1) + (i & 1))

function grad8x3(hash: number, x: number, y: number, z: number): number {
  const n = (v: number) => i8(-v)
  switch (hash & 0xf) {
    case 0: case 12: return avg7(x, y)
    case 1: case 13: return avg7(n(x), y)
    case 2: case 14: return avg7(x, n(y))
    case 3: case 15: return avg7(n(x), n(y))
    case 4: return avg7(x, z)
    case 5: return avg7(n(x), z)
    case 6: return avg7(x, n(z))
    case 7: return avg7(n(x), n(z))
    case 8: return avg7(y, z)
    case 9: return avg7(n(y), z)
    case 10: return avg7(y, n(z))
    default: return avg7(n(y), n(z))
  }
}

/** FastLED `inoise8(x, y, z)`, bit for bit. */
export function inoise8x3(x: number, y: number, z: number): number {
  x &= 0xffff; y &= 0xffff; z &= 0xffff
  const X = x >> 8, Y = y >> 8, Z = z >> 8
  const A = (NOISE_P[X] + Y) & 0xff, AA = (NOISE_P[A] + Z) & 0xff, AB = (NOISE_P[A + 1] + Z) & 0xff
  const B = (NOISE_P[X + 1] + Y) & 0xff, BA = (NOISE_P[B] + Z) & 0xff, BB = (NOISE_P[B + 1] + Z) & 0xff
  const u = ease8InOutQuad(x & 0xff), v = ease8InOutQuad(y & 0xff), w = ease8InOutQuad(z & 0xff)
  const xx = (x & 0xff) >> 1, yy = (y & 0xff) >> 1, zz = (z & 0xff) >> 1
  const xn = i8(xx - 128), yn = i8(yy - 128), zn = i8(zz - 128)
  const X1 = lerp7by8(grad8x3(NOISE_P[AA], xx, yy, zz), grad8x3(NOISE_P[BA], xn, yy, zz), u)
  const X2 = lerp7by8(grad8x3(NOISE_P[AB], xx, yn, zz), grad8x3(NOISE_P[BB], xn, yn, zz), u)
  const X3 = lerp7by8(grad8x3(NOISE_P[AA + 1], xx, yy, zn), grad8x3(NOISE_P[BA + 1], xn, yy, zn), u)
  const X4 = lerp7by8(grad8x3(NOISE_P[AB + 1], xx, yn, zn), grad8x3(NOISE_P[BB + 1], xn, yn, zn), u)
  const n = i8(lerp7by8(lerp7by8(X1, X2, v), lerp7by8(X3, X4, v), w) + 64) & 0xff
  return Math.min(255, n + n)
}

/** FastLED's 3-D `inoise8`, copied for host builds; needs `INOISE8_HOST_CPP` first. */
export const INOISE8_3D_HOST_CPP = String.raw`static inline int8_t grad8(uint8_t hash, int8_t x, int8_t y, int8_t z) {
  switch(hash & 0xF) {
    case 0: return avg7(x, y); case 1: return avg7(-x, y); case 2: return avg7(x, -y); case 3: return avg7(-x, -y);
    case 4: return avg7(x, z); case 5: return avg7(-x, z); case 6: return avg7(x, -z); case 7: return avg7(-x, -z);
    case 8: return avg7(y, z); case 9: return avg7(-y, z); case 10: return avg7(y, -z); case 11: return avg7(-y, -z);
    case 12: return avg7(x, y); case 13: return avg7(-x, y); case 14: return avg7(x, -y); case 15: return avg7(-x, -y);
  }
  return 0;
}
static inline uint8_t inoise8(uint16_t x, uint16_t y, uint16_t z) {
  uint8_t X = x >> 8, Y = y >> 8, Z = z >> 8;
  uint8_t A = _np[X] + Y, AA = _np[A] + Z, AB = _np[A + 1] + Z, B = _np[X + 1] + Y, BA = _np[B] + Z, BB = _np[B + 1] + Z;
  uint8_t u = x, v = y, w = z;
  int8_t xx = ((uint8_t)(x) >> 1) & 0x7F, yy = ((uint8_t)(y) >> 1) & 0x7F, zz = ((uint8_t)(z) >> 1) & 0x7F; uint8_t N = 0x80;
  u = ease8InOutQuad(u); v = ease8InOutQuad(v); w = ease8InOutQuad(w);
  int8_t X1 = lerp7by8(grad8(_np[AA], xx, yy, zz), grad8(_np[BA], xx - N, yy, zz), u);
  int8_t X2 = lerp7by8(grad8(_np[AB], xx, yy - N, zz), grad8(_np[BB], xx - N, yy - N, zz), u);
  int8_t X3 = lerp7by8(grad8(_np[AA + 1], xx, yy, zz - N), grad8(_np[BA + 1], xx - N, yy, zz - N), u);
  int8_t X4 = lerp7by8(grad8(_np[AB + 1], xx, yy - N, zz - N), grad8(_np[BB + 1], xx - N, yy - N, zz - N), u);
  int8_t Y1 = lerp7by8(X1, X2, v), Y2 = lerp7by8(X3, X4, v);
  int8_t n = lerp7by8(Y1, Y2, w); n += 64; uint32_t t = (uint8_t)n + (uint8_t)n; return t > 255 ? 255 : (uint8_t)t;
}`

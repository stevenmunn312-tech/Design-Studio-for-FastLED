// FastLED fixed-point helper shims, shared by the live-preview evaluator and the
// C++ generator so an ANIMartRIX-style formula behaves the same in the browser
// preview and on-device.
//
// On-device these (sin8, cos8, beatsin8, …) are native FastLED functions taking
// uint8_t/uint16_t and returning the same. In the JS preview we approximate them
// with floating-point math. Minor differences in expressions that rely on exact
// 8-/16-bit wrap or saturation are a known, documented divergence (the same
// caveat the CustomFormula / Code-node notes carry).

const TAU = Math.PI * 2

/** Wrap to the uint8_t domain (0–255) the way a C++ cast would. */
function u8(x: number): number { return ((Math.floor(x) % 256) + 256) % 256 }
/** Wrap to the uint16_t domain (0–65535). */
function u16(x: number): number { return ((Math.floor(x) % 65536) + 65536) % 65536 }
function clampByte(x: number): number { return Math.max(0, Math.min(255, x)) }

// ── byte-domain wave / easing primitives (mirror FastLED's lib8tion) ──────────
/** Triangle wave on the uint8 domain (0→0, 128→255, 255→1). */
function triwave8b(input: number): number {
  const v = u8(input)
  let out = u8(v << 1)
  if (v & 0x80) out = 255 - out
  return clampByte(out)
}
/** Quadratic ease in/out on 0–255 (FastLED ease8InOutQuad). */
function easeInOutQuad8(input: number): number {
  const i = u8(input)
  let j = i
  if (j & 0x80) j = 255 - j
  const jj = (j * j) >> 8           // scale8(j, j)
  let jj2 = jj << 1
  if (i & 0x80) jj2 = 255 - jj2
  return clampByte(jj2)
}
/** Cubic ease in/out on 0–255 — smoothstep 3x²−2x³ (FastLED ease8InOutCubic). */
function easeInOutCubic8(input: number): number {
  const i = u8(input)
  const ii = (i * i) >> 8
  const iii = (ii * i) >> 8
  let r1 = 3 * ii - 2 * iii
  if (r1 > 255) r1 = 255
  return clampByte(r1)
}

/** The shim names exposed inside a formula sandbox. Kept in one place so the
 *  JS sandbox, the C++ helpers and the call-rewrite stay in sync. */
export const SHIM_NAMES = [
  'sin8', 'cos8', 'sin16', 'beatsin8', 'beatsin16', 'scale8', 'qadd8', 'qsub8',
  'triwave8', 'quadwave8', 'cubicwave8', 'ease8InOutQuad', 'ease8InOutCubic',
  'blend8', 'lerp8by8', 'lerp16by16', 'sqrt16', 'nscale8',
] as const

export type ShimTable = Record<(typeof SHIM_NAMES)[number], (...args: number[]) => number>

/** Build the JS shim table for a given time `t` (seconds). beatsin8/16 read `t`,
 *  the rest are pure — so this is cheap to call once per frame and reuse. */
export function makeShims(t: number): ShimTable {
  return {
    sin8:  (x) => clampByte(Math.round(Math.sin((u8(x) / 256) * TAU) * 128 + 128)),
    cos8:  (x) => clampByte(Math.round(Math.sin(((u8(x) + 64) / 256) * TAU) * 128 + 128)),
    sin16: (x) => Math.round(Math.sin((u16(x) / 65536) * TAU) * 32767),
    beatsin8:  (bpm, lo = 0, hi = 255)   => Math.round(lo + (Math.sin((t * bpm / 60) * TAU) * 0.5 + 0.5) * (hi - lo)),
    beatsin16: (bpm, lo = 0, hi = 65535) => Math.round(lo + (Math.sin((t * bpm / 60) * TAU) * 0.5 + 0.5) * (hi - lo)),
    scale8: (v, s) => (u8(v) * u8(s)) >> 8,
    qadd8:  (a, b) => Math.min(255, u8(a) + u8(b)),
    qsub8:  (a, b) => Math.max(0, u8(a) - u8(b)),
    triwave8:   (x) => triwave8b(x),
    quadwave8:  (x) => easeInOutQuad8(triwave8b(x)),
    cubicwave8: (x) => easeInOutCubic8(triwave8b(x)),
    ease8InOutQuad:  (x) => easeInOutQuad8(x),
    ease8InOutCubic: (x) => easeInOutCubic8(x),
    // blend8(a, b, amountOfB): mix two bytes — scale8(a, 255−amt) + scale8(b, amt).
    blend8: (a, b, amt) => clampByte(((u8(a) * (255 - u8(amt))) >> 8) + ((u8(b) * u8(amt)) >> 8)),
    // lerp8by8(a, b, frac): interpolate a→b by a 0–255 fraction.
    lerp8by8: (a, b, frac) => {
      a = u8(a); b = u8(b); frac = u8(frac)
      return b > a ? clampByte(a + (((b - a) * frac) >> 8)) : clampByte(a - (((a - b) * frac) >> 8))
    },
    // lerp16by16(a, b, frac): interpolate a→b by a 0–65535 fraction.
    lerp16by16: (a, b, frac) => {
      a = u16(a); b = u16(b); frac = u16(frac)
      return b > a ? a + Math.floor((b - a) * frac / 65536) : a - Math.floor((a - b) * frac / 65536)
    },
    sqrt16:  (x) => Math.floor(Math.sqrt(u16(x))),
    nscale8: (v, s) => (u8(v) * u8(s)) >> 8,
  }
}

/** C++ float-wrapper definitions for the shims, so a formula like
 *  `sin8(r * 200 + t) / 255` does float division (matching the JS preview)
 *  rather than integer division on a `uint8_t` result. Emitted once when any
 *  field / formula node is present. */
export const CPP_SHIM_HELPERS = [
  '// FastLED helper shims wrapped to float so formula expressions stay floating-point.',
  'float _fsin8(float x){ return sin8((uint8_t)x); }',
  'float _fcos8(float x){ return cos8((uint8_t)x); }',
  'float _fsin16(float x){ return sin16((uint16_t)x); }',
  'float _fbeatsin8(float bpm, float lo = 0, float hi = 255){ return beatsin8((uint8_t)bpm, (uint8_t)lo, (uint8_t)hi); }',
  'float _fbeatsin16(float bpm, float lo = 0, float hi = 65535){ return beatsin16((uint16_t)bpm, (uint16_t)lo, (uint16_t)hi); }',
  'float _fscale8(float v, float s){ return scale8((uint8_t)v, (uint8_t)s); }',
  'float _fqadd8(float a, float b){ return qadd8((uint8_t)a, (uint8_t)b); }',
  'float _fqsub8(float a, float b){ return qsub8((uint8_t)a, (uint8_t)b); }',
  'float _ftriwave8(float x){ return triwave8((uint8_t)x); }',
  'float _fquadwave8(float x){ return quadwave8((uint8_t)x); }',
  'float _fcubicwave8(float x){ return cubicwave8((uint8_t)x); }',
  'float _fease8InOutQuad(float x){ return ease8InOutQuad((uint8_t)x); }',
  'float _fease8InOutCubic(float x){ return ease8InOutCubic((uint8_t)x); }',
  'float _fblend8(float a, float b, float amt){ return blend8((uint8_t)a, (uint8_t)b, (uint8_t)amt); }',
  'float _flerp8by8(float a, float b, float frac){ return lerp8by8((uint8_t)a, (uint8_t)b, (uint8_t)frac); }',
  'float _flerp16by16(float a, float b, float frac){ return lerp16by16((uint16_t)a, (uint16_t)b, (uint16_t)frac); }',
  'float _fsqrt16(float x){ return sqrt16((uint16_t)x); }',
  'float _fnscale8(float v, float s){ return scale8((uint8_t)v, (uint8_t)s); }',
].join('\n')

/** Rewrite shim call sites in a user formula to the float wrappers above.
 *  `\b` before the bare name means `beatsin8(` is left for its own rule and
 *  isn't clipped by the `sin8` rule. */
export function cppRewriteShims(expr: string): string {
  let out = expr
  for (const name of SHIM_NAMES) {
    out = out.replace(new RegExp(`\\b${name}\\s*\\(`, 'g'), `_f${name}(`)
  }
  return out
}

/** Whether a formula references any shim — used to gate emitting the helpers. */
export function usesShims(expr: string): boolean {
  return SHIM_NAMES.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(expr))
}

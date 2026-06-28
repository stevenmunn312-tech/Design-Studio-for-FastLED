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

/** The shim names exposed inside a formula sandbox. Kept in one place so the
 *  JS sandbox, the C++ helpers and the call-rewrite stay in sync. */
export const SHIM_NAMES = [
  'sin8', 'cos8', 'sin16', 'beatsin8', 'beatsin16', 'scale8', 'qadd8', 'qsub8',
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

import { wrapXShiftLines } from './wrapXShift'

/** C++ twin of `wrapXMix` in `state/evaluator/wrapX.ts`. */
export const WRAP_X_HELPER_CPP = String.raw`static inline float _wrapXMix(float plain, float shifted, int x) {
  float wb=(float)x/WIDTH, wa=(float)(WIDTH-x)/WIDTH;
  float v=0.5f+((shifted-0.5f)*wa+(plain-0.5f)*wb)/sqrtf(wa*wa+wb*wb);
  return constrain(v,0.0f,1.0f);
}`

/**
 * Turn one field block into its seamless-wrapped form. `lines` is the block as
 * the emitter writes it, reading `_x` and writing `field[_y*WIDTH+_x]=EXPR;`.
 * The block is kept as the unshifted pass, then repeated with every read of
 * `_x` moved a canvas width right and every write blended into what the first
 * pass left there.
 */
export function wrapXBlockLines(lines: string[], field: string): string[] {
  return [...lines, ...wrapXShiftLines(lines, field)]
}

/**
 * Post-shaping for a 0–1 noise value, and the Worley cell-distance modes.
 * Preview and firmware share these constants; `noiseShapeCpp` and
 * `worleyValueCpp` write the same arithmetic for the sketch.
 */
export const NOISE_SHAPES = ['plain', 'ridged', 'billow'] as const
export type NoiseShape = typeof NOISE_SHAPES[number]

export function noiseShape(value: unknown): NoiseShape {
  return (NOISE_SHAPES as readonly string[]).includes(String(value)) ? String(value) as NoiseShape : 'plain'
}

/** `ridged` is `1 − |2n − 1|`, sharp bright crests along the noise's midline;
 *  `billow` is `|2n − 1|`, rounded lumps with sharp dark creases. Both fold
 *  the value about 0.5, so they hold their 0–1 range. `plain` is untouched. */
export function shapeNoise(n: number, shape: NoiseShape): number {
  if (shape === 'plain') return n
  const folded = Math.abs(2 * Math.max(0, Math.min(1, n)) - 1)
  return shape === 'ridged' ? 1 - folded : folded
}

/** C++ float expression shaping the float expression `expr`. */
export function noiseShapeCpp(shape: NoiseShape, expr: string): string {
  if (shape === 'plain') return expr
  const folded = `fabsf(2.0f*constrain(${expr},0.0f,1.0f)-1.0f)`
  return shape === 'ridged' ? `(1.0f-${folded})` : folded
}

export const WORLEY_MODES = ['f1', 'f2f1', 'edges'] as const
export type WorleyMode = typeof WORLEY_MODES[number]

export function worleyMode(value: unknown): WorleyMode {
  return (WORLEY_MODES as readonly string[]).includes(String(value)) ? String(value) as WorleyMode : 'f1'
}

/** How fast `edges` falls off from a cell border, in cells of F2 − F1. */
export const WORLEY_EDGE_GAIN = 3

/** `f1` is the distance to the nearest feature point, `f2f1` how much nearer
 *  that is than the second nearest (dark along the borders between cells),
 *  and `edges` its inverse: thin bright lines on the borders. */
export function worleyValue(mode: WorleyMode, f1: number, f2: number): number {
  if (mode === 'f2f1') return Math.min(1, f2 - f1)
  if (mode === 'edges') return Math.max(0, 1 - (f2 - f1) * WORLEY_EDGE_GAIN)
  return Math.min(1, f1)
}

/** C++ expression for `worleyValue` over the locals `_f1` and `_f2`. */
export function worleyValueCpp(mode: WorleyMode): string {
  if (mode === 'f2f1') return 'min(1.0f,_f2-_f1)'
  if (mode === 'edges') return `max(0.0f,1.0f-(_f2-_f1)*${WORLEY_EDGE_GAIN}.0f)`
  return 'min(1.0f,_f1)'
}

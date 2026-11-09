/**
 * Map Range on both sides: the preview's arithmetic and the C++ the normal
 * sketch and the control graph emit, beside each other so they cannot drift.
 *
 * Unclamped, a value past In Min or In Max keeps extrapolating, which is what
 * a remap has always done. `clampOutput` holds the result between Out Min and
 * Out Max whichever way round they are, so a reversed range clamps too.
 */
export function mapRangeValue(
  value: number, inMin: number, inMax: number, outMin: number, outMax: number, clampOutput: boolean,
): number {
  const t = inMax === inMin ? 0 : (value - inMin) / (inMax - inMin)
  const result = outMin + t * (outMax - outMin)
  return clampOutput ? Math.max(Math.min(outMin, outMax), Math.min(Math.max(outMin, outMax), result)) : result
}

/** The same remap as C++, through the generated `mapFloat` helper. */
export function mapRangeCpp(
  value: string, inMin: string, inMax: string, outMin: string, outMax: string, clampOutput: boolean,
): string {
  const mapped = `mapFloat(${value}, ${inMin}, ${inMax}, ${outMin}, ${outMax})`
  return clampOutput
    ? `fmaxf(fminf(${outMin}, ${outMax}), fminf(fmaxf(${outMin}, ${outMax}), ${mapped}))`
    : mapped
}

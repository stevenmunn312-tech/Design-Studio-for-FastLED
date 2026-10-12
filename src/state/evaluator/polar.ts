/** Polar Gradient's palette coordinate for one pixel. The C++ twin in
 *  `nodes/shapes/codegen.ts` writes the same expression, so a change here is a
 *  change there. Angle is measured from +X through the pixel-centre midpoint of
 *  the canvas; radius is normalised so the farthest corner is 1. `spinPhase`
 *  and `scrollPhase` are the integrated rates (`∫ spin dt`, `∫ radialScroll dt`). */
export function polarGradientU(
  dx: number, dy: number, rMax: number,
  angleOffset: number, spinPhase: number, repeat: number, radialMix: number, scrollPhase: number,
): number {
  const turn = Math.atan2(dy, dx) / (2 * Math.PI) + angleOffset / 360 + spinPhase
  const radius = Math.sqrt(dx * dx + dy * dy) / rMax + scrollPhase
  return (1 - radialMix) * turn * repeat + radialMix * radius * repeat
}

/** Whole angular repeats: a fractional one would leave a seam at the ±π cut. */
export function polarRepeat(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(16, Math.round(value))) : 1
}

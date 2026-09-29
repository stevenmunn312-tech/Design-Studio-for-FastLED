/**
 * Seamless horizontal wrap for a scalar field defined on the plane.
 *
 * The field is evaluated twice, unshifted (`plain`) and shifted right by one
 * canvas width (`shifted`), and pixel `x` blends them with weights
 * `(W - x) / W` for the shifted copy and `x / W` for the plain one. At `x = 0`
 * the result is `f(W)` and at the virtual column `x = W` it is `f(W)` again, so
 * the two canvas edges meet. The weights are normalised by their root sum of
 * squares so the blend keeps a noise field's contrast instead of averaging it
 * flat mid-canvas; values are taken about 0.5, the middle of the 0–1 range.
 * `WRAP_X_HELPER_CPP` (codegen/wrapXHelperCpp.ts) is the C++ twin.
 */
export function wrapXMix(plain: number, shifted: number, x: number, width: number): number {
  const wb = x / width
  const wa = (width - x) / width
  const norm = Math.sqrt(wa * wa + wb * wb)
  return Math.max(0, Math.min(1, 0.5 + ((shifted - 0.5) * wa + (plain - 0.5) * wb) / norm))
}

/** Blend `shifted` into `plain` in place, row by row. */
export function wrapXBlend(plain: Float32Array, shifted: Float32Array, width: number, height: number): Float32Array {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      plain[i] = wrapXMix(plain[i], shifted[i], x, width)
    }
  }
  return plain
}

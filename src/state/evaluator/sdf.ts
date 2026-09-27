/**
 * Signed-distance primitives shared by frame shapes and scalar-field shapes.
 * Distances are negative inside and positive outside, in the caller's units.
 */

export function rectSd(lx: number, ly: number, halfWidth: number, halfHeight: number): number {
  const qx = Math.abs(lx) - halfWidth
  const qy = Math.abs(ly) - halfHeight
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
}

/** Radial ellipse approximation used by the existing Shape renderer. */
export function ellipseSd(lx: number, ly: number, radiusX: number, radiusY: number): number {
  return (Math.hypot(lx / radiusX, ly / radiusY) - 1) * Math.min(radiusX, radiusY)
}

/**
 * Signed distance from a point to a regular polygon of `sides` sides and
 * circumradius `size`. This radial approximation is exact along apothems and
 * stays continuous when two integer-sided distances are blended.
 */
export function polygonSd(lx: number, ly: number, sides: number, size: number): number {
  const seg = (Math.PI * 2) / sides
  const apothem = Math.cos(Math.PI / sides)
  const r = Math.hypot(lx, ly)
  const a = Math.atan2(ly, lx)
  const folded = ((a % seg) + seg) % seg - seg / 2
  return r - (size * apothem) / Math.cos(folded)
}

/** Fractional polygon sides morph by blending the neighbouring integer SDFs. */
export function morphPolygonSd(lx: number, ly: number, sides: number, size: number): number {
  const n = Math.max(3, sides)
  const lower = Math.floor(n)
  const upper = Math.ceil(n)
  if (lower === upper) return polygonSd(lx, ly, lower, size)
  const amount = n - lower
  return polygonSd(lx, ly, lower, size) * (1 - amount)
    + polygonSd(lx, ly, upper, size) * amount
}

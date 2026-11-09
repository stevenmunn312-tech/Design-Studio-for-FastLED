/**
 * Signed-distance primitives shared by frame shapes and scalar-field shapes.
 * Distances are negative inside and positive outside, in the caller's units.
 */

/** The shapes Shape and Shape Field both offer, under one set of names. An
 *  ellipse is a circle at aspect 1. */
export const SHAPE_KINDS = ['rect', 'ellipse', 'polygon'] as const

/**
 * Shape Field's kinds: Shape's, then the rose and the superformula. Their
 * distance is measured along the radius from the centre, not to the nearest
 * point of the outline, which a field's fill and glow tolerate but Shape's
 * stroke cannot: an outline drawn from it thins to nothing along a petal's
 * sides. Shape would also need a bounding reach for its 0–1 placement margin,
 * which the superformula has no closed form for. So Shape keeps three.
 */
export const SHAPE_FIELD_KINDS = [...SHAPE_KINDS, 'rose', 'superformula'] as const

/**
 * A rose of `petals` petals, each `size` long and 180/petals degrees wide,
 * the first along +x. Distance is radial: from the centre out to the petal
 * edge at the point's own angle.
 */
export function roseSd(lx: number, ly: number, petals: number, size: number): number {
  return Math.sqrt(lx * lx + ly * ly) - size * Math.max(0, Math.cos(petals * Math.atan2(ly, lx)))
}

/** Gielis's superformula, already clamped as its knobs are (`superformulaKnobs`). */
export interface Superformula { m: number; n1: number; n2: number; n3: number; a: number; b: number }

/** The bounds both sides apply: lobes from 1, every exponent and stretch from 0.05. */
export function superformulaKnobs(m: number, n1: number, n2: number, n3: number, a: number, b: number): Superformula {
  return {
    m: Math.max(1, m),
    n1: Math.max(0.05, n1), n2: Math.max(0.05, n2), n3: Math.max(0.05, n3),
    a: Math.max(0.05, a), b: Math.max(0.05, b),
  }
}

/**
 * The superformula outline scaled by `size` (a lobe reaches `size` at a and b
 * of 1), with the same radial distance as the rose.
 */
export function superformulaSd(lx: number, ly: number, sf: Superformula, size: number): number {
  const q = sf.m * Math.atan2(ly, lx) * 0.25
  const t1 = Math.abs(Math.cos(q) / sf.a), t2 = Math.abs(Math.sin(q) / sf.b)
  return Math.sqrt(lx * lx + ly * ly) - size * Math.pow(Math.pow(t1, sf.n2) + Math.pow(t2, sf.n3), -1 / sf.n1)
}

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

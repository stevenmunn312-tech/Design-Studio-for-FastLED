import { parseFourierPoints, resampleClosed } from './fourierOutline'

/** Points in the baked polyline a custom Path walks: the spline through the
 *  author's points, resampled evenly by length. 128 x,y pairs of floats cost 1 KB of
 *  flash, and `CUSTOM_PATH_SEGMENT_STEPS` per segment keeps the spline smooth
 *  before resampling. */
export const CUSTOM_PATH_SAMPLES = 128
const CUSTOM_PATH_SEGMENT_STEPS = 16

interface Point { x: number; y: number }

/**
 * Custom Path text as a closed polyline, or `null` when it is not a valid
 * outline (see `parseFourierPoints`, whose text format it shares); Path then
 * draws the circle. The curve is a uniform Catmull-Rom spline through the
 * points, so it passes through every one of them and closes back to the
 * first. Points keep the author's -1..1 coordinates, y up.
 */
export function customPathTable(text: unknown): Point[] | null {
  const points = parseFourierPoints(text)
  if (!points) return null
  const n = points.length
  const dense: Point[] = []
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n]
    for (let s = 0; s < CUSTOM_PATH_SEGMENT_STEPS; s++) {
      const u = s / CUSTOM_PATH_SEGMENT_STEPS, u2 = u * u, u3 = u2 * u
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3)
      dense.push({ x: blend(p0.x, p1.x, p2.x, p3.x), y: blend(p0.y, p1.y, p2.y, p3.y) })
    }
  }
  return resampleClosed(dense, CUSTOM_PATH_SAMPLES)
}

/** The point at turn fraction `t` (0..1, 1 being the start again) along a table,
 *  interpolated linearly between samples. The sketch does the same sum. */
export function customPathPoint(table: readonly Point[], t: number): Point {
  const n = table.length
  const u = Math.max(0, Math.min(1, t)) * n
  const floor = Math.floor(u), frac = u - floor
  const a = table[floor % n], b = table[(floor + 1) % n]
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac }
}

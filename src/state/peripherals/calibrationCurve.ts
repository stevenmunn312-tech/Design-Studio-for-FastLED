// The one calibration-curve rule, shared by the preview and the firmware.
//
// An analog sensor part carries monotonic points (pin volts -> reading in the
// part's unit). Between two points the reading is linear; outside the first
// and last it holds the end value. `interpolateCurve` is what the preview
// calls, and `CALIBRATION_CURVE_CPP` is the same arithmetic in C++, so a part
// reads identically in the browser and on the board. A native test compiles
// the C++ and compares the two (calibrationCurveNative.test.ts).

export interface CurvePoint {
  volts: number
  value: number
}

/**
 * Why a list of points is not a usable curve, or `null` when it is.
 *
 * Volts must rise strictly, so every voltage has one reading. The reading may
 * stay level between points (a sensor that saturates) but must never change
 * direction: a hump would make two voltages mean the same thing and a reading
 * ambiguous. Every number must be finite, because each one is written into
 * firmware as a literal.
 */
export function calibrationCurveIssue(points: unknown): string | null {
  if (!Array.isArray(points) || points.length < 2) return 'needs at least two points'
  if (points.length > MAX_CURVE_POINTS) return `has more than ${MAX_CURVE_POINTS} points`
  let rising = false
  let falling = false
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as Partial<CurvePoint> | null
    if (!point || typeof point.volts !== 'number' || typeof point.value !== 'number'
      || !Number.isFinite(point.volts) || !Number.isFinite(point.value)
      || Math.abs(point.volts) > MAX_CURVE_MAGNITUDE || Math.abs(point.value) > MAX_CURVE_MAGNITUDE) {
      return `point ${index + 1} is not a pair of finite numbers`
    }
    if (index === 0) continue
    const before = points[index - 1] as CurvePoint
    if (point.volts <= before.volts) return `volts must rise at point ${index + 1}`
    if (point.value > before.value) rising = true
    if (point.value < before.value) falling = true
  }
  if (rising && falling) return 'readings must not change direction'
  if (!rising && !falling) return 'readings must change across the curve'
  return null
}

/** Points above this are refused: more is firmware size for no accuracy. */
export const MAX_CURVE_POINTS = 16
/** A literal this large no longer fits a float's useful precision. */
export const MAX_CURVE_MAGNITUDE = 1_000_000

/**
 * The reading at `volts`. Linear between points, held at the end values
 * outside them. A voltage that is not a number reads the first point's value,
 * so a bad input never becomes NaN in a graph.
 */
export function interpolateCurve(points: readonly CurvePoint[], volts: number): number {
  if (points.length === 0) return 0
  const last = points.length - 1
  if (Number.isNaN(volts) || volts <= points[0].volts) return points[0].value
  if (volts >= points[last].volts) return points[last].value
  let upper = 1
  while (volts > points[upper].volts) upper += 1
  const low = points[upper - 1]
  const high = points[upper]
  return low.value + (volts - low.volts) * (high.value - low.value) / (high.volts - low.volts)
}

/**
 * The same rule in C++, emitted once per sketch. Takes parallel arrays so each
 * sensor's table is a plain `static const` pair. Keep it line for line with
 * `interpolateCurve`.
 */
export const CALIBRATION_CURVE_CPP: readonly string[] = [
  '// Linear interpolation through a part\'s calibration points; the end values hold outside them.',
  'static float _calCurve(const float *volts, const float *values, uint8_t count, float v) {',
  '  if (!(v > volts[0])) return values[0];',
  '  if (v >= volts[count - 1]) return values[count - 1];',
  '  uint8_t upper = 1;',
  '  while (v > volts[upper]) upper++;',
  '  return values[upper - 1] + (v - volts[upper - 1]) * (values[upper] - values[upper - 1]) / (volts[upper] - volts[upper - 1]);',
  '}',
]

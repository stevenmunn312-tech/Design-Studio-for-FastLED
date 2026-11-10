/*
 * Where a value sits along a control's travel, and back.
 *
 * A slider, a fader, a screen widget and a phone control all turn a bounded
 * range into a position from 0 to 1 and a position back into a value. Most
 * ranges travel linearly. A range that spans decades (a half-life of 0.1 to
 * 120 s) travels logarithmically instead: equal distances along it multiply
 * the value by equal ratios, so 1 to 10 s takes as much travel as 10 to 100 s.
 *
 * Only the travel changes. The value a control stores, sends and is typed
 * into stays in the property's own units, so a saved project, a wire and a
 * typed number mean exactly what they meant on a linear slider.
 *
 * A log range needs a minimum above zero. Asked for one without, a control
 * travels linearly rather than failing: `effectiveRangeScale` is that one rule.
 *
 * The firmware holds the same mapping in `RANGE_SCALE_LOG_CPP` and the Web
 * Remote page in `RANGE_SCALE_LOG_JS`; both are emitted only where a log
 * control is.
 */

export type RangeScale = 'linear' | 'log'

/** The scales a control can travel on, linear first as the default. */
export const RANGE_SCALES: readonly RangeScale[] = ['linear', 'log']

/** How many positions a log-scale range input is divided into. */
export const RANGE_TRAVEL_STEPS = 1000

/** Whether `min`..`max` can be travelled logarithmically: finite, above zero and apart. */
export function logRangeUsable(min: number, max: number): boolean {
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min
}

/** The scale a control actually travels on: log only when asked for and the range allows it. */
export function effectiveRangeScale(scale: unknown, min: number, max: number): RangeScale {
  return scale === 'log' && logRangeUsable(min, max) ? 'log' : 'linear'
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * Where `value` sits along `min`..`max`: 0 at the minimum, 1 at the maximum,
 * clamped at both ends. A value that is not a number sits at the minimum, and
 * so does every value of an empty range.
 */
export function rangePosition(value: number, min: number, max: number, scale: RangeScale = 'linear'): number {
  if (!Number.isFinite(value) || !(max > min)) return 0
  const held = Math.max(min, Math.min(max, value))
  if (effectiveRangeScale(scale, min, max) === 'log') return clamp01(Math.log(held / min) / Math.log(max / min))
  return clamp01((held - min) / (max - min))
}

/**
 * The value at `position` along `min`..`max`, the position clamped to 0..1.
 * Not snapped to any step: each control keeps its own rule for that.
 */
export function rangeValueAt(position: number, min: number, max: number, scale: RangeScale = 'linear'): number {
  const p = Number.isFinite(position) ? clamp01(position) : 0
  if (!(max > min)) return min
  if (effectiveRangeScale(scale, min, max) === 'log') return Math.max(min, Math.min(max, min * Math.pow(max / min, p)))
  return min + p * (max - min)
}

/** Decimal places a number is written with, at most eight. */
function decimalsOf(value: number): number {
  return Math.min(8, (String(value).split('.')[1] ?? '').length)
}

/**
 * `value` on the step counted from `min`, inside the range, rounded to the
 * decimals the step and minimum are written with so 0.1 steps do not drift.
 * With no step it is only clamped.
 */
export function snapRangeValue(value: number, min: number, max: number, step: number): number {
  const finite = Number.isFinite(value) ? value : min
  const clamped = Math.max(min, Math.min(Math.max(min, max), finite))
  if (!(step > 0)) return clamped
  const snapped = min + Math.round((clamped - min) / step) * step
  const decimals = Math.max(decimalsOf(step), decimalsOf(min))
  return Number(Math.max(min, Math.min(Math.max(min, max), snapped)).toFixed(decimals))
}

/** Where a value sits on a log-scale range input, in whole positions of `RANGE_TRAVEL_STEPS`. */
export function logTravelPosition(value: number, min: number, max: number): number {
  return Math.round(rangePosition(value, min, max, 'log') * RANGE_TRAVEL_STEPS)
}

/**
 * The value a log-scale range input's `position` lands on, snapped to the
 * step, from `value` where it stood. A move too small to reach the next step
 * still moves one step its way: an arrow key at the bottom of a three-decade
 * range is a tenth of a step, and without this the keyboard could never leave
 * the bottom.
 */
export function logTravelValue(position: number, value: number, min: number, max: number, step: number): number {
  const next = snapRangeValue(rangeValueAt(position / RANGE_TRAVEL_STEPS, min, max, 'log'), min, max, step)
  const direction = Math.sign(position - logTravelPosition(value, min, max))
  if (next !== value || direction === 0 || !(step > 0)) return next
  return snapRangeValue(value + direction * step, min, max, step)
}

/**
 * The firmware twin of `rangeValueAt` + `snapRangeValue` on a log range, and
 * of `rangePosition`. Emitted once, and only into a sketch with a log-scale
 * control: the caller checks its lines for `_rsLog`.
 */
export const RANGE_SCALE_LOG_CPP = `// A log-scale control's travel (state/rangeScale.ts): equal distances along
// it multiply the value by equal ratios. The position runs 0 to 1.
static float _rsLogValue(float position, float minimum, float maximum, float step) {
  float value = minimum * powf(maximum / minimum, constrain(position, 0.0f, 1.0f));
  if (step > 0.0f) value = minimum + roundf((value - minimum) / step) * step;
  return constrain(value, minimum, maximum);
}

static float _rsLogPosition(float value, float minimum, float maximum) {
  if (!isfinite(value)) return 0.0f;
  return constrain(logf(constrain(value, minimum, maximum) / minimum) / logf(maximum / minimum), 0.0f, 1.0f);
}`

/**
 * The Web Remote page's twin, as script text: `lv` is a position's value and
 * `lp` a value's position, both reading the range from a control's `data-`
 * attributes. The page snaps the value with its own `q`, as it does for a
 * linear slider.
 */
export const RANGE_SCALE_LOG_JS = [
  'function lv(c,p){var lo=+c.dataset.min,hi=+c.dataset.max;p=Math.min(1,Math.max(0,+p||0));',
  'return Math.min(hi,Math.max(lo,lo*Math.pow(hi/lo,p)));}',
  'function lp(c,x){var lo=+c.dataset.min,hi=+c.dataset.max;x=+x;if(!isFinite(x))return 0;',
  'return Math.min(1,Math.max(0,Math.log(Math.min(hi,Math.max(lo,x))/lo)/Math.log(hi/lo)));}',
].join('\n')

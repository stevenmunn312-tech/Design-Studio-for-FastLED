/** True when `text` is a number the slider itself could land on. */
export function validRangeValue(text: string, min: number, max: number, step: number): boolean {
  if (text.trim() === '') return false
  const parsed = Number(text)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return false
  // Allow for floating-point noise while still enforcing the same increments
  // as the range input (for example 0.1, 0.2, ...).
  const stepsFromMin = (parsed - min) / step
  return Math.abs(stepsFromMin - Math.round(stepsFromMin)) < 1e-8
}

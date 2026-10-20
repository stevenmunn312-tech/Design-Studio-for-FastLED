/** Whole angular repeats: a fractional one would leave a seam at the ±π cut. */
export function polarRepeat(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(16, Math.round(value))) : 1
}

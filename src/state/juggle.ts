/** The live dot count is bounded before rounding in preview and firmware. */
export const JUGGLE_COUNT = { min: 1, max: 8, default: 4 } as const

export function juggleDotCount(value: number): number {
  return Number.isFinite(value)
    ? Math.round(Math.max(JUGGLE_COUNT.min, Math.min(JUGGLE_COUNT.max, value)))
    : JUGGLE_COUNT.default
}

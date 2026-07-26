import { MAX_PIN_NUMBER } from '../state/boardGpio'

// Every hardware-facing generator routes user-entered Arduino pin values
// through this helper so fractional, non-finite, and wildly out-of-range
// values never reach firmware. Board-specific availability and electrical
// capabilities are checked separately by validateGraph.
export function sanitizePin(value: unknown, fallback: number, min = 0, max = MAX_PIN_NUMBER): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

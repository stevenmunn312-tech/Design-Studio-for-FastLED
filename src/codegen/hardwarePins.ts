import { MAX_PIN_NUMBER } from '../build/boards/boardGpio'
import { isPartPinRef } from '../build/parts/partReferences'

// Every hardware-facing generator routes user-entered Arduino pin values
// through this helper so fractional, non-finite, and wildly out-of-range
// values never reach firmware. Board-specific availability and electrical
// capabilities are checked separately by validateGraph.
//
// A `{ part, pin }` reference to a pin on another part (partReferences.ts) is not
// a GPIO and never becomes one: it reads as unset. Code is not generated for a
// node holding one at all (`withoutUnresolved`); this keeps the helper honest
// for any caller that reaches it anyway.
export function sanitizePin(value: unknown, fallback: number, min = 0, max = MAX_PIN_NUMBER): number {
  if (isPartPinRef(value)) return fallback
  // A cleared pin field is '' and Number('') is 0, so without this guard an
  // empty field compiled as GPIO 0 while the hardware manifest treated it as
  // unset; both sides must agree on the board default.
  if (typeof value === 'string' && value.trim() === '') return fallback
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

// Every hardware-facing generator routes user-entered GPIO values through this
// helper so fractional, non-finite, and out-of-range pins never reach firmware.
// GPIO48 is the highest pin on any currently supported board (ESP32-S3).
export function sanitizePin(value: unknown, fallback: number, min = 0, max = 48): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

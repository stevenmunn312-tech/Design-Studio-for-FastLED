/**
 * Frame Transform's static operations, shared by preview and sketch. The
 * image is rotated first, then flipped, then slid (with wrap), so a
 * destination pixel samples its source by undoing those in reverse.
 */

export const FRAME_ROTATIONS = ['0', '90', '180', '270'] as const

/** Quarter turns clockwise, 0–3, from the `rotate` property. */
export function frameQuarterTurns(value: unknown): number {
  const n = Math.round(Number(value ?? 0) / 90)
  return Number.isFinite(n) ? ((n % 4) + 4) % 4 : 0
}

/** Pixel offsets a slide can take; the slider's range, wrapped on both sides. */
export const FRAME_OFFSET = { min: -64, max: 64 } as const

export function frameOffset(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : 0)
  return Math.max(FRAME_OFFSET.min, Math.min(FRAME_OFFSET.max, n))
}

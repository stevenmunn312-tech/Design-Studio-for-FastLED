/**
 * Palette Transform's Black point: a levels-style floor that pulls a
 * palette's dark end to true black while keeping its hue order, per channel
 * `c' = max(0, c − f) / (1 − f)`. Catalogue palettes bottom out at a dark
 * colour rather than black, so a full-frame pattern washes out; this gives
 * any of them contrast without hand-building a Poline round a dark anchor.
 *
 * Worked in whole bytes, the same integer steps in the preview and the C++,
 * so both land on the same entry to the count.
 */

/** Highest black point: at 1 every colour would divide by zero. */
export const PALETTE_BLACK_POINT_MAX = 0.9

/** The floor as a byte, from the 0–0.9 knob (clamped, rounded). */
export function blackPointByte(level: number): number {
  const f = Number.isFinite(level) ? Math.max(0, Math.min(PALETTE_BLACK_POINT_MAX, level)) : 0
  return Math.floor(f * 255 + 0.5)
}

/** One channel through the floor, with the C++'s integer rounding. */
export function applyBlackPoint(channel: number, floor: number): number {
  if (floor <= 0) return channel
  if (channel <= floor) return 0
  return Math.floor(((channel - floor) * 255 + Math.floor((255 - floor) / 2)) / (255 - floor))
}

/** The floor byte as C++, from a float expression. */
export function blackPointByteCpp(level: string): string {
  return `(uint8_t)(constrain(${level}, 0.0f, ${PALETTE_BLACK_POINT_MAX}f) * 255.0f + 0.5f)`
}

/** A C++ lambda `_lv(c)` applying the floor `_bp`, declared inside the node's block. */
export const BLACK_POINT_LAMBDA_CPP =
  'auto _lv = [&](uint8_t _ch) -> uint8_t { return _ch <= _bp ? 0 : (uint8_t)(((uint16_t)(_ch - _bp) * 255u + (255u - _bp) / 2u) / (255u - _bp)); };'

// What a 7-segment module actually shows.
//
// Four characters and a colon, and that is the whole vocabulary. The evaluator
// draws this into the node body, the workbench draws it on the bench, and the
// C++ generator writes the same characters to the TM1637 — so the layout is
// decided once here rather than three times.
//
// A segment module is not a text display, which is why the node takes a number
// and a mode rather than a `string`. A general text input would accept words it
// has no glyphs for, and the honest place to refuse that is the port type.

import { scaleAndRound, DISPLAY_TEXT_NO_READING } from './displayText'

/** Digits a TM1637 module has. The only width this module renders. */
export const SEGMENT_DIGITS = 4

export const SEGMENT_DISPLAY_MODES = ['Number', 'Clock', 'Index'] as const
export type SegmentDisplayMode = (typeof SEGMENT_DISPLAY_MODES)[number]

export function asSegmentMode(value: unknown): SegmentDisplayMode {
  const mode = String(value ?? '')
  return (SEGMENT_DISPLAY_MODES as readonly string[]).includes(mode)
    ? (mode as SegmentDisplayMode)
    : 'Number'
}

/** TM1637 brightness steps. 0 is dimmest-on; the module has no darker level. */
export const SEGMENT_BRIGHTNESS_MIN = 0
export const SEGMENT_BRIGHTNESS_MAX = 7

export function clampSegmentBrightness(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 4
  return Math.min(SEGMENT_BRIGHTNESS_MAX, Math.max(SEGMENT_BRIGHTNESS_MIN, n))
}

/**
 * What the module displays this frame.
 *
 * `digits` is always exactly `SEGMENT_DIGITS` characters — a space is a blank
 * digit — so a caller never has to think about padding. `decimalAt` is the
 * digit index carrying a decimal point, or -1.
 */
export interface SegmentFrame {
  digits: string
  colon: boolean
  decimalAt: number
  /** False when the module is dark: nothing is written, not even blanks. */
  lit: boolean
}

export const BLANK_SEGMENT_FRAME: SegmentFrame = {
  digits: '    ', colon: false, decimalAt: -1, lit: false,
}

/**
 * Overflow marker.
 *
 * `----` is the segment-display convention for a reading that will not fit, and
 * every character in it exists on a 7-segment digit. Truncating to the low four
 * digits instead would show a confidently wrong number, which on a display
 * whose whole job is to be read at a glance is the worst available outcome.
 */
const SEGMENT_OVERFLOW = '----'

export interface SegmentNumberOptions {
  decimals: number
  leadingZero: boolean
}

/**
 * Render a number across the four digits.
 *
 * Rounding goes through `scaleAndRound` — the same function `FormatNumber` and
 * the generated firmware use — so a value that reads 12.3 in one place cannot
 * read 12.4 in another.
 */
export function renderSegmentNumber(value: number, options: SegmentNumberOptions): SegmentFrame {
  const decimals = Math.min(3, Math.max(0, Math.round(options.decimals) || 0))
  const scaled = scaleAndRound(value, decimals)
  if (scaled === null) {
    // A module with four digits cannot spell the shared no-reading marker, so
    // it shows the dashes it can draw.
    return { digits: DISPLAY_TEXT_NO_READING.padStart(SEGMENT_DIGITS, '-').slice(0, SEGMENT_DIGITS), colon: false, decimalAt: -1, lit: true }
  }

  const negative = scaled < 0
  const magnitude = Math.abs(scaled)
  const body = String(magnitude)
  // Digits available for the number itself, after a minus sign takes one.
  const room = SEGMENT_DIGITS - (negative ? 1 : 0)
  if (body.length > room) return { digits: SEGMENT_OVERFLOW, colon: false, decimalAt: -1, lit: true }

  const padded = options.leadingZero ? body.padStart(room, '0') : body
  const text = (negative ? '-' : '') + padded
  const digits = text.padStart(SEGMENT_DIGITS, ' ')
  // The point sits after the last whole digit, counted from the right.
  const decimalAt = decimals > 0 ? SEGMENT_DIGITS - 1 - decimals : -1
  return { digits, colon: false, decimalAt, lit: true }
}

/**
 * Render `HH:MM` across the four digits.
 *
 * The colon is a real segment on the module rather than a character, so it is
 * reported separately and the four digits stay four digits. `blink` drives the
 * once-a-second pulse a clock is expected to have; a caller that wants a steady
 * colon passes true.
 */
export function renderSegmentClock(hour: number, minute: number, colonOn: boolean): SegmentFrame {
  const hh = Math.abs(Math.round(Number.isFinite(hour) ? hour : 0)) % 100
  const mm = Math.abs(Math.round(Number.isFinite(minute) ? minute : 0)) % 100
  const digits = `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`
  return { digits, colon: colonOn, decimalAt: -1, lit: true }
}

/**
 * Render a position within a collection, as `n` right-aligned.
 *
 * Deliberately not `n/total`: four digits cannot show a separator and two
 * numbers without one of them becoming unreadable, and the number people look
 * at is which one is playing.
 */
export function renderSegmentIndex(index: number): SegmentFrame {
  const n = Math.round(Number.isFinite(index) ? index : 0)
  if (n < 0 || n > 9999) return { digits: SEGMENT_OVERFLOW, colon: false, decimalAt: -1, lit: true }
  return { digits: String(n).padStart(SEGMENT_DIGITS, ' '), colon: false, decimalAt: -1, lit: true }
}

/** A frame as one readable string, for a node body or a test. */
export function segmentFrameText(frame: SegmentFrame): string {
  if (!frame.lit) return ''
  if (frame.colon) return `${frame.digits.slice(0, 2)}:${frame.digits.slice(2)}`
  if (frame.decimalAt >= 0) {
    return `${frame.digits.slice(0, frame.decimalAt + 1)}.${frame.digits.slice(frame.decimalAt + 1)}`
  }
  return frame.digits
}

/**
 * The raw segment byte for one character, in TM1637 bit order.
 *
 * Bit 0 is the top bar and the rest run clockwise, with bit 6 the centre — the
 * standard 7-segment map every driver for this part expects. Exported so the
 * generator emits the same table the preview draws from; a second table written
 * from memory is how a `6` ends up missing its top bar on hardware only.
 */
export const SEGMENT_GLYPHS: Record<string, number> = {
  '0': 0x3f, '1': 0x06, '2': 0x5b, '3': 0x4f, '4': 0x66,
  '5': 0x6d, '6': 0x7d, '7': 0x07, '8': 0x7f, '9': 0x6f,
  '-': 0x40, ' ': 0x00,
  A: 0x77, b: 0x7c, C: 0x39, d: 0x5e, E: 0x79, F: 0x71,
}

/** Segment bytes for a frame, decimal point and colon already applied. */
export function segmentBytes(frame: SegmentFrame): number[] {
  if (!frame.lit) return new Array(SEGMENT_DIGITS).fill(0)
  const bytes: number[] = []
  for (let i = 0; i < SEGMENT_DIGITS; i++) {
    let byte = SEGMENT_GLYPHS[frame.digits[i]] ?? 0
    if (i === frame.decimalAt) byte |= 0x80
    // The TM1637 carries the colon on the second digit's high bit.
    if (frame.colon && i === 1) byte |= 0x80
    bytes.push(byte)
  }
  return bytes
}

// What a 7-segment module actually shows.
//
// Digits and, on some modules, a colon: that is the whole vocabulary. The evaluator
// draws this into the node body, the workbench draws it on the bench, and the
// C++ generator writes the same characters to the TM1637 — so the layout is
// decided once here rather than three times.
//
// A segment module is not a text display, which is why the node takes a number
// and a mode rather than a `string`. A general text input would accept words it
// has no glyphs for, and the honest place to refuse that is the port type.

import type { DisplaySignalKind } from './displaySignal'

/**
 * What a segment controller physically is.
 *
 * Digit count and brightness range are controller facts, not module-wide
 * constants: a TM1637 has four digits and eight brightness steps, a MAX7219
 * has eight and sixteen. Keeping them here is what lets one node contract
 * cover both, which is the plan's rule about controller-specific wiring and
 * digit capacity living in the part adapter.
 */
export interface SegmentController {
  id: string
  digits: number
  /** A centre colon segment, which only the TM1637 form has. */
  hasColon: boolean
  brightnessMax: number
  /** Node property keys this controller wires, in header order. */
  pins: readonly string[]
}

export const SEGMENT_CONTROLLERS: Record<string, SegmentController> = {
  TM1637: {
    id: 'TM1637', digits: 4, hasColon: true, brightnessMax: 7,
    pins: ['clkPin', 'dioPin'],
  },
  MAX7219: {
    id: 'MAX7219', digits: 8, hasColon: false, brightnessMax: 15,
    pins: ['clkPin', 'dinPin', 'csPin'],
  },
}

export const DEFAULT_SEGMENT_CONTROLLER = SEGMENT_CONTROLLERS.TM1637

/** The controller a declared controller string names, or the default. */
export function segmentControllerFor(controller: string | undefined): SegmentController {
  if (!controller) return DEFAULT_SEGMENT_CONTROLLER
  const upper = controller.toUpperCase()
  for (const key of Object.keys(SEGMENT_CONTROLLERS)) {
    if (upper.startsWith(key)) return SEGMENT_CONTROLLERS[key]
  }
  return DEFAULT_SEGMENT_CONTROLLER
}

/**
 * What the digits show, decided by what is plugged into `Display`.
 *
 * Not a property, and not a free number: a bare reading wired from anywhere in
 * the graph is a custom-UI capability. Four digits can say the time, a
 * position in a track, or a position in a collection, and each of those has
 * exactly one source that means it.
 */
export const SEGMENT_DISPLAY_MODES = ['Waiting', 'Clock', 'Elapsed', 'Index'] as const
export type SegmentDisplayMode = (typeof SEGMENT_DISPLAY_MODES)[number]

const MODE_BY_KIND: Record<DisplaySignalKind, SegmentDisplayMode> = {
  clock: 'Clock',
  // M:SS of the running track, using the colon the TM1637 already has. The
  // only thing four digits can say well about a player.
  player: 'Elapsed',
  slideshow: 'Index',
}

export function segmentModeForKind(kind: DisplaySignalKind): SegmentDisplayMode {
  return MODE_BY_KIND[kind]
}

/** 0 is dimmest-on; neither controller has a darker level short of off. */
export const SEGMENT_BRIGHTNESS_MIN = 0
/** The widest range any controller offers, for a property slider's bound. */
export const SEGMENT_BRIGHTNESS_MAX = 15

/**
 * Bound a brightness to what `controller` actually accepts.
 *
 * A 4 means half brightness on a TM1637 and a quarter on a MAX7219, so the
 * ceiling has to come from the controller rather than from one shared number —
 * emitting 12 to a TM1637 would set three bits it does not read.
 */
export function clampSegmentBrightness(
  value: unknown,
  controller: SegmentController = DEFAULT_SEGMENT_CONTROLLER,
): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return Math.min(4, controller.brightnessMax)
  return Math.min(controller.brightnessMax, Math.max(SEGMENT_BRIGHTNESS_MIN, n))
}

/**
 * What the module displays this frame.
 *
 * `digits` is always exactly the controller's digit count — a space is a blank
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

export function blankSegmentFrame(digits = DEFAULT_SEGMENT_CONTROLLER.digits): SegmentFrame {
  return { digits: ' '.repeat(digits), colon: false, decimalAt: -1, lit: false }
}

/** Stable appliance fault numbers shared with generated player firmware. */
export const SEGMENT_FAULT_CODES = {
  NO_SD_CARD: 1,
  NO_PLAYABLE_TRACK: 2,
} as const

export type SegmentFaultCode = (typeof SEGMENT_FAULT_CODES)[keyof typeof SEGMENT_FAULT_CODES]

/** Render a compact four-character error code, right-aligned on wider modules. */
export function renderSegmentFault(
  code: SegmentFaultCode,
  digits = DEFAULT_SEGMENT_CONTROLLER.digits,
): SegmentFrame {
  const body = `E${String(code).padStart(3, '0')}`
  if (body.length > digits) return segmentDashes(digits)
  return { digits: body.padStart(digits, ' '), colon: false, decimalAt: -1, lit: true }
}

/**
 * A field of dashes, the width of the module.
 *
 * The segment convention for a reading that will not fit or does not exist —
 * and, because a segment module cannot render words, its form of "waiting for
 * a signal" too. Truncating to the low digits instead would show a confidently
 * wrong number, which on a display whose whole job is to be read at a glance
 * is the worst available outcome.
 */
export function segmentDashes(digits = DEFAULT_SEGMENT_CONTROLLER.digits): SegmentFrame {
  return { digits: '-'.repeat(digits), colon: false, decimalAt: -1, lit: true }
}

const dashes = segmentDashes

/**
 * Render `HH:MM` across the four digits.
 *
 * The colon is a real segment on the module rather than a character, so it is
 * reported separately and the four digits stay four digits. `blink` drives the
 * once-a-second pulse a clock is expected to have; a caller that wants a steady
 * colon passes true.
 */
export function renderSegmentClock(
  hour: number,
  minute: number,
  colonOn: boolean,
  digits = DEFAULT_SEGMENT_CONTROLLER.digits,
  second = 0,
): SegmentFrame {
  const pair = (value: number) =>
    String(Math.abs(Math.round(Number.isFinite(value) ? value : 0)) % 100).padStart(2, '0')
  // Six digits of clock only fit where there are six digits. On a four-digit
  // module the seconds are the part nobody reads at a glance, so they go.
  const body = digits >= 6
    ? `${pair(hour)}${pair(minute)}${pair(second)}`
    : `${pair(hour)}${pair(minute)}`
  return { digits: body.padStart(digits, ' ').slice(-digits), colon: colonOn, decimalAt: -1, lit: true }
}

/**
 * Render a position within a collection, as `n` right-aligned.
 *
 * Deliberately not `n/total`: four digits cannot show a separator and two
 * numbers without one of them becoming unreadable, and the number people look
 * at is which one is playing.
 */
export function renderSegmentIndex(
  index: number,
  digits = DEFAULT_SEGMENT_CONTROLLER.digits,
): SegmentFrame {
  // A reading that is not a number is dashes, the same as in Number mode.
  // Folding it to 0 would put a confident "1" on a module whose input is
  // broken, and the firmware's lroundf on a NaN is not obliged to agree with
  // whatever the browser folded to.
  if (!Number.isFinite(index)) return dashes(digits)
  const n = Math.round(index)
  const body = String(Math.abs(n))
  if (n < 0 || body.length > digits) return dashes(digits)
  return { digits: body.padStart(digits, ' '), colon: false, decimalAt: -1, lit: true }
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
  const width = frame.digits.length
  if (!frame.lit) return new Array(width).fill(0)
  const bytes: number[] = []
  for (let i = 0; i < width; i++) {
    let byte = SEGMENT_GLYPHS[frame.digits[i]] ?? 0
    if (i === frame.decimalAt) byte |= 0x80
    // The TM1637 carries the colon on the second digit's high bit.
    if (frame.colon && i === 1) byte |= 0x80
    bytes.push(byte)
  }
  return bytes
}

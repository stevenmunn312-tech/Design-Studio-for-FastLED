// The one text model behind the `string` port type.
//
// Both the evaluator and the C++ generator import this module, because a
// display that reads one thing in the browser and another on the bench is the
// failure this whole feature is judged on. Number rounding, truncation, and the
// "no reading" markers are decided here once; nothing downstream is allowed to
// invent its own.
//
// The rules are written for a fixed buffer, not a JavaScript string. Generated
// firmware carries `char[DISPLAY_TEXT_BUFFER_BYTES]` and `snprintf`, never an
// Arduino `String` that reallocates once per LED frame, so every function here
// has to produce something that fits a known budget.

import { FONT, type BitmapFont, DEFAULT_FONT } from './font'

/**
 * Bytes a generated string may occupy, terminator excluded.
 *
 * Sized from the widest planned fixed layout: a 128 px OLED row at the shared
 * 3x5 font plus one column of spacing fits 32 characters, and 63 leaves room
 * for multi-byte input to be measured and truncated honestly rather than
 * arriving pre-clipped. It is deliberately small enough to sit on the stack of
 * an ESP32 loop without thought.
 */
export const DISPLAY_TEXT_MAX_BYTES = 63

/** Buffer size to declare in C++: the budget plus the NUL terminator. */
export const DISPLAY_TEXT_BUFFER_BYTES = DISPLAY_TEXT_MAX_BYTES + 1

/**
 * Appended when text is cut short.
 *
 * Three ASCII dots rather than U+2026: the ellipsis character is three bytes of
 * UTF-8 and draws as nothing in the shared bitmap font, so a truncated title
 * would silently lose its "there is more" marker on exactly the small displays
 * that need it most.
 */
export const DISPLAY_TEXT_ELLIPSIS = '...'

/** Stand-in for a character the target surface cannot draw. */
export const DISPLAY_TEXT_GLYPH_FALLBACK = '?'

/**
 * Shown instead of a number that has no value — NaN, an infinity, or a clock
 * whose reading is not valid.
 *
 * Dashes are the segment-display convention for "no reading", and they are
 * visibly different from a zero, which is what a silent fallback to `0` would
 * look like.
 */
export const DISPLAY_TEXT_NO_READING = '---'

/**
 * Shown instead of a number too large for its configured field.
 *
 * Distinct from `DISPLAY_TEXT_NO_READING` on purpose: "the sensor is not
 * reporting" and "the value does not fit the field you configured" are
 * different problems with different fixes, and one marker for both would hide
 * a layout mistake behind an apparent wiring fault.
 */
export const DISPLAY_TEXT_OVERFLOW = 'EEE'

/** Bytes `text` occupies when encoded as UTF-8. */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < 0x80) bytes += 1
    else if (cp < 0x800) bytes += 2
    else if (cp < 0x10000) bytes += 3
    else bytes += 4
  }
  return bytes
}

/**
 * Cut `text` to `maxBytes` of UTF-8, appending `ellipsis` when anything was
 * dropped.
 *
 * Iteration is by code point, so a multi-byte character is either kept whole or
 * dropped whole. Cutting a UTF-8 sequence in half produces bytes no decoder
 * accepts, and on a device that means a corrupt glyph rather than a clipped
 * word.
 *
 * When the budget cannot even hold the ellipsis, the ellipsis is dropped and
 * the text is hard-cut — a field too small to say "there is more" is still
 * better used showing the first characters than showing only dots.
 */
export function truncateUtf8(
  text: string,
  maxBytes: number = DISPLAY_TEXT_MAX_BYTES,
  ellipsis: string = DISPLAY_TEXT_ELLIPSIS,
): string {
  const budget = Math.max(0, Math.floor(maxBytes))
  if (budget === 0) return ''
  if (utf8ByteLength(text) <= budget) return text

  const markerBytes = utf8ByteLength(ellipsis)
  const useMarker = markerBytes < budget
  const contentBudget = useMarker ? budget - markerBytes : budget

  let out = ''
  let used = 0
  for (const ch of text) {
    const size = utf8ByteLength(ch)
    if (used + size > contentBudget) break
    out += ch
    used += size
  }
  return useMarker ? out + ellipsis : out
}

/** Characters the shared bitmap font can draw, after its uppercase folding. */
export function supportedGlyphs(font: BitmapFont = DEFAULT_FONT): Set<string> {
  return new Set(Object.keys(font.glyphs ?? FONT))
}

/**
 * Replace every character the target font cannot draw.
 *
 * Applied by a rendering surface, not by the `string` type itself: a 3x5 LED
 * font and an LVGL screen have very different coverage, so folding text down to
 * the smallest common set at the wire would make every display as limited as
 * the most limited one. `textColumns` in `font.ts` already uppercases, so the
 * same fold happens here before the lookup.
 */
export function coerceGlyphs(
  text: string,
  font: BitmapFont = DEFAULT_FONT,
  fallback: string = DISPLAY_TEXT_GLYPH_FALLBACK,
): string {
  const glyphs = supportedGlyphs(font)
  let out = ''
  for (const ch of text.toUpperCase()) out += glyphs.has(ch) ? ch : fallback
  return out
}

/**
 * Normalise anything the graph hands a `string` port into a bounded single
 * line.
 *
 * Control characters and newlines are folded to spaces rather than passed
 * through: a fixed display row has no second line to put them on, and a raw
 * `\n` reaching a driver is a rendering artefact on some controllers and a
 * command on others.
 */
export function displayString(value: unknown, maxBytes: number = DISPLAY_TEXT_MAX_BYTES): string {
  const raw = value === null || value === undefined ? '' : String(value)
  let flattened = ''
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0
    flattened += (cp < 0x20 || cp === 0x7f) ? ' ' : ch
  }
  return truncateUtf8(flattened, maxBytes)
}

/** How `FormatNumber` turns a value into text. */
export interface NumberTextFormat {
  /** Digits after the point, 0–4. */
  decimals: number
  /** Minimum integer digits, zero-padded on the left. 1 means no padding. */
  padWidth: number
  /** Show a `+` on positive values. Negatives always show `-`. */
  showSign: boolean
  /** Integer digits the field can hold before the value is an overflow. */
  maxIntegerDigits: number
  prefix: string
  suffix: string
}

export const DEFAULT_NUMBER_FORMAT: NumberTextFormat = {
  decimals: 0,
  padWidth: 1,
  showSign: false,
  maxIntegerDigits: 6,
  prefix: '',
  suffix: '',
}

export function normalizeNumberFormat(props: Record<string, unknown>): NumberTextFormat {
  const int = (value: unknown, def: number, min: number, max: number) => {
    const n = Math.round(Number(value))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
  }
  return {
    decimals: int(props.decimals, DEFAULT_NUMBER_FORMAT.decimals, 0, 4),
    padWidth: int(props.padWidth, DEFAULT_NUMBER_FORMAT.padWidth, 1, 8),
    showSign: props.showSign === true,
    maxIntegerDigits: int(props.maxIntegerDigits, DEFAULT_NUMBER_FORMAT.maxIntegerDigits, 1, 9),
    prefix: displayString(props.prefix ?? '', 8),
    suffix: displayString(props.suffix ?? '', 8),
  }
}

/**
 * Round `value` to `decimals` places as a scaled integer, half away from zero.
 *
 * Deliberately not `toFixed` and deliberately not `%.*f`. Both round ties by
 * rules that differ between JavaScript and a C library's current rounding mode,
 * and a BPM readout that shows 119 in the browser and 120 on the device is the
 * kind of disagreement nobody thinks to test for. Generated firmware runs this
 * same scale-and-round in `double`, so the two agree by construction rather
 * than by coincidence.
 *
 * Returns null when the value has no finite rounding.
 */
export function scaleAndRound(value: number, decimals: number): number | null {
  if (!Number.isFinite(value)) return null
  const scale = 10 ** decimals
  const scaled = value < 0 ? -Math.round(-value * scale) : Math.round(value * scale)
  return Number.isFinite(scaled) ? scaled : null
}

/** Render `value` through `format`, or one of the marker strings. */
export function formatNumberText(value: number, format: NumberTextFormat): string {
  const scaled = scaleAndRound(value, format.decimals)
  if (scaled === null) return format.prefix + DISPLAY_TEXT_NO_READING + format.suffix

  const negative = scaled < 0
  const magnitude = Math.abs(scaled)
  const scale = 10 ** format.decimals
  const whole = Math.floor(magnitude / scale)
  const fraction = magnitude % scale

  if (String(whole).length > format.maxIntegerDigits) {
    return format.prefix + DISPLAY_TEXT_OVERFLOW + format.suffix
  }

  const sign = negative ? '-' : format.showSign ? '+' : ''
  const wholeText = String(whole).padStart(format.padWidth, '0')
  const fractionText = format.decimals > 0 ? '.' + String(fraction).padStart(format.decimals, '0') : ''
  return format.prefix + sign + wholeText + fractionText + format.suffix
}

/** The clock readings `FormatDateTime` can render. */
export type DateTimeTextMode =
  | 'HH:MM'
  | 'HH:MM:SS'
  | 'YYYY-MM-DD'
  | 'DD-MM'
  | 'Weekday'
  | 'Weekday HH:MM'

export const DATE_TIME_TEXT_MODES: readonly DateTimeTextMode[] = [
  'HH:MM', 'HH:MM:SS', 'YYYY-MM-DD', 'DD-MM', 'Weekday', 'Weekday HH:MM',
]

/**
 * What each mode shows when the clock reading is not valid.
 *
 * A dashed mask the same shape as the real reading, so an unsynced clock looks
 * like a clock with no time rather than like a layout that broke. Falling back
 * to `00:00` would be a plausible-looking lie, and midnight is a time people
 * actually wait for.
 */
const DATE_TIME_BLANK: Record<DateTimeTextMode, string> = {
  'HH:MM': '--:--',
  'HH:MM:SS': '--:--:--',
  'YYYY-MM-DD': '----------',
  'DD-MM': '-----',
  Weekday: '---',
  'Weekday HH:MM': '--- --:--',
}

/** Uppercase because the shared bitmap font has no lower case. */
const WEEKDAY_TEXT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

/** The clock fields `FormatDateTime` reads; a subset of `RtcSnapshot`. */
export interface DateTimeTextFields {
  hour: number
  minute: number
  second: number
  weekday: number
  day: number
  month: number
  year: number
  valid: boolean
}

export function asDateTimeTextMode(value: unknown): DateTimeTextMode {
  const mode = String(value ?? '')
  return (DATE_TIME_TEXT_MODES as readonly string[]).includes(mode)
    ? (mode as DateTimeTextMode)
    : 'HH:MM'
}

function pad2(value: number): string {
  const n = Math.abs(Math.round(value)) % 100
  return String(n).padStart(2, '0')
}

export function formatDateTimeText(fields: DateTimeTextFields | null, mode: DateTimeTextMode): string {
  if (!fields || fields.valid !== true) return DATE_TIME_BLANK[mode]

  const weekday = WEEKDAY_TEXT[((Math.round(fields.weekday) % 7) + 7) % 7]
  const year = String(Math.abs(Math.round(fields.year)) % 10000).padStart(4, '0')

  switch (mode) {
    case 'HH:MM': return `${pad2(fields.hour)}:${pad2(fields.minute)}`
    case 'HH:MM:SS': return `${pad2(fields.hour)}:${pad2(fields.minute)}:${pad2(fields.second)}`
    case 'YYYY-MM-DD': return `${year}-${pad2(fields.month)}-${pad2(fields.day)}`
    case 'DD-MM': return `${pad2(fields.day)}-${pad2(fields.month)}`
    case 'Weekday': return weekday
    case 'Weekday HH:MM': return `${weekday} ${pad2(fields.hour)}:${pad2(fields.minute)}`
  }
}

/**
 * Escape `text` into the body of a C string literal.
 *
 * The reason this is strict rather than clever: a `TextValue`'s text is typed
 * by a user and lands in generated C++, which is exactly the interpolation path
 * CLAUDE.md requires to be validated against a known set first. So the rule is
 * allow-list, not escape-everything — printable ASCII survives with `"`, `\`,
 * `?` and the rest escaped, and anything outside that range becomes the glyph
 * fallback rather than being emitted as a byte sequence a compiler has to
 * interpret. Trigraph-forming `?` is escaped because `??/` is a backslash to a
 * conforming preprocessor.
 */
export function escapeCppStringBody(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < 0x20 || cp > 0x7e) { out += DISPLAY_TEXT_GLYPH_FALLBACK; continue }
    if (ch === '\\') { out += '\\\\'; continue }
    if (ch === '"') { out += '\\"'; continue }
    if (ch === '?') { out += '\\?'; continue }
    out += ch
  }
  return out
}

/** `text` as a complete, quoted C string literal. */
export function cppStringLiteral(text: string): string {
  return `"${escapeCppStringBody(text)}"`
}

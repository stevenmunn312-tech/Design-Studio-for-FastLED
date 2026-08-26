import { describe, it, expect } from 'vitest'
import { DEFAULT_FONT } from '../font'
import {
  DISPLAY_TEXT_MAX_BYTES,
  DISPLAY_TEXT_BUFFER_BYTES,
  DISPLAY_TEXT_ELLIPSIS,
  DISPLAY_TEXT_NO_READING,
  DISPLAY_TEXT_OVERFLOW,
  DISPLAY_TEXT_GLYPH_FALLBACK,
  utf8ByteLength,
  truncateUtf8,
  coerceGlyphs,
  displayString,
  scaleAndRound,
  formatNumberText,
  normalizeNumberFormat,
  formatDateTimeText,
  asDateTimeTextMode,
  DATE_TIME_TEXT_MODES,
  escapeCppStringBody,
  cppStringLiteral,
  DEFAULT_NUMBER_FORMAT,
  type NumberTextFormat,
  type DateTimeTextFields,
} from '../displayText'

const fmt = (over: Partial<NumberTextFormat> = {}): NumberTextFormat => ({ ...DEFAULT_NUMBER_FORMAT, ...over })

describe('utf8ByteLength', () => {
  it('counts bytes, not code units', () => {
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('é')).toBe(2)
    expect(utf8ByteLength('€')).toBe(3)
    // Outside the BMP: one code point, four bytes, two JS code units.
    expect(utf8ByteLength('😀')).toBe(4)
    expect('😀'.length).toBe(2)
  })
})

describe('truncateUtf8', () => {
  it('leaves text inside the budget alone', () => {
    expect(truncateUtf8('BPM 128', 32)).toBe('BPM 128')
  })

  it('appends the ellipsis when it drops anything', () => {
    expect(truncateUtf8('ABCDEFGHIJ', 8)).toBe('ABCDE...')
    expect(utf8ByteLength(truncateUtf8('ABCDEFGHIJ', 8))).toBeLessThanOrEqual(8)
  })

  // The failure this exists to prevent: half of a multi-byte sequence is not
  // text any decoder accepts, so a device renders garbage rather than a
  // clipped word.
  it('never splits a multi-byte character', () => {
    // '€' is three bytes; a budget of 4 after the marker cannot hold one.
    const out = truncateUtf8('€€€€', 6, '..')
    expect(out).toBe('€..')
    expect(utf8ByteLength(out)).toBeLessThanOrEqual(6)
    for (const ch of out) expect(ch.codePointAt(0)).toBeGreaterThan(0)
  })

  it('never emits a partial astral code point', () => {
    const out = truncateUtf8('😀😀😀', 7)
    expect(utf8ByteLength(out)).toBeLessThanOrEqual(7)
    expect(out.endsWith(DISPLAY_TEXT_ELLIPSIS)).toBe(true)
    expect([...out].every((ch) => ch === DISPLAY_TEXT_ELLIPSIS[0] || ch === '😀')).toBe(true)
  })

  it('drops the marker when the budget cannot hold it', () => {
    // Two bytes of field cannot say "there is more"; showing the first two
    // characters beats showing two dots.
    expect(truncateUtf8('ABCDEF', 2)).toBe('AB')
  })

  it('returns empty for a zero budget', () => {
    expect(truncateUtf8('ABC', 0)).toBe('')
  })
})

describe('coerceGlyphs', () => {
  it('folds to upper case and keeps drawable characters', () => {
    expect(coerceGlyphs('hello')).toBe('HELLO')
    expect(coerceGlyphs('12:30')).toBe('12:30')
  })

  it('replaces what the shared font cannot draw', () => {
    // Taken from the font rather than hardcoded: '#' used to stand for
    // "undrawable" here and quietly stopped meaning that the day it got a
    // glyph, which is a test asserting nothing.
    const missing = ['@', '~', '^', '|'].filter((ch) => !(ch in DEFAULT_FONT.glyphs))
    expect(missing.length, 'the font now draws everything this test relied on').toBeGreaterThan(0)
    for (const ch of missing) {
      expect(coerceGlyphs(`A${ch}B`)).toBe(`A${DISPLAY_TEXT_GLYPH_FALLBACK}B`)
    }
    expect(coerceGlyphs('café')).toBe(`CAF${DISPLAY_TEXT_GLYPH_FALLBACK}`)
  })

  // Titles come from a stranger's ID3 tags, so the punctuation in them has to
  // survive: an elapsed/duration row read "0:00?7:49" before '/' had a glyph.
  it('draws the punctuation a track title actually contains', () => {
    expect(coerceGlyphs("0:00/7:49")).toBe('0:00/7:49')
    expect(coerceGlyphs("DON'T STOP (REMIX) & MORE")).toBe("DON'T STOP (REMIX) & MORE")
  })
})

describe('displayString', () => {
  it('bounds to the shared budget', () => {
    const long = 'A'.repeat(200)
    expect(utf8ByteLength(displayString(long))).toBeLessThanOrEqual(DISPLAY_TEXT_MAX_BYTES)
  })

  it('flattens control characters to spaces', () => {
    const raw = 'A' + String.fromCharCode(10) + 'B' + String.fromCharCode(9) + 'C' + String.fromCharCode(127)
    expect(displayString(raw)).toBe('A B C ')
  })

  it('treats null and undefined as empty', () => {
    expect(displayString(null)).toBe('')
    expect(displayString(undefined)).toBe('')
  })

  it('leaves one byte for the terminator', () => {
    expect(DISPLAY_TEXT_BUFFER_BYTES).toBe(DISPLAY_TEXT_MAX_BYTES + 1)
  })
})

describe('scaleAndRound', () => {
  // Ties round away from zero in both directions. `Math.round` alone rounds
  // half toward +Infinity, which would disagree with the firmware's own
  // rounding on every negative tie.
  it('rounds halves away from zero symmetrically', () => {
    expect(scaleAndRound(0.5, 0)).toBe(1)
    expect(scaleAndRound(-0.5, 0)).toBe(-1)
    expect(scaleAndRound(1.5, 0)).toBe(2)
    expect(scaleAndRound(-1.5, 0)).toBe(-2)
    expect(scaleAndRound(2.5, 0)).toBe(3)
    expect(scaleAndRound(-2.5, 0)).toBe(-3)
  })

  it('scales by the decimal count', () => {
    expect(scaleAndRound(1.234, 2)).toBe(123)
    expect(scaleAndRound(1.235, 2)).toBe(124)
    expect(scaleAndRound(-1.235, 2)).toBe(-124)
  })

  it('reports no rounding for non-finite input', () => {
    expect(scaleAndRound(NaN, 0)).toBeNull()
    expect(scaleAndRound(Infinity, 0)).toBeNull()
    expect(scaleAndRound(-Infinity, 2)).toBeNull()
  })
})

describe('formatNumberText', () => {
  it('formats whole numbers', () => {
    expect(formatNumberText(128, fmt())).toBe('128')
    expect(formatNumberText(0, fmt())).toBe('0')
  })

  it('shows negatives with a sign and positives only when asked', () => {
    expect(formatNumberText(-7, fmt())).toBe('-7')
    expect(formatNumberText(7, fmt({ showSign: true }))).toBe('+7')
    expect(formatNumberText(-7, fmt({ showSign: true }))).toBe('-7')
  })

  it('places decimals and pads the fraction', () => {
    expect(formatNumberText(1.5, fmt({ decimals: 2 }))).toBe('1.50')
    expect(formatNumberText(1.004, fmt({ decimals: 2 }))).toBe('1.00')
    expect(formatNumberText(-0.05, fmt({ decimals: 2 }))).toBe('-0.05')
  })

  it('zero-pads the integer part to the field width', () => {
    expect(formatNumberText(7, fmt({ padWidth: 3 }))).toBe('007')
    expect(formatNumberText(-7, fmt({ padWidth: 3 }))).toBe('-007')
  })

  it('carries a rounded fraction into the integer part', () => {
    expect(formatNumberText(9.99, fmt({ decimals: 1 }))).toBe('10.0')
  })

  it('marks a value with no reading rather than showing zero', () => {
    expect(formatNumberText(NaN, fmt())).toBe(DISPLAY_TEXT_NO_READING)
    expect(formatNumberText(Infinity, fmt())).toBe(DISPLAY_TEXT_NO_READING)
  })

  it('marks an overflow distinctly from a missing reading', () => {
    expect(formatNumberText(12345, fmt({ maxIntegerDigits: 4 }))).toBe(DISPLAY_TEXT_OVERFLOW)
    expect(DISPLAY_TEXT_OVERFLOW).not.toBe(DISPLAY_TEXT_NO_READING)
  })

  it('keeps prefix and suffix around every outcome', () => {
    const decorated = fmt({ prefix: 'T', suffix: 'C' })
    expect(formatNumberText(21, decorated)).toBe('T21C')
    expect(formatNumberText(NaN, decorated)).toBe(`T${DISPLAY_TEXT_NO_READING}C`)
    expect(formatNumberText(1e9, fmt({ prefix: 'T', suffix: 'C', maxIntegerDigits: 3 })))
      .toBe(`T${DISPLAY_TEXT_OVERFLOW}C`)
  })
})

describe('normalizeNumberFormat', () => {
  it('clamps out-of-range settings instead of trusting them', () => {
    const f = normalizeNumberFormat({ decimals: 99, padWidth: -4, maxIntegerDigits: 400 })
    expect(f.decimals).toBe(4)
    expect(f.padWidth).toBe(1)
    expect(f.maxIntegerDigits).toBe(9)
  })

  it('falls back for unparseable settings', () => {
    const f = normalizeNumberFormat({ decimals: 'lots', padWidth: null })
    expect(f.decimals).toBe(DEFAULT_NUMBER_FORMAT.decimals)
    expect(f.padWidth).toBe(DEFAULT_NUMBER_FORMAT.padWidth)
  })

  it('bounds prefix and suffix', () => {
    const f = normalizeNumberFormat({ prefix: 'X'.repeat(50) })
    expect(utf8ByteLength(f.prefix)).toBeLessThanOrEqual(8)
  })
})

describe('formatDateTimeText', () => {
  const clock: DateTimeTextFields = {
    hour: 9, minute: 5, second: 3, weekday: 1, day: 4, month: 7, year: 2026, valid: true,
  }

  it('renders each mode', () => {
    expect(formatDateTimeText(clock, 'HH:MM')).toBe('09:05')
    expect(formatDateTimeText(clock, 'HH:MM:SS')).toBe('09:05:03')
    expect(formatDateTimeText(clock, 'YYYY-MM-DD')).toBe('2026-07-04')
    expect(formatDateTimeText(clock, 'DD-MM')).toBe('04-07')
    expect(formatDateTimeText(clock, 'Weekday')).toBe('MON')
    expect(formatDateTimeText(clock, 'Weekday HH:MM')).toBe('MON 09:05')
  })

  // Midnight is a time people wait for, so an unsynced clock must not show it.
  it('shows a dashed mask rather than a plausible time when invalid', () => {
    const invalid = { ...clock, valid: false }
    expect(formatDateTimeText(invalid, 'HH:MM')).toBe('--:--')
    expect(formatDateTimeText(invalid, 'HH:MM:SS')).toBe('--:--:--')
    expect(formatDateTimeText(null, 'Weekday HH:MM')).toBe('--- --:--')
    for (const mode of DATE_TIME_TEXT_MODES) {
      expect(formatDateTimeText(invalid, mode)).not.toMatch(/[0-9]/)
    }
  })

  it('renders a blank mask the same width as the real reading', () => {
    for (const mode of DATE_TIME_TEXT_MODES) {
      const live = formatDateTimeText(clock, mode)
      const blank = formatDateTimeText(null, mode)
      expect(blank.length, mode).toBe(live.length)
    }
  })

  it('wraps a weekday index safely', () => {
    expect(formatDateTimeText({ ...clock, weekday: 7 }, 'Weekday')).toBe('SUN')
    expect(formatDateTimeText({ ...clock, weekday: -1 }, 'Weekday')).toBe('SAT')
  })

  it('rolls the clock over rather than printing three digits', () => {
    expect(formatDateTimeText({ ...clock, hour: 23, minute: 59, second: 59 }, 'HH:MM:SS')).toBe('23:59:59')
    expect(formatDateTimeText({ ...clock, hour: 24, minute: 0 }, 'HH:MM')).toBe('24:00')
  })

  it('falls back to a known mode for unknown input', () => {
    expect(asDateTimeTextMode('nonsense')).toBe('HH:MM')
    expect(asDateTimeTextMode(undefined)).toBe('HH:MM')
    expect(asDateTimeTextMode('DD-MM')).toBe('DD-MM')
  })
})

describe('escapeCppStringBody', () => {
  it('passes ordinary text through', () => {
    expect(escapeCppStringBody('BPM 128')).toBe('BPM 128')
  })

  // A TextValue's text is typed by a user and ends up in generated C++, so the
  // rule is an allow-list rather than an escape pass: anything outside
  // printable ASCII becomes the fallback glyph instead of a byte a compiler has
  // to interpret.
  it('cannot break out of the literal', () => {
    const hostile = [
      '"); evil(); //',
      'a\\b',
      'line' + String.fromCharCode(10) + 'break',
      String.fromCharCode(0) + 'nul',
      '??/',
      '‮' + 'rtl-override',
      '😀',
    ]
    for (const text of hostile) {
      const literal = cppStringLiteral(text)
      expect(literal.startsWith('"') && literal.endsWith('"'), text).toBe(true)
      // No raw newline, NUL, or trigraph-forming sequence survives.
      expect(literal, text).not.toContain(String.fromCharCode(10))
      expect(literal, text).not.toContain(String.fromCharCode(0))
      expect(literal, text).not.toMatch(/\?\?[=/'()!<>-]/)

      // Every backslash introduces a recognised escape, and once the valid
      // escapes are removed nothing is left that could close the literal
      // early. Counting raw quotes would not do: `\"` legitimately contains
      // one.
      const body = literal.slice(1, -1)
      for (let i = 0; i < body.length; i++) {
        if (body[i] !== '\\') continue
        expect(['\\', '"', '?'], text).toContain(body[i + 1])
        i++
      }
      const withoutEscapes = body.replace(/\\[\\"?]/g, '')
      expect(withoutEscapes, text).not.toContain('"')
      expect(withoutEscapes, text).not.toContain('\\')
    }
  })

  it('replaces non-ASCII with the fallback glyph', () => {
    expect(escapeCppStringBody('café')).toBe(`caf${DISPLAY_TEXT_GLYPH_FALLBACK}`)
  })
})

import { describe, it, expect } from 'vitest'
import {
  SEGMENT_DIGITS,
  SEGMENT_DISPLAY_MODES,
  asSegmentMode,
  clampSegmentBrightness,
  SEGMENT_BRIGHTNESS_MIN,
  SEGMENT_BRIGHTNESS_MAX,
  renderSegmentNumber,
  renderSegmentClock,
  renderSegmentIndex,
  segmentFrameText,
  segmentBytes,
  SEGMENT_GLYPHS,
  BLANK_SEGMENT_FRAME,
} from '../segmentDisplay'

const num = (value: number, decimals = 0, leadingZero = false) =>
  renderSegmentNumber(value, { decimals, leadingZero })

describe('segment modes', () => {
  it('falls back to a known mode', () => {
    expect(asSegmentMode('Clock')).toBe('Clock')
    expect(asSegmentMode('nonsense')).toBe('Number')
    expect(asSegmentMode(undefined)).toBe('Number')
    expect(SEGMENT_DISPLAY_MODES).toContain('Index')
  })

  it('clamps brightness to what the module has', () => {
    expect(clampSegmentBrightness(99)).toBe(SEGMENT_BRIGHTNESS_MAX)
    expect(clampSegmentBrightness(-5)).toBe(SEGMENT_BRIGHTNESS_MIN)
    expect(clampSegmentBrightness('bright')).toBe(4)
  })
})

describe('renderSegmentNumber', () => {
  it('always fills exactly four digits', () => {
    for (const value of [0, 7, 42, 1234, -1, -99]) {
      expect(num(value).digits.length, String(value)).toBe(SEGMENT_DIGITS)
    }
  })

  it('right-aligns and blank-pads by default', () => {
    expect(num(7).digits).toBe('   7')
    expect(num(42).digits).toBe('  42')
    expect(num(1234).digits).toBe('1234')
  })

  it('zero-pads when asked, so the number stops shifting', () => {
    expect(num(7, 0, true).digits).toBe('0007')
    expect(num(42, 0, true).digits).toBe('0042')
  })

  it('keeps the minus sign inside the field', () => {
    expect(num(-7).digits).toBe('  -7')
    expect(num(-999).digits).toBe('-999')
    expect(num(-7, 0, true).digits).toBe('-007')
  })

  it('places the decimal point by digit index', () => {
    const one = num(12.3, 1)
    expect(one.digits).toBe(' 123')
    expect(one.decimalAt).toBe(2)
    expect(segmentFrameText(one)).toBe(' 12.3')
  })

  // Rounding runs through the same scaleAndRound the text nodes and the
  // firmware use, so one value cannot read two ways.
  it('rounds halves away from zero', () => {
    expect(num(0.5).digits.trim()).toBe('1')
    expect(num(-0.5).digits.trim()).toBe('-1')
    expect(num(1.5).digits.trim()).toBe('2')
    expect(num(-1.5).digits.trim()).toBe('-2')
  })

  // 2.45 is 2.4500000000000002 in binary, so scaling lands just above the tie
  // and rounds up. Asserted rather than avoided: the generated firmware scales
  // in double for exactly this reason, and a change to either side that broke
  // the agreement would show up here.
  it('scales before rounding, binary representation and all', () => {
    expect(segmentFrameText(num(2.45, 1))).toBe('  2.5')
    expect(segmentFrameText(num(2.44, 1))).toBe('  2.4')
  })

  // Truncating to the low four digits would show a confidently wrong number on
  // a display whose whole job is to be read at a glance.
  it('shows dashes rather than a wrong number when it will not fit', () => {
    expect(num(12345).digits).toBe('----')
    expect(num(-1234).digits).toBe('----')
  })

  it('shows dashes for a value with no reading', () => {
    expect(num(Number.NaN).digits).toBe('----')
    expect(num(Number.POSITIVE_INFINITY).digits).toBe('----')
  })

  it('clamps an absurd decimal setting rather than trusting it', () => {
    expect(num(1, 99).digits.length).toBe(SEGMENT_DIGITS)
  })
})

describe('renderSegmentClock', () => {
  it('renders HH:MM with the colon as a separate signal', () => {
    const frame = renderSegmentClock(9, 5, true)
    expect(frame.digits).toBe('0905')
    expect(frame.colon).toBe(true)
    expect(segmentFrameText(frame)).toBe('09:05')
  })

  it('holds the colon dark when asked', () => {
    expect(renderSegmentClock(9, 5, false).colon).toBe(false)
  })

  it('wraps rather than overflowing its two digits', () => {
    expect(renderSegmentClock(23, 59, true).digits).toBe('2359')
    expect(renderSegmentClock(-1, 100, true).digits.length).toBe(SEGMENT_DIGITS)
  })
})

describe('renderSegmentIndex', () => {
  it('right-aligns the position', () => {
    expect(renderSegmentIndex(1).digits).toBe('   1')
    expect(renderSegmentIndex(12).digits).toBe('  12')
  })

  it('refuses a position it cannot show', () => {
    expect(renderSegmentIndex(99999).digits).toBe('----')
    expect(renderSegmentIndex(-1).digits).toBe('----')
  })
})

describe('segmentBytes', () => {
  it('writes nothing at all when the module is dark', () => {
    expect(segmentBytes(BLANK_SEGMENT_FRAME)).toEqual([0, 0, 0, 0])
  })

  it('maps digits through the shared glyph table', () => {
    const bytes = segmentBytes(num(8))
    expect(bytes[3]).toBe(SEGMENT_GLYPHS['8'])
    expect(bytes[0]).toBe(SEGMENT_GLYPHS[' '])
  })

  it('carries the decimal point on the digit it follows', () => {
    const bytes = segmentBytes(num(12.3, 1))
    expect(bytes[2] & 0x80).toBe(0x80)
    expect(bytes[3] & 0x80).toBe(0)
  })

  // The TM1637 carries the colon on the second digit's high bit rather than as
  // a character of its own.
  it('carries the colon on the second digit', () => {
    const bytes = segmentBytes(renderSegmentClock(12, 34, true))
    expect(bytes[1] & 0x80).toBe(0x80)
    expect(segmentBytes(renderSegmentClock(12, 34, false))[1] & 0x80).toBe(0)
  })

  it('always returns one byte per digit', () => {
    expect(segmentBytes(num(1)).length).toBe(SEGMENT_DIGITS)
  })
})

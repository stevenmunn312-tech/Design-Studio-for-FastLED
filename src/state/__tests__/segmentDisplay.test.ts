import { describe, it, expect } from 'vitest'
import {
  SEGMENT_CONTROLLERS,
  SEGMENT_DISPLAY_MODES,
  segmentControllerFor,
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
  blankSegmentFrame,
} from '../segmentDisplay'

const TM = SEGMENT_CONTROLLERS.TM1637
const MAX = SEGMENT_CONTROLLERS.MAX7219
const SEGMENT_DIGITS = TM.digits

const num = (value: number, decimals = 0, leadingZero = false) =>
  renderSegmentNumber(value, { decimals, leadingZero })

const num8 = (value: number, decimals = 0, leadingZero = false) =>
  renderSegmentNumber(value, { decimals, leadingZero, digits: MAX.digits })

describe('segment modes', () => {
  it('falls back to a known mode', () => {
    expect(asSegmentMode('Clock')).toBe('Clock')
    expect(asSegmentMode('nonsense')).toBe('Number')
    expect(asSegmentMode(undefined)).toBe('Number')
    expect(SEGMENT_DISPLAY_MODES).toContain('Index')
  })

  // A 4 is half brightness on a TM1637 and a quarter on a MAX7219, so the
  // ceiling has to come from the controller rather than one shared number.
  it('clamps brightness to what each controller actually has', () => {
    expect(clampSegmentBrightness(99, TM)).toBe(TM.brightnessMax)
    expect(clampSegmentBrightness(99, MAX)).toBe(MAX.brightnessMax)
    expect(TM.brightnessMax).not.toBe(MAX.brightnessMax)
    expect(clampSegmentBrightness(-5, TM)).toBe(SEGMENT_BRIGHTNESS_MIN)
    expect(clampSegmentBrightness('bright', TM)).toBe(4)
    expect(SEGMENT_BRIGHTNESS_MAX).toBe(MAX.brightnessMax)
  })

  it('describes each controller by what it physically is', () => {
    expect(TM).toMatchObject({ digits: 4, hasColon: true })
    expect(MAX).toMatchObject({ digits: 8, hasColon: false })
    expect(TM.pins).toEqual(['clkPin', 'dioPin'])
    expect(MAX.pins).toEqual(['clkPin', 'dinPin', 'csPin'])
  })

  it('resolves a controller from its declared name', () => {
    expect(segmentControllerFor('MAX7219').id).toBe('MAX7219')
    expect(segmentControllerFor('TM1637').id).toBe('TM1637')
    expect(segmentControllerFor('SSD1306').id).toBe('TM1637')
    expect(segmentControllerFor(undefined).id).toBe('TM1637')
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
    expect(segmentBytes(blankSegmentFrame(TM.digits))).toEqual([0, 0, 0, 0])
    expect(segmentBytes(blankSegmentFrame(MAX.digits))).toEqual(new Array(8).fill(0))
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

describe('eight digits', () => {
  it('fills the wider module', () => {
    expect(num8(42).digits).toBe('      42')
    expect(num8(42, 0, true).digits).toBe('00000042')
    expect(num8(-42).digits).toBe('     -42')
  })

  // A number that overflows four digits fits eight, so the width has to be the
  // controller's rather than a shared constant.
  it('shows a value the narrow module has to refuse', () => {
    expect(num(123456).digits).toBe('----')
    expect(num8(123456).digits).toBe('  123456')
  })

  it('still refuses a value too wide even for eight', () => {
    expect(num8(1234567890).digits).toBe('--------')
  })

  it('shows seconds where there is room and drops them where there is not', () => {
    expect(renderSegmentClock(9, 5, false, MAX.digits, 30).digits).toBe('  090530')
    expect(renderSegmentClock(9, 5, false, TM.digits, 30).digits).toBe('0905')
  })

  it('right-aligns an index across either width', () => {
    expect(renderSegmentIndex(7, MAX.digits).digits).toBe('       7')
    expect(renderSegmentIndex(7, TM.digits).digits).toBe('   7')
  })

  it('always fills exactly the controller width', () => {
    for (const controller of [TM, MAX]) {
      for (const value of [0, 7, -1, Number.NaN, 99999999]) {
        const frame = renderSegmentNumber(value, { decimals: 0, leadingZero: false, digits: controller.digits })
        expect(frame.digits.length, `${controller.id} ${value}`).toBe(controller.digits)
      }
    }
  })
})

// The plan's Phase 3 edge-case list, for the cases the happy path never
// reaches. Most of these are the ways a module lies confidently: showing a
// truncated number, a folded NaN, or a plausible midnight is worse on a display
// whose whole job is to be read at a glance than showing nothing readable.
describe('edge cases', () => {
  describe('negatives', () => {
    it('zero-pads inside the minus sign rather than around it', () => {
      expect(renderSegmentNumber(-5, { decimals: 0, leadingZero: true }).digits).toBe('-005')
    })

    it('refuses a negative whose minus sign leaves no room', () => {
      // Four digits, three of them usable once the sign takes one.
      expect(renderSegmentNumber(-999, { decimals: 0, leadingZero: false }).digits).toBe('-999')
      expect(renderSegmentNumber(-1000, { decimals: 0, leadingZero: false }).digits).toBe('----')
    })

    it('keeps the decimal point where a sign has shifted the digits', () => {
      const frame = renderSegmentNumber(-1.5, { decimals: 1, leadingZero: false })
      expect(frame.digits).toBe(' -15')
      expect(segmentFrameText(frame)).toBe(' -1.5')
    })

    it('renders a rounded-away negative as a plain zero', () => {
      // -0.04 scales to -0, and -0 is not less than 0, so no sign is drawn.
      expect(segmentFrameText(renderSegmentNumber(-0.04, { decimals: 1, leadingZero: false }))).toBe('  0.0')
    })
  })

  describe('readings that are not numbers', () => {
    it('dashes rather than folding, in every mode', () => {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(renderSegmentNumber(value, { decimals: 0, leadingZero: false }).digits).toBe('----')
        // Folding to 0 here would put a confident "1st pattern" on a module
        // whose input is broken, and lroundf on a NaN is not obliged to fold
        // the same way the browser does.
        expect(renderSegmentIndex(value).digits).toBe('----')
      }
    })

    it('still lights the module while showing dashes', () => {
      expect(renderSegmentNumber(Number.NaN, { decimals: 0, leadingZero: false }).lit).toBe(true)
      expect(renderSegmentIndex(Number.NaN).lit).toBe(true)
    })
  })

  describe('clock rollover', () => {
    it('shows midnight rather than treating zero as nothing', () => {
      const frame = renderSegmentClock(0, 0, true)
      expect(frame.digits).toBe('0000')
      expect(frame.lit).toBe(true)
      expect(frame.colon).toBe(true)
    })

    it('rolls from the last minute of the day to the first', () => {
      expect(renderSegmentClock(23, 59, true).digits).toBe('2359')
      expect(renderSegmentClock(0, 0, true).digits).toBe('0000')
    })

    it('rolls the seconds field on a module wide enough to show it', () => {
      expect(renderSegmentClock(23, 59, false, MAX.digits, 59).digits).toBe('  235959')
      expect(renderSegmentClock(0, 0, false, MAX.digits, 0).digits).toBe('  000000')
    })

    it('keeps each field two digits wide whatever it is handed', () => {
      // The contract is width, not calendar sense: a field that overflowed its
      // two digits would shift every other digit and make the whole row wrong.
      expect(renderSegmentClock(123, 456, false).digits).toBe('2356')
    })
  })

  describe('decimal placement', () => {
    // The point is a segment on a digit, not a character between digits. With
    // nothing padded in front of it, a value under 1 lit the dot on an
    // otherwise blank digit — on the bench that reads as a fault, not as
    // "nought point four".
    it('keeps a whole digit in front of the point', () => {
      expect(segmentFrameText(renderSegmentNumber(0.4, { decimals: 1, leadingZero: false }))).toBe('  0.4')
      expect(segmentFrameText(renderSegmentNumber(0.05, { decimals: 2, leadingZero: false }))).toBe(' 0.05')
      expect(segmentFrameText(renderSegmentNumber(0, { decimals: 3, leadingZero: false }))).toBe('0.000')
    })

    it('keeps the sign outside that whole digit', () => {
      expect(segmentFrameText(renderSegmentNumber(-0.4, { decimals: 1, leadingZero: false }))).toBe(' -0.4')
    })

    it('refuses a precision that leaves no room for the sign', () => {
      // Three decimals fill all four digits; a negative has nowhere to put its
      // minus, so dashes rather than a number missing its sign.
      expect(renderSegmentNumber(-0.5, { decimals: 3, leadingZero: false }).digits).toBe('----')
      expect(renderSegmentNumber(0.5, { decimals: 3, leadingZero: false }).digits).toBe('0500')
    })

    it('has room for both on a wider module', () => {
      expect(segmentFrameText(renderSegmentNumber(-0.5, { decimals: 3, leadingZero: false, digits: MAX.digits })))
        .toBe('   -0.500')
    })
  })

  describe('brightness', () => {
    // 0 is the dimmest *on* level, not off. Anything that treats it as falsy
    // and substitutes a default makes the dim end of the slider unreachable.
    it('keeps a zero rather than substituting a default', () => {
      expect(clampSegmentBrightness(0, TM)).toBe(0)
      expect(clampSegmentBrightness(0, MAX)).toBe(0)
    })

    it('falls back only when there is no reading at all', () => {
      expect(clampSegmentBrightness(undefined, TM)).toBe(4)
      expect(clampSegmentBrightness(Number.NaN, TM)).toBe(4)
      expect(clampSegmentBrightness('nonsense', MAX)).toBe(4)
    })

    it('bounds each controller to the bits it actually reads', () => {
      expect(clampSegmentBrightness(15, TM)).toBe(TM.brightnessMax)
      expect(clampSegmentBrightness(15, MAX)).toBe(MAX.brightnessMax)
      expect(clampSegmentBrightness(-3, TM)).toBe(0)
    })

    it('lights every digit at the dimmest level, which is not the same as dark', () => {
      const frame = renderSegmentNumber(8, { decimals: 0, leadingZero: false })
      expect(segmentBytes(frame).some((byte) => byte !== 0)).toBe(true)
    })
  })
})

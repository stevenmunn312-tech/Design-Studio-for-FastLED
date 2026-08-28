import { describe, it, expect } from 'vitest'
import {
  SEGMENT_CONTROLLERS,
  SEGMENT_DISPLAY_MODES,
  segmentControllerFor,
  segmentModeForKind,
  segmentDashes,
  clampSegmentBrightness,
  SEGMENT_BRIGHTNESS_MIN,
  SEGMENT_BRIGHTNESS_MAX,
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

describe('segment modes', () => {
  // Not a property: what is plugged into Display decides, so every mode has
  // exactly one source that means it and no mode can be selected by mistake.
  it('takes its mode from the source plugged in', () => {
    expect(segmentModeForKind('clock')).toBe('Clock')
    expect(segmentModeForKind('player')).toBe('Elapsed')
    expect(segmentModeForKind('slideshow')).toBe('Index')
    expect(SEGMENT_DISPLAY_MODES).toContain('Waiting')
  })

  // A module that cannot spell "waiting for a signal" says it the way it
  // already says "no reading I trust".
  it('fills the module with dashes when it has nothing to show', () => {
    expect(segmentDashes(TM.digits).digits).toBe('----')
    expect(segmentDashes(MAX.digits).digits).toBe('--------')
    expect(segmentDashes(TM.digits).lit).toBe(true)
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
    const bytes = segmentBytes(renderSegmentIndex(8))
    expect(bytes[3]).toBe(SEGMENT_GLYPHS['8'])
    expect(bytes[0]).toBe(SEGMENT_GLYPHS[' '])
  })

  it('maps a dash through the same table', () => {
    expect(segmentBytes(segmentDashes(TM.digits))[0]).toBe(SEGMENT_GLYPHS['-'])
  })

  // The TM1637 carries the colon on the second digit's high bit rather than as
  // a character of its own.
  it('carries the colon on the second digit', () => {
    const bytes = segmentBytes(renderSegmentClock(12, 34, true))
    expect(bytes[1] & 0x80).toBe(0x80)
    expect(segmentBytes(renderSegmentClock(12, 34, false))[1] & 0x80).toBe(0)
  })

  it('always returns one byte per digit', () => {
    expect(segmentBytes(renderSegmentIndex(1)).length).toBe(SEGMENT_DIGITS)
  })
})

describe('eight digits', () => {
  it('fills the wider module', () => {
    expect(renderSegmentIndex(42, MAX.digits).digits).toBe('      42')
  })

  // A position that overflows four digits fits eight, so the width has to be
  // the controller's rather than a shared constant.
  it('shows a value the narrow module has to refuse', () => {
    expect(renderSegmentIndex(123456).digits).toBe('----')
    expect(renderSegmentIndex(123456, MAX.digits).digits).toBe('  123456')
  })

  it('still refuses a value too wide even for eight', () => {
    expect(renderSegmentIndex(1234567890, MAX.digits).digits).toBe('--------')
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
        const frame = renderSegmentIndex(value, controller.digits)
        expect(frame.digits.length, `${controller.id} ${value}`).toBe(controller.digits)
      }
      expect(segmentDashes(controller.digits).digits.length).toBe(controller.digits)
    }
  })
})

// The plan's Phase 3 edge-case list, for the cases the happy path never
// reaches. Most of these are the ways a module lies confidently: showing a
// truncated number, a folded NaN, or a plausible midnight is worse on a display
// whose whole job is to be read at a glance than showing nothing readable.
describe('edge cases', () => {
  describe('readings that are not numbers', () => {
    it('dashes rather than folding', () => {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        // Folding to 0 here would put a confident "1st pattern" on a module
        // whose input is broken, and lroundf on a NaN is not obliged to fold
        // the same way the browser does.
        expect(renderSegmentIndex(value).digits).toBe('----')
      }
    })

    it('still lights the module while showing dashes', () => {
      expect(renderSegmentIndex(Number.NaN).lit).toBe(true)
      expect(segmentDashes(TM.digits).lit).toBe(true)
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
      expect(segmentBytes(renderSegmentIndex(8)).some((byte) => byte !== 0)).toBe(true)
    })
  })
})

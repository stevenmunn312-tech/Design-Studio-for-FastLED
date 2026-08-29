import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { SEGMENT_DISPLAY_CPP_HELPERS } from '../segmentDisplayCpp'
import { SEGMENT_GLYPHS, SEGMENT_CONTROLLERS } from '../../state/segmentDisplay'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, sh: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const outputNode = node('out', 'MatrixOutput', 'output', {
  width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5,
})

const display = (props: Record<string, unknown> = {}) =>
  node('seg', 'SegmentDisplay', 'output', {
    partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19, brightness: 4, ...props,
  })

const max7219 = (props: Record<string, unknown> = {}) =>
  node('seg', 'SegmentDisplay', 'output', {
    partId: 'max7219-8digit-7segment', clkPin: 18, dinPin: 23, csPin: 5, brightness: 8, ...props,
  })

describe('segment display helpers', () => {
  // A second glyph table typed from memory is how a `6` ends up missing its top
  // bar on hardware and nowhere else.
  it('generates its glyph table from the shared map', () => {
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    const expected = digits.map((d) => `0x${SEGMENT_GLYPHS[d].toString(16).padStart(2, '0')}`).join(', ')
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain(expected)
  })

  it('sizes its buffer for the widest controller', () => {
    const widest = Math.max(...Object.values(SEGMENT_CONTROLLERS).map((c) => c.digits))
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain(`#define SEG_MAX_DIGITS ${widest}`)
  })

  // A bit-banged four-byte transfer every LED frame would cost more than the
  // render it is reporting on.
  it('writes only on a change or a refresh deadline', () => {
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('if (!changed && (now - d.lastWriteMs) < SEG_REFRESH_MS) return;')
  })

  it('needs no external driver library', () => {
    expect(SEGMENT_DISPLAY_CPP_HELPERS).not.toContain('#include')
  })

  it('supports the E prefix on both controller transports', () => {
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain("if (c == 'E') return _segE;")
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain("if (c == 'E') { value = _segMaxE; return true; }")
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('_maxSend(d, 0x09, decodeMask);')
  })
})

describe('generateCpp with a segment display', () => {
  it('configures the module in setup and services it in the loop', () => {
    const src = generateCpp([outputNode, display()], [])
    expect(src).toContain('_segBegin(_seg_seg, SEG_KIND_TM1637, 4, 18, 19,')
    expect(src).toContain('_segWrite(_seg_seg,')
    expect(src).toContain('static SegDisplay _seg_seg;')
  })

  // The change this slice exists for. A display is never upstream of an LED
  // output, so walking back only from MatrixOutput would prune it and leave the
  // part dark on a board that compiled and uploaded cleanly.
  it('survives the prune despite feeding no LED output', () => {
    const src = generateCpp([outputNode, display()], [])
    expect(src).toContain('_seg_seg')
  })

  it('keeps what feeds a display alive too', () => {
    const nodes = [outputNode, node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' }), display()]
    const src = generateCpp(nodes, [edge('e', 'rtc', 'seg', 'display', 'display')])
    expect(src).toContain('n_rtc_dateTime')
    expect(src).toContain('_segClock(_segBuf_seg, 4, n_rtc_dateTime.hour')
  })

  it('leaves the driver out of a sketch with no display', () => {
    const src = generateCpp([outputNode], [])
    expect(src).not.toContain('SegDisplay')
    expect(src).not.toContain('_segBegin')
  })

  it('emits the driver once for several displays', () => {
    const second = node('seg2', 'SegmentDisplay', 'output', {
      partId: 'tm1637-4digit-display', clkPin: 21, dioPin: 22, brightness: 2,
    })
    const src = generateCpp([outputNode, display(), second], [])
    expect(src.split('static void _segBegin').length - 1).toBe(1)
    expect(src).toContain('_segBegin(_seg_seg, SEG_KIND_TM1637, 4, 18, 19,')
    expect(src).toContain('_segBegin(_seg_seg2, SEG_KIND_TM1637, 4, 21, 22,')
  })

  // A normal sketch has one source it can answer for, so the module shows the
  // time or it shows dashes.
  it('renders the mode the wire implies', () => {
    const nodes = [outputNode, node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' }), display()]
    expect(generateCpp(nodes, [edge('e', 'rtc', 'seg', 'display', 'display')])).toContain('_segClock(')
    // Unplugged: dashes, which is this module's way of saying it is waiting.
    expect(generateCpp([outputNode, display()], [])).toContain('_segAllDash(_segBuf_seg, 4);')
  })

  // No trustworthy clock reading shows dashes, never a plausible midnight.
  it('reads a wired clock struct and dashes what it cannot trust', () => {
    const nodes = [outputNode, node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' }), display()]
    const src = generateCpp(nodes, [edge('e', 'rtc', 'seg', 'display', 'display')])
    expect(src).toContain('n_rtc_dateTime.valid')
    expect(src).toContain('n_rtc_dateTime.hour')
    expect(src).toContain('_segAllDash(_segBuf_seg, 4);')
  })

  it('honours a disabled module', () => {
    const src = generateCpp([outputNode, display({ enabled: false })], [])
    expect(src).toContain('bool _segOn_seg = false;')
    expect(src).toContain('_segBlankAll(_segBuf_seg, 4);')
  })

  it('clamps a hostile brightness rather than emitting it', () => {
    // A TM1637 reads three brightness bits, a MAX7219 four, so the ceiling is
    // the controller's rather than one shared number.
    expect(generateCpp([outputNode, display({ brightness: 999 })], []))
      .toContain('_segBegin(_seg_seg, SEG_KIND_TM1637, 4, 18, 19, 21, 7);')
    expect(generateCpp([outputNode, max7219({ brightness: 999 })], []))
      .toContain('_segBegin(_seg_seg, SEG_KIND_MAX7219, 8, 18, 23, 5, 15);')
  })

  // Wall-clock driven, like every other animation here.
  it('blinks the clock colon from millis rather than a frame counter', () => {
    const nodes = [outputNode, node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' }), display({ showColon: true })]
    const src = generateCpp(nodes, [edge('e', 'rtc', 'seg', 'display', 'display')])
    expect(src).toContain('((millis() / 1000) % 2) == 0')
  })
})

describe('MAX7219', () => {
  it('wires its own three lines and eight digits', () => {
    const src = generateCpp([outputNode, max7219()], [])
    expect(src).toContain('_segBegin(_seg_seg, SEG_KIND_MAX7219, 8, 18, 23, 5, 8);')
  })

  // The MAX7219 numbers its segment bits the opposite way to the TM1637, so raw
  // bytes would need a second reversed glyph table — one more place for a 6 to
  // lose its top bar on one controller only. Code B has the chip decode instead.
  it('drives digits through Code B decode rather than a second glyph table', () => {
    const src = generateCpp([outputNode, max7219()], [])
    expect(src).toContain('_maxSend(d, 0x09, 0xFF);')
    expect(src).toContain('static uint8_t _maxCodeB(char c)')
  })

  it('sets its scan limit from the digit count', () => {
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('_maxSend(d, 0x0B, (uint8_t)(digits - 1));')
  })

  it('renders across eight digits', () => {
    const src = generateCpp([outputNode, max7219()], [])
    expect(src).toContain('_segAllDash(_segBuf_seg, 8);')
  })

  // The module has no colon segment, so asking for one must not emit a write to
  // a bit that does not exist.
  it('never asks a colonless module for a colon', () => {
    const nodes = [outputNode, node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' }), max7219({ showColon: true })]
    const src = generateCpp(nodes, [edge('e', 'rtc', 'seg', 'display', 'display')])
    expect(src).toContain('_segWrite(_seg_seg, _segBuf_seg, _segDec_seg, false,')
  })

  it('shows seconds where the TM1637 cannot', () => {
    const nodes = [outputNode, node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' }), max7219()]
    const src = generateCpp(nodes, [edge('e', 'rtc', 'seg', 'display', 'display')])
    expect(src).toMatch(/_segClock\(_segBuf_seg, 8, .*\.second\)/)
  })

  it('shares one driver with a TM1637 in the same sketch', () => {
    const tm = node('seg2', 'SegmentDisplay', 'output', {
      partId: 'tm1637-4digit-display', clkPin: 21, dioPin: 22,
    })
    const src = generateCpp([outputNode, max7219(), tm], [])
    expect(src.split('static void _segBegin').length - 1).toBe(1)
    expect(src).toContain('SEG_KIND_MAX7219')
    expect(src).toContain('SEG_KIND_TM1637')
  })
})

// The plan's Phase 3 edge-case list on the generated side. The characters
// themselves are the shared renderer's job and are tested in
// state/__tests__/segmentDisplay.test.ts; what matters here is that the emitted
// C++ carries the same rules and that two modules stay independent.
describe('segment display edge cases', () => {
  it('guards a non-finite reading before rounding it', () => {
    // lroundf on a NaN is unspecified, so folding first would let the firmware
    // disagree with the browser about a reading neither of them has.
    const body = (fn: string) => {
      const start = SEGMENT_DISPLAY_CPP_HELPERS.indexOf(`static void ${fn}(`)
      expect(start, fn).toBeGreaterThan(-1)
      // Up to the next function declaration, so an assertion cannot be
      // satisfied by a mention in a neighbouring helper's comment.
      const end = SEGMENT_DISPLAY_CPP_HELPERS.indexOf('static void ', start + 1)
      return SEGMENT_DISPLAY_CPP_HELPERS.slice(start, end < 0 ? undefined : end)
    }
    const index = body('_segIndex')
    expect(index).toContain('static void _segIndex(char *out, uint8_t digits, float value)')
    expect(index.indexOf('if (!isfinite(value))')).toBeLessThan(index.indexOf('long index = lroundf('))
  })

  // The cast only ever existed at the call site, where it rounded before the
  // helper could check the reading was a number at all.
  it('never pre-rounds a reading at the call site', () => {
    expect(generateCpp([outputNode, display()], [])).not.toContain('(long)lroundf(')
  })

  it('refuses a negative index rather than dropping its sign', () => {
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('if (index < 0 || len > digits) { _segAllDash(out, digits); return; }')
  })

  // 0 is the dimmest *on* level on both controllers. Anything treating it as
  // falsy and reaching for a default makes the bottom of the slider
  // unreachable on hardware only.
  it('emits a zero brightness rather than substituting a default', () => {
    expect(generateCpp([outputNode, display({ brightness: 0 })], []))
      .toContain('_segBegin(_seg_seg, SEG_KIND_TM1637, 4, 18, 19, 21, 0);')
    expect(generateCpp([outputNode, max7219({ brightness: 0 })], []))
      .toContain('_segBegin(_seg_seg, SEG_KIND_MAX7219, 8, 18, 23, 5, 0);')
  })

  it('keeps a dimmest-on module out of shutdown', () => {
    // TM1637: 0x88 is display-on plus brightness bits; 0x80 is display-off.
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('lit ? (uint8_t)(0x88 | (d.brightness & 0x07)) : (uint8_t)0x80')
    // MAX7219: shutdown is register 0x0C, never the intensity register.
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('if (!lit) { _maxSend(d, 0x0C, 0x00); return; }')
  })

  it('rolls each clock field within its two digits', () => {
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('abs(hour) % 100')
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('abs(minute) % 100')
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('abs(second) % 100')
  })

  describe('two modules in one sketch', () => {
    const pair = () => [
      outputNode,
      node('a', 'SegmentDisplay', 'output', {
        partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19,
        segmentMode: 'Number', value: 42, brightness: 1,
      }),
      node('b', 'SegmentDisplay', 'output', {
        partId: 'max7219-8digit-7segment', clkPin: 12, dinPin: 13, csPin: 14,
        segmentMode: 'Index', value: 7, brightness: 9,
      }),
    ]

    it('gives each its own state, buffer and setup call', () => {
      const src = generateCpp(pair(), [])
      expect(src).toContain('static SegDisplay _seg_a;')
      expect(src).toContain('static SegDisplay _seg_b;')
      expect(src).toContain('char _segBuf_a[SEG_MAX_DIGITS + 1];')
      expect(src).toContain('char _segBuf_b[SEG_MAX_DIGITS + 1];')
      expect(src).toContain('_segBegin(_seg_a, SEG_KIND_TM1637, 4, 18, 19, 21, 1);')
      expect(src).toContain('_segBegin(_seg_b, SEG_KIND_MAX7219, 8, 12, 13, 14, 9);')
    })

    it('renders each at its own width', () => {
      const src = generateCpp(pair(), [])
      expect(src).toContain('_segAllDash(_segBuf_a, 4);')
      expect(src).toContain('_segAllDash(_segBuf_b, 8);')
    })

    it('writes each on its own change rather than sharing a deadline', () => {
      const src = generateCpp(pair(), [])
      expect(src).toContain('_segWrite(_seg_a,')
      expect(src).toContain('_segWrite(_seg_b,')
    })

    it('still emits the shared driver exactly once', () => {
      const src = generateCpp(pair(), [])
      expect(src.split('static void _segWrite(').length - 1).toBe(1)
      expect(src.split('#define SEG_MAX_DIGITS').length - 1).toBe(1)
    })
  })
})

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

  it('rounds the way the shared model does, in double', () => {
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('double product = (double)value * scale;')
    expect(SEGMENT_DISPLAY_CPP_HELPERS).toContain('floor(product + 0.5)')
  })

  it('needs no external driver library', () => {
    expect(SEGMENT_DISPLAY_CPP_HELPERS).not.toContain('#include')
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
    const nodes = [outputNode, node('w', 'Wave', 'signal', { speed: 0.5 }), display()]
    const src = generateCpp(nodes, [edge('e', 'w', 'seg', 'value', 'value')])
    expect(src).toContain('n_w_value')
    expect(src).toContain('_segNumber(_segBuf_seg, 4, n_w_value')
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

  it('renders each mode through its own helper', () => {
    expect(generateCpp([outputNode, display({ segmentMode: 'Number' })], [])).toContain('_segNumber(')
    expect(generateCpp([outputNode, display({ segmentMode: 'Index' })], [])).toContain('_segIndex(')
    expect(generateCpp([outputNode, display({ segmentMode: 'Clock' })], [])).toContain('_segClock(')
  })

  // No trustworthy clock reading shows dashes, never a plausible midnight.
  it('dashes a clock with no reading rather than showing a time', () => {
    const src = generateCpp([outputNode, display({ segmentMode: 'Clock' })], [])
    expect(src).toContain('_segAllDash(_segBuf_seg, 4);')
  })

  it('reads a wired clock struct', () => {
    const nodes = [outputNode, node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' }), display({ segmentMode: 'Clock' })]
    const src = generateCpp(nodes, [edge('e', 'rtc', 'seg', 'dateTime', 'dateTime')])
    expect(src).toContain('n_rtc_dateTime.valid')
    expect(src).toContain('n_rtc_dateTime.hour')
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
    const src = generateCpp([outputNode, display({ segmentMode: 'Clock', showColon: true })], [])
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
    expect(src).toContain('_segNumber(_segBuf_seg, 8,')
  })

  // The module has no colon segment, so asking for one must not emit a write to
  // a bit that does not exist.
  it('never asks a colonless module for a colon', () => {
    const src = generateCpp([outputNode, max7219({ segmentMode: 'Clock', showColon: true })], [])
    expect(src).toContain('_segWrite(_seg_seg, _segBuf_seg, _segDec_seg, false,')
  })

  it('shows seconds where the TM1637 cannot', () => {
    const src = generateCpp([outputNode, max7219({ segmentMode: 'Clock' })], [])
    expect(src).toMatch(/_segClock\(_segBuf_seg, 8, .*\.second\)|_segClock\(_segBuf_seg, 8, 0, 0, 0\)/)
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

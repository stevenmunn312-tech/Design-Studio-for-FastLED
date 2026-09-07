// A display is hardware, not a branch of the creative graph.  These five
// generators take notably different routes to a sketch, so exercise the same
// configured fixtures through each one.  A driver declaration without setup,
// or setup without its periodic service, leaves a physically sound panel dark
// and is exactly the failure this test guards against.

import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { playerDisplaysFromGraph } from '../playerDisplays'
import { generateWiringDiagnosticSketch } from '../wiringDiagnosticGenerator'
import { generateStreamReceiverSketch } from '../streamReceiverGenerator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/graphEvaluator'

function node(id: string, nodeType: string, category = 'output', properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id, source, sourceHandle, target, targetHandle }) as unknown as StudioEdge

const output = node('out', 'MatrixOutput', 'output', {
  width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 4,
})

// Deliberately cover all three fixed driver families and both buses.  The TFT
// uses its self-contained Diagnostics layout so the standalone sketches also
// prove the XPT2046 support code is present, not merely the colour panel.
const fixtures = [
  node('oled', 'InfoDisplay', 'output', {
    partId: 'ssd1306-oled-128x64', sdaPin: 21, sclPin: 22, i2cAddress: '0x3C',
  }),
  node('segment', 'SegmentDisplay', 'output', {
    partId: 'tm1637-4digit-display', clkPin: 32, dioPin: 33, brightness: 4,
  }),
  node('tft', 'TransportDisplay', 'output', {
    partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Diagnostics',
    csPin: 5, dcPin: 16, resetPin: 17, sckPin: 18, mosiPin: 23, backlightPin: 4,
    touchCsPin: 15, touchIrqPin: 2, touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19,
  }),
]

function expectFixedDisplaySupport(source: string): void {
  // Headers and forward declarations are separate contracts: the Arduino
  // preprocessor hoists functions before structs, while the OLED helper still
  // compiles its Wire branch even when the selected module happens to be SPI.
  expect(source).toContain('#include <Wire.h>')
  expect(source).toContain('#include <SPI.h>')
  expect(source).toContain('struct OledPanel;')
  expect(source).toContain('struct SegDisplay;')
  expect(source).toContain('struct TftPanel;')

  expect(source).toContain('static OledPanel _oled_oled;')
  expect(source).toContain('static SegDisplay _seg_segment;')
  expect(source).toContain('static TftPanel _tft_tft;')
  // Normal sketches may use the selected board's canonical I2C pair; the
  // standalone/template paths use the module's resolved pins. Either way the
  // bus must be explicitly started before the OLED's begin call.
  expect(source).toContain('Wire.begin(')
  expect(source).toContain('_oledBeginI2c(_oled_oled, OLED_SSD1306, 0x3c')
  expect(source).toContain('_segBegin(_seg_segment, SEG_KIND_TM1637, 4, 32, 33, 21, 4);')
  expect(source).toContain('_tftBegin(_tft_tft, 5, 16, 17, 18, 23, 4,')

  // The driver helpers and the actual per-pass service must both survive the
  // generator. An initialized-but-never-serviced display is still omitted in
  // practice.
  expect(source).toContain('struct OledPanel {')
  expect(source).toContain('struct SegDisplay {')
  expect(source).toContain('struct TftPanel {')
  expect(source).toContain('static uint16_t _xptRead12(')
  expect(source).toContain('_oledClear(_oled_oled);')
  expect(source).toContain('_segWrite(_seg_segment, _segBuf_segment')
  expect(source).toContain('_tftBacklight(_tft_tft, _tftOn_tft);')
  expect(source).toContain('_touchDown_tft = (_tftOn_tft) && _xptPoint(')
}

const groups: GroupRegistry = {
  g0: {
    nodes: [node('solid', 'SolidColor', 'pattern', { r: 20, g: 40, b: 80 }), node('group-out', 'GroupOutput', 'pattern')],
    edges: [edge('group-edge', 'solid', 'frame', 'group-out', 'frame')],
  },
}

describe('configured fixed displays across C++ generator paths', () => {
  it('emits declarations, setup and service in a normal sketch', () => {
    expectFixedDisplaySupport(generateCpp([output, ...fixtures], []))
  })

  it('emits declarations, setup and service in a generative-show controller', () => {
    const collection = node('collection', 'PatternCollection', 'pattern', { patternIds: ['g0'] })
    const slideshow = node('slideshow', 'PatternSlideshow', 'pattern')
    const source = generateShowSketch(
      [output, collection, slideshow, ...fixtures],
      [
        edge('collection-show', 'collection', 'patternset', 'slideshow', 'patternset'),
        edge('show-output', 'slideshow', 'frame', 'out', 'frame'),
      ],
      groups,
    )
    expectFixedDisplaySupport(source)
  })

  it('emits declarations, setup and service in an SD-player sketch', () => {
    const source = generatePlayerSketch({}, undefined, {
      displays: playerDisplaysFromGraph([output, ...fixtures] as never, [] as never),
    })
    expectFixedDisplaySupport(source)
  })

  it('keeps configured displays alive in the wiring diagnostic sketch', () => {
    expectFixedDisplaySupport(generateWiringDiagnosticSketch([output, ...fixtures])!)
  })

  it('keeps configured displays alive while the stream receiver awaits frames', () => {
    const source = generateStreamReceiverSketch([output, ...fixtures])!
    expectFixedDisplaySupport(source)
    expect(source.indexOf('_tftBacklight(_tft_tft, _tftOn_tft);')).toBeLessThan(
      source.indexOf("static const uint8_t prefix[] = { 'A', 'd', 'a' };"),
    )
  })
})

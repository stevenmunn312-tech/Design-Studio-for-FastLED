import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { fastledSetupCpp, laneRanges, ledHardwareFromProps } from '../output/ledHardwareCpp'
import { generateCpp } from '../cppGenerator'
import { generateWiringDiagnosticSketch } from '../sketches/wiringDiagnosticGenerator'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: id, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (id: string, source: string, target: string) =>
  ({ id, source, sourceHandle: 'frame', target, targetHandle: 'frame' }) as StudioEdge

const split = { form: 'matrix', width: 16, height: 32, dataPin: 4, dataLanes: 4, lanePins: [5, 6, 7] }

describe('fastledSetupCpp lanes', () => {
  it('leaves a single-pin output exactly as it was', () => {
    expect(fastledSetupCpp(ledHardwareFromProps({}))).toEqual([
      '  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);',
      '  FastLED.setBrightness(128);',
    ])
  })

  it('adds one controller per lane over the same array', () => {
    const lines = fastledSetupCpp(ledHardwareFromProps(split))
    expect(lines.filter((line) => line.includes('addLeds'))).toEqual([
      '  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, 0, NUM_LEDS / 4);  // lane 1',
      '  FastLED.addLeds<WS2812B, 5, GRB>(leds, 1 * (NUM_LEDS / 4), NUM_LEDS / 4);  // lane 2',
      '  FastLED.addLeds<WS2812B, 6, GRB>(leds, 2 * (NUM_LEDS / 4), NUM_LEDS / 4);  // lane 3',
      '  FastLED.addLeds<WS2812B, 7, GRB>(leds, 3 * (NUM_LEDS / 4), NUM_LEDS / 4);  // lane 4',
    ])
  })

  it('names each lane\'s controller and applies per-controller settings to all of them', () => {
    const lines = fastledSetupCpp(ledHardwareFromProps({ ...split, dataLanes: 2, lanePins: [5], correction: 'TypicalLEDStrip' }), {
      controllerName: 'controller_out', ledCountMacro: '512', brightness: null,
    })
    expect(lines).toContain('  CLEDController& controller_out = FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, 0, 256);  // lane 1')
    expect(lines).toContain('  CLEDController& controller_out_lane2 = FastLED.addLeds<WS2812B, 5, GRB>(leds, 256, 256);  // lane 2')
    expect(lines).toContain('  controller_out.setCorrection(TypicalLEDStrip);')
    expect(lines).toContain('  controller_out_lane2.setCorrection(TypicalLEDStrip);')
  })

  it('keeps RGBW lanes in RGBW mode', () => {
    const lines = fastledSetupCpp(ledHardwareFromProps({ ...split, chipset: 'SK6812-RGBW' }))
    expect(lines.filter((line) => line.includes('.setRgbw(RgbwDefault())'))).toHaveLength(4)
  })

  it('never splits a clocked chipset', () => {
    expect(ledHardwareFromProps({ ...split, chipset: 'APA102' }).lanePins).toEqual([])
  })

  it('leaves an uneven literal count to the compiler', () => {
    expect(laneRanges('10', 4)).toEqual(['0, 10 / 4', '1 * (10 / 4), 10 / 4', '2 * (10 / 4), 10 / 4', '3 * (10 / 4), 10 / 4'])
  })
})

describe('generators emit lanes', () => {
  const fill = node('fill', 'SolidColor', { r: 255 })

  it('in the normal sketch', () => {
    const sketch = generateCpp([fill, node('out', 'MatrixOutput', split)], [edge('a', 'fill', 'out')])
    expect(sketch).toContain('FastLED.addLeds<WS2812B, 7, GRB>(leds, 3 * (NUM_LEDS / 4), NUM_LEDS / 4);  // lane 4')
  })

  it('on a multi-output route', () => {
    const sketch = generateCpp([
      fill, node('out', 'MatrixOutput', split), node('strip', 'MatrixOutput', { form: 'strip', ledCount: 30, dataPin: 9 }),
    ], [edge('a', 'fill', 'out'), edge('b', 'fill', 'strip')])
    expect(sketch).toContain('CLEDController& controller_out_lane4 = FastLED.addLeds<WS2812B, 7, GRB>(leds_out, 384, 128);  // lane 4')
    expect(sketch).toContain('FastLED.addLeds<WS2812B, DATA_PIN_strip, GRB>(leds_strip, 30);')
  })

  it('in the wiring diagnostic, which lights each lane in turn', () => {
    const sketch = generateWiringDiagnosticSketch([node('out', 'MatrixOutput', split)])!
    expect(sketch).toContain('#define DATA_LANES 4')
    expect(sketch).toContain('void drawLaneDiagnostic(uint32_t now) {')
    expect(sketch).toContain('% 9);')
    expect(sketch).toContain('  if (mode == 0) drawLaneDiagnostic(now);')
    expect(sketch).toContain('  else switch (mode - 1) {')
    expect(sketch.split('FastLED.addLeds<').length - 1).toBe(4)
  })

  it('leaves the diagnostic of a single-pin output alone', () => {
    const sketch = generateWiringDiagnosticSketch([node('out', 'MatrixOutput', { ...split, dataLanes: 1 })])!
    expect(sketch).not.toContain('drawLaneDiagnostic')
    expect(sketch).toContain('  switch (mode) {')
  })
})

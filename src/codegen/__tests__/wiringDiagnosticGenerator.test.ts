import { describe, expect, it } from 'vitest'
import { generateWiringDiagnosticSketch } from '../wiringDiagnosticGenerator'
import type { StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const outputNode = node('out', 'MatrixOutput', 'output', {
  width: 8,
  height: 12,
  chipset: 'WS2812B',
  colorOrder: 'GRB',
  dataPin: 5,
})

describe('generateWiringDiagnosticSketch', () => {
  it('returns null without a MatrixOutput node', () => {
    expect(generateWiringDiagnosticSketch([])).toBeNull()
  })

  it('bakes in the matrix dimensions and hardware pin', () => {
    const sketch = generateWiringDiagnosticSketch([outputNode])!
    expect(sketch).toContain('#define WIDTH 8')
    expect(sketch).toContain('#define HEIGHT 12')
    expect(sketch).toContain('#define DATA_PIN 5')
    expect(sketch).toContain('FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);')
  })

  it('cycles through the diagnostic modes for color order, brightness, orientation, panels, and both chases', () => {
    const sketch = generateWiringDiagnosticSketch([outputNode])!
    expect(sketch).toContain('drawBrightnessBars()')
    expect(sketch).toContain('drawOrientationMap(blink)')
    expect(sketch).toContain('drawPanelDiagnostic()')
    expect(sketch).toContain('drawLogicalChase(now)')
    expect(sketch).toContain('drawPhysicalChase(now)')
    expect(sketch).toContain('case 0: fill_solid(leds, NUM_LEDS, CRGB::Red); break;')
    expect(sketch).toContain('case 2: fill_solid(leds, NUM_LEDS, CRGB::Blue); break;')
  })

  it('renders diagnostic numbers and a direct physical-index chase', () => {
    const sketch = generateWiringDiagnosticSketch([outputNode])!
    expect(sketch).toContain('const uint8_t DIGITS[10][5] PROGMEM')
    expect(sketch).toContain('drawNumber(0, 0, logical, CRGB::White);')
    expect(sketch).toContain('drawNumber(0, 0, physical, CRGB::White);')
    expect(sketch).toContain('leds[physical] = CHSV')
  })

  it('reuses the baked XY remap when layout settings need one', () => {
    const serpentine = node('out', 'MatrixOutput', 'output', {
      width: 8,
      height: 8,
      serpentine: true,
      layout: 'panels',
      tilesX: 2,
      tilesY: 2,
      tileRotations: '0,90,180,270',
    })
    const sketch = generateWiringDiagnosticSketch([serpentine])!
    expect(sketch).toContain('const uint16_t _xytable[64] PROGMEM')
    expect(sketch).toContain('leds[XY((uint8_t)x, (uint8_t)y)] = color;')
    expect(sketch).toContain('#define PANEL_TILES_X 2')
    expect(sketch).toContain('#define PANEL_TILES_Y 2')
  })

  it('keeps the configured power cap in the diagnostic sketch', () => {
    const capped = node('out', 'MatrixOutput', 'output', {
      width: 8,
      height: 8,
      powerLimit: true,
      volts: 5,
      milliamps: 1500,
    })
    const sketch = generateWiringDiagnosticSketch([capped])!
    expect(sketch).toContain('FastLED.setMaxPowerInVoltsAndMilliamps(5, 1500);')
  })

  it('emits CLOCK_PIN only for SPI chipsets', () => {
    const clockless = generateWiringDiagnosticSketch([outputNode])!
    expect(clockless).not.toContain('CLOCK_PIN')

    const spi = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, chipset: 'APA102', clockPin: 7 })
    const spiSketch = generateWiringDiagnosticSketch([spi])!
    expect(spiSketch).toContain('#define CLOCK_PIN 7')
  })
})

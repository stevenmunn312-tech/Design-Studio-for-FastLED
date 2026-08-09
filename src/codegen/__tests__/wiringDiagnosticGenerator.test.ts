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

  it('sanitizes MatrixOutput data and SPI clock pins', () => {
    const out = node('out', 'MatrixOutput', 'output', {
      width: 8,
      height: 8,
      chipset: 'APA102',
      dataPin: -4,
      clockPin: 299,
    })
    const sketch = generateWiringDiagnosticSketch([out])!
    expect(sketch).toContain('#define DATA_PIN 0')
    expect(sketch).toContain('#define CLOCK_PIN 255')
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

  describe('HUB75 (docs/development/design/hub75-output.md)', () => {
    const hub75Out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, chipset: 'HUB75' })

    it('drives the DMA library instead of FastLED addLeds/show', () => {
      const sketch = generateWiringDiagnosticSketch([hub75Out])!
      expect(sketch).toContain('#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>')
      expect(sketch).toContain('MatrixPanel_I2S_DMA *dma_display = nullptr;')
      expect(sketch).toContain(
        'HUB75_I2S_CFG::i2s_pins _hub75Pins = { 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, -1, 17, 18, 0 };',
      )
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 1, _hub75Pins);')
      expect(sketch).toContain('dma_display = new MatrixPanel_I2S_DMA(_hub75Cfg);')
      expect(sketch).not.toContain('#define DATA_PIN')
      expect(sketch).not.toContain('FastLED.addLeds<')
      expect(sketch).not.toContain('FastLED.show();')
      // Still uses the same CRGB leds[] diagnostic-drawing logic as every
      // other chipset — only the setup/output step differs.
      expect(sketch).toContain('CRGB leds[NUM_LEDS];')
      expect(sketch).toContain('case 0: fill_solid(leds, NUM_LEDS, CRGB::Red); break;')
      expect(sketch).toContain('dma_display->drawPixelRGB888(x, y, c.r, c.g, c.b);')
    })

    it('skips setMaxPowerInVoltsAndMilliamps for HUB75 (no FastLED controller to throttle)', () => {
      const capped = node('out', 'MatrixOutput', 'output', {
        width: 8, height: 8, chipset: 'HUB75', powerLimit: true, volts: 5, milliamps: 1500,
      })
      const sketch = generateWiringDiagnosticSketch([capped])!
      expect(sketch).not.toContain('setMaxPowerInVoltsAndMilliamps')
    })

    it('reads through the baked XY table when the blit needs one', () => {
      const custom = node('out', 'MatrixOutput', 'output', {
        width: 8, height: 8, chipset: 'HUB75', layout: 'custom',
        customXYMap: JSON.stringify(Array.from({ length: 64 }, (_, i) => 63 - i)),
      })
      const sketch = generateWiringDiagnosticSketch([custom])!
      expect(sketch).toContain('const uint16_t _xytable[64] PROGMEM')
      expect(sketch).toContain('CRGB c = leds[XY((uint8_t)x, (uint8_t)y)];')
    })

    it('drives a single-row panel chain via chain_length', () => {
      const chainedOut = node('out', 'MatrixOutput', 'output', {
        width: 24, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 3, tilesY: 1,
      })
      const sketch = generateWiringDiagnosticSketch([chainedOut])!
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 3, _hub75Pins);')
    })

    it('drives a folded 2D panel grid via VirtualMatrixPanel_T', () => {
      const gridOut = node('out', 'MatrixOutput', 'output', {
        width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2,
      })
      const sketch = generateWiringDiagnosticSketch([gridOut])!
      expect(sketch).toContain('#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>')
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 4, _hub75Pins);')
      expect(sketch).toContain('hub75Virtual = new VirtualMatrixPanel_T<CHAIN_TOP_LEFT_DOWN>(2, 2, 8, 8);')
      expect(sketch).toContain('hub75Virtual->setDisplay(*dma_display);')
      expect(sketch).toContain('hub75Virtual->drawPixelRGB888(x, y, c.r, c.g, c.b);')
    })
  })
})

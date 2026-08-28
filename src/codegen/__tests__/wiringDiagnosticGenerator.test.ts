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

  it.each(['strip', 'ring', 'corkscrew'])('diagnoses a %s as its physical N-LED chain', (form) => {
    const out = node('out', 'MatrixOutput', 'output', {
      form, ledCount: 120, width: 16, height: 16, serpentine: true, dataPin: 7,
    })
    const sketch = generateWiringDiagnosticSketch([out])!
    expect(sketch).toContain('#define WIDTH 120')
    expect(sketch).toContain('#define HEIGHT 1')
    expect(sketch).toContain('#define DATA_PIN 7')
    expect(sketch).not.toContain('const uint16_t _xytable')
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

  it('holds a configured I2S amplifier quiet while the LED-only diagnostic runs', () => {
    const amplifier = node('amp', 'Amplifier', 'output', {
      model: 'max98357a-i2s-amplifier',
      i2sBclk: 14,
      i2sLrc: 15,
      i2sDout: 16,
    })
    const sketch = generateWiringDiagnosticSketch([outputNode, amplifier])!

    expect(sketch).toContain('#define AMP_I2S_BCLK 14')
    expect(sketch).toContain('#define AMP_I2S_LRC  15')
    expect(sketch).toContain('#define AMP_I2S_DOUT 16')
    expect(sketch).toContain('pinMode(AMP_I2S_BCLK, OUTPUT); digitalWrite(AMP_I2S_BCLK, LOW);')
    expect(sketch).toContain('pinMode(AMP_I2S_LRC, OUTPUT);  digitalWrite(AMP_I2S_LRC, LOW);')
    expect(sketch).toContain('pinMode(AMP_I2S_DOUT, OUTPUT); digitalWrite(AMP_I2S_DOUT, LOW);')
    expect(sketch.indexOf('pinMode(AMP_I2S_BCLK')).toBeLessThan(sketch.indexOf('FastLED.addLeds<'))
  })

  it('does not invent I2S mute pins for an analog amplifier', () => {
    const amplifier = node('amp', 'Amplifier', 'output', {
      model: 'pam8403-3w-stereo-amplifier',
    })
    const sketch = generateWiringDiagnosticSketch([outputNode, amplifier])!

    expect(sketch).not.toContain('AMP_I2S_')
  })

  it('identifies a targeted Stereo VU fixture and verifies each configured direction', () => {
    const vu = node('vu', 'StereoVuMeter', 'output', {
      targetOutputId: 'out', ledCount: 36, leftDataPin: 6, rightDataPin: 7,
      chipset: 'WS2812B', colorOrder: 'GRB', leftDirection: 'Top', rightDirection: 'Bottom',
    })
    const sketch = generateWiringDiagnosticSketch([outputNode, vu], 'out')!
    expect(sketch).toContain('#define VU_LED_COUNT 36')
    expect(sketch).toContain('#define VU_LEFT_PIN 6')
    expect(sketch).toContain('#define VU_RIGHT_PIN 7')
    expect(sketch).toContain('#define VU_LEFT_REVERSED 1')
    expect(sketch).toContain('#define VU_RIGHT_REVERSED 0')
    expect(sketch).toContain('FastLED.addLeds<WS2812B, VU_LEFT_PIN, GRB>(vuLeft, VU_LED_COUNT)')
    expect(sketch).toContain('FastLED.addLeds<WS2812B, VU_RIGHT_PIN, GRB>(vuRight, VU_LED_COUNT)')
    expect(sketch).toContain('drawVuRail(vuLeft, VU_LEFT_REVERSED, CRGB(64, 0, 0), now)')
    expect(sketch).toContain('drawVuRail(vuRight, VU_RIGHT_REVERSED, CRGB(0, 0, 64), now)')
    expect(sketch).toContain('physical = reversed ? VU_LED_COUNT - 1 - logical : logical')
    expect(sketch).toContain('FastLED.setBrightness(DIAG_BRIGHTNESS);')
    expect(sketch.match(/FastLED\.show\(\);/g)).toHaveLength(1)
  })

  it('does not test a Stereo VU fixture assigned to another output route', () => {
    const vu = node('vu', 'StereoVuMeter', 'output', { targetOutputId: 'other', ledCount: 36 })
    const sketch = generateWiringDiagnosticSketch([outputNode, vu], 'out')!
    expect(sketch).not.toContain('VU_LED_COUNT')
    expect(sketch).not.toContain('drawVuWiringDiagnostic')
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
      expect(sketch).toContain('dma_display->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('skips setMaxPowerInVoltsAndMilliamps for HUB75 (no FastLED controller to throttle)', () => {
      const capped = node('out', 'MatrixOutput', 'output', {
        width: 8, height: 8, chipset: 'HUB75', powerLimit: true, volts: 5, milliamps: 1500,
      })
      const sketch = generateWiringDiagnosticSketch([capped])!
      expect(sketch).not.toContain('setMaxPowerInVoltsAndMilliamps')
    })

    it('keeps the HUB75 framebuffer logical and lets the DMA topology path own routing', () => {
      const grid = node('out', 'MatrixOutput', 'output', {
        width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2,
      })
      const sketch = generateWiringDiagnosticSketch([grid])!
      expect(sketch).not.toContain('const uint16_t _xytable')
      expect(sketch).toContain('CRGB _c = leds[(uint16_t)_y * WIDTH + _x];')
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
      expect(sketch).toContain('hub75Virtual->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('remaps rotated HUB75 panel tiles through a coord table before drawing', () => {
      const rotatedOut = node('out', 'MatrixOutput', 'output', {
        width: 16, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 1, tileRotations: '0,90',
      })
      const sketch = generateWiringDiagnosticSketch([rotatedOut])!
      expect(sketch).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
      expect(sketch).toContain('uint16_t _hub75XY = pgm_read_word(&_hub75CoordMap[_y * WIDTH + _x]);')
      expect(sketch).toContain('dma_display->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
    })

    it('adds the panel-topology phase to a folded-grid wiring-test cycle', () => {
      const gridOut = node('out', 'MatrixOutput', 'output', {
        width: 64, height: 64, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2,
        tileSerpentine: true, tileRotations: '0,90,180,270',
      })
      const sketch = generateWiringDiagnosticSketch([gridOut])!
      expect(sketch).toContain('#define PANEL_SERPENTINE 1')
      expect(sketch).toContain('#define HUB75_PANEL_TOPOLOGY_ONLY 0')
      expect(sketch).toContain('const uint16_t PANEL_ROTATIONS[PANEL_TILES_X * PANEL_TILES_Y] PROGMEM = { 0,90,180,270 };')
      expect(sketch).toContain('uint8_t mode = (uint8_t)((now / DIAG_MODE_MS) % 9);')
      expect(sketch).toContain('case 6: drawHub75PanelTopology(blink); break;')
    })

    it('generates a dedicated folded-grid topology pattern from MatrixOutput settings', () => {
      const gridOut = node('out', 'MatrixOutput', 'output', {
        width: 64, height: 64, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2,
        tileSerpentine: true, tileRotations: '0,90,180,270',
      })
      const sketch = generateWiringDiagnosticSketch([gridOut], 'out', 'hub75-panel-topology')!
      expect(sketch).toContain('#define PANEL_TILES_X 2')
      expect(sketch).toContain('#define PANEL_TILES_Y 2')
      expect(sketch).toContain('#define PANEL_W 32')
      expect(sketch).toContain('#define PANEL_H 32')
      expect(sketch).toContain('#define HUB75_PANEL_TOPOLOGY_ONLY 1')
      expect(sketch).toContain('int chainX = (PANEL_SERPENTINE && (ty & 1)) ? PANEL_TILES_X - 1 - tx : tx;')
      expect(sketch).toContain('drawGlyph3x5(px + 5, py + 4, GLYPH_X, CRGB::Red)')
      expect(sketch).toContain('drawGlyph3x5(px + 5, py + 10, GLYPH_Y, CRGB::Blue)')
      expect(sketch).toContain('drawGlyph3x5(px + 5, py + PANEL_H - 7, GLYPH_R, CRGB::Orange)')
      expect(sketch).toContain('drawHorizontalArrow(px + 3, px + PANEL_W - 4, py + PANEL_H / 2, chainRight, CRGB::Yellow)')
      expect(sketch).toContain('drawHub75PanelTopology(blink);')
      expect(sketch).not.toContain('switch (mode)')
    })

    it('does not generate the dedicated topology mode for non-folded outputs', () => {
      expect(generateWiringDiagnosticSketch([hub75Out], 'out', 'hub75-panel-topology')).toBeNull()
      expect(generateWiringDiagnosticSketch([outputNode], 'out', 'hub75-panel-topology')).toBeNull()
    })
  })
})

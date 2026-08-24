import { describe, it, expect } from 'vitest'
import { generateStreamReceiverSketch, streamLayoutForGraph } from '../streamReceiverGenerator'
import type { StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const outputNode = node('out', 'MatrixOutput', 'output', { width: 8, height: 12, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 })

describe('streamLayoutForGraph', () => {
  it('returns null without a MatrixOutput node', () => {
    expect(streamLayoutForGraph([])).toBeNull()
  })

  it('resolves width/height/serpentine from MatrixOutput', () => {
    const layout = streamLayoutForGraph([outputNode])
    expect(layout).toEqual({ width: 8, height: 12, serpentine: false, baud: 921600 })
  })

  it('picks up serpentine when set', () => {
    const out = node('out', 'MatrixOutput', 'output', { width: 4, height: 4, serpentine: true })
    expect(streamLayoutForGraph([out])?.serpentine).toBe(true)
  })

  it('forces serpentine off for HUB75 even if a stale flag is set', () => {
    // Regression: serpentine is an addressable-strip wiring concept the HUB75
    // property editor hides, but switching a node's chipset from an
    // addressable one to HUB75 leaves the old stored value in place. Both the
    // sender (buildAdalightPacket) and receiver must agree it's a no-op here.
    const out = node('out', 'MatrixOutput', 'output', { width: 4, height: 4, chipset: 'HUB75', serpentine: true })
    expect(streamLayoutForGraph([out])?.serpentine).toBe(false)
  })

  it.each(['strip', 'ring', 'corkscrew'])('streams a %s as its physical N-LED chain', (form) => {
    const out = node('out', 'MatrixOutput', 'output', {
      form, ledCount: 120, width: 16, height: 16, serpentine: true,
    })
    expect(streamLayoutForGraph([out])).toEqual({
      width: 120, height: 1, serpentine: false, baud: 921600,
    })
  })
})

describe('generateStreamReceiverSketch', () => {
  it('returns null without a MatrixOutput node', () => {
    expect(generateStreamReceiverSketch([])).toBeNull()
  })

  it('bakes in the matrix dimensions and pin', () => {
    const sketch = generateStreamReceiverSketch([outputNode])!
    expect(sketch).toContain('#define WIDTH 8')
    expect(sketch).toContain('#define HEIGHT 12')
    expect(sketch).toContain('#define DATA_PIN 5')
    expect(sketch).toContain('#define NUM_LEDS (WIDTH * HEIGHT)')
  })

  it('sanitizes MatrixOutput data and SPI clock pins', () => {
    const out = node('out', 'MatrixOutput', 'output', {
      width: 8,
      height: 8,
      chipset: 'APA102',
      dataPin: -4,
      clockPin: 299,
    })
    const sketch = generateStreamReceiverSketch([out])!
    expect(sketch).toContain('#define DATA_PIN 0')
    expect(sketch).toContain('#define CLOCK_PIN 255')
  })

  it('initialises FastLED with the configured chipset/order', () => {
    const sketch = generateStreamReceiverSketch([outputNode])!
    expect(sketch).toContain('FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);')
  })

  it('implements the Adalight sync + checksum handshake', () => {
    const sketch = generateStreamReceiverSketch([outputNode])!
    expect(sketch).toContain("'A', 'd', 'a'")
    expect(sketch).toContain('chk != (uint8_t)(hi ^ lo ^ 0x55)')
    expect(sketch).toContain('FastLED.show();')
  })

  it('reads exactly NUM_LEDS RGB triples with no XY()/serpentine remap of its own', () => {
    const sketch = generateStreamReceiverSketch([outputNode])!
    expect(sketch).toContain('for (uint16_t i = 0; i < NUM_LEDS; i++)')
    expect(sketch).not.toContain('uint16_t XY(')
  })

  it('bounds every byte read with a timeout instead of hanging forever on a dropped byte', () => {
    // Regression: the receiver used to busy-wait on `while (!Serial.available()) {}`
    // with no timeout at every header/payload byte. A single byte lost to a UART RX
    // overflow (e.g. during FastLED.show()'s interrupts-disabled window) would
    // desync it permanently — the LEDs freeze with no error visible to the host,
    // since the write side never learns the receiver stopped consuming bytes.
    const sketch = generateStreamReceiverSketch([outputNode])!
    expect(sketch).toContain('#define READ_TIMEOUT_MS')
    expect(sketch).toContain('int readByte()')
    expect(sketch).not.toContain('while (!Serial.available()) {}')
  })

  it('emits CLOCK_PIN only for SPI chipsets', () => {
    const clockless = generateStreamReceiverSketch([outputNode])!
    expect(clockless).not.toContain('CLOCK_PIN')

    const spi = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, chipset: 'APA102', clockPin: 7 })
    const spiSketch = generateStreamReceiverSketch([spi])!
    expect(spiSketch).toContain('#define CLOCK_PIN 7')
  })

  describe('HUB75 (docs/development/design/hub75-output.md)', () => {
    const hub75Out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, chipset: 'HUB75' })

    it('drives the DMA library instead of FastLED addLeds/show', () => {
      const sketch = generateStreamReceiverSketch([hub75Out])!
      expect(sketch).toContain('#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>')
      expect(sketch).toContain('MatrixPanel_I2S_DMA *dma_display = nullptr;')
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 1, _hub75Pins);')
      expect(sketch).toContain('dma_display = new MatrixPanel_I2S_DMA(_hub75Cfg);')
      expect(sketch).not.toContain('#define DATA_PIN')
      expect(sketch).not.toContain('FastLED.addLeds<')
      expect(sketch).not.toContain('FastLED.show();')
      // Still reads exactly NUM_LEDS triples via the same Adalight handshake —
      // only the setup/output step differs.
      expect(sketch).toContain("'A', 'd', 'a'")
      expect(sketch).toContain('leds[i] = CRGB(r, g, bl);')
      expect(sketch).toContain('for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {')
      expect(sketch).toContain('dma_display->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('drives a single-row panel chain via chain_length', () => {
      const chainedOut = node('out', 'MatrixOutput', 'output', {
        width: 24, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 3, tilesY: 1,
      })
      const sketch = generateStreamReceiverSketch([chainedOut])!
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 3, _hub75Pins);')
    })

    it('drives a folded 2D panel grid via VirtualMatrixPanel_T', () => {
      const gridOut = node('out', 'MatrixOutput', 'output', {
        width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2,
      })
      const sketch = generateStreamReceiverSketch([gridOut])!
      expect(sketch).toContain('#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>')
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 4, _hub75Pins);')
      expect(sketch).toContain('hub75Virtual = new VirtualMatrixPanel_T<CHAIN_TOP_LEFT_DOWN>(2, 2, 8, 8);')
      expect(sketch).toContain('hub75Virtual->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('remaps rotated HUB75 panel tiles through a coord table before drawing', () => {
      const rotatedOut = node('out', 'MatrixOutput', 'output', {
        width: 16, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 1, tileRotations: '0,90',
      })
      const sketch = generateStreamReceiverSketch([rotatedOut])!
      expect(sketch).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
      expect(sketch).toContain('uint16_t _hub75XY = pgm_read_word(&_hub75CoordMap[_y * WIDTH + _x]);')
      expect(sketch).toContain('dma_display->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
    })
  })
})

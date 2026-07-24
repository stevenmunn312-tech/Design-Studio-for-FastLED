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
})

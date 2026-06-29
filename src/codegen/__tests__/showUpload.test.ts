import { describe, it, expect } from 'vitest'
import { generateProvisionerSketch, PROVISION_CHUNK } from '../provisionerSketchGenerator'
import { generatePlayerSketch, playerConfigFromGraph } from '../playerSketchGenerator'

describe('generateProvisionerSketch', () => {
  it('bakes the SD chip-select pin and chunk size into the sketch', () => {
    const ino = generateProvisionerSketch({ sdCsPin: 21 })
    expect(ino).toContain('#define SD_CS  21')
    expect(ino).toContain(`#define CHUNK  ${PROVISION_CHUNK}`)
  })

  it('implements the PUT/END control protocol', () => {
    const ino = generateProvisionerSketch()
    expect(ino).toContain('#define SD_CS  5')              // default pin
    expect(ino).toContain('Serial.println("READY")')        // boot handshake
    expect(ino).toContain('line == "PING"')                 // re-probe handshake
    expect(ino).toContain('line.startsWith("PUT ")')        // file command
    expect(ino).toContain('Serial.println("OK")')           // ready-to-receive
    expect(ino).toContain('Serial.println("A")')            // per-chunk ack
    expect(ino).toContain('Serial.println("DONE")')         // file complete
    expect(ino).toContain('line == "END"')                  // session end
  })
})

describe('playerConfigFromGraph', () => {
  const node = (nodeType: string, properties: Record<string, unknown>) =>
    ({ data: { nodeType, properties } })

  it('pulls LED config from MatrixOutput and SD/I2S pins from SDCard', () => {
    const cfg = playerConfigFromGraph([
      node('MatrixOutput', { width: 32, height: 8, chipset: 'SK6812', colorOrder: 'RGB', dataPin: 12 }),
      node('SDCard', { sdCsPin: 21, i2sBclk: 5, i2sLrc: 6, i2sDout: 7, maxVolume: 12 }),
    ])
    expect(cfg).toMatchObject({
      ledWidth: 32, ledHeight: 8, chipset: 'SK6812', colorOrder: 'RGB', ledDataPin: 12,
      sdCsPin: 21, i2sBclk: 5, i2sLrc: 6, i2sDout: 7, maxVolume: 12,
    })
  })

  it('falls back to defaults for missing nodes/props', () => {
    const cfg = playerConfigFromGraph([])
    expect(cfg.ledWidth).toBe(16)
    expect(cfg.chipset).toBe('WS2812B')
    expect(cfg.sdCsPin).toBe(5)
    expect(cfg.maxVolume).toBe(18)
  })
})

describe('generatePlayerSketch', () => {
  it('uses the encoded beat decay and lets FastLED apply global brightness', () => {
    const ino = generatePlayerSketch()
    expect(ino).toContain('flashDecay = expf(')
    expect(ino).toContain('ev.paramCount > 1 ? ev.params[1] : 22.0f')
    expect(ino).toContain('flashLevel *= flashDecay')
    expect(ino.indexOf('// Beat flash overlay')).toBeLessThan(ino.indexOf('FastLED.show();'))
  })
})

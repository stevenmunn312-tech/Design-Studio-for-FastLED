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

  it('emits the built-in pattern switch for an enum show', () => {
    const ino = generatePlayerSketch()
    expect(ino).toContain('case 2:  // Plasma')
    expect(ino).not.toContain('render_p0(ms)')
  })

  it('dispatches to compiled render_pN functions for a collection show', () => {
    const renderers = {
      buffers: ['CRGB p0_buf_a[NUM_LEDS];'],
      helpers: [],
      functions: [
        'void render_p0(uint32_t ms) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }',
        'void render_p1(uint32_t ms) { fill_solid(leds, NUM_LEDS, CRGB::Red); }',
      ],
      count: 2,
      params: [],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).toContain('Music-Sync Player (collection show)')
    expect(ino).toContain('void render_p0(uint32_t ms)')
    expect(ino).toContain('case 0: render_p0(ms); break;')
    expect(ino).toContain('case 1: render_p1(ms); break;')
    expect(ino).not.toContain('case 2:  // Plasma')   // no built-in switch
    expect(ino).toContain('patternId  = 0;')          // index default
  })

  it('threads the energy role param into render_pN and the event dispatcher', () => {
    const renderers = {
      buffers: [],
      helpers: [],
      functions: ['void render_p0(uint32_t ms, float energy) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1,
      params: ['energy'],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).toContain('float      energy')                    // global
    expect(ino).toContain('#define CMD_SET_ENERGY     6')
    expect(ino).toContain('case CMD_SET_ENERGY:     energy = ev.params[0]; break;')
    expect(ino).toContain('case 0: render_p0(ms, energy); break;')   // passed to render fn
  })

  it('omits the energy plumbing when no role params are threaded', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1, params: [],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).not.toContain('case CMD_SET_ENERGY')
    expect(ino).toContain('case 0: render_p0(ms); break;')
  })

  it('normalises CMD_SET_SPEED into the speed role global and threads it into render_pN', () => {
    const renderers = {
      buffers: [],
      helpers: [],
      functions: ['void render_p0(uint32_t ms, float energy, float speed) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1,
      params: ['energy', 'speed'],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).toContain('float      speed')                       // role global (distinct from animSpeed)
    // CMD_SET_SPEED still sets animSpeed AND derives the normalised speed role.
    expect(ino).toContain('animSpeed  = ev.params[0]; speed = constrain(ev.params[0] * 0.5f, 0.0f, 1.0f); break;')
    expect(ino).toContain('case 0: render_p0(ms, energy, speed); break;')
  })

  it('does not touch the speed global when speed is not a threaded role', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms, float energy) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1, params: ['energy'],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).not.toContain('float      speed')
    expect(ino).toContain('animSpeed  = ev.params[0]; break;')
  })

  it('threads the palette role: global, paletteFromId helper, CMD_SET_PALETTE, and render arg', () => {
    const renderers = {
      buffers: [],
      helpers: [],
      functions: ['void render_p0(uint32_t ms, const CRGBPalette16& palette) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1,
      params: ['palette'],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).toContain('CRGBPalette16 palette = RainbowColors_p;')          // role global
    expect(ino).toContain('CRGBPalette16 paletteFromId(uint8_t palId)')        // helper mirrors samplePalette
    expect(ino).toContain('paletteId  = (uint8_t)ev.params[0]; palette = paletteFromId(paletteId); break;')
    expect(ino).toContain('case 0: render_p0(ms, palette); break;')            // passed to render fn
  })

  it('omits the palette plumbing when no palette role is threaded', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1, params: [],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).not.toContain('CRGBPalette16 palette')
    expect(ino).not.toContain('paletteFromId')
    expect(ino).toContain('paletteId  = (uint8_t)ev.params[0]; break;')
  })
})

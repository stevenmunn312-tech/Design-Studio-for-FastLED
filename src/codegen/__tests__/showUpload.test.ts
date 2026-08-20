import { describe, it, expect } from 'vitest'
import { generateProvisionerSketch, PROVISION_CHUNK, PROVISION_RX_BUFFER } from '../provisionerSketchGenerator'
import { generatePlayerSketch, playerConfigFromGraph } from '../playerSketchGenerator'
import { TRANSITION_HELPER_CPP } from '../transitionHelperCpp'

describe('generateProvisionerSketch', () => {
  it('bakes the SD chip-select pin and chunk size into the sketch', () => {
    const ino = generateProvisionerSketch({ sdCsPin: 21 })
    expect(ino).toContain('#define SD_CS  21')
    expect(ino).toContain(`#define CHUNK      ${PROVISION_CHUNK}`)
  })

  it('rounds and clamps the SD chip-select pin before emitting firmware', () => {
    expect(generateProvisionerSketch({ sdCsPin: -4.7 })).toContain('#define SD_CS  0')
    expect(generateProvisionerSketch({ sdCsPin: 280 })).toContain('#define SD_CS  255')
    expect(generateProvisionerSketch({ sdCsPin: Number.NaN })).toContain('#define SD_CS  10')
  })

  it('implements the PUT/END control protocol', () => {
    const ino = generateProvisionerSketch()
    expect(ino).toContain('#define SD_CS  10')             // default pin
    expect(ino).toContain('Serial.println("READY")')        // boot handshake
    expect(ino).toContain('line == "PING"')                 // re-probe handshake
    expect(ino).toContain('line.startsWith("PUT ")')        // file command
    expect(ino).toContain('Serial.println("OK")')           // ready-to-receive
    expect(ino).toContain('Serial.println("A")')            // per-chunk ack
    expect(ino).toContain('Serial.println("DONE")')         // file complete
    expect(ino).toContain('line == "END"')                  // session end
  })

  it('parses PUT on the last space so a path may contain spaces', () => {
    // Hardware-found, 2026-08-16. `PUT /music/Uplifting Trance.mp3 7505711`
    // split on the *first* space gave path "/music/Uplifting" and size 0, so
    // the device opened a truncated file, answered OK, skipped the write loop
    // and replied DONE — while the host streamed 7.5 MB at a device that had
    // stopped listening and reported "lost ack at byte 0". Song titles contain
    // spaces far more often than not, so this broke nearly every real transfer.
    const ino = generateProvisionerSketch()
    expect(ino).toContain('line.lastIndexOf(\' \')')
    expect(ino).not.toContain('line.indexOf(\' \', 4)')
  })

  it('boots at 115200 and lets the host raise the link', () => {
    // A 7.5 MB song is ~11 minutes at 115200, which makes SD provisioning
    // unusable. First contact stays slow-and-safe so the handshake can never
    // be what fails; the host raises the rate only after READY, and verifies
    // it before sending a byte of payload.
    const ino = generateProvisionerSketch()
    expect(ino).toContain('Serial.begin(115200)')
    expect(ino).toContain('line.startsWith("BAUD ")')
    expect(ino).toContain('Serial.updateBaudRate(rate)')
    // "OK" must clear the wire at the old rate or the host never sees it.
    expect(ino).toMatch(/Serial\.println\("OK"\);\s*\n\s*Serial\.flush\(\);/)
  })

  it('sizes the RX buffer above one block for the raised link', () => {
    const ino = generateProvisionerSketch()
    expect(ino).toContain(`#define RX_BUFFER  ${PROVISION_RX_BUFFER}`)
    expect(PROVISION_RX_BUFFER).toBeGreaterThan(PROVISION_CHUNK)
    // setRxBufferSize is ignored unless it precedes begin().
    expect(ino.indexOf('setRxBufferSize')).toBeLessThan(ino.indexOf('Serial.begin(115200)'))
    // A 4 KB block must not live on the loop task's 8 KB stack.
    expect(ino).toContain('static uint8_t buf[CHUNK]')
  })

  it('refuses a PUT whose size did not parse instead of desyncing', () => {
    // Size 0 means the trailing token was not a number. Accepting it replies
    // DONE immediately and leaves the host streaming into a device that is
    // back at the command prompt — a silent desync is much harder to diagnose
    // than a refusal the host reports as "device refused".
    const ino = generateProvisionerSketch()
    expect(ino).toContain('ERR bad-size')
  })
})

describe('playerConfigFromGraph', () => {
  const node = (nodeType: string, properties: Record<string, unknown>) =>
    ({ id: nodeType.toLowerCase(), data: { nodeType, properties } })

  // The LED target comes off a wire — the generator's `frame` into an output's
  // `frame` — so a fixture whose MatrixOutput should be read has to include
  // both ends, the same as a real graph.
  const showEdge = [{ source: 'performancegenerator', target: 'matrixoutput', sourceHandle: 'frame', targetHandle: 'frame' }]
  const generator = node('PerformanceGenerator', {})

  it('takes LED config from MatrixOutput, card pins from SDCard, I2S from Amplifier', () => {
    // The I2S pins and the volume moved off SDCard: where the music is stored
    // and what turns it into sound are two separate parts you buy, wire, and
    // can get wrong independently.
    const cfg = playerConfigFromGraph([
      generator,
      node('MatrixOutput', { width: 32, height: 8, chipset: 'SK6812', colorOrder: 'RGB', dataPin: 12 }),
      node('SDCard', { sdCsPin: 21 }),
      node('Amplifier', { i2sBclk: 5, i2sLrc: 6, i2sDout: 7, maxVolume: 12 }),
    ], showEdge)
    expect(cfg).toMatchObject({
      ledWidth: 32, ledHeight: 8, chipset: 'SK6812', colorOrder: 'RGB', ledDataPin: 12,
      sdCsPin: 21, i2sBclk: 5, i2sLrc: 6, i2sDout: 7, maxVolume: 12,
    })
  })

  it('ignores I2S pins left on a SDCard node', () => {
    // Breaking change, no migration: a graph saved before the split keeps the
    // old properties, and they must not quietly win over the Amplifier.
    const cfg = playerConfigFromGraph([
      node('SDCard', { i2sBclk: 5, i2sLrc: 6, i2sDout: 7 }),
      node('Amplifier', { i2sBclk: 27, i2sLrc: 26, i2sDout: 25 }),
    ])
    expect(cfg).toMatchObject({ i2sBclk: 27, i2sLrc: 26, i2sDout: 25 })
  })

  it('keeps working with no Amplifier node at all', () => {
    // A graph that never had one still generates a valid sketch.
    const cfg = playerConfigFromGraph([node('SDCard', { sdCsPin: 21 })])
    expect(cfg).toMatchObject({ sdCsPin: 21, i2sBclk: 26, i2sLrc: 25, i2sDout: 22 })
  })

  it('falls back to defaults for missing nodes/props', () => {
    // Reached only by a graph validation has already blocked: with no show
    // target `sdShowConnected` is false, so no real upload gets here.
    const cfg = playerConfigFromGraph([])
    expect(cfg.ledWidth).toBe(16)
    expect(cfg.chipset).toBe('WS2812B')
    expect(cfg.sdCsPin).toBe(10)
    expect(cfg.maxVolume).toBe(18)
    expect(cfg.audioOutput).toBe('i2s')
  })

  it('derives the audio output from the parts, not from a property', () => {
    // Adding an amplifier *is* the statement that this build uses I2S; asking
    // again invites the two answers to disagree about the same bench.
    expect(playerConfigFromGraph([
      node('SDCard', {}), node('Amplifier', {}),
    ], [], 'esp32:esp32:esp32').audioOutput).toBe('i2s')

    // No amplifier on a classic ESP32: the built-in DAC is the only way that
    // board makes a sound unaided.
    expect(playerConfigFromGraph([node('SDCard', {})], [], 'esp32:esp32:esp32').audioOutput)
      .toBe('internalDac')

    // An S3 has no DAC to fall back on, so it stays I2S and validation says an
    // amplifier is missing rather than the player pretending it has one.
    expect(playerConfigFromGraph([node('SDCard', {})], [], 'esp32:esp32:esp32s3').audioOutput)
      .toBe('i2s')
  })

  it('sanitizes SD/I2S pins and max volume read from saved graph properties', () => {
    const cfg = playerConfigFromGraph([
      node('SDCard', { sdCsPin: -4.7 }),
      // Volume lives with the output now, not with the storage.
      node('Amplifier', { i2sBclk: 19.6, i2sLrc: 280, i2sDout: 'invalid', maxVolume: 99 }),
    ])
    expect(cfg).toMatchObject({
      sdCsPin: 0,
      i2sBclk: 20,
      i2sLrc: 255,
      i2sDout: 22,
      maxVolume: 21,
    })
  })

  it('sanitizes MatrixOutput pins read from saved graph properties', () => {
    const cfg = playerConfigFromGraph([
      generator,
      node('MatrixOutput', { dataPin: -3.8, clockPin: 270 }),
    ], showEdge)
    expect(cfg).toMatchObject({ ledDataPin: 0, ledClockPin: 255 })
  })
})

describe('generatePlayerSketch track selection', () => {
  it('opens the track it was generated for rather than scanning', () => {
    // Hardware, 2026-08-16: the card still held a song from an earlier session
    // that sorted first, so the player loaded that pair instead of the freshly
    // provisioned one — silent output that looked like an I2S wiring fault.
    const ino = generatePlayerSketch({}, undefined, { preferredTrack: 'Uplifting Trance' })
    expect(ino).toContain('static const char* PREFERRED_TRACK = "Uplifting Trance"')
    expect(ino).toContain('String("/music/") + PREFERRED_TRACK + ".mp3"')
    // Both halves of the pair must exist before it commits to them.
    expect(ino).toContain('SD.exists(mp3.c_str()) && SD.exists(show.c_str())')
    expect(ino).toContain('Expected track missing')
  })

  it('falls back only to an mp3 that has a matching show', () => {
    // A stray mp3 with no show of its own must be skipped, not played against
    // whatever show happened to load.
    const ino = generatePlayerSketch()
    expect(ino).toContain('static const char* PREFERRED_TRACK = ""')
    expect(ino).toContain('no matching show')
    expect(ino).toContain('No playable track found on the card')
  })

  it('escapes a title that would otherwise break the C string', () => {
    const ino = generatePlayerSketch({}, undefined, { preferredTrack: 'He said "hi"' })
    expect(ino).toContain('PREFERRED_TRACK = "He said \\"hi\\""')
  })
})

describe('generatePlayerSketch audio output', () => {
  it('defaults to direct external I2S through the no-PSRAM decoder', () => {
    const ino = generatePlayerSketch()
    expect(ino).toContain('#include <Audio_nopsram.h>')
    expect(ino).toContain('Audio audio;')
    expect(ino).toContain('audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);')
    expect(ino).toContain('#define I2S_BCLK      26')
    expect(ino).not.toContain('setInternalDAC')
  })

  it('switches to the internal DAC and drops the I2S pin defines', () => {
    const ino = generatePlayerSketch({ audioOutput: 'internalDac' })
    expect(ino).toContain('Audio audio(true);')
    expect(ino).not.toContain('setInternalDAC')
    expect(ino).toContain('#include <Audio_nopsram.h>')
    expect(ino).not.toContain('audio.setPinout(')
    expect(ino).not.toContain('#define I2S_BCLK')
    expect(ino).not.toContain('#define I2S_LRC')
    expect(ino).not.toContain('#define I2S_DOUT')
  })

  it('sanitizes direct pin and volume configuration before emitting firmware', () => {
    const ino = generatePlayerSketch({
      ledDataPin: -9,
      ledClockPin: 290,
      chipset: 'APA102',
      sdCsPin: -10,
      i2sBclk: 260,
      i2sLrc: 24.6,
      i2sDout: Number.NaN,
      maxVolume: -3,
    })
    expect(ino).toContain('#define LED_DATA_PIN  0')
    expect(ino).toContain('#define LED_CLOCK_PIN 255')
    expect(ino).toContain('#define SD_CS         0')
    expect(ino).toContain('#define I2S_BCLK      255')
    expect(ino).toContain('#define I2S_LRC       25')
    expect(ino).toContain('#define I2S_DOUT      22')
    expect(ino).toContain('audio.setVolume(0);')
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

  it('composites transitions by style id instead of a plain crossfade', () => {
    const ino = generatePlayerSketch()
    // The style id is captured and dispatched through the shared helper, which
    // implements all 16 styles (wipe/iris/… plus the crossfade default).
    expect(ino).toContain('#include <Audio_nopsram.h>  // ESP32-audioI2S-nopsram\n#include <FastLED.h>')
    expect(ino).toContain('CRGB samplePalette(uint8_t palId, uint8_t index);')
    expect(ino).toContain('void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);')
    expect(ino).toContain('transType     = (uint8_t)ev.params[0];')
    expect(ino).toContain('void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt)')
    expect(ino).toContain('case 1: {  // wipe')
    expect(ino).toContain('case 15: {  // zoom')
    expect(ino).toContain('compositeTransition(transType, leds, showA, showB, tp);')
  })

  it('emits the shared transition helper verbatim (parity with the generative show)', () => {
    // Guards against drift between the player's copy and the shared module the
    // generative-show sketch uses, so both composite transitions identically.
    expect(generatePlayerSketch()).toContain(TRANSITION_HELPER_CPP)
  })

  it('overlays a particle burst on CMD_PARTICLE_BURST', () => {
    const ino = generatePlayerSketch()
    expect(ino).toContain('#define CMD_PARTICLE_BURST 7')
    expect(ino).toContain('case CMD_PARTICLE_BURST:')
    expect(ino).toContain('float prnd(float n)')                  // shared spawn hash
    expect(ino).toContain('CHSV(burstHue, 217, 255)')            // colored sparks
    expect(ino).toContain('(float)(posMs - burstStart) < PARTICLE_LIFE_MS')
    // Eleven motion styles dispatched by the burst's style id.
    expect(ino).toContain('switch (burstStyle)')
    expect(ino).toContain('case 2: {  // explode')
    expect(ino).toContain('case 5:  // twinkle')
    expect(ino).toContain('case 10:  // confetti')
    expect(ino).toContain('burstStyle     = (uint8_t)(ev.paramCount > 2 ? ev.params[2] : 0.0f);')
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

  it('hosts the baked audio globals and feeds them from the envelope when enabled', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { leds[0] = CRGB(_audioBass * 255, 0, 0); }'],
      count: 1, params: [],
    }
    const ino = generatePlayerSketch({}, renderers, { audioEnvelope: true })
    expect(ino).toContain('_audioBass = 0, _audioMids = 0, _audioTreble = 0')   // globals
    expect(ino).toContain('float     _audioSpectrum[32]')                        // for beat nodes
    expect(ino).toContain('void updateShowAudio(uint32_t ms)')                   // interpolator
    expect(ino).toContain('audioEnv = (uint8_t*)malloc')                         // envelope loader
    expect(ino).toContain('updateShowAudio(posMs)')                             // called each frame
  })

  it('omits the baked audio plumbing by default', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1, params: [],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).not.toContain('updateShowAudio')
    expect(ino).not.toContain('_audioSpectrum')
  })
})

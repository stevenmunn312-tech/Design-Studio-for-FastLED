import { describe, it, expect } from 'vitest'
import { generateProvisionerSketch, PROVISION_CHUNK, PROVISION_RX_BUFFER } from '../sketches/provisionerSketchGenerator'
import { generatePlayerSketch, playerConfigFromGraph } from '../playerSketchGenerator'
import { transitionHelperCpp } from '../helpers/transitionHelperCpp'

describe('generateProvisionerSketch', () => {
  it('bakes the complete SD SPI bus and chunk size into the sketch', () => {
    const ino = generateProvisionerSketch({
      sdCsPin: 21, sdSckPin: 18, sdMisoPin: 19, sdMosiPin: 23,
    })
    expect(ino).toContain('#define SD_CS  21')
    expect(ino).toContain('#define SD_SCK  18')
    expect(ino).toContain('#define SD_MISO  19')
    expect(ino).toContain('#define SD_MOSI  23')
    expect(ino).toContain('_spiBusBegin(SD_SCK, SD_MISO, SD_MOSI)')
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
      node('SDCard', { sdCsPin: 21, sdSckPin: 18, sdMisoPin: 19, sdMosiPin: 23 }),
      node('Amplifier', { i2sBclk: 5, i2sLrc: 6, i2sDout: 7, maxVolume: 12 }),
    ], showEdge)
    expect(cfg).toMatchObject({
      hasPrimaryLedOutput: true,
      ledWidth: 32, ledHeight: 8, chipset: 'SK6812', colorOrder: 'RGB', ledDataPin: 12,
      sdCsPin: 21, sdSckPin: 18, sdMisoPin: 19, sdMosiPin: 23,
      i2sBclk: 5, i2sLrc: 6, i2sDout: 7, maxVolume: 12,
    })
  })

  it('takes the PSRAM request from the controller Board', () => {
    const cfg = playerConfigFromGraph([
      generator,
      node('Board', { psramPolicy: 'on' }),
      node('MatrixOutput', { width: 16, height: 16 }),
    ], showEdge)
    expect(cfg.usePsram).toBe(true)
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

  it('uses the selected board SPI defaults for an older SD card', () => {
    const cfg = playerConfigFromGraph([
      node('Board', { profileId: 'esp32-devkit-v1-30pin-esp32d' }),
      node('SDCard', { sdCsPin: 5 }),
    ], [], 'esp32:esp32:esp32')
    expect(cfg).toMatchObject({
      sdCsPin: 5, sdSckPin: 18, sdMisoPin: 19, sdMosiPin: 23,
    })
  })

  it('falls back to defaults for missing nodes/props', () => {
    // Defaults remain the internal render canvas for a VU-only player, but the
    // missing primary target must not turn them into a phantom LED controller.
    const cfg = playerConfigFromGraph([])
    expect(cfg.hasPrimaryLedOutput).toBe(false)
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
      node('SDCard', { sdCsPin: -4.7, sdSckPin: 19.6, sdMisoPin: 280, sdMosiPin: 'invalid' }),
      // Volume lives with the output now, not with the storage.
      node('Amplifier', { i2sBclk: 19.6, i2sLrc: 280, i2sDout: 'invalid', maxVolume: 99 }),
    ])
    expect(cfg).toMatchObject({
      sdCsPin: 0,
      sdSckPin: 20,
      sdMisoPin: 255,
      sdMosiPin: 11,
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
    // Nothing named, so no preferred-track search is compiled.
    expect(ino).not.toContain('PREFERRED_TRACK')
    expect(ino).toContain('no matching show')
    expect(ino).toContain('No playable track found on the card')
  })

  it('escapes a title that would otherwise break the C string', () => {
    const ino = generatePlayerSketch({}, undefined, { preferredTrack: 'He said "hi"' })
    expect(ino).toContain('PREFERRED_TRACK = "He said \\"hi\\""')
  })
})

describe('generatePlayerSketch audio output', () => {
  it('defaults to direct external I2S through the decoder', () => {
    const ino = generatePlayerSketch()
    expect(ino).toContain('#include <Audio.h>')
    expect(ino).toContain('Audio audio;')
    expect(ino).toContain('audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);')
    expect(ino).toContain('#define I2S_BCLK      26')
    expect(ino).not.toContain('setInternalDAC')
  })

  it('switches to the internal DAC and drops the I2S pin defines', () => {
    const ino = generatePlayerSketch({ audioOutput: 'internalDac' })
    expect(ino).toContain('Audio audio(true);')
    expect(ino).not.toContain('setInternalDAC')
    expect(ino).toContain('#include <Audio.h>')
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
      sdSckPin: 18.6,
      sdMisoPin: 300,
      sdMosiPin: Number.NaN,
      i2sBclk: 260,
      i2sLrc: 24.6,
      i2sDout: Number.NaN,
      maxVolume: -3,
    })
    expect(ino).toContain('#define LED_DATA_PIN  0')
    expect(ino).toContain('#define LED_CLOCK_PIN 255')
    expect(ino).toContain('#define SD_CS         0')
    expect(ino).toContain('#define SD_SCK        19')
    expect(ino).toContain('#define SD_MISO       255')
    expect(ino).toContain('#define SD_MOSI       11')
    expect(ino).toContain('_spiBusBegin(SD_SCK, SD_MISO, SD_MOSI);')
    expect(ino).toContain('#define I2S_BCLK      255')
    expect(ino).toContain('#define I2S_LRC       25')
    expect(ino).toContain('#define I2S_DOUT      22')
    expect(ino).toContain('static const uint8_t PLAYER_MAX_VOLUME = 0;')
    expect(ino).toContain('audio.setVolume(PLAYER_MAX_VOLUME);')
  })
})

describe('generatePlayerSketch', () => {
  it('uses the encoded beat decay and lets FastLED apply global brightness', () => {
    const ino = generatePlayerSketch()
    expect(ino).toContain('flashDecay = expf(')
    // The loader rejects a malformed event, so the arm reads its parameter.
    expect(ino).toContain('flashDecay = expf(-16.0f / (60.0f + (ev.params[1] / 255.0f) * 240.0f));')
    expect(ino).not.toContain('ev.paramCount >')
    expect(ino).toContain('flashLevel *= flashDecay')
    expect(ino.indexOf('// Beat flash overlay')).toBeLessThan(ino.indexOf('\n  FastLED.show();'))
  })

  it('draws nothing, and carries no pattern code, for a player with no patterns', () => {
    const ino = generatePlayerSketch()
    expect(ino).toContain('void renderPattern(uint8_t, float) {}')
    expect(ino).not.toContain('samplePalette')
    expect(ino).not.toContain('animSpeed')
  })

  it('composites transitions by style id instead of a plain crossfade', () => {
    const ino = generatePlayerSketch({}, undefined, { transitionIds: [0, 1, 15] })
    // The style id is captured and dispatched through the shared helper,
    // narrowed to the styles this player can reach.
    expect(ino).toContain('#include <Audio.h>       // ESP32-audioI2S\n#include <FastLED.h>')
    expect(ino).toContain('void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);')
    expect(ino).toContain('transType     = (uint8_t)ev.params[0];')
    expect(ino).toContain('void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt)')
    expect(ino).toContain('case 1: {  // wipe')
    expect(ino).toContain('case 15: {  // zoom')
    expect(ino).not.toContain('case 2: {  // dissolve')
    expect(ino).toContain('compositeTransition(transType, leds, showA, showB, tp);')
  })

  it('emits the shared transition helper verbatim (parity with the generative show)', () => {
    // Guards against drift between the player's copy and the shared module the
    // generative-show sketch uses, so both composite transitions identically.
    expect(generatePlayerSketch({}, undefined, { transitionIds: [0, 4] })).toContain(transitionHelperCpp([0, 4]))
  })

  it('compiles only crossfade when no other style is reachable', () => {
    const ino = generatePlayerSketch()
    // One reachable style needs no dispatch.
    expect(ino).toContain('  // crossfade (0)\n  ::memmove(out, a,')
    expect(ino).not.toContain('switch (type)')
    expect(ino).not.toContain('case 1: {  // wipe')
    expect(ino).not.toContain('case 20: {  // slab tilt')
    expect(ino).not.toContain('_sampleShaded')
    expect(ino).not.toContain('_depthShade')
  })

  it('overlays a particle burst on CMD_PARTICLE_BURST', () => {
    const ino = generatePlayerSketch()
    expect(ino).toContain('#define CMD_PARTICLE_BURST 7')
    expect(ino).toContain('case CMD_PARTICLE_BURST:')
    expect(ino).toContain('float prnd(float n)')                  // shared spawn hash
    expect(ino).toContain('CRGB base = burstColor;')             // configured/event color
    expect(ino).toContain('(float)(posMs - burstStart) < PARTICLE_LIFE_MS')
    // Eleven motion styles dispatched by the burst's style id.
    expect(ino).toContain('switch (burstStyle)')
    expect(ino).toContain('case 2: {  // explode')
    expect(ino).toContain('case 5:  // twinkle')
    expect(ino).toContain('case 10:  // confetti')
    expect(ino).toContain('burstStyle     = (uint8_t)ev.params[2];')
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
    // One pattern needs no dispatch; the role still reaches it.
    expect(ino).toContain('render_p0((uint32_t)(t * 1000.0f), energy);')
    expect(ino).not.toContain('renderPattern(')
  })

  it('omits the energy plumbing when no role params are threaded', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1, params: [],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).not.toContain('case CMD_SET_ENERGY')
    expect(ino).toContain('render_p0((uint32_t)(t * 1000.0f));')
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
    expect(ino).toContain('float      speed     = 0.5f;')            // role global
    expect(ino).toContain('case CMD_SET_SPEED:      speed = constrain(ev.params[0] * 0.5f, 0.0f, 1.0f); break;')
    expect(ino).toContain('render_p0((uint32_t)(t * 1000.0f), energy, speed);')
  })

  it('does not touch the speed global when speed is not a threaded role', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms, float energy) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1, params: ['energy'],
    }
    const ino = generatePlayerSketch({}, renderers)
    expect(ino).not.toContain('float      speed')
    // Nothing reads a speed, so the event has no arm.
    expect(ino).not.toContain('case CMD_SET_SPEED:')
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
    expect(ino).toContain('CRGBPalette16 paletteFromId(uint8_t palId)')
    expect(ino).toContain('case CMD_SET_PALETTE:    palette = paletteFromId((uint8_t)ev.params[0]); break;')
    expect(ino).toContain('render_p0((uint32_t)(t * 1000.0f), palette);')     // passed to render fn
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
    expect(ino).not.toContain('case CMD_SET_PALETTE:')
    // No palette is named, so no palette table costs RAM.
    expect(ino).not.toContain('CRGBPalette16 paldef_')
  })

  it('takes the raw speed multiplier and only the reachable palettes for built-in show patterns', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms, float speed, const CRGBPalette16& palette) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
      count: 1, params: ['speed', 'palette'], rawSpeed: true,
    }
    const ino = generatePlayerSketch({}, renderers, { paletteNames: ['ocean', 'heat'] })
    expect(ino).toContain('float      speed     = 1.0f;')
    expect(ino).toContain('case CMD_SET_SPEED:      speed = ev.params[0]; break;')
    expect(ino).toContain('default: return paldef_ocean;')
    expect(ino).toMatch(/case \d+: {2}return paldef_heat;/)
    expect(ino).toContain('CRGBPalette16 paldef_ocean(')
    expect(ino).not.toContain('CRGBPalette16 paldef_lava(')
  })

  it('hosts the baked audio globals and feeds them from the envelope when enabled', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { leds[0] = CRGB(_audioBass * 255, 0, 0); }'],
      count: 1, params: [],
    }
    const ino = generatePlayerSketch({}, renderers, { audioEnvelope: true })
    expect(ino).toContain('_audioBass = 0, _audioMids = 0, _audioTreble = 0')   // globals
    // No pattern reads the spectrum, so it is neither stored nor filled.
    expect(ino).not.toContain('_audioSpectrum')
    expect(ino).toContain('void updateShowAudio(uint32_t ms)')                   // interpolator
    expect(ino).toContain('audioEnv = (uint8_t*)malloc')                         // envelope loader
    expect(ino).toContain('updateShowAudio(posMs)')                             // called each frame
    expect(ino).not.toContain('audioEnvSpectrum')
  })

  it('loads the baked equalizer block and fills the spectrum from it when a pattern reads one', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { leds[0] = CRGB(_audioSpectrum[3] * 255, 0, 0); }'],
      count: 1, params: [],
    }
    const ino = generatePlayerSketch({}, renderers, { audioEnvelope: true })
    expect(ino).toContain('if (tagged && version == 3')
    expect(ino).toContain('audioEnvSpectrum = (uint8_t*)malloc(frames * 16);')
    expect(ino).toContain('int e = b >> 1;')
    // The three-band fill stays as the low-memory fallback.
    expect(ino).toContain('_audioSpectrum[b] = b < 6 ? _audioBass')
  })

  it('taps decoded PCM before I2S and prefers live FastLED analysis over the baked fallback', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { leds[0] = CRGB(_audioBass * 255, _audioBeat ? 255 : 0, 0); }'],
      count: 1, params: [],
    }
    const ino = generatePlayerSketch({}, renderers, { audioEnvelope: true, decoderTap: true })

    expect(ino).toContain('void audio_process_i2s(int16_t* outBuff, uint16_t validSamples')
    expect(ino).toContain('if (continueI2S) *continueI2S = true;')
    expect(ino).toContain('fl::make_shared<fl::audio::Processor>()')
    // Analysis runs in its own task on core 0, woken by the producer, and
    // yields after every block so core 0's idle task still feeds the watchdog.
    // On the LED loop it cost 38 ms a frame on a 256 kbps station.
    const task = ino.slice(ino.indexOf('static void _decoderAnalysisLoop(void *) {'), ino.indexOf('void setupDecoderTap() {'))
    expect(task).toContain('_audioProcessor->update(fl::audio::Sample(fl::span<const fl::i16>(block, DECODER_TAP_BLOCK_SAMPLES), now));')
    expect(task).toContain('_audioBass = _audioProcessor->getBassLevel();')
    expect(task).toContain('vTaskDelay(1);')
    expect(ino).toContain('xTaskCreatePinnedToCore(_decoderAnalysisLoop, "audioAnalysis", 8192, nullptr, 1, &_decoderAnalysisTask, 0);')
    expect(ino).toContain('if (_decoderAnalysisTask) xTaskNotifyGive(_decoderAnalysisTask);')
    const loopSide = ino.slice(ino.indexOf('void updateDecoderAudio() {'), ino.indexOf('void resetDecoderTapLevels() {'))
    expect(loopSide).not.toContain('_audioProcessor->')
    expect(loopSide).toContain('_audioBeat = beatCount != _audioBeatSeen;')
    // The decoder fills the ring from its own task, so the shared count only
    // moves under the lock.
    expect(ino).toContain('static portMUX_TYPE _decoderTapMux = portMUX_INITIALIZER_UNLOCKED;')
    expect(ino).not.toContain('while (_decoderTapQueued > 0)')
    const changes = [...ino.matchAll(/^ +_decoderTapQueued(?:\+\+|--| = 0);/gm)]
    expect(changes.length).toBe(4)
    for (const change of changes) {
      const before = ino.slice(0, change.index)
      expect(before.lastIndexOf('portENTER_CRITICAL(&_decoderTapMux);')).toBeGreaterThan(before.lastIndexOf('portEXIT_CRITICAL(&_decoderTapMux);'))
    }
    expect(ino).not.toContain('_audioSpectrum')
    expect(ino).toContain('setupDecoderTap();')
    expect(ino).toContain('if (!_decoderTapLive) updateShowAudio(posMs);')
    expect(ino.indexOf('audio.loop();')).toBeLessThan(ino.indexOf('updateDecoderAudio();'))
  })

  it('undoes the classic ESP32 DAC bias before analysing tapped PCM', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { leds[0] = CRGB(_audioBass * 255, 0, 0); }'],
      count: 1, params: [],
    }
    const ino = generatePlayerSketch({ audioOutput: 'internalDac' }, renderers, { decoderTap: true })
    // Resolved at generation: the bias code is in, and no switch for it remains.
    expect(ino).not.toContain('DECODER_TAP_INTERNAL_DAC')
    expect(ino).toContain('(int32_t)(uint16_t)raw - 32768')
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

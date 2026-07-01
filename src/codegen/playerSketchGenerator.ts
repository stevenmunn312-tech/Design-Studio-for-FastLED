// Generates the ESP32-S3 player sketch that:
//   - plays MP3 from SD card via I2S
//   - reads the companion .show file
//   - executes LED commands at the right timestamps in sync with audio position
//
// Two modes share the same scaffold (audio sync, .show loader, event loop):
//   - enum show (version 1): the built-in `renderPattern` switch below.
//   - collection show (version 2): pass `renderers` (compiled from the wired
//     Pattern Collection via showGenerator.buildPatternRenderers). Each
//     SET_PATTERN index then dispatches to a `render_pN()` function.

import type { PatternRenderers } from './showGenerator'

export interface PlayerConfig {
  ledWidth:    number
  ledHeight:   number
  ledDataPin:  number
  chipset:     string
  colorOrder:  string
  sdCsPin:     number
  i2sBclk:     number   // I2S bit clock pin
  i2sLrc:      number   // I2S left/right clock (word select)
  i2sDout:     number   // I2S data out to DAC
  maxVolume:   number   // 0-21 for MAX98357A
}

const DEFAULTS: PlayerConfig = {
  ledWidth: 16, ledHeight: 16, ledDataPin: 18,
  chipset: 'WS2812B', colorOrder: 'GRB',
  sdCsPin: 5,
  i2sBclk: 26, i2sLrc: 25, i2sDout: 22,
  maxVolume: 18,
}

// Minimal node shape so this stays decoupled from the graph store.
interface ConfigNode { data: { nodeType: string; properties: Record<string, unknown> } }

/**
 * Derive the player's hardware config from the graph: LED matrix settings come
 * from the MatrixOutput node, SD + I2S audio pins from the SDCard node. Used by
 * the music-sync upload flow, where the SDCard is wired into MatrixOutput.
 */
export function playerConfigFromGraph(nodes: ConfigNode[]): Partial<PlayerConfig> {
  const mo = nodes.find((n) => n.data.nodeType === 'MatrixOutput')?.data.properties ?? {}
  const sd = nodes.find((n) => n.data.nodeType === 'SDCard')?.data.properties ?? {}
  const num = (v: unknown, d: number) => (v === undefined || v === null ? d : Number(v))
  const str = (v: unknown, d: string) => (v === undefined || v === null ? d : String(v))
  return {
    ledWidth:   num(mo.width, DEFAULTS.ledWidth),
    ledHeight:  num(mo.height, DEFAULTS.ledHeight),
    ledDataPin: num(mo.dataPin, DEFAULTS.ledDataPin),
    chipset:    str(mo.chipset, DEFAULTS.chipset),
    colorOrder: str(mo.colorOrder, DEFAULTS.colorOrder),
    sdCsPin:    num(sd.sdCsPin, DEFAULTS.sdCsPin),
    i2sBclk:    num(sd.i2sBclk, DEFAULTS.i2sBclk),
    i2sLrc:     num(sd.i2sLrc, DEFAULTS.i2sLrc),
    i2sDout:    num(sd.i2sDout, DEFAULTS.i2sDout),
    maxVolume:  num(sd.maxVolume, DEFAULTS.maxVolume),
  }
}

export function generatePlayerSketch(
  cfg: Partial<PlayerConfig> = {}, renderers?: PatternRenderers,
  // `audioEnvelope`: the .show carries a baked bass/mids/treble track (see
  // bakeEnvelope) and the collected patterns were compiled with externalAudio,
  // so the player hosts the _audio* globals and feeds them from the track.
  opts: { audioEnvelope?: boolean } = {},
): string {
  const c = { ...DEFAULTS, ...cfg }
  const numLeds = c.ledWidth * c.ledHeight
  const collection = !!(renderers && renderers.count > 0)
  const bakedAudio = !!opts.audioEnvelope

  // Collection patterns: per-pattern frame buffers, deduped helpers, and the
  // render_pN() functions — emitted above renderPattern().
  const patternDecls = collection
    ? [
        ...renderers!.buffers,
        '',
        ...renderers!.helpers.flatMap((h) => [h, '']),
        ...renderers!.functions.flatMap((fn) => [fn, '']),
      ].join('\n')
    : ''

  // Role params ("Use group inputs"): each render_pN takes extra floats fed
  // from globals the event stream updates (e.g. SET_ENERGY → energy).
  const roleParams = collection ? renderers!.params : []
  const argList = roleParams.map((pName) => `, ${pName}`).join('')
  const hasEnergy = roleParams.includes('energy')
  const hasSpeed = roleParams.includes('speed')
  const hasPalette = roleParams.includes('palette')

  // renderPattern() either dispatches to a render_pN() (collection) or runs the
  // built-in pattern switch (enum). The render_pN() bodies expect ms.
  const renderPatternFn = collection
    ? [
        'void renderPattern(float t) {',
        '  uint32_t ms = (uint32_t)(t * 1000.0f);',
        '  switch (patternId) {',
        ...Array.from({ length: renderers!.count }, (_, i) => `    case ${i}: render_p${i}(ms${argList}); break;`),
        `    default: render_p0(ms${argList}); break;`,
        '  }',
        '}',
      ].join('\n')
    : `void renderPattern(float t) {
  switch (patternId) {
    case 0:  // SolidColor
      fill_solid(leds, NUM_LEDS, samplePalette(paletteId, 0));
      break;
    case 1:  // NoiseField
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++) {
          float v = (sin(x * 0.5f + t * animSpeed) + cos(y * 0.5f + t * animSpeed * 0.7f)) * 0.5f;
          leds[y * WIDTH + x] = samplePalette(paletteId, (uint8_t)((v + 1) * 100 + t * 10));
        }
      break;
    case 2:  // Plasma
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++) {
          float v = sin(x / 3.0f + t * animSpeed)
                  + sin(y / 3.0f + t * animSpeed * 0.8f)
                  + sin((x + y) / 5.0f + t * animSpeed * 0.6f);
          leds[y * WIDTH + x] = samplePalette(paletteId, (uint8_t)(v * 45 + t * 20));
        }
      break;
    case 3:  // Fire
    case 4: { // Fire2012
      static uint8_t heat[${c.ledHeight}][${c.ledWidth}] = {};
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++)
          heat[y][x] = qsub8(heat[y][x], random8(0, 12));
      for (int y = 0; y < HEIGHT - 2; y++)
        for (int x = 0; x < WIDTH; x++)
          heat[y][x] = (heat[y+1][x] + heat[y+2][max(0,x-1)] + heat[y+2][x] + heat[y+2][min(WIDTH-1,x+1)]) / 4;
      for (int x = 0; x < WIDTH; x++)
        if (random8() < 120) heat[HEIGHT-1][x] = qadd8(heat[HEIGHT-1][x], random8(160, 255));
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++)
          leds[y * WIDTH + x] = HeatColor(heat[y][x]);
      break;
    }
    case 6:  // RadialBurst
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++) {
          float d = sqrt((x-WIDTH/2.0f)*(x-WIDTH/2.0f)+(y-HEIGHT/2.0f)*(y-HEIGHT/2.0f))
                    / sqrt(WIDTH*WIDTH/4.0f + HEIGHT*HEIGHT/4.0f);
          float w = (sin((d * 8 - t * animSpeed * 3) * 3.14159f) + 1) / 2.0f;
          leds[y * WIDTH + x] = samplePalette(paletteId, (uint8_t)(w * 255));
        }
      break;
    case 7:  // Spiral
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++) {
          float d = sqrt((x-WIDTH/2.0f)*(x-WIDTH/2.0f)+(y-HEIGHT/2.0f)*(y-HEIGHT/2.0f))
                    / sqrt(WIDTH*WIDTH/4.0f + HEIGHT*HEIGHT/4.0f);
          float a = atan2(y-HEIGHT/2.0f, x-WIDTH/2.0f);
          float s = (a + d * 12.57f - t * animSpeed * 3.14159f) * 2;
          leds[y * WIDTH + x] = samplePalette(paletteId, (uint8_t)((sin(s)+1)/2.0f*255));
        }
      break;
    case 11: // GradientFrame
    default:
      for (int i = 0; i < NUM_LEDS; i++)
        leds[i] = samplePalette(paletteId, (uint8_t)(i * 255 / NUM_LEDS + t * 10));
      break;
  }
}`

  return `// FastLED Studio — Music-Sync Player${collection ? ' (collection show)' : ''}
// Generated by FastLED Studio. Requires:
//   - ESP32-audioI2S  (schreibfaul1/ESP32-audioI2S on GitHub)
//   - FastLED
//   - SD (built-in Arduino)
// Hardware: SD card on SPI, I2S DAC (MAX98357A or PCM5102) on pins below.

#include <FastLED.h>
#include <SD.h>
#include <SPI.h>
#include <Audio.h>       // ESP32-audioI2S

// ── Pin config ────────────────────────────────────────────────────────────────
#define LED_DATA_PIN  ${c.ledDataPin}
#define WIDTH         ${c.ledWidth}
#define HEIGHT        ${c.ledHeight}
#define NUM_LEDS      ${numLeds}
#define SD_CS         ${c.sdCsPin}
#define I2S_BCLK      ${c.i2sBclk}
#define I2S_LRC       ${c.i2sLrc}
#define I2S_DOUT      ${c.i2sDout}

// ── Show file binary format ───────────────────────────────────────────────────
// Header: magic(4) + version(1) + bpm_x10(2) + duration_ms(4) + event_count(4)
// Event:  t_ms(4) + cmd(1) + param_count(1) + params[](float32 * N)
#define CMD_SET_PATTERN    0
#define CMD_SET_PALETTE    1
#define CMD_SET_SPEED      2
#define CMD_SET_BRIGHTNESS 3
#define CMD_BEAT_FLASH     4
#define CMD_TRANSITION     5
#define CMD_SET_ENERGY     6

struct ShowEvent {
  uint32_t t;
  uint8_t  cmd;
  uint8_t  paramCount;
  float    params[4];
};

// ── Globals ───────────────────────────────────────────────────────────────────
CRGB leds[NUM_LEDS];
Audio audio;

ShowEvent* showEvents = nullptr;
uint32_t   eventCount = 0;
uint32_t   eventIdx   = 0;
float      animSpeed  = 1.0f;
uint8_t    patternId  = ${collection ? 0 : 2};        // active pattern${collection ? ' index' : ' (default: Plasma)'}
uint8_t    paletteId  = 0;        // default: Rainbow
float      flashLevel = 0.0f;
float      flashDecay = 0.82f;
float      transProgress = 1.0f;  // 1 = no transition in progress
${hasEnergy ? 'float      energy    = 0.0f;      // SET_ENERGY → energy group-input role\n' : ''}${hasSpeed ? 'float      speed     = 0.5f;      // SET_SPEED (normalised 0–1) → speed group-input role\n' : ''}${hasPalette ? 'CRGBPalette16 palette = RainbowColors_p;  // SET_PALETTE → palette group-input role\n' : ''}${bakedAudio ? `
// Baked audio envelope (song-synced FFT), fed into the pattern audio globals.
float     _audioBass = 0, _audioMids = 0, _audioTreble = 0;   // 0–1, current frame
float     _audioSpectrum[32];        // coarse spectrum for BeatDetect/PercussionDetect
uint8_t*  audioEnv = nullptr;        // frameCount * 3 bytes (bass, mids, treble)
uint32_t  audioEnvFrames = 0;
uint8_t   audioEnvRate = 50;
` : ''}

// ── Palette helper ────────────────────────────────────────────────────────────
CRGB samplePalette(uint8_t palId, uint8_t index) {
  switch (palId) {
    case 1:  return ColorFromPalette(OceanColors_p,   index);
    case 2:  return ColorFromPalette(LavaColors_p,    index);
    case 3:  return ColorFromPalette(ForestColors_p,  index);
    case 4:  return ColorFromPalette(HeatColors_p,    index);
    case 5:  return ColorFromPalette(PartyColors_p,   index);
    default: return ColorFromPalette(RainbowColors_p, index);
  }
}
${hasPalette ? `
// Palette-role helper: map a SET_PALETTE id to a CRGBPalette16 (mirrors the
// samplePalette() switch above) so the \`palette\` group-input role tracks the
// same preset the global enum path would use.
CRGBPalette16 paletteFromId(uint8_t palId) {
  switch (palId) {
    case 1:  return OceanColors_p;
    case 2:  return LavaColors_p;
    case 3:  return ForestColors_p;
    case 4:  return HeatColors_p;
    case 5:  return PartyColors_p;
    default: return RainbowColors_p;
  }
}
` : ''}
// ── Pattern renderers ─────────────────────────────────────────────────────────
${patternDecls}${renderPatternFn}

// ── Show file loader ──────────────────────────────────────────────────────────
bool loadShowFile(const char* path) {
  File f = SD.open(path, FILE_READ);
  if (!f) return false;

  uint8_t header[15];
  f.read(header, 15);
  if (header[0]!='S'||header[1]!='H'||header[2]!='O'||header[3]!='W') { f.close(); return false; }

  eventCount = ((uint32_t)header[11]) | ((uint32_t)header[12]<<8) |
               ((uint32_t)header[13]<<16) | ((uint32_t)header[14]<<24);
  if (showEvents) free(showEvents);
  showEvents = (ShowEvent*)malloc(eventCount * sizeof(ShowEvent));
  if (!showEvents) { f.close(); return false; }

  for (uint32_t i = 0; i < eventCount; i++) {
    uint8_t evBuf[6]; f.read(evBuf, 6);
    showEvents[i].t = ((uint32_t)evBuf[0])|((uint32_t)evBuf[1]<<8)|
                      ((uint32_t)evBuf[2]<<16)|((uint32_t)evBuf[3]<<24);
    showEvents[i].cmd        = evBuf[4];
    showEvents[i].paramCount = evBuf[5];
    for (uint8_t p = 0; p < showEvents[i].paramCount && p < 4; p++) {
      uint8_t fb[4]; f.read(fb, 4);
      uint32_t raw = ((uint32_t)fb[0])|((uint32_t)fb[1]<<8)|
                     ((uint32_t)fb[2]<<16)|((uint32_t)fb[3]<<24);
      memcpy(&showEvents[i].params[p], &raw, 4);
    }
  }
${bakedAudio ? `
  // Trailing audio envelope: rate(1) + frameCount(4) + 3 bytes/frame.
  if (f.available() >= 5) {
    audioEnvRate = f.read();
    uint8_t cb[4]; f.read(cb, 4);
    audioEnvFrames = ((uint32_t)cb[0])|((uint32_t)cb[1]<<8)|((uint32_t)cb[2]<<16)|((uint32_t)cb[3]<<24);
    if (audioEnv) free(audioEnv);
    audioEnv = (uint8_t*)malloc(audioEnvFrames * 3);
    if (audioEnv) f.read(audioEnv, audioEnvFrames * 3);
    else audioEnvFrames = 0;
  }
` : ''}  f.close();
  eventIdx = 0;
  return true;
}
${bakedAudio ? `
// Drive the pattern audio globals from the baked envelope at the current audio
// position (linear interpolation), so a pattern's FFTAnalyzer reacts in sync.
void updateShowAudio(uint32_t ms) {
  if (!audioEnv || audioEnvFrames == 0) { _audioBass = _audioMids = _audioTreble = 0; return; }
  float fpos = ms * (audioEnvRate / 1000.0f);
  uint32_t i = (uint32_t)fpos;
  if (i >= audioEnvFrames) i = audioEnvFrames - 1;
  uint32_t j = (i + 1 < audioEnvFrames) ? i + 1 : i;
  float frac = fpos - (float)i;
  _audioBass   = (audioEnv[i*3+0] + (audioEnv[j*3+0] - audioEnv[i*3+0]) * frac) / 255.0f;
  _audioMids   = (audioEnv[i*3+1] + (audioEnv[j*3+1] - audioEnv[i*3+1]) * frac) / 255.0f;
  _audioTreble = (audioEnv[i*3+2] + (audioEnv[j*3+2] - audioEnv[i*3+2]) * frac) / 255.0f;
  // Coarse spectrum so BeatDetect/PercussionDetect still respond (bass→low bins,
  // mids→mid, treble→high). Approximate — full baked spectrum is a follow-up.
  for (int b = 0; b < 32; b++)
    _audioSpectrum[b] = b < 6 ? _audioBass : (b < 16 ? _audioMids : _audioTreble);
}
` : ''}

// ── Event dispatcher ──────────────────────────────────────────────────────────
void applyEvent(const ShowEvent& ev) {
  switch (ev.cmd) {
    case CMD_SET_PATTERN:    patternId  = (uint8_t)ev.params[0]; break;
    case CMD_SET_PALETTE:    paletteId  = (uint8_t)ev.params[0];${hasPalette ? ' palette = paletteFromId(paletteId);' : ''} break;
    case CMD_SET_SPEED:      animSpeed  = ev.params[0];${hasSpeed ? ' speed = constrain(ev.params[0] * 0.5f, 0.0f, 1.0f);' : ''} break;
    case CMD_SET_BRIGHTNESS: FastLED.setBrightness((uint8_t)ev.params[0]); break;
    case CMD_BEAT_FLASH:
      flashLevel = ev.params[0] / 255.0f;
      flashDecay = expf(-16.0f / (60.0f + ((ev.paramCount > 1 ? ev.params[1] : 22.0f) / 255.0f) * 240.0f));
      break;
    case CMD_TRANSITION:     transProgress = 0.0f; break;${hasEnergy ? '\n    case CMD_SET_ENERGY:     energy = ev.params[0]; break;' : ''}
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  FastLED.addLeds<${c.chipset}, LED_DATA_PIN, ${c.colorOrder}>(leds, NUM_LEDS);
  FastLED.setBrightness(180);

  if (!SD.begin(SD_CS)) { Serial.println("SD mount failed"); while(1); }

  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(${c.maxVolume});

  // Play the first .mp3 found in /music/
  File root = SD.open("/music");
  File entry = root.openNextFile();
  while (entry) {
    String name = entry.name();
    if (name.endsWith(".mp3") || name.endsWith(".MP3")) {
      String showPath = "/shows/" + name.substring(0, name.lastIndexOf('.')) + ".show";
      loadShowFile(showPath.c_str());
      audio.connecttoFS(SD, ("/music/" + name).c_str());
      Serial.printf("Playing: %s\\n", name.c_str());
      break;
    }
    entry = root.openNextFile();
  }
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  audio.loop();

  uint32_t posMs = audio.getFilePos() > 0
    ? (uint32_t)(audio.getFilePos() * 8.0f / audio.getBitRate() * 1000.0f)
    : 0;

  // Dispatch all events whose timestamp has passed
  while (eventIdx < eventCount && showEvents[eventIdx].t <= posMs) {
    applyEvent(showEvents[eventIdx]);
    eventIdx++;
  }
${bakedAudio ? '  updateShowAudio(posMs);   // song-synced FFT → pattern audio globals\n' : ''}
  float t = posMs / 1000.0f;
  renderPattern(t);

  // Beat flash overlay
  if (flashLevel > 0.01f) {
    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i].r = qadd8(leds[i].r, (uint8_t)((255 - leds[i].r) * flashLevel));
      leds[i].g = qadd8(leds[i].g, (uint8_t)((255 - leds[i].g) * flashLevel));
      leds[i].b = qadd8(leds[i].b, (uint8_t)((255 - leds[i].b) * flashLevel));
    }
    flashLevel *= flashDecay;
  }

  FastLED.show();
  FastLED.delay(16);  // ~60 fps
}
`
}

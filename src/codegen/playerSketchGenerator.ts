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
import { STUDIO_PALETTES, customPaletteDeclarationsCpp, paletteCppRef } from '../state/paletteCatalog'

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

function cppPrototype(definition: string): string | null {
  const match = definition.match(/^([^\n{]+?\([^)]*\))\s*\{/m)
  return match ? `${match[1]};` : null
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
  const paletteSampleCases = STUDIO_PALETTES
    .slice(1)
    .map((palette, index) => `    case ${index + 1}:  return ColorFromPalette(${paletteCppRef(palette)}, index);`)
    .join('\n')
  const paletteFromIdCases = STUDIO_PALETTES
    .slice(1)
    .map((palette, index) => `    case ${index + 1}:  return ${paletteCppRef(palette)};`)
    .join('\n')
  const paletteGlobals = customPaletteDeclarationsCpp().join('\n')
  const fastLedDecls = new Set<string>([
    'void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);',
    'CRGB samplePalette(uint8_t palId, uint8_t index);',
  ])
  if (hasPalette) fastLedDecls.add('CRGBPalette16 paletteFromId(uint8_t palId);')
  if (collection) {
    for (const block of [...renderers!.helpers, ...renderers!.functions]) {
      const proto = cppPrototype(block)
      if (proto && /CRGB(?:Palette16)?/.test(proto)) fastLedDecls.add(proto)
    }
  }

  // renderPattern() either dispatches to a render_pN() (collection) or runs the
  // built-in pattern switch (enum). The render_pN() bodies expect ms.
  const renderPatternFn = collection
    ? [
        'void renderPattern(uint8_t pid, float t) {',
        '  uint32_t ms = (uint32_t)(t * 1000.0f);',
        '  switch (pid) {',
        ...Array.from({ length: renderers!.count }, (_, i) => `    case ${i}: render_p${i}(ms${argList}); break;`),
        `    default: render_p0(ms${argList}); break;`,
        '  }',
        '}',
      ].join('\n')
    : `void renderPattern(uint8_t pid, float t) {
  switch (pid) {
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

  // All 16 transition styles as one self-contained function operating on generic
  // buffers, so the player composites A→B the same way the browser preview does
  // (compositeTransition in graphEvaluator.ts). A .show transition carries only
  // its style id + duration, so the direction/axis/tile/count/turns params use
  // the same defaults the preview falls back to. `out` must differ from a and b.
  const transitionHelper = `// ── Transitions ─────────────────────────────────────────────────────────────
void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt) {
  switch (type) {
    case 1: {  // wipe (rightward)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      int thr = (int)(tt * WIDTH);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if (x < thr) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 2: {  // dissolve
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int i = 0; i < NUM_LEDS; i++) {
        uint32_t h = ((uint32_t)i * 1664525u + 1013904223u);
        if ((h & 0xFFFF) < (uint32_t)(tt * 65535)) out[i] = b[i];
      }
      break;
    }
    case 3: {  // iris
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, r = tt * sqrtf(cx*cx + cy*cy);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x - cx, dy = y - cy;
        if (sqrtf(dx*dx + dy*dy) < r) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 4: {  // clockwipe
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float n = (atan2f(x - cx, -(y - cy)) + 3.14159265f) / 6.2831853f;
        if (n < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 5: {  // push (rightward)
      fill_solid(out, NUM_LEDS, CRGB::Black);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        int ax = (int)roundf(x + tt*WIDTH), bx = (int)roundf(x - (1.0f-tt)*WIDTH);
        if (bx >= 0 && bx < WIDTH) out[y*WIDTH+x] = b[y*WIDTH+bx];
        else if (ax >= 0 && ax < WIDTH) out[y*WIDTH+x] = a[y*WIDTH+ax];
      }
      break;
    }
    case 6: {  // checkerboard (tile 4)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float thr = ((x/4 + y/4) % 2 == 0) ? tt*2.0f : tt*2.0f - 1.0f;
        if (thr >= 1.0f) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 7: {  // diagonal
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float n = ((float)x/WIDTH + (float)y/HEIGHT) * 0.5f;
        if (n < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 8: {  // fadeblack
      float al = tt < 0.5f ? 1.0f - tt*2.0f : (tt - 0.5f)*2.0f;
      for (int i = 0; i < NUM_LEDS; i++) { CRGB s = tt < 0.5f ? a[i] : b[i];
        out[i] = CRGB((uint8_t)(s.r*al), (uint8_t)(s.g*al), (uint8_t)(s.b*al)); }
      break;
    }
    case 9: {  // fadewhite
      float al = tt < 0.5f ? 1.0f - tt*2.0f : (tt - 0.5f)*2.0f, w = (1.0f - al)*255.0f;
      for (int i = 0; i < NUM_LEDS; i++) { CRGB s = tt < 0.5f ? a[i] : b[i];
        out[i] = CRGB((uint8_t)(s.r*al+w), (uint8_t)(s.g*al+w), (uint8_t)(s.b*al+w)); }
      break;
    }
    case 10: {  // blinds (4, horizontal)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      int slat = max(1, HEIGHT / 4);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if ((float)(y % slat) / slat < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 11: {  // ripple
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, maxR = sqrtf(cx*cx+cy*cy), e = 0.08f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x-cx, dy = y-cy, n = sqrtf(dx*dx+dy*dy) / maxR;
        int idx = y*WIDTH+x;
        if (n < tt - e) out[idx] = b[idx];
        else if (n < tt) { float bl = (tt - n) / e; out[idx] = blend(a[idx], b[idx], (uint8_t)(bl*255)); }
      }
      break;
    }
    case 12: {  // spiral (2 turns)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, maxR = sqrtf(cx*cx+cy*cy), k = 1.0f + 1.0f/2.0f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x-cx, dy = y-cy, r = sqrtf(dx*dx+dy*dy) / maxR;
        float na = (atan2f(dy, dx) + 3.14159265f) / 6.2831853f;
        if ((r + na/2.0f) / k < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 13: {  // curtain (horizontal)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if (fabsf(2.0f*y/HEIGHT - 1.0f) < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 14: {  // scanlines
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float thr = (y % 2 == 0) ? ((float)y/HEIGHT)*0.5f : 0.5f + ((float)(y-1)/HEIGHT)*0.5f;
        if (tt > thr) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 15: {  // zoom
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, sc = max(0.01f, tt);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        int bx = (int)((x-cx)/sc + cx), by = (int)((y-cy)/sc + cy), idx = y*WIDTH+x;
        if (bx >= 0 && bx < WIDTH && by >= 0 && by < HEIGHT)
          out[idx] = blend(out[idx], b[by*WIDTH+bx], (uint8_t)(tt*255));
        else out[idx].nscale8((uint8_t)((1.0f-tt)*255));
      }
      break;
    }
    default: {  // crossfade (0)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      nblend(out, b, NUM_LEDS, (uint8_t)(tt * 255));
      break;
    }
  }
}

// Hash → [0,1) (GLSL fract(sin(...)) — mirrors prnd() in showPreview.ts so the
// device spawns the same particle sparks as the browser preview).
float prnd(float n) { float s = sinf(n * 12.9898f) * 43758.5453f; return s - floorf(s); }
`

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

// Explicit FastLED-typed declarations keep the Arduino preprocessor from
// inventing its own before <FastLED.h>, which breaks CRGB names.
${[...fastLedDecls].join('\n')}

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
#define CMD_PARTICLE_BURST 7

// Particle-burst overlay — keep in sync with showPreview.ts (PARTICLE_LIFE_MS,
// PARTICLE_COUNT) so the device spawns the same sparks the browser preview does.
#define PARTICLE_LIFE_MS   600
#define PARTICLE_COUNT     16

struct ShowEvent {
  uint32_t t;
  uint8_t  cmd;
  uint8_t  paramCount;
  float    params[4];
};

// ── Globals ───────────────────────────────────────────────────────────────────
CRGB leds[NUM_LEDS];
CRGB showA[NUM_LEDS];             // outgoing pattern during a transition
CRGB showB[NUM_LEDS];            // incoming pattern during a transition
Audio audio;

ShowEvent* showEvents = nullptr;
uint32_t   eventCount = 0;
uint32_t   eventIdx   = 0;
float      animSpeed  = 1.0f;
uint8_t    patternId  = ${collection ? 0 : 2};        // active pattern${collection ? ' index' : ' (default: Plasma)'}
uint8_t    prevPatternId = ${collection ? 0 : 2};     // outgoing pattern during a transition
uint8_t    paletteId  = 0;        // default: Rainbow
float      flashLevel = 0.0f;
float      flashDecay = 0.82f;
uint8_t    transType  = 0;        // transition style id (see compositeTransition)
uint32_t   transStart = 0;        // ms the current transition began
float      transDurMs = 0.0f;     // 0 = no transition in progress
uint32_t   burstStart = 0;        // ms the current particle burst began
float      burstIntensity = 0.0f; // 0–1 spark brightness (0 = no burst)
uint8_t    burstHue   = 0;        // spark hue
uint8_t    burstStyle = 0;        // particle motion style (see PARTICLE_STYLES)
${hasEnergy ? 'float      energy    = 0.0f;      // SET_ENERGY → energy group-input role\n' : ''}${hasSpeed ? 'float      speed     = 0.5f;      // SET_SPEED (normalised 0–1) → speed group-input role\n' : ''}${hasPalette ? 'CRGBPalette16 palette = RainbowColors_p;  // SET_PALETTE → palette group-input role\n' : ''}${bakedAudio ? `
// Baked audio envelope (song-synced FFT), fed into the pattern audio globals.
float     _audioBass = 0, _audioMids = 0, _audioTreble = 0;   // 0–1, current frame
float     _audioSpectrum[32];        // coarse spectrum for BeatDetect/PercussionDetect
uint8_t*  audioEnv = nullptr;        // frameCount * 3 bytes (bass, mids, treble)
uint32_t  audioEnvFrames = 0;
uint8_t   audioEnvRate = 50;
` : ''}

${paletteGlobals}

// ── Palette helper ────────────────────────────────────────────────────────────
CRGB samplePalette(uint8_t palId, uint8_t index) {
  switch (palId) {
${paletteSampleCases}
    default: return ColorFromPalette(RainbowColors_p, index);
  }
}
${hasPalette ? `
// Palette-role helper: map a SET_PALETTE id to a CRGBPalette16 (mirrors the
// samplePalette() switch above) so the \`palette\` group-input role tracks the
// same preset the global enum path would use.
CRGBPalette16 paletteFromId(uint8_t palId) {
  switch (palId) {
${paletteFromIdCases}
    default: return RainbowColors_p;
  }
}
` : ''}
// ── Pattern renderers ─────────────────────────────────────────────────────────
${patternDecls}${renderPatternFn}

${transitionHelper}
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
    case CMD_TRANSITION:
      // Fired just before the incoming SET_PATTERN (same timestamp, sorted so
      // TRANSITION lands first), so patternId still holds the outgoing pattern.
      prevPatternId = patternId;
      transType     = (uint8_t)ev.params[0];
      transStart    = ev.t;
      transDurMs    = (ev.paramCount > 1 ? ev.params[1] : 0.0f) * 1000.0f;
      break;
    case CMD_PARTICLE_BURST:
      burstStart     = ev.t;
      burstIntensity = ev.params[0] / 255.0f;
      burstHue       = (uint8_t)(ev.paramCount > 1 ? ev.params[1] : 0.0f);
      burstStyle     = (uint8_t)(ev.paramCount > 2 ? ev.params[2] : 0.0f);
      break;${hasEnergy ? '\n    case CMD_SET_ENERGY:     energy = ev.params[0]; break;' : ''}
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
  // Transition: while one is running, render the outgoing pattern into showA and
  // the incoming one into showB, then composite A→B into leds by its style.
  float tp = transDurMs > 0.0f ? (float)(posMs - transStart) / transDurMs : 1.0f;
  if (tp < 1.0f) {
    renderPattern(prevPatternId, t);
    ::memmove(showA, leds, sizeof(CRGB) * NUM_LEDS);   // outgoing → showA
    renderPattern(patternId, t);
    ::memmove(showB, leds, sizeof(CRGB) * NUM_LEDS);   // incoming → showB
    compositeTransition(transType, leds, showA, showB, tp);
  } else {
    renderPattern(patternId, t);
  }

  // Beat flash overlay
  if (flashLevel > 0.01f) {
    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i].r = qadd8(leds[i].r, (uint8_t)((255 - leds[i].r) * flashLevel));
      leds[i].g = qadd8(leds[i].g, (uint8_t)((255 - leds[i].g) * flashLevel));
      leds[i].b = qadd8(leds[i].b, (uint8_t)((255 - leds[i].b) * flashLevel));
    }
    flashLevel *= flashDecay;
  }

  // Particle-burst overlay: short-lived colored sparks (one of eleven motion
  // styles) added on top of the frame — FastLED's brightness then scales them,
  // so they fade with a silence fade-to-black. Keep the switch in sync with
  // particleOverlayAt() in showPreview.ts.
  if (burstIntensity > 0.01f && (float)(posMs - burstStart) < PARTICLE_LIFE_MS) {
    float ageSec = (posMs - burstStart) / 1000.0f;
    float f = (float)(posMs - burstStart) / PARTICLE_LIFE_MS;
    CRGB base = CHSV(burstHue, 217, 255);
    float cx = WIDTH * 0.5f, cy = HEIGHT * 0.5f, maxR = min(WIDTH, HEIGHT) * 0.5f;
    for (int i = 0; i < PARTICLE_COUNT; i++) {
      float bp = burstStart * 0.001f + i * 7.13f;
      float r1 = prnd(bp + 1.0f), r2 = prnd(bp + 2.0f), r3 = prnd(bp + 3.0f), r4 = prnd(bp + 4.0f);
      float x, y, bri = 1.0f - f;
      switch (burstStyle) {
        case 1:  // rain
          x = r1 * WIDTH + (r4 - 0.5f) * 2.0f * ageSec;
          y = r2 * HEIGHT * 0.5f + (4.0f + r3 * 6.0f) * ageSec;
          break;
        case 2: {  // explode
          float a = r1 * 6.2831853f, sp = 2.0f + r2 * 6.0f;
          x = cx + cosf(a) * sp * ageSec; y = cy + sinf(a) * sp * ageSec;
          break;
        }
        case 3: {  // fireworks
          float a = r1 * 6.2831853f, sp = 3.0f + r2 * 5.0f;
          x = cx + (r3 - 0.5f) * WIDTH * 0.3f + cosf(a) * sp * ageSec;
          y = cy + sinf(a) * sp * ageSec + 4.0f * ageSec * ageSec;
          bri = (1.0f - f) * (1.0f - f);
          break;
        }
        case 4: {  // swirl
          float a = r1 * 6.2831853f + 6.0f * ageSec, rad = (0.15f + f * 0.85f) * maxR;
          x = cx + cosf(a) * rad; y = cy + sinf(a) * rad;
          break;
        }
        case 5:  // twinkle
          x = r1 * WIDTH; y = r2 * HEIGHT;
          bri = max(0.0f, 1.0f - fabsf(f - r3) * 3.0f);
          break;
        case 6: {  // ring
          float a = r1 * 6.2831853f, rad = f * maxR;
          x = cx + cosf(a) * rad; y = cy + sinf(a) * rad;
          bri = (1.0f - f) * 1.25f;
          break;
        }
        case 7:  // fountain
          x = cx + (r1 - 0.5f) * 10.0f * ageSec;
          y = HEIGHT - 1 - (3.0f + r2 * 6.0f) * ageSec + 5.0f * ageSec * ageSec;
          break;
        case 8: {  // helix
          float a = (i % 2) * 3.14159265f + r1 * 0.7f + ageSec * 9.0f;
          x = cx + cosf(a) * maxR * 0.55f;
          y = HEIGHT - 1 - f * (HEIGHT + 2) + (r2 - 0.5f) * 2.0f;
          break;
        }
        case 9:  // meteor
          x = -2.0f + f * (WIDTH + 6) - r1 * 5.0f;
          y = r2 * HEIGHT + x * 0.35f + (r3 - 0.5f) * 2.0f;
          bri = (1.0f - r1 * 0.7f) * (1.0f - f * 0.5f);
          break;
        case 10:  // confetti
          x = r1 * WIDTH + sinf(ageSec * 7.0f + r3 * 6.2831853f) * 1.5f;
          y = fmodf(r2 * HEIGHT + ageSec * (2.0f + r4 * 4.0f), (float)HEIGHT);
          bri = (1.0f - f) * (0.55f + 0.45f * powf(sinf(ageSec * 12.0f + r3 * 6.2831853f), 2.0f));
          break;
        default:  // rise
          x = r1 * WIDTH + (r3 - 0.5f) * 8.0f * ageSec;
          y = r2 * HEIGHT + (-(1.0f + r4 * 3.0f)) * ageSec + 3.0f * ageSec * ageSec;
          break;
      }
      int xi = (int)lroundf(x), yi = (int)lroundf(y);
      if (xi < 0 || xi >= WIDTH || yi < 0 || yi >= HEIGHT) continue;
      CRGB s = base;
      s.nscale8((uint8_t)(constrain(burstIntensity * bri, 0.0f, 1.0f) * 255.0f));
      leds[yi * WIDTH + xi] += s;
    }
  }

  FastLED.show();
  FastLED.delay(16);  // ~60 fps
}
`
}

// ST7789 driver and colour layout rendering, emitted into the sketch.
//
// Written inline for the same reason the OLED and TM1637 drivers are: the
// ST7789's command set is short and stable, and bundling it keeps the display
// slices off the optional-library staging path — nothing to fetch, nothing to
// pin, nothing to fail without a network.
//
// The geometry comes from state/transportDisplay.ts, resolved for the panel's
// mounted size and emitted as literals, so the numbers cannot drift from the
// preview's. The glyph table comes from state/font.ts the same way.
//
// Three things about this panel are different from the 1-bit one, and each
// changes the shape of the driver:
//
// There is no framebuffer. A 240x240 frame is 115 KB and a 240x320 frame is
// 153 KB, which does not fit beside FastLED and an audio pipeline on an ESP32.
// So instead of the OLED's compare-two-buffers flush, each field caches the
// text or the integer it last drew and repaints only when that changes. Both
// sides draw the same pixels; only the decision about *when* to ship bytes
// differs, and only one of the two has the RAM to make it the same way.
//
// The background is painted once, at setup. A full-screen fill is 115 KB over
// SPI, and doing it on a refresh deadline would stall the LED loop for long
// enough to see. The deadline repaints the fields instead, which is what
// recovers a panel that was unplugged and came back.
//
// It uses hardware SPI rather than bit-banging. The OLED bit-bangs because 1
// KB a second is nothing; 115 KB is not, and the ESP32's GPIO matrix means
// hardware SPI still reaches arbitrary pins. Transactions are opened and
// closed around every burst so touch and an SD card can share the bus, which
// is exactly how the 2.4-inch module is wired.

import { DEFAULT_FONT, FONT_H, FONT_W } from '../state/font'
import { tftInitStreamCpp } from './tftInitSequence'
import { cppStringLiteral, DISPLAY_TEXT_BUFFER_BYTES } from '../state/displayText'
import {
  TFT_LETTER_SPACING, tftMadctl, tftRotatedSize, tftWindowOrigin,
  type TftController, type TftField, type TftRect, type TftRotation,
} from '../state/tftSurface'
import {
  TRANSPORT_ARTWORK_H, TRANSPORT_ARTWORK_W, TRANSPORT_COLORS,
  diagnosticsGeometry, fixedTransportGeometry, ledStatusGeometry, nowPlayingGeometry,
  showStatusGeometry, transportClockGeometry, transportWaitingGeometry,
  type TransportDisplayLayout,
} from '../state/transportDisplay'
import { ledStatusCountText } from '../state/ledOutputRuntime'
import { DISPLAY_WAITING_TEXT } from '../state/displaySignal'

/**
 * Forward declaration for the top of a sketch, above the includes' first
 * function.
 *
 * The Arduino .ino preprocessor hoists a prototype for every function it finds
 * to a point above all user type definitions, so `struct TftPanel` — declared
 * with the helpers, far down the file — is not yet a name when the prototype
 * for a helper taking one by reference arrives. The build then fails on a line
 * the generator never wrote. This is the fourth struct to need it; the derived
 * check in codegen/__tests__/displayForwardDeclarations.test.ts is what stops
 * there being a fifth that nobody remembers.
 */
export const TFT_DISPLAY_CPP_FORWARD = 'struct TftPanel;'

/**
 * The include this driver needs, for whichever generator emits it.
 *
 * Unlike the OLED, which bit-bangs and needs nothing, this panel is driven by
 * the Arduino SPI library. Stated here rather than assumed, so the sketch
 * preamble and the driver cannot disagree about what is available.
 */
export const TFT_DISPLAY_CPP_INCLUDES = '#include <SPI.h>'

/** Longest string one cached field can hold, terminator excluded. */
const TFT_SLOT_CHARS = 32

/**
 * The cached fields, by name.
 *
 * Slots rather than one cache per field so the struct is a fixed size
 * whichever layout is selected. The counts below are derived from these maps,
 * so adding a field to a layout cannot overrun the cache silently.
 */
const NOW_PLAYING_TEXT_SLOTS = {
  title: 0, artist: 1, pattern: 2, elapsed: 3, duration: 4, state: 5,
} as const
const NOW_PLAYING_VALUE_SLOTS = { progress: 0, volume: 1, artwork: 2 } as const

const SHOW_STATUS_TEXT_SLOTS = {
  pattern: 0, ordinal: 1, status: 2, highlight: 3, highlightOrdinal: 4,
} as const
/** Show Status draws no bars or indicators, so it caches no numeric fields. */
const SHOW_STATUS_VALUE_SLOTS = {} as const

const LED_STATUS_TEXT_SLOTS = { name: 0, fixture: 1, state: 2, level: 3 } as const
/** LED Status draws no bars or indicators, so it caches no numeric fields. */
const LED_STATUS_VALUE_SLOTS = {} as const

const FIXED_TRANSPORT_TEXT_SLOTS = { title: 0, pattern: 1, state: 2 } as const
const FIXED_TRANSPORT_VALUE_SLOTS = { volume: 0 } as const

const CLOCK_TEXT_SLOTS = { time: 0, date: 1, status: 2 } as const
/** Clock draws no bars or indicators, so it caches no numeric fields. */
const CLOCK_VALUE_SLOTS = {} as const

const TFT_TEXT_SLOTS = Math.max(
  Object.keys(NOW_PLAYING_TEXT_SLOTS).length,
  Object.keys(SHOW_STATUS_TEXT_SLOTS).length,
  Object.keys(LED_STATUS_TEXT_SLOTS).length,
  Object.keys(FIXED_TRANSPORT_TEXT_SLOTS).length,
  Object.keys(CLOCK_TEXT_SLOTS).length,
)
const TFT_VALUE_SLOTS = Math.max(
  Object.keys(NOW_PLAYING_VALUE_SLOTS).length,
  Object.keys(SHOW_STATUS_VALUE_SLOTS).length,
  Object.keys(LED_STATUS_VALUE_SLOTS).length,
  Object.keys(FIXED_TRANSPORT_VALUE_SLOTS).length,
  Object.keys(CLOCK_VALUE_SLOTS).length,
)

/**
 * Longest gap between repaints when nothing changed.
 *
 * Fields only, not the background — see the note at the top. This is what
 * brings a panel back after it was unplugged and returned, without the loop
 * polling it.
 */
const TFT_REFRESH_MS = 2000

/**
 * Shortest gap between any two repaints.
 *
 * Wall-clock, never a frame counter: an LED loop's rate depends on the strip
 * length and what else is running, so pacing on frames would make the panel
 * update at a different speed on every build. Twelve hertz is well past what a
 * transport readout needs and leaves the loop alone the rest of the time.
 */
const TFT_MIN_INTERVAL_MS = 80

/**
 * Pixels one window write ships before the loop gets a look in.
 *
 * Small on purpose: a fill is issued as one window and one run of pixels, and
 * this is only the size of the scratch the run is written from.
 */
const TFT_CHUNK_PIXELS = 32

export interface TftDisplayHelperProfile {
  textSlots: number
  valueSlots: number
  spi: boolean
  parallel: boolean
  rect: boolean
  bar: boolean
  whole: boolean
  time: boolean
  artwork: boolean
}

const FULL_TFT_HELPER_PROFILE: TftDisplayHelperProfile = {
  textSlots: TFT_TEXT_SLOTS,
  valueSlots: TFT_VALUE_SLOTS,
  spi: true,
  parallel: true,
  rect: true,
  bar: true,
  whole: true,
  time: true,
  artwork: true,
}

/** The smallest shared runtime capable of serving every TFT in one sketch. */
export function tftDisplayHelperProfile(displays: readonly TftDisplayEmit[]): TftDisplayHelperProfile {
  let textSlots = 0
  let valueSlots = 0
  let bar = false
  let rect = false
  let whole = false
  let time = false
  let artwork = false

  for (const display of displays) {
    switch (display.layout) {
      case 'Now Playing':
        textSlots = Math.max(textSlots, Object.keys(NOW_PLAYING_TEXT_SLOTS).length)
        valueSlots = Math.max(valueSlots, Object.keys(NOW_PLAYING_VALUE_SLOTS).length)
        bar = true
        rect = true
        time = true
        if (display.artwork) { artwork = true; whole = true }
        break
      case 'Show Status':
        textSlots = Math.max(textSlots, Object.keys(SHOW_STATUS_TEXT_SLOTS).length)
        whole = true
        break
      case 'LED Status':
        textSlots = Math.max(textSlots, Object.keys(LED_STATUS_TEXT_SLOTS).length)
        break
      case 'Fixed Transport':
        textSlots = Math.max(textSlots, Object.keys(FIXED_TRANSPORT_TEXT_SLOTS).length)
        valueSlots = Math.max(valueSlots, Object.keys(FIXED_TRANSPORT_VALUE_SLOTS).length)
        bar = true
        rect = true
        break
      case 'Clock':
        textSlots = Math.max(textSlots, Object.keys(CLOCK_TEXT_SLOTS).length)
        break
      case 'Diagnostics':
        rect = true
        if (display.diagnosticTouch) textSlots = Math.max(textSlots, 3)
        break
      case 'Waiting':
        break
    }
  }

  return {
    textSlots,
    valueSlots,
    spi: displays.some((display) => !display.parallel),
    parallel: displays.some((display) => !!display.parallel),
    rect,
    bar,
    whole,
    time,
    artwork,
  }
}

function alignTo4(bytes: number): number {
  return Math.ceil(bytes / 4) * 4
}

/**
 * Internal RAM one `static TftPanel` costs the sketch.
 *
 * Hundreds of bytes rather than the OLED's thousands, which is the whole point
 * of caching fields instead of frames: the colour panel is fifty times the
 * pixels and a fraction of the RAM. Beside the struct it measures, for the
 * same reason the OLED's figure is beside its own.
 *
 * Sized for a 32-bit target, which is what the RAM warning is calibrated
 * against. Flash is not counted here or anywhere in that estimate: the font
 * table and any baked artwork are PROGMEM, and the compile-capacity check
 * measures the real figure.
 */
export const TFT_PANEL_RAM_BYTES = (() => {
  // Worst case: a mixed SPI/parallel sketch needs the transport discriminator,
  // eight data lines and WR. Reset, SCK, MOSI and RD are setup-only arguments
  // and are no longer retained in every panel instance.
  const pinsAndTransport = 3 + 1 + 8 + 1           // cs, dc, bl, parallel, d[8], wr
  const flags = 3                                  // madctl, lit, painted
  const dims = 8                                   // w, h, colStart, rowStart
  const cache = TFT_TEXT_SLOTS * (TFT_SLOT_CHARS + 1)
  const scratch = TFT_CHUNK_PIXELS * 2
  const values = TFT_VALUE_SLOTS * 4
  const clocks = 8                                 // lastPaintMs, lastFullMs
  return alignTo4(pinsAndTransport + flags + dims + cache + scratch) + values + clocks
})()

/**
 * The shared bitmap font as a flat column table.
 *
 * Generated from the same `FONT` the preview draws with, so a glyph cannot
 * differ between the two. Symbols are prefixed for this driver rather than
 * shared with the OLED's table because a sketch can carry both panels, and two
 * definitions of one name is a build failure — the data behind them is the one
 * font either way, so there is nothing here to drift.
 */
function fontTableCpp(): { chars: string; table: string; count: number } {
  const glyphs = Object.keys(DEFAULT_FONT.glyphs).filter((ch) => ch.length === 1).sort()
  const columns: number[] = []
  for (const ch of glyphs) {
    const rows = DEFAULT_FONT.glyphs[ch]
    for (let c = 0; c < FONT_W; c++) {
      let column = 0
      for (let r = 0; r < FONT_H; r++) {
        if ((rows[r] ?? 0) & (1 << (FONT_W - 1 - c))) column |= 1 << r
      }
      columns.push(column)
    }
  }
  return {
    chars: cppStringLiteral(glyphs.join('')),
    table: columns.map((c) => `0x${c.toString(16).padStart(2, '0')}`).join(', '),
    count: glyphs.length,
  }
}

/** A packed colour as the emitted source spells it. */
function hex16(value: number): string {
  return `0x${(value & 0xffff).toString(16).padStart(4, '0').toUpperCase()}`
}

/** Alignment as the driver's integer, matching `TftAlign`. */
const ALIGN_CPP: Record<TftField['align'], number> = { left: 0, center: 1, right: 2 }

/** Driver, primitives and the glyph table, emitted once per sketch. */
export function tftDisplayHelpersCpp(
  profile: TftDisplayHelperProfile = FULL_TFT_HELPER_PROFILE,
): string {
  const font = fontTableCpp()
  const c = TRANSPORT_COLORS
  const mixedTransport = profile.spi && profile.parallel
  const spiGlobals = profile.spi
    ? `static SPISettings _tftSpi(40000000, MSBFIRST, SPI_MODE0);\nstatic bool _tftSpiStarted = false;`
    : ''
  const transportFields = mixedTransport
    ? `  bool parallel;\n  uint8_t d[8];\n  uint8_t wr;`
    : profile.parallel
      ? `  uint8_t d[8];\n  uint8_t wr;`
      : ''
  const textCacheField = profile.textSlots > 0
    ? `  char text[TFT_TEXT_SLOTS][TFT_SLOT_CHARS + 1];`
    : ''
  const valueCacheField = profile.valueSlots > 0
    ? `  int32_t value[TFT_VALUE_SLOTS];`
    : ''
  const busFunctions = mixedTransport
    ? `static inline void _tftTxnBegin(TftPanel &p) {
  if (!p.parallel) SPI.beginTransaction(_tftSpi);
}

static inline void _tftTxnEnd(TftPanel &p) {
  if (!p.parallel) SPI.endTransaction();
}

static inline void _tftWrite8(TftPanel &p, uint8_t value) {
  if (!p.parallel) { SPI.transfer(value); return; }
  for (uint8_t b = 0; b < 8; b++) digitalWrite(p.d[b], (value >> b) & 1);
  digitalWrite(p.wr, LOW);
  digitalWrite(p.wr, HIGH);
}`
    : profile.parallel
      ? `static inline void _tftTxnBegin(TftPanel &) {}

static inline void _tftTxnEnd(TftPanel &) {}

static inline void _tftWrite8(TftPanel &p, uint8_t value) {
  for (uint8_t b = 0; b < 8; b++) digitalWrite(p.d[b], (value >> b) & 1);
  digitalWrite(p.wr, LOW);
  digitalWrite(p.wr, HIGH);
}`
      : `static inline void _tftTxnBegin(TftPanel &) { SPI.beginTransaction(_tftSpi); }

static inline void _tftTxnEnd(TftPanel &) { SPI.endTransaction(); }

static inline void _tftWrite8(TftPanel &, uint8_t value) { SPI.transfer(value); }`
  const transportAssignments = mixedTransport
    ? `  p.parallel = (dataPins != nullptr);
  p.wr = wr;
  for (uint8_t b = 0; b < 8; b++) p.d[b] = p.parallel ? dataPins[b] : 255;`
    : profile.parallel
      ? `  p.wr = wr;
  for (uint8_t b = 0; b < 8; b++) p.d[b] = dataPins[b];`
      : ''
  const spiBegin = `if (!_tftSpiStarted) {
#if defined(ESP32)
    // The GPIO matrix routes the peripheral to whichever pins the build chose,
    // so an arbitrary pinout still gets hardware SPI.
    SPI.begin(sck, -1, mosi, -1);
#elif defined(ESP8266)
    // ESP8266 exposes pin selection separately from begin().
    SPI.pins(sck, MISO, mosi, -1);
    SPI.begin();
#else
    SPI.begin();
#endif
    _tftSpiStarted = true;
  }`
  const parallelBegin = `for (uint8_t b = 0; b < 8; b++) { pinMode(p.d[b], OUTPUT); digitalWrite(p.d[b], LOW); }
  pinMode(p.wr, OUTPUT); digitalWrite(p.wr, HIGH);
  if (rd != 255) { pinMode(rd, OUTPUT); digitalWrite(rd, HIGH); }`
  const beginBus = mixedTransport
    ? `if (p.parallel) {
    ${parallelBegin.replaceAll('\n', '\n    ')}
  } else ${spiBegin}`
    : profile.parallel
      ? parallelBegin
      : spiBegin
  const textDirtyHelper = profile.textSlots > 0
    ? `static bool _tftTextDirty(TftPanel &p, uint8_t slot, const char *text) {
  if (slot >= TFT_TEXT_SLOTS) return true;
  if (text == 0) text = "";
  if (strncmp(p.text[slot], text, TFT_SLOT_CHARS) == 0) return false;
  strncpy(p.text[slot], text, TFT_SLOT_CHARS);
  p.text[slot][TFT_SLOT_CHARS] = 0;
  return true;
}`
    : ''
  const valueDirtyHelper = profile.valueSlots > 0
    ? `static bool _tftValueDirty(TftPanel &p, uint8_t slot, int32_t value) {
  if (slot >= TFT_VALUE_SLOTS) return true;
  if (p.value[slot] == value) return false;
  p.value[slot] = value;
  return true;
}`
    : ''
  const rectHelper = profile.rect
    ? `static void _tftRect(TftPanel &p, int x, int y, int w, int h, uint16_t color) {
  if (w <= 0 || h <= 0) return;
  _tftFillRect(p, x, y, w, 1, color);
  _tftFillRect(p, x, y + h - 1, w, 1, color);
  _tftFillRect(p, x, y, 1, h, color);
  _tftFillRect(p, x + w - 1, y, 1, h, color);
}`
    : ''
  const barHelpers = profile.bar
    ? `static int _tftBarFill(int w, float value) {
  int inner = w - 2;
  if (inner <= 0) return 0;
  float v = value;
  if (!isfinite(v) || v < 0) v = 0;
  if (v > 1) v = 1;
  return (int)lroundf(inner * v);
}

static void _tftBar(TftPanel &p, int x, int y, int w, int h, float value,
                    uint16_t fill, uint16_t track, uint16_t outline) {
  if (w <= 2 || h <= 2) return;
  _tftRect(p, x, y, w, h, outline);
  int filled = _tftBarFill(w, value);
  _tftFillRect(p, x + 1, y + 1, filled, h - 2, fill);
  _tftFillRect(p, x + 1 + filled, y + 1, w - 2 - filled, h - 2, track);
}`
    : ''
  const wholeHelper = profile.whole
    ? `static long _tftWhole(float value) {
  if (!isfinite(value)) return 0;
  if (value > 2147483000.0f) return 2147483000L;
  if (value < -2147483000.0f) return -2147483000L;
  return (long)lroundf(value);
}`
    : ''
  const timeHelper = profile.time
    ? `static long _tftFloorWhole(float value) {
  if (!isfinite(value)) return 0;
  if (value > 2147483000.0f) return 2147483000L;
  if (value < -2147483000.0f) return -2147483000L;
  return (long)floorf(value);
}

static void _tftTime(char *dst, size_t dstSize, float seconds) {
  long total = _tftFloorWhole(seconds > 0 ? seconds : 0);
  snprintf(dst, dstSize, "%ld:%02ld", total / 60, total % 60);
}`
    : ''
  const artworkHelper = profile.artwork
    ? `static void _tftArt(TftPanel &p, int x, int y, int w, int h, const uint8_t *data) {
  _tftWindow(p, x, y, w, h);
  uint32_t count = (uint32_t)w * (uint32_t)h * 2;
  _tftTxnBegin(p);
  digitalWrite(p.dc, LOW);
  digitalWrite(p.cs, LOW);
  _tftWrite8(p, TFT_RAMWR);
  digitalWrite(p.dc, HIGH);
  for (uint32_t i = 0; i < count; i++) _tftWrite8(p, pgm_read_byte(&data[i]));
  digitalWrite(p.cs, HIGH);
  _tftTxnEnd(p);
}`
    : ''
  return `// ── Colour TFT (ST7789 / ST7789V) ───────────────────────────────────────────
// Mirrors src/state/tftSurface.ts and src/state/transportDisplay.ts so the
// panel draws what the preview drew.
#define TFT_FONT_W    ${FONT_W}
#define TFT_FONT_H    ${FONT_H}
#define TFT_SPACING   ${TFT_LETTER_SPACING}
#define TFT_SLOT_CHARS ${TFT_SLOT_CHARS}
#define TFT_TEXT_SLOTS ${profile.textSlots}
#define TFT_VALUE_SLOTS ${profile.valueSlots}
#define TFT_CHUNK     ${TFT_CHUNK_PIXELS}
// Longest gap between field repaints when nothing changed, so a panel that was
// unplugged and returned redraws itself without the loop polling it. The
// background is not repainted on this deadline: a full-screen fill is over a
// hundred kilobytes across the bus and would stall the LED loop visibly.
#define TFT_REFRESH_MS ${TFT_REFRESH_MS}
// Shortest gap between any two repaints. Wall-clock, never a frame count: an
// LED loop's rate depends on the strip length, so pacing on frames would make
// the panel run at a different speed on every build.
#define TFT_MIN_INTERVAL_MS ${TFT_MIN_INTERVAL_MS}

#define TFT_ALIGN_LEFT   ${ALIGN_CPP.left}
#define TFT_ALIGN_CENTER ${ALIGN_CPP.center}
#define TFT_ALIGN_RIGHT  ${ALIGN_CPP.right}

// Colours, from TRANSPORT_COLORS rather than picked again here.
#define TFT_C_BG      ${hex16(c.background)}
#define TFT_C_TEXT    ${hex16(c.text)}
#define TFT_C_DIM     ${hex16(c.dim)}
#define TFT_C_ACCENT  ${hex16(c.accent)}
#define TFT_C_TRACK   ${hex16(c.track)}
#define TFT_C_OUTLINE ${hex16(c.outline)}
#define TFT_C_ON      ${hex16(c.on)}
#define TFT_C_OFF     ${hex16(c.off)}
#define TFT_C_FRAME   ${hex16(c.artFrame)}

// ST7789 commands, as the datasheet names them.
#define TFT_SWRESET 0x01
#define TFT_SLPOUT  0x11
#define TFT_INVOFF  0x20
#define TFT_INVON   0x21
#define TFT_DISPON  0x29
#define TFT_CASET   0x2A
#define TFT_RASET   0x2B
#define TFT_RAMWR   0x2C
#define TFT_MADCTL  0x36
#define TFT_COLMOD  0x3A
#define TFT_NORON   0x13

static const char _tftChars[] = ${font.chars};
static const uint8_t _tftFont[${font.count} * TFT_FONT_W] = { ${font.table} };

// One transaction speed for every panel on the bus. 40 MHz is inside the
// ST7789's rated write clock and is what the 2.4-inch module's ribbon will
// take; touch and SD open their own transactions at their own speeds.
${spiGlobals}

struct TftPanel {
  uint8_t cs, dc;
  // Backlight. 255 means the module ties it high and there is nothing to drive.
  uint8_t bl;
  // Which bus this panel speaks. The same controller ships on both: an ILI9341
  // is an ILI9341 whether its bytes arrive down one data line or eight, so the
  // command set, windowing and every layout above are shared and only the three
  // bus primitives below branch.
${transportFields}
  // 8-bit parallel only. Data lines least-significant first, then the write
  // strobe the controller latches on, then the read strobe. RD is never
  // pulsed - nothing here reads the panel - but it is held high so the panel
  // does not drive the bus back while we are writing it.
  // Visible size as mounted, so a rotated panel is not a special case here.
  int16_t w, h;
  // Where the visible window starts in controller RAM at this rotation. Zero
  // on a panel whose glass matches its frame memory; 80 on the 1.3-inch module
  // in the rotations that scan backwards.
  uint16_t colStart, rowStart;
  uint8_t madctl;
  bool lit;
  bool painted;
  // What each field last drew. This is the dirty model: with no framebuffer to
  // compare, a field repaints when the thing it says changes.
${textCacheField}
${valueCacheField}
  uint16_t scratch[TFT_CHUNK];
  uint32_t lastPaintMs, lastFullMs;
};

// ── Bus ─────────────────────────────────────────────────────────────────────

/*
 * Every write below is the same shape whichever bus is fitted: open, put a
 * command byte out with DC low, put data bytes out with DC high, close. Only
 * these three know which transport is underneath, which is why the command,
 * command+data, colour-run and artwork writers that follow are identical for
 * an SPI breakout and a parallel shield.
 */

${busFunctions}

static void _tftCommand(TftPanel &p, uint8_t value) {
  _tftTxnBegin(p);
  digitalWrite(p.dc, LOW);
  digitalWrite(p.cs, LOW);
  _tftWrite8(p, value);
  digitalWrite(p.cs, HIGH);
  _tftTxnEnd(p);
}

static void _tftCommandData(TftPanel &p, uint8_t command, const uint8_t *data, uint8_t count) {
  _tftTxnBegin(p);
  digitalWrite(p.dc, LOW);
  digitalWrite(p.cs, LOW);
  _tftWrite8(p, command);
  digitalWrite(p.dc, HIGH);
  for (uint8_t i = 0; i < count; i++) _tftWrite8(p, data[i]);
  digitalWrite(p.cs, HIGH);
  _tftTxnEnd(p);
}

// Address the rectangle about to be written. The column and row offsets are
// the whole reason this is not a plain window: an ST7789 driving a 240x240
// panel has 240x320 of frame memory behind it, so a rotation that scans
// backwards addresses the glass eighty rows in. Without them the picture sits
// off the panel with a band of noise down one edge.
static void _tftWindow(TftPanel &p, int x, int y, int w, int h) {
  uint16_t x0 = (uint16_t)(x + p.colStart);
  uint16_t x1 = (uint16_t)(x + w - 1 + p.colStart);
  uint16_t y0 = (uint16_t)(y + p.rowStart);
  uint16_t y1 = (uint16_t)(y + h - 1 + p.rowStart);
  uint8_t cols[4] = { (uint8_t)(x0 >> 8), (uint8_t)x0, (uint8_t)(x1 >> 8), (uint8_t)x1 };
  uint8_t rows[4] = { (uint8_t)(y0 >> 8), (uint8_t)y0, (uint8_t)(y1 >> 8), (uint8_t)y1 };
  _tftCommandData(p, TFT_CASET, cols, 4);
  _tftCommandData(p, TFT_RASET, rows, 4);
}

/** A run of one colour into the window just addressed. */
static void _tftRun(TftPanel &p, uint16_t color, uint32_t count) {
  uint8_t hi = (uint8_t)(color >> 8);
  uint8_t lo = (uint8_t)(color & 0xFF);
  _tftTxnBegin(p);
  digitalWrite(p.dc, LOW);
  digitalWrite(p.cs, LOW);
  _tftWrite8(p, TFT_RAMWR);
  digitalWrite(p.dc, HIGH);
  while (count--) { _tftWrite8(p, hi); _tftWrite8(p, lo); }
  digitalWrite(p.cs, HIGH);
  _tftTxnEnd(p);
}

static void _tftFillRect(TftPanel &p, int x, int y, int w, int h, uint16_t color) {
  if (w <= 0 || h <= 0) return;
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  if (x + w > p.w) w = p.w - x;
  if (y + h > p.h) h = p.h - y;
  if (w <= 0 || h <= 0) return;
  _tftWindow(p, x, y, w, h);
  _tftRun(p, color, (uint32_t)w * (uint32_t)h);
}

${rectHelper}

// ── Setup ───────────────────────────────────────────────────────────────────

static void _tftBacklight(TftPanel &p, bool on) {
  if (p.bl == 255) return;
  if (p.lit == on && p.painted) return;
  p.lit = on;
  digitalWrite(p.bl, on ? HIGH : LOW);
}

/*
 * dataPins is what selects the transport: null for an SPI panel, an array of
 * eight for a parallel one. Defaulted so every existing SPI caller is unchanged
 * - a panel that says nothing about eight data lines does not have them.
 */
static void _tftBegin(TftPanel &p, uint8_t cs, uint8_t dc, uint8_t rst, uint8_t sck,
                      uint8_t mosi, uint8_t bl, int16_t w, int16_t h,
                      uint16_t colStart, uint16_t rowStart, uint8_t madctl,
                      bool invert, uint16_t background,
                      const uint8_t *dataPins = nullptr,
                      uint8_t wr = 255, uint8_t rd = 255,
                      const uint8_t *init = nullptr, uint16_t initLen = 0) {
  p.cs = cs; p.dc = dc; p.bl = bl;
${transportAssignments}
  p.w = w; p.h = h; p.colStart = colStart; p.rowStart = rowStart;
  p.madctl = madctl;
  p.lit = false; p.painted = false;
  p.lastPaintMs = 0; p.lastFullMs = 0;
${profile.textSlots > 0 ? '  for (uint8_t s = 0; s < TFT_TEXT_SLOTS; s++) p.text[s][0] = 0;' : ''}
${profile.valueSlots > 0 ? '  for (uint8_t s = 0; s < TFT_VALUE_SLOTS; s++) p.value[s] = INT32_MIN;' : ''}

  pinMode(cs, OUTPUT); pinMode(dc, OUTPUT);
  digitalWrite(cs, HIGH);
  if (rst != 255) pinMode(rst, OUTPUT);
  if (bl != 255) { pinMode(bl, OUTPUT); digitalWrite(bl, LOW); }

${beginBus}

  if (rst != 255) {
    digitalWrite(rst, HIGH); delay(10);
    digitalWrite(rst, LOW);  delay(10);
    digitalWrite(rst, HIGH); delay(120);
  }

  _tftCommand(p, TFT_SWRESET); delay(150);
  _tftCommand(p, TFT_SLPOUT);  delay(120);

  uint8_t colmod = 0x55;                 // 16 bits per pixel
  _tftCommandData(p, TFT_COLMOD, &colmod, 1);
  _tftCommandData(p, TFT_MADCTL, &p.madctl, 1);

  // The panel's electrical setup - power, porch or charge pump, VCOM, gamma -
  // walked from the stream its own controller needs rather than one sequence
  // sent to every part. See codegen/tftInitSequence.ts: these opcodes do not
  // mean the same thing on ST7789 and ILI9341 silicon, and a panel sent the
  // wrong set comes up dark. Each entry is: opcode, count, bytes...
  for (uint16_t i = 0; init != nullptr && i + 1 < initLen; ) {
    uint8_t cmd = init[i];
    uint8_t count = init[i + 1];
    _tftCommandData(p, cmd, &init[i + 2], count);
    i += 2 + count;
  }

  // IPS glass on both catalogued modules is wired normally-black, so a
  // controller left in its normal mode renders a photographic negative.
  _tftCommand(p, invert ? TFT_INVON : TFT_INVOFF);
  _tftCommand(p, TFT_NORON); delay(10);
  _tftCommand(p, TFT_DISPON); delay(100);

  // Painted once, here. Every field below erases its own cell, so the ground
  // never has to be laid again.
  _tftFillRect(p, 0, 0, p.w, p.h, background);
}

// ── Change detection ────────────────────────────────────────────────────────

/**
 * Whether this pass may touch the panel, and whether every field should
 * repaint rather than only the changed ones.
 *
 * millis() differences are wrap-safe in unsigned arithmetic, so the 49-day
 * rollover needs no special case.
 */
static bool _tftPaint(TftPanel &p, bool &full) {
  uint32_t now = millis();
  if (p.painted && (uint32_t)(now - p.lastPaintMs) < TFT_MIN_INTERVAL_MS) return false;
  full = !p.painted || (uint32_t)(now - p.lastFullMs) >= TFT_REFRESH_MS;
  if (full) p.lastFullMs = now;
  p.lastPaintMs = now;
  p.painted = true;
  return true;
}

// Always called, never short-circuited past, or the cache goes stale behind a
// full repaint and the next pass reports a change that already happened.
${textDirtyHelper}

${valueDirtyHelper}

// ── Drawing ─────────────────────────────────────────────────────────────────

static int _tftGlyphIndex(char c) {
  if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');
  for (int i = 0; _tftChars[i] != 0; i++) if (_tftChars[i] == c) return i;
  return -1;
}

static int _tftTextWidth(const char *text, int scale) {
  int n = (int)strlen(text);
  return n == 0 ? 0 : ((n * (TFT_FONT_W + TFT_SPACING)) - TFT_SPACING) * scale;
}

// One filled square per lit font pixel. Integer scaling only: a fractional
// scale would need filtering, and a filtered 3x5 bitmap is mud.
static void _tftText(TftPanel &p, int x, int y, const char *text, uint16_t color, int scale) {
  int cursor = x;
  for (int i = 0; text[i] != 0; i++) {
    int glyph = _tftGlyphIndex(text[i]);
    // Unsupported characters draw the fallback, matching coerceGlyphs().
    if (glyph < 0) glyph = _tftGlyphIndex('?');
    if (glyph >= 0) {
      for (int col = 0; col < TFT_FONT_W; col++) {
        uint8_t column = _tftFont[(glyph * TFT_FONT_W) + col];
        for (int row = 0; row < TFT_FONT_H; row++) {
          if (column & (1 << row)) {
            _tftFillRect(p, cursor + (col * scale), y + (row * scale), scale, scale, color);
          }
        }
      }
    }
    cursor += (TFT_FONT_W + TFT_SPACING) * scale;
  }
}

// Fits in characters against real metrics, so a cut ends at a glyph boundary
// and the ellipsis survives instead of being the first thing clipped.
static void _tftFit(char *dst, size_t dstSize, const char *text, int pixels, int scale) {
  int stride = (TFT_FONT_W + TFT_SPACING) * scale;
  int capacity = pixels < (TFT_FONT_W * scale) ? 0 : (pixels + (TFT_SPACING * scale)) / stride;
  if (capacity < 0) capacity = 0;
  if ((size_t)capacity > dstSize - 1) capacity = (int)dstSize - 1;
  int len = (int)strlen(text);
  if (len <= capacity) { memcpy(dst, text, len); dst[len] = 0; return; }
  if (capacity <= 3) { memcpy(dst, text, capacity); dst[capacity] = 0; return; }
  memcpy(dst, text, capacity - 3);
  dst[capacity - 3] = '.'; dst[capacity - 2] = '.'; dst[capacity - 1] = '.';
  dst[capacity] = 0;
}

// A field erases its own cell before drawing. Without that, a shorter string
// leaves the tail of the one before it on the panel, and with no framebuffer
// there is nothing to notice that it did.
static void _tftField(TftPanel &p, int x, int y, int w, int h, int scale, int align,
                      const char *text, uint16_t color, uint16_t background) {
  _tftFillRect(p, x, y, w, h, background);
  char fitted[TFT_SLOT_CHARS + 1];
  _tftFit(fitted, sizeof(fitted), text == 0 ? "" : text, w, scale);
  if (fitted[0] == 0) return;
  int drawn = _tftTextWidth(fitted, scale);
  int at = x;
  if (align == TFT_ALIGN_RIGHT) at = x + w - drawn;
  else if (align == TFT_ALIGN_CENTER) at = x + ((w - drawn) / 2);
  _tftText(p, at, y, fitted, color, scale);
}

// Matches tftBarFill(): the driver compares this integer rather than the float
// behind it, because a progress value moves every frame and the drawn bar
// does not.
${barHelpers}

// A wire's float as a whole number, safely.
//
// Casting a NaN or an infinity to an integer type is undefined behaviour, and
// these values come off a graph edge: an unwired port, a division that went
// wrong upstream, or a count that has not arrived yet. The browser helpers
// return 0 for the same input, so this is parity as well as safety.
${wholeHelper}

${timeHelper}

/**
 * Blit baked RGB565 artwork from PROGMEM.
 *
 * Finished bytes, straight to the bus. There is deliberately no scaler and no
 * colour conversion here: the picture is rendered in the browser at export, so
 * a second implementation on this side would be a second thing to disagree
 * with it. The same rule the 1-bit pattern thumbnails follow.
 */
${artworkHelper}
`
}

/** What a `TransportDisplay` node hands the generator. */
export interface TftDisplayEmit {
  id: string
  controller: TftController
  /** How the panel is bolted down; the geometry is resolved against it. */
  rotation: TftRotation
  layout: TransportDisplayLayout
  csPin: number
  dcPin: number
  resetPin: number
  sckPin: number
  mosiPin: number
  /**
   * An 8-bit parallel panel's own lines, least-significant data bit first.
   *
   * Absent means SPI, which is what every caller that predates the second
   * transport hands over and what `_tftBegin` defaults to. Present, the eight
   * data lines and the write/read strobes replace the clock and data-out
   * above - a parallel panel has neither.
   */
  parallel?: { dataPins: readonly number[]; wrPin: number; rdPin: number }
  /** 255 when the module ties its backlight high and there is nothing to drive. */
  backlightPin: number
  enabledExpr: string
  /** Clock: the wired RTCInput's `_RtcDateTimeValue`, or null when unresolved. */
  dateTimeExpr: string | null
  /** Now Playing. Text expressions are `const char *`; the rest are numeric. */
  titleExpr: string | null
  artistExpr: string | null
  patternNameExpr: string | null
  elapsedExpr: string
  durationExpr: string
  progressExpr: string
  playingExpr: string
  volumeExpr: string
  /** Show Status, and the artwork index Now Playing blits by. */
  patternIndexExpr: string
  patternCountExpr: string
  /** Show Status: the candidate the user is looking at, while browsing. */
  browsingExpr: string
  highlightNameExpr: string | null
  highlightIndexExpr: string
  /**
   * Show Status only: the emitted pattern-name table this panel reads, when
   * the sketch has one.
   *
   * A name is not a picture, so this is independent of the thumbnail table an
   * OLED browser needs — a TFT-only show reported blanks for as long as the
   * two were emitted together.
   */
  patternNames?: { tableStem: string; selVar: string }
  /**
   * LED Status: what the wired fixture is, and what it is doing.
   *
   * The first three are settled at generation time — a fixture's name, form
   * and LED count cannot change on the device — so only the two that a wire
   * can move are expressions. Absent when no LED output is wired, which draws
   * the layout's own blank rather than inventing a fixture.
   */
  ledStatus?: {
    name: string
    formLabel: string
    ledCount: number
    /** C++ bool: the effective blackout, after every factor. */
    enabledExpr: string
    /** C++ float 0-1: the effective level, after every factor. */
    brightnessExpr: string
  }
  /** Whether Diagnostics can read a live XPT2046 point. */
  diagnosticTouch?: boolean
  /**
   * Now Playing only: the identifier stem of the baked artwork this panel
   * blits, when a picture was baked for it.
   *
   * Absent means the layout draws its empty frame instead — which is what a
   * pattern with no baked art should look like, rather than a black square
   * indistinguishable from art that renders black.
   */
  artwork?: { tableStem: string; count: number }
}

export function tftDisplayGlobalCpp(display: TftDisplayEmit): string {
  // The enable latch is file scope rather than a loop local because touch
  // sampling reads it, and touch is sampled before this panel's own loop lines
  // run. Reading last pass's value on the frame Enabled changes is the cost;
  // the alternative is evaluating a graph expression twice per pass in two
  // places, which is how the two would come to disagree.
  return `static TftPanel _tft_${display.id};
static bool _tftOn_${display.id} = true;`
}

export function tftDisplaySetupCpp(display: TftDisplayEmit): string[] {
  const size = tftRotatedSize(display.controller, display.rotation)
  const origin = tftWindowOrigin(display.controller, display.rotation)
  const madctl = tftMadctl(display.controller, display.rotation)
  const geometry = `${size.width}, ${size.height}, ${origin.col}, ${origin.row}, `
    + `0x${madctl.toString(16).padStart(2, '0')}, ${display.controller.invert}, TFT_C_BG`
  // The controller's own power-on registers, as a byte stream `_tftBegin`
  // walks. Emitted per panel because two panels in one sketch can be different
  // silicon wanting different sequences.
  const init = tftInitStreamCpp(`_tftInit_${display.id}`, display.controller.id)
  if (!display.parallel) {
    return [
      ...init.lines,
      `  _tftBegin(_tft_${display.id}, ${display.csPin}, ${display.dcPin}, ${display.resetPin}, `
        + `${display.sckPin}, ${display.mosiPin}, ${display.backlightPin}, ${geometry}, `
        + `nullptr, 255, 255, ${init.name}, sizeof(${init.name}));`,
    ]
  }
  // The data lines are handed over as an array because `_tftBegin` decides the
  // transport from whether it got one. SCK and MOSI are passed as NO_PIN: a
  // parallel panel has neither, and naming a real GPIO there would claim a pad
  // nothing drives.
  const lines = display.parallel.dataPins.join(', ')
  return [
    ...init.lines,
    `  static const uint8_t _tftData_${display.id}[8] = { ${lines} };`,
    `  _tftBegin(_tft_${display.id}, ${display.csPin}, ${display.dcPin}, ${display.resetPin}, `
      + `255, 255, ${display.backlightPin}, ${geometry}, `
      + `_tftData_${display.id}, ${display.parallel.wrPin}, ${display.parallel.rdPin}, `
      + `${init.name}, sizeof(${init.name}));`,
  ]
}

/** A field's coordinates, exactly as the shared geometry resolved them. */
function fieldArgs(field: TftField): string {
  return `${field.x}, ${field.y}, ${field.w}, ${field.h}, ${field.scale}, ${ALIGN_CPP[field.align]}`
}

function rectArgs(rect: TftRect): string {
  return `${rect.x}, ${rect.y}, ${rect.w}, ${rect.h}`
}

function nowPlayingLoop(display: TftDisplayEmit, width: number, height: number): string[] {
  const p = `_tft_${display.id}`
  const id = display.id
  const g = nowPlayingGeometry(width, height)
  const s = NOW_PLAYING_TEXT_SLOTS
  const v = NOW_PLAYING_VALUE_SLOTS
  const text = (expr: string | null) => expr ?? '""'
  const lines: string[] = []

  // Artwork follows the active pattern. Cache the clamped table index like a
  // bar's filled-pixel count so a selection change repaints exactly once.
  if (display.artwork) {
    lines.push(
      `      long _tftArtIndex_${id} = _tftWhole(${display.patternIndexExpr});`,
      `      if (_tftArtIndex_${id} < 0) _tftArtIndex_${id} = 0;`,
      `      if (_tftArtIndex_${id} >= ${display.artwork.count}) _tftArtIndex_${id} = ${display.artwork.count - 1};`,
      `      if (_tftValueDirty(${p}, ${v.artwork}, _tftArtIndex_${id}) || _tftFull_${id}) {`,
      `        _tftArt(${p}, ${g.artwork.x}, ${g.artwork.y}, `
        + `${TRANSPORT_ARTWORK_W}, ${TRANSPORT_ARTWORK_H}, _artData_${display.artwork.tableStem}[_tftArtIndex_${id}]);`,
      `      }`,
    )
  } else {
    lines.push(
      `      if (_tftFull_${id}) {`,
      `        _tftFillRect(${p}, ${rectArgs(g.artwork)}, TFT_C_BG);`,
      `        _tftRect(${p}, ${rectArgs(g.artwork)}, TFT_C_FRAME);`,
      `      }`,
    )
  }

  lines.push(
    `      const char *_tftTitle_${id} = ${text(display.titleExpr)};`,
    `      if (_tftTextDirty(${p}, ${s.title}, _tftTitle_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.title)}, _tftTitle_${id}, TFT_C_TEXT, TFT_C_BG);`,
    `      const char *_tftArtist_${id} = ${text(display.artistExpr)};`,
    `      if (_tftTextDirty(${p}, ${s.artist}, _tftArtist_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.artist)}, _tftArtist_${id}, TFT_C_DIM, TFT_C_BG);`,
    `      const char *_tftPattern_${id} = ${text(display.patternNameExpr)};`,
    `      if (_tftTextDirty(${p}, ${s.pattern}, _tftPattern_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.pattern)}, _tftPattern_${id}, TFT_C_ACCENT, TFT_C_BG);`,
  )

  lines.push(
    `      char _tftE_${id}[12]; char _tftD_${id}[12];`,
    `      _tftTime(_tftE_${id}, sizeof(_tftE_${id}), ${display.elapsedExpr});`,
    `      _tftTime(_tftD_${id}, sizeof(_tftD_${id}), ${display.durationExpr});`,
    `      if (_tftTextDirty(${p}, ${s.elapsed}, _tftE_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.elapsed)}, _tftE_${id}, TFT_C_TEXT, TFT_C_BG);`,
    `      if (_tftTextDirty(${p}, ${s.duration}, _tftD_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.duration)}, _tftD_${id}, TFT_C_DIM, TFT_C_BG);`,
  )

  lines.push(
    // The bar compares the pixels it would fill, not the float behind them.
    `      float _tftProg_${id} = ${display.progressExpr};`,
    `      if (_tftValueDirty(${p}, ${v.progress}, _tftBarFill(${g.progress.w}, _tftProg_${id})) || _tftFull_${id}) `
      + `_tftBar(${p}, ${rectArgs(g.progress)}, _tftProg_${id}, TFT_C_ACCENT, TFT_C_TRACK, TFT_C_OUTLINE);`,
  )

  lines.push(
    // A word, not a glyph: the shared 3x5 font has no triangle, and inventing
    // one here would be a glyph the preview does not have.
    `      const char *_tftState_${id} = (${display.playingExpr}) ? "PLAY" : "PAUSE";`,
    `      if (_tftTextDirty(${p}, ${s.state}, _tftState_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.state)}, _tftState_${id}, TFT_C_TEXT, TFT_C_BG);`,
    `      if (_tftFull_${id}) _tftField(${p}, ${fieldArgs(g.volumeLabel)}, "VOL", TFT_C_DIM, TFT_C_BG);`,
    `      float _tftVol_${id} = ${display.volumeExpr};`,
    `      if (_tftValueDirty(${p}, ${v.volume}, _tftBarFill(${g.volume.w}, _tftVol_${id})) || _tftFull_${id}) `
      + `_tftBar(${p}, ${rectArgs(g.volume)}, _tftVol_${id}, TFT_C_TEXT, TFT_C_TRACK, TFT_C_OUTLINE);`,
  )

  return lines
}

function showStatusLoop(display: TftDisplayEmit, width: number, height: number): string[] {
  const p = `_tft_${display.id}`
  const id = display.id
  const g = showStatusGeometry(width, height)
  const s = SHOW_STATUS_TEXT_SLOTS
  const text = (expr: string | null) => expr ?? '""'
  const lines: string[] = []

  // Read out of flash into a local before either field is formatted: the
  // running pattern and the browsed candidate are two indices into one table,
  // and the reader copies rather than points because PROGMEM may be a separate
  // address space.
  const names = display.patternNames
  const nameBuffer = (suffix: string, indexExpr: string) => {
    const buffer = `_tftName${suffix}_${id}`
    lines.push(
      `      char ${buffer}[${DISPLAY_TEXT_BUFFER_BYTES}];`,
      `      _patName_${names!.tableStem}_read(${buffer}, sizeof(${buffer}), (uint16_t)(${indexExpr}));`,
    )
    return buffer
  }
  const patternName = names && !display.patternNameExpr
    ? nameBuffer('Active', `${names.selVar}.active`) : display.patternNameExpr
  const highlightName = names && !display.highlightNameExpr
    ? nameBuffer('High', `${names.selVar}.highlight`) : display.highlightNameExpr

  // Formatting only — no declaration and no paint — so the running pattern's
  // ordinal and the browsed candidate's are produced by one piece of code.
  // They count out of the same collection, and a divergence between them
  // would be a bug nobody could see by looking at the panel.
  // The index local is named after its buffer so the browsing branch does not
  // shadow the outer one: the two ordinals live in nested scopes, and a
  // shadowed name here compiles but reads as a bug in every review.
  const formatOrdinal = (buffer: string, indexExpr: string, indent: string) => {
    const at = `_tftAt${buffer}`
    return [
      `${indent}long ${at} = _tftWhole(${indexExpr});`,
      `${indent}if (_tftCount_${id} <= 0) {`,
      // The same refusal showStatusOrdinalText() makes: a lone 1/0 on a panel
      // is worse than being told the wire is not carrying a show.
      `${indent}  snprintf(${buffer}, sizeof(${buffer}), "NO PATTERNS");`,
      `${indent}} else {`,
      `${indent}  if (${at} < 0) ${at} = 0;`,
      `${indent}  if (${at} > _tftCount_${id} - 1) ${at} = _tftCount_${id} - 1;`,
      `${indent}  snprintf(${buffer}, sizeof(${buffer}), "%ld/%ld", ${at} + 1, _tftCount_${id});`,
      `${indent}}`,
    ]
  }

  lines.push(
    `      const char *_tftPattern_${id} = ${text(patternName)};`,
    `      if (_tftTextDirty(${p}, ${s.pattern}, _tftPattern_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.pattern)}, _tftPattern_${id}, TFT_C_TEXT, TFT_C_BG);`,
    `      long _tftCount_${id} = _tftWhole(${display.patternCountExpr});`,
    `      char _tftOrd_${id}[16];`,
    ...formatOrdinal(`_tftOrd_${id}`, display.patternIndexExpr, '      '),
    `      if (_tftTextDirty(${p}, ${s.ordinal}, _tftOrd_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.ordinal)}, _tftOrd_${id}, TFT_C_DIM, TFT_C_BG);`,
  )

  lines.push(
    `      bool _tftBrowsing_${id} = ${display.browsingExpr};`,
    // The same silence showStatusStateText() keeps: the ordinal row has
    // already said NO PATTERNS, and following that with PLAYING claims a show
    // the panel has just reported it does not have.
    `      const char *_tftState_${id} = _tftCount_${id} <= 0 ? "" `
      + `: (_tftBrowsing_${id} ? "BROWSING" : "PLAYING");`,
    `      if (_tftTextDirty(${p}, ${s.status}, _tftState_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.status)}, _tftState_${id}, `
      + `_tftBrowsing_${id} ? TFT_C_ACCENT : TFT_C_DIM, TFT_C_BG);`,
  )

  // Blank rather than skipped, matching drawTransportShowStatus: painting the
  // empty field is what clears the previous candidate when a browse ends, and
  // the dirty cache means an unchanged blank costs nothing after the first.
  lines.push(
    `      const char *_tftHigh_${id} = _tftBrowsing_${id} ? (${text(highlightName)}) : "";`,
    `      if (_tftTextDirty(${p}, ${s.highlight}, _tftHigh_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.highlight)}, _tftHigh_${id}, TFT_C_ACCENT, TFT_C_BG);`,
    `      char _tftHighOrd_${id}[16];`,
    `      _tftHighOrd_${id}[0] = 0;`,
    `      if (_tftBrowsing_${id}) {`,
    ...formatOrdinal(`_tftHighOrd_${id}`, display.highlightIndexExpr, '        '),
    `      }`,
    `      if (_tftTextDirty(${p}, ${s.highlightOrdinal}, _tftHighOrd_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.highlightOrdinal)}, _tftHighOrd_${id}, TFT_C_DIM, TFT_C_BG);`,
  )

  return lines
}

/**
 * LED Status: which fixture this is, and what it is actually doing.
 *
 * The device twin of `drawTransportLedStatus`, resolving the same geometry
 * function so the two cannot disagree about where a row sits. The two static
 * rows are string literals rather than runtime reads because a fixture's name
 * and shape are compile-time facts — only the state and the level move.
 *
 * `_tftLevelPct` rounds the way `ledStatusLevelText` does, through `lroundf`
 * on a value already clamped to 0-1, so a level of 0.715 reads 72 on both
 * sides rather than 71 on one of them.
 */
function ledStatusLoop(display: TftDisplayEmit, width: number, height: number): string[] {
  const p = `_tft_${display.id}`
  const id = display.id
  const g = ledStatusGeometry(width, height)
  const s = LED_STATUS_TEXT_SLOTS
  const status = display.ledStatus
  const fixture = status ? ledStatusCountText(status.ledCount) : ''
  const lines: string[] = [
    `      const char *_tftName_${id} = ${cppStringLiteral(status?.name ?? '')};`,
    `      if (_tftTextDirty(${p}, ${s.name}, _tftName_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.name)}, _tftName_${id}, TFT_C_TEXT, TFT_C_BG);`,
    `      const char *_tftFixture_${id} = ${cppStringLiteral(fixture)};`,
    `      if (_tftTextDirty(${p}, ${s.fixture}, _tftFixture_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.fixture)}, _tftFixture_${id}, TFT_C_DIM, TFT_C_BG);`,
  ]

  // Nothing wired: the layout's at-rest reading, which is dark at zero rather
  // than a fixture invented to fill the rows.
  const enabled = status?.enabledExpr ?? 'false'
  const brightness = status?.brightnessExpr ?? '0.0f'

  lines.push(
    `      bool _tftLit_${id} = ${enabled};`,
    `      const char *_tftState_${id} = _tftLit_${id} ? "ON" : "BLACKOUT";`,
    `      if (_tftTextDirty(${p}, ${s.state}, _tftState_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.state)}, _tftState_${id}, `
      + `_tftLit_${id} ? TFT_C_ON : TFT_C_OFF, TFT_C_BG);`,
    // Drawn while dark too, matching the browser: it is the level the fixture
    // returns to, and blanking it would make a blackout look like a fault.
    `      char _tftLevel_${id}[8];`,
    `      snprintf(_tftLevel_${id}, sizeof(_tftLevel_${id}), "%ld%%", `
      + `(long)lroundf(constrain((float)(${brightness}), 0.0f, 1.0f) * 100.0f));`,
    `      if (_tftTextDirty(${p}, ${s.level}, _tftLevel_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.level)}, _tftLevel_${id}, `
      + `_tftLit_${id} ? TFT_C_TEXT : TFT_C_DIM, TFT_C_BG);`,
  )

  return lines
}

function fixedTransportLoop(display: TftDisplayEmit, width: number, height: number): string[] {
  const p = `_tft_${display.id}`
  const id = display.id
  const g = fixedTransportGeometry(width, height)
  const s = FIXED_TRANSPORT_TEXT_SLOTS
  const v = FIXED_TRANSPORT_VALUE_SLOTS
  const text = (expr: string | null) => expr ?? '""'
  const button = (
    name: string,
    geometry: typeof g.previous,
    labelExpr: string,
    activeExpr = 'false',
    condition = `_tftFull_${id}`,
  ) => [
    `      if (${condition}) {`,
    `        bool _tftActive_${name}_${id} = ${activeExpr};`,
    `        _tftFillRect(${p}, ${rectArgs(geometry.rect)}, _tftActive_${name}_${id} ? TFT_C_ACCENT : TFT_C_TRACK);`,
    `        _tftRect(${p}, ${rectArgs(geometry.rect)}, _tftActive_${name}_${id} ? TFT_C_TEXT : TFT_C_OUTLINE);`,
    `        _tftField(${p}, ${fieldArgs(geometry.label)}, ${labelExpr}, `
      + `_tftActive_${name}_${id} ? TFT_C_BG : TFT_C_TEXT, _tftActive_${name}_${id} ? TFT_C_ACCENT : TFT_C_TRACK);`,
    `      }`,
  ]
  const lines = [
    `      const char *_tftTitle_${id} = ${text(display.titleExpr)};`,
    `      if (_tftTextDirty(${p}, ${s.title}, _tftTitle_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.title)}, _tftTitle_${id}, TFT_C_TEXT, TFT_C_BG);`,
    `      const char *_tftPattern_${id} = ${text(display.patternNameExpr)};`,
    `      if (_tftTextDirty(${p}, ${s.pattern}, _tftPattern_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.pattern)}, _tftPattern_${id}, TFT_C_ACCENT, TFT_C_BG);`,
    ...button('prev', g.previous, '"PREV"'),
    ...button('next', g.next, '"NEXT"'),
    `      bool _tftPlaying_${id} = ${display.playingExpr};`,
    `      const char *_tftState_${id} = _tftPlaying_${id} ? "PAUSE" : "PLAY";`,
    `      bool _tftStateDirty_${id} = _tftTextDirty(${p}, ${s.state}, _tftState_${id});`,
    ...button('play', g.playPause, `_tftState_${id}`, `_tftPlaying_${id}`, `_tftStateDirty_${id} || _tftFull_${id}`),
    `      if (_tftFull_${id}) _tftField(${p}, ${fieldArgs(g.volumeLabel)}, "VOL", TFT_C_DIM, TFT_C_BG);`,
    `      float _tftVol_${id} = ${display.volumeExpr};`,
    `      if (_tftValueDirty(${p}, ${v.volume}, _tftBarFill(${g.volume.w}, _tftVol_${id})) || _tftFull_${id}) `
      + `_tftBar(${p}, ${rectArgs(g.volume)}, _tftVol_${id}, TFT_C_TEXT, TFT_C_TRACK, TFT_C_OUTLINE);`,
  ]
  return lines
}

/**
 * An RTC's own reading, drawn large — the colour twin of `infoDisplayCpp.ts`'s
 * Clock branch, reading the same `_RtcDateTimeValue` this panel's normal-sketch
 * caller resolves exactly as the OLED case does. Cached like every other TFT
 * field rather than repainted every frame, unlike the OLED's whole-buffer
 * flush.
 */
function clockLoop(display: TftDisplayEmit, width: number, height: number): string[] {
  const p = `_tft_${display.id}`
  const id = display.id
  const g = transportClockGeometry(width, height)
  const s = CLOCK_TEXT_SLOTS
  const dt = display.dateTimeExpr
  return [
    `      char _tftTime_${id}[16]; char _tftDate_${id}[16];`,
    `      bool _tftClockValid_${id} = ${dt ? `${dt}.valid` : 'false'};`,
    `      if (_tftClockValid_${id}) {`,
    `        snprintf(_tftTime_${id}, sizeof(_tftTime_${id}), "%02d:%02d:%02d", `
      + `${dt ? `(int)${dt}.hour` : 0}, ${dt ? `(int)${dt}.minute` : 0}, ${dt ? `(int)${dt}.second` : 0});`,
    `        snprintf(_tftDate_${id}, sizeof(_tftDate_${id}), "%04d-%02d-%02d", `
      + `${dt ? `(int)${dt}.year` : 0}, ${dt ? `(int)${dt}.month` : 1}, ${dt ? `(int)${dt}.day` : 1});`,
    `      } else {`,
    `        snprintf(_tftTime_${id}, sizeof(_tftTime_${id}), "--:--:--");`,
    `        _tftDate_${id}[0] = 0;`,
    `      }`,
    `      if (_tftTextDirty(${p}, ${s.time}, _tftTime_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.time)}, _tftTime_${id}, TFT_C_TEXT, TFT_C_BG);`,
    `      if (_tftTextDirty(${p}, ${s.date}, _tftDate_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.date)}, _tftDate_${id}, TFT_C_DIM, TFT_C_BG);`,
    `      bool _tftClockSynced_${id} = ${dt ? `(${dt}.synced && !${dt}.stale)` : 'false'};`,
    `      const char *_tftClockStatus_${id} = !_tftClockValid_${id} ? "NO CLOCK" : `
      + `(_tftClockSynced_${id} ? "SYNCED" : "NOT SYNCED");`,
    `      if (_tftTextDirty(${p}, ${s.status}, _tftClockStatus_${id}) || _tftFull_${id}) `
      + `_tftField(${p}, ${fieldArgs(g.status)}, _tftClockStatus_${id}, `
      + `!_tftClockValid_${id} ? TFT_C_OFF : (_tftClockSynced_${id} ? TFT_C_ON : TFT_C_ACCENT), TFT_C_BG);`,
  ]
}

/**
 * Nothing is plugged in, and the panel says so.
 *
 * Both rows are fixed text, so they are painted on a full repaint only — the
 * dirty cache exists for readings that change, and these never do. Without
 * this the layout fell through to Now Playing and a device drew an empty
 * transport where the preview drew a message, which is exactly the kind of
 * disagreement the shared geometry exists to prevent.
 */
function waitingLoop(display: TftDisplayEmit, width: number, height: number): string[] {
  const p = `_tft_${display.id}`
  const id = display.id
  const g = transportWaitingGeometry(width, height)
  const lines = [
    `      if (_tftFull_${id}) _tftField(${p}, ${fieldArgs(g.message)}, `
      + `${cppStringLiteral(DISPLAY_WAITING_TEXT)}, TFT_C_TEXT, TFT_C_BG);`,
  ]
  if (g.hint) {
    lines.push(
      `      if (_tftFull_${id}) _tftField(${p}, ${fieldArgs(g.hint)}, `
        + `"WIRE A SOURCE TO DISPLAY", TFT_C_DIM, TFT_C_BG);`,
    )
  }
  return lines
}

function diagnosticsLoop(display: TftDisplayEmit, width: number, height: number): string[] {
  const p = `_tft_${display.id}`
  const id = display.id
  const g = diagnosticsGeometry(width, height)
  const colors = ['0xf800', '0x07e0', '0x031f', '0xffff']
  const lines = [
    `      if (_tftFull_${id}) {`,
    `        _tftField(${p}, ${fieldArgs(g.title)}, "DISPLAY TEST", TFT_C_TEXT, TFT_C_BG);`,
    ...g.swatches.flatMap((rect, i) => [
      `        _tftFillRect(${p}, ${rectArgs(rect)}, ${colors[i]});`,
      `        _tftRect(${p}, ${rectArgs(rect)}, TFT_C_OUTLINE);`,
    ]),
    `        _tftField(${p}, ${fieldArgs(g.panel)}, "${width} X ${height}", TFT_C_DIM, TFT_C_BG);`,
    `      }`,
  ]
  if (display.diagnosticTouch) {
    lines.push(
      `      const char *_tftTouch_${id} = _touchDown_${id} ? "TOUCH DOWN" : "TOUCH READY";`,
      `      if (_tftTextDirty(${p}, 0, _tftTouch_${id}) || _tftFull_${id}) _tftField(${p}, ${fieldArgs(g.touch)}, _tftTouch_${id}, _touchDown_${id} ? TFT_C_ON : TFT_C_ACCENT, TFT_C_BG);`,
      `      char _tftXY_${id}[24];`,
      `      if (_touchDown_${id}) snprintf(_tftXY_${id}, sizeof(_tftXY_${id}), "X %d  Y %d", _touchX_${id}, _touchY_${id});`,
      `      else snprintf(_tftXY_${id}, sizeof(_tftXY_${id}), "PRESS THE PANEL");`,
      `      if (_tftTextDirty(${p}, 1, _tftXY_${id}) || _tftFull_${id}) _tftField(${p}, ${fieldArgs(g.coordinates)}, _tftXY_${id}, TFT_C_TEXT, TFT_C_BG);`,
      `      char _tftRaw_${id}[24];`,
      `      if (_touchDown_${id}) snprintf(_tftRaw_${id}, sizeof(_tftRaw_${id}), "RAW %u  %u", _touchRawX_${id}, _touchRawY_${id});`,
      `      else snprintf(_tftRaw_${id}, sizeof(_tftRaw_${id}), "RAW --  --");`,
      `      if (_tftTextDirty(${p}, 2, _tftRaw_${id}) || _tftFull_${id}) _tftField(${p}, ${fieldArgs(g.rawCoordinates)}, _tftRaw_${id}, TFT_C_DIM, TFT_C_BG);`,
    )
  } else {
    lines.push(
      `      if (_tftFull_${id}) {`,
      `        _tftField(${p}, ${fieldArgs(g.touch)}, "NO TOUCH", TFT_C_ACCENT, TFT_C_BG);`,
      `        _tftField(${p}, ${fieldArgs(g.coordinates)}, "PRESS THE PANEL", TFT_C_TEXT, TFT_C_BG);`,
      `        _tftField(${p}, ${fieldArgs(g.rawCoordinates)}, "NO RAW INPUT", TFT_C_DIM, TFT_C_BG);`,
      `      }`,
    )
  }
  return lines
}

/**
 * Per-frame layout and repaint.
 *
 * Every coordinate comes from the shared geometry, resolved for this panel's
 * mounted size, rather than being written out again — which is the only reason
 * the panel and its preview can be claimed to match.
 *
 * A disabled panel drops its backlight and is left alone. It is deliberately
 * not cleared: the fields still hold what they were showing, so switching it
 * back on repaints only what changed while it was dark rather than redrawing
 * the whole screen.
 */
export function tftDisplayLoopCpp(display: TftDisplayEmit): string[] {
  const id = display.id
  const size = tftRotatedSize(display.controller, display.rotation)
  const body = display.layout === 'Waiting'
    ? waitingLoop(display, size.width, size.height)
    : display.layout === 'Clock'
    ? clockLoop(display, size.width, size.height)
    : display.layout === 'Diagnostics'
    ? diagnosticsLoop(display, size.width, size.height)
    : display.layout === 'Show Status'
      ? showStatusLoop(display, size.width, size.height)
    : display.layout === 'LED Status'
      ? ledStatusLoop(display, size.width, size.height)
    : display.layout === 'Fixed Transport'
      ? fixedTransportLoop(display, size.width, size.height)
      : nowPlayingLoop(display, size.width, size.height)

  return [
    `  { // Transport Display`,
    `    _tftOn_${id} = ${display.enabledExpr};`,
    `    _tftBacklight(_tft_${id}, _tftOn_${id});`,
    `    bool _tftFull_${id} = false;`,
    `    if (_tftOn_${id} && _tftPaint(_tft_${id}, _tftFull_${id})) {`,
    ...body,
    `    }`,
    `  }`,
  ]
}

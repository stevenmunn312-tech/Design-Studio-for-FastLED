// SH1106 / SSD1306 driver and layout rendering, emitted into the sketch.
//
// Written inline for the same reason the TM1637 driver is: a page-addressed
// 1-bit panel is a short, stable protocol, and bundling it keeps the display
// slices off the optional-library staging path — nothing to fetch, nothing to
// pin, nothing to fail without a network.
//
// The geometry constants and the glyph table are generated from
// state/infoDisplay.ts and state/font.ts rather than restated here. A margin
// typed twice is a margin that disagrees, and the whole point of the shared
// layout module is that the panel matches its preview.

import { DEFAULT_FONT, FONT_H, FONT_W } from '../state/font'
import {
  browserGeometry, clockGeometry, nowPlayingGeometry, waitingGeometry,
  type InfoDisplayLayout,
} from '../state/infoDisplay'
import { DISPLAY_WAITING_TEXT } from '../state/displaySignal'
import {
  OLED_LETTER_SPACING, OLED_PAGE_HEIGHT,
  type OledController, type OledTransport,
} from '../state/oledSurface'
import { cppStringLiteral } from '../state/displayText'

/**
 * The shared bitmap font as a flat column table.
 *
 * Generated from the same `FONT` the preview draws with, so a glyph cannot
 * differ between the two. Characters outside the table render as the fallback,
 * exactly as `coerceGlyphs` does in the browser.
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

/** Driver, primitives and the glyph table, emitted once per sketch. */
/**
 * Forward declaration for the top of a sketch, above the includes' first
 * function.
 *
 * The Arduino .ino preprocessor hoists a prototype for every function it finds
 * to a point above all user type definitions, so `struct OledPanel` — declared with
 * the helpers, far down the file — is not yet a name when the prototype for a
 * helper taking one by reference arrives. The build then fails on a line the
 * generator never wrote. The same trap already cost the FastLED declarations
 * that sit beside this one in the emitted preamble.
 */
export const INFO_DISPLAY_CPP_FORWARD = 'struct OledPanel;'

/**
 * The largest panel the shared struct is sized for.
 *
 * Every catalogued controller is 128x64 today, and the SH1106 differs only in
 * how much of its wider controller RAM the glass shows — `columnOffset`, not a
 * different buffer. A *smaller* module now needs nothing here: the panel
 * carries its own width and page count, and the layout resolves against them.
 * A larger one raises these two numbers and costs every panel the difference,
 * which is why they are a ceiling rather than a per-panel allocation.
 */
const OLED_MAX_WIDTH = 128
const OLED_MAX_HEIGHT = 64
const OLED_MAX_PAGES = OLED_MAX_HEIGHT / OLED_PAGE_HEIGHT

/** transport, cs/dc/rst/sck/mosi, addr, columnOffset, segmentRemap, comScan, w, h, pages, written. */
const OLED_PANEL_BYTE_MEMBERS = 14

function alignTo4(bytes: number): number {
  return Math.ceil(bytes / 4) * 4
}

/**
 * Internal RAM one `static OledPanel` costs the sketch.
 *
 * It lives here rather than in the RAM estimator because the struct below is
 * what it measures: `buf` and `last` are a full page-major frame each — the
 * second is what lets the panel skip a page that did not change — plus the
 * eleven byte-sized members and the 4-byte `lastWriteMs` after them. Two
 * kilobytes is not noise on an MCU that has 320 of them, and it was previously
 * counted as nothing at all.
 *
 * Flash is not counted here or anywhere in that estimate: the font table and
 * any baked thumbnails are PROGMEM, and the compile-capacity check measures
 * the real figure.
 *
 * Sized for a 32-bit target, which is what the RAM warning is calibrated
 * against. An AVR packs its structs and has a 2-byte int, so it would come out
 * a few bytes under — irrelevant beside the two frames, and academic anyway
 * since two of those do not fit in an Uno's entire SRAM.
 */
export const OLED_PANEL_RAM_BYTES =
  alignTo4(OLED_PANEL_BYTE_MEMBERS + 2 * OLED_MAX_WIDTH * OLED_MAX_PAGES) + 4


export function infoDisplayHelpersCpp(): string {
  const font = fontTableCpp()
  return `// ── 1-bit OLED (SH1106 / SSD1306) ───────────────────────────────────────────
// Mirrors src/state/oledSurface.ts and src/state/infoDisplay.ts so the panel
// draws what the preview drew.
// A ceiling for the shared buffer, not the panel: each OledPanel carries its
// own w/h/pages, so a smaller module addresses and flushes only its own glass.
#define OLED_MAX_W    ${OLED_MAX_WIDTH}
#define OLED_MAX_H    ${OLED_MAX_HEIGHT}
#define OLED_PAGE_H   ${OLED_PAGE_HEIGHT}
#define OLED_MAX_PAGES (OLED_MAX_H / OLED_PAGE_H)
#define OLED_FONT_W   ${FONT_W}
#define OLED_FONT_H   ${FONT_H}
#define OLED_SPACING  ${OLED_LETTER_SPACING}
// Longest gap between pushes when nothing changed, so a panel that was
// unplugged and returned redraws itself without the loop polling it.
#define OLED_REFRESH_MS 1000

static const char _oledChars[] = ${font.chars};
static const uint8_t _oledFont[${font.count} * OLED_FONT_W] = { ${font.table} };

// Which wires carry the bytes. The layout, the page addressing and the column
// offset above are identical either way — mirroring the split in
// src/state/oledSurface.ts, where the surface knows nothing about the bus.
#define OLED_SPI 0
#define OLED_I2C 1
// Control byte prefixes an I2C write: 0x00 says the payload is commands,
// 0x40 says it is display RAM. SPI says the same thing with the D/C line.
#define OLED_I2C_CMD  0x00
#define OLED_I2C_DATA 0x40
// Split so one page never exceeds the Wire library's transmit buffer, which is
// 32 bytes on AVR and only larger elsewhere. 16 payload bytes plus the control
// byte fits every implementation.
#define OLED_I2C_CHUNK 16

struct OledPanel {
  uint8_t transport;
  // SPI wires. A 4-pin I2C module has none of these.
  uint8_t cs, dc, rst, sck, mosi;
  // I2C. The address is a solder blob on the module: 0x3C or 0x3D.
  uint8_t addr;
  uint8_t columnOffset;
  // 0xA0/0xC0 scan forwards; 0xA1/0xC8 turn the panel 180 degrees. Which pair
  // is right depends on how the module is bolted down, not on the controller.
  uint8_t segmentRemap, comScan;
  // This panel's own glass. Everything below addresses through these rather
  // than through the ceiling the buffer is sized to.
  uint8_t w, h, pages;
  uint8_t buf[OLED_MAX_W * OLED_MAX_PAGES];
  uint8_t last[OLED_MAX_W * OLED_MAX_PAGES];
  bool written;
  uint32_t lastWriteMs;
};

static void _oledSpiByte(OledPanel &p, uint8_t value) {
  for (uint8_t i = 0; i < 8; i++) {
    digitalWrite(p.mosi, (value & 0x80) ? HIGH : LOW);
    digitalWrite(p.sck, HIGH);
    digitalWrite(p.sck, LOW);
    value <<= 1;
  }
}

static void _oledCommand(OledPanel &p, uint8_t value) {
  if (p.transport == OLED_I2C) {
    Wire.beginTransmission(p.addr);
    Wire.write((uint8_t)OLED_I2C_CMD);
    Wire.write(value);
    Wire.endTransmission();
    return;
  }
  digitalWrite(p.dc, LOW);
  digitalWrite(p.cs, LOW);
  _oledSpiByte(p, value);
  digitalWrite(p.cs, HIGH);
}

/** One page of display RAM, however this panel is wired. */
static void _oledPage(OledPanel &p, const uint8_t *page) {
  if (p.transport == OLED_I2C) {
    for (uint8_t x = 0; x < p.w; x += OLED_I2C_CHUNK) {
      uint8_t run = (uint8_t)(p.w - x);
      if (run > OLED_I2C_CHUNK) run = OLED_I2C_CHUNK;
      Wire.beginTransmission(p.addr);
      Wire.write((uint8_t)OLED_I2C_DATA);
      for (uint8_t i = 0; i < run; i++) Wire.write(page[x + i]);
      Wire.endTransmission();
    }
    return;
  }
  digitalWrite(p.dc, HIGH);
  digitalWrite(p.cs, LOW);
  for (uint8_t x = 0; x < p.w; x++) _oledSpiByte(p, page[x]);
  digitalWrite(p.cs, HIGH);
}

/** The controller setup both transports share, once the wires are up. */
static void _oledInit(OledPanel &p) {
  _oledCommand(p, 0xAE);              // display off
  _oledCommand(p, 0xD5); _oledCommand(p, 0x80);
  // Multiplex ratio is the row count, so it comes from the panel rather than
  // from a constant: a 32-row module driven at 0x3F scans rows it does not have.
  _oledCommand(p, 0xA8); _oledCommand(p, (uint8_t)(p.h - 1));
  _oledCommand(p, 0xD3); _oledCommand(p, 0x00);
  _oledCommand(p, 0x40);
  _oledCommand(p, 0xAD); _oledCommand(p, 0x8B);   // SH1106 charge pump; ignored by SSD1306
  _oledCommand(p, p.segmentRemap);    // segment remap, per mounted rotation
  _oledCommand(p, p.comScan);         // COM scan direction, likewise
  // COM pin layout follows the same fact: alternative for a 64-row panel,
  // sequential for a 32-row one, and getting it wrong interleaves the image.
  _oledCommand(p, 0xDA); _oledCommand(p, (uint8_t)(p.h > 32 ? 0x12 : 0x02));
  _oledCommand(p, 0x81); _oledCommand(p, 0x80);   // contrast
  _oledCommand(p, 0xD9); _oledCommand(p, 0x22);
  _oledCommand(p, 0xDB); _oledCommand(p, 0x35);
  _oledCommand(p, 0xA4);              // resume from RAM
  _oledCommand(p, 0xA6);              // normal, not inverted
  _oledCommand(p, 0xAF);              // display on
}

/** Fields neither transport can do without, so neither begin can forget them. */
static void _oledCommon(OledPanel &p, uint8_t transport, uint8_t w, uint8_t h,
                        uint8_t columnOffset, uint8_t segmentRemap, uint8_t comScan) {
  p.transport = transport;
  // Clamped to what the shared buffer can hold: a panel wider or taller than
  // the ceiling would index past both frames, and a corrupted neighbour is
  // harder to spot than a clipped picture.
  p.w = w > OLED_MAX_W ? OLED_MAX_W : w;
  p.h = h > OLED_MAX_H ? OLED_MAX_H : h;
  p.pages = (uint8_t)((p.h + OLED_PAGE_H - 1) / OLED_PAGE_H);
  p.columnOffset = columnOffset;
  p.segmentRemap = segmentRemap; p.comScan = comScan;
  p.written = false; p.lastWriteMs = 0;
  for (uint16_t i = 0; i < sizeof(p.buf); i++) { p.buf[i] = 0; p.last[i] = 0; }
}

static void _oledBeginSpi(OledPanel &p, uint8_t cs, uint8_t dc, uint8_t rst,
                          uint8_t sck, uint8_t mosi, uint8_t w, uint8_t h,
                          uint8_t columnOffset, uint8_t segmentRemap, uint8_t comScan) {
  _oledCommon(p, OLED_SPI, w, h, columnOffset, segmentRemap, comScan);
  p.cs = cs; p.dc = dc; p.rst = rst; p.sck = sck; p.mosi = mosi;
  p.addr = 0;

  pinMode(cs, OUTPUT); pinMode(dc, OUTPUT); pinMode(rst, OUTPUT);
  pinMode(sck, OUTPUT); pinMode(mosi, OUTPUT);
  digitalWrite(cs, HIGH); digitalWrite(sck, LOW);

  digitalWrite(rst, LOW); delay(10); digitalWrite(rst, HIGH); delay(10);
  _oledInit(p);
}

// No reset line and no chip select: a 4-pin module brings out power, ground and
// the two bus wires, and resets itself from its own RC network at power-up.
// Wire.begin() is the sketch's, not this panel's — every I2C device on the
// board shares one bus, so one place starts it.
static void _oledBeginI2c(OledPanel &p, uint8_t addr, uint8_t w, uint8_t h,
                          uint8_t columnOffset, uint8_t segmentRemap, uint8_t comScan) {
  _oledCommon(p, OLED_I2C, w, h, columnOffset, segmentRemap, comScan);
  p.cs = 0; p.dc = 0; p.rst = 0; p.sck = 0; p.mosi = 0;
  p.addr = addr;
  _oledInit(p);
}

// Page-addressed, one page at a time. The column offset is the whole reason
// this is not a straight buffer dump: an SH1106 has 132 columns of RAM behind a
// 128-column panel, so its window starts two columns in. Dumping without it
// shifts the image two pixels and wraps the remainder down the edge.
static void _oledFlush(OledPanel &p, bool lit) {
  uint32_t now = millis();
  uint16_t used = (uint16_t)p.w * (uint16_t)p.pages;
  bool changed = !p.written;
  for (uint16_t i = 0; i < used && !changed; i++) changed = p.buf[i] != p.last[i];
  if (!changed && (now - p.lastWriteMs) < OLED_REFRESH_MS) return;
  for (uint16_t i = 0; i < used; i++) p.last[i] = p.buf[i];
  p.written = true;
  p.lastWriteMs = now;

  if (!lit) { _oledCommand(p, 0xAE); return; }
  _oledCommand(p, 0xAF);

  for (uint8_t page = 0; page < p.pages; page++) {
    _oledCommand(p, (uint8_t)(0xB0 + page));
    _oledCommand(p, (uint8_t)(0x00 | (p.columnOffset & 0x0F)));
    _oledCommand(p, (uint8_t)(0x10 | ((p.columnOffset >> 4) & 0x0F)));
    _oledPage(p, &p.buf[page * p.w]);
  }
}

// ── Drawing ─────────────────────────────────────────────────────────────────

static void _oledClear(OledPanel &p) {
  uint16_t used = (uint16_t)p.w * (uint16_t)p.pages;
  for (uint16_t i = 0; i < used; i++) p.buf[i] = 0;
}

static void _oledPixel(OledPanel &p, int x, int y) {
  if (x < 0 || x >= p.w || y < 0 || y >= p.h) return;
  p.buf[((y / OLED_PAGE_H) * p.w) + x] |= (uint8_t)(1 << (y % OLED_PAGE_H));
}

static int _oledGlyphIndex(char c) {
  if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');
  for (int i = 0; _oledChars[i] != 0; i++) if (_oledChars[i] == c) return i;
  return -1;
}

static int _oledTextWidth(const char *text) {
  int n = (int)strlen(text);
  return n == 0 ? 0 : (n * (OLED_FONT_W + OLED_SPACING)) - OLED_SPACING;
}

static void _oledText(OledPanel &p, int x, int y, const char *text) {
  int cursor = x;
  for (int i = 0; text[i] != 0; i++) {
    int glyph = _oledGlyphIndex(text[i]);
    // Unsupported characters draw the fallback, matching coerceGlyphs().
    if (glyph < 0) glyph = _oledGlyphIndex('?');
    if (glyph >= 0) {
      for (int c = 0; c < OLED_FONT_W; c++) {
        uint8_t column = _oledFont[(glyph * OLED_FONT_W) + c];
        for (int r = 0; r < OLED_FONT_H; r++) if (column & (1 << r)) _oledPixel(p, cursor + c, y + r);
      }
    }
    cursor += OLED_FONT_W + OLED_SPACING;
  }
}

// Fits in characters against real metrics, so a cut ends at a glyph boundary
// and the ellipsis survives instead of being the first thing clipped.
static void _oledFit(char *dst, size_t dstSize, const char *text, int pixels) {
  int stride = OLED_FONT_W + OLED_SPACING;
  int capacity = pixels < OLED_FONT_W ? 0 : (pixels + OLED_SPACING) / stride;
  if (capacity < 0) capacity = 0;
  if ((size_t)capacity > dstSize - 1) capacity = (int)dstSize - 1;
  int len = (int)strlen(text);
  if (len <= capacity) { memcpy(dst, text, len); dst[len] = 0; return; }
  if (capacity <= 3) { memcpy(dst, text, capacity); dst[capacity] = 0; return; }
  memcpy(dst, text, capacity - 3);
  dst[capacity - 3] = '.'; dst[capacity - 2] = '.'; dst[capacity - 1] = '.';
  dst[capacity] = 0;
}

static void _oledHLine(OledPanel &p, int x, int y, int w) {
  for (int i = 0; i < w; i++) _oledPixel(p, x + i, y);
}

static void _oledVLine(OledPanel &p, int x, int y, int h) {
  for (int i = 0; i < h; i++) _oledPixel(p, x, y + i);
}

static void _oledRect(OledPanel &p, int x, int y, int w, int h) {
  if (w <= 0 || h <= 0) return;
  _oledHLine(p, x, y, w); _oledHLine(p, x, y + h - 1, w);
  _oledVLine(p, x, y, h); _oledVLine(p, x + w - 1, y, h);
}

static void _oledFill(OledPanel &p, int x, int y, int w, int h) {
  for (int row = 0; row < h; row++) _oledHLine(p, x, y + row, w);
}

static void _oledBar(OledPanel &p, int x, int y, int w, int h, float value) {
  if (w <= 2 || h <= 2) return;
  _oledRect(p, x, y, w, h);
  float v = value;
  if (!isfinite(v) || v < 0) v = 0;
  if (v > 1) v = 1;
  int filled = (int)lroundf((w - 2) * v);
  if (filled > 0) _oledFill(p, x + 1, y + 1, filled, h - 2);
}


// Elapsed/duration as M:SS, matching formatTransportTime().
static void _oledTime(char *dst, size_t dstSize, float seconds) {
  long total = (long)floorf(seconds > 0 ? seconds : 0);
  snprintf(dst, dstSize, "%ld:%02ld", total / 60, total % 60);
}
`
}

export interface InfoDisplayEmit {
  id: string
  /** Which wires carry the bytes; the layout is the same either way. */
  transport: OledTransport
  csPin: number
  dcPin: number
  resetPin: number
  sckPin: number
  mosiPin: number
  /** I2C only. The pins are the sketch's shared bus, not this panel's. */
  address: number
  columnOffset: number
  /** Segment-remap and COM-scan commands for the mounted rotation. */
  segmentRemap: number
  comScan: number
  layout: InfoDisplayLayout
  /** The glass this panel actually has, which is what the layout resolves against. */
  width: number
  height: number
  enabledExpr: string
  titleExpr: string | null
  line2Expr: string | null
  valueExpr: string
  progressExpr: string
  playingExpr: string
  volumeExpr: string
  durationExpr: string
  dateTimeExpr: string | null
  /**
   * Pattern Browser only: the identifier stem of the thumbnail table this
   * browser reads, and the PatternSel driving it. Two browsers can show
   * different collections, so neither the table nor the selection is shared.
   */
  browser?: {
    /**
     * The player that owns this selection.
     *
     * Named for the player rather than the panel because two panels wired to
     * one player must read one cursor — and because the panel no longer
     * decides anything, so it has nothing of its own to name.
     */
    tableStem: string
    selVar: string
  }
}

export function infoDisplayGlobalCpp(display: InfoDisplayEmit): string {
  return `static OledPanel _oled_${display.id};`
}

export function infoDisplaySetupCpp(display: InfoDisplayEmit): string[] {
  const rotation = `0x${display.segmentRemap.toString(16)}, 0x${display.comScan.toString(16)}`
  if (display.transport === 'i2c') {
    return [
      `  _oledBeginI2c(_oled_${display.id}, 0x${display.address.toString(16)}, ` +
        `${display.width}, ${display.height}, ${display.columnOffset}, ${rotation});`,
    ]
  }
  return [
    `  _oledBeginSpi(_oled_${display.id}, ${display.csPin}, ${display.dcPin}, ${display.resetPin}, ` +
      `${display.sckPin}, ${display.mosiPin}, ${display.width}, ${display.height}, ` +
      `${display.columnOffset}, ${rotation});`,
  ]
}

/**
 * Per-frame layout and flush.
 *
 * Every coordinate here is *resolved* by the same geometry functions the
 * preview draws from, against this panel's own size, rather than written out
 * again — so a shorter module cannot lay itself out one way here and another
 * way on the glass. A row the geometry says does not fit is not emitted at
 * all, which is how the two sides agree about a dropped row rather than one of
 * them drawing past the bottom.
 */
export function infoDisplayLoopCpp(display: InfoDisplayEmit): string[] {
  const p = `_oled_${display.id}`
  const { width, height } = display
  const text = (expr: string | null) => expr ?? '""'

  const lines = [
    `  { // Info Display`,
    `    bool _oledOn_${display.id} = ${display.enabledExpr};`,
    `    _oledClear(${p});`,
    `    if (_oledOn_${display.id}) {`,
    `      char _oledBuf_${display.id}[40];`,
  ]

  if (display.layout === 'Clock') {
    const dt = display.dateTimeExpr
    const g = clockGeometry(width, height)
    lines.push(
      `      char _oledT_${display.id}[16]; char _oledD_${display.id}[16];`,
      `      bool _oledValid_${display.id} = ${dt ? `${dt}.valid` : 'false'};`,
      `      if (_oledValid_${display.id}) {`,
      `        snprintf(_oledT_${display.id}, sizeof(_oledT_${display.id}), "%02d:%02d", ` +
        `${dt ? `${dt}.hour` : 0}, ${dt ? `${dt}.minute` : 0});`,
      `        snprintf(_oledD_${display.id}, sizeof(_oledD_${display.id}), "%04d-%02d-%02d", ` +
        `${dt ? `${dt}.year` : 0}, ${dt ? `${dt}.month` : 1}, ${dt ? `${dt}.day` : 1});`,
      `      } else {`,
      `        snprintf(_oledT_${display.id}, sizeof(_oledT_${display.id}), "--:--");`,
      `        _oledD_${display.id}[0] = 0;`,
      `      }`,
      `      _oledText(${p}, max(${g.time.x}, (${width} - _oledTextWidth(_oledT_${display.id})) / 2), ${g.time.y}, _oledT_${display.id});`,
      `      _oledText(${p}, max(${g.date.x}, (${width} - _oledTextWidth(_oledD_${display.id})) / 2), ${g.date.y}, _oledD_${display.id});`,
    )
    if (g.rule) lines.push(`      _oledHLine(${p}, ${g.rule.x}, ${g.rule.y}, ${g.rule.w});`)
    if (g.health) lines.push(
      `      const char *_oledH_${display.id} = !_oledValid_${display.id} ? "NO CLOCK" : ` +
        `(${dt ? `(${dt}.synced && !${dt}.stale)` : 'false'} ? "SYNCED" : "NOT SYNCED");`,
      `      _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), _oledH_${display.id}, ${g.health.w});`,
      `      _oledText(${p}, ${g.health.x}, ${g.health.y}, _oledBuf_${display.id});`,
    )
  } else if (display.layout === 'Waiting') {
    // Nothing plugged in, said outright. A blank panel and a dead panel look
    // identical on a bench, and the second row names the user's next move.
    const g = waitingGeometry(width, height)
    lines.push(
      `      _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), "${DISPLAY_WAITING_TEXT}", ${g.message.w});`,
      `      _oledText(${p}, max(${g.message.x}, (${width} - _oledTextWidth(_oledBuf_${display.id})) / 2), ${g.message.y}, _oledBuf_${display.id});`,
    )
    if (g.hint) lines.push(
      `      _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), "WIRE A SOURCE TO DISPLAY", ${g.hint.w});`,
      `      _oledText(${p}, max(${g.hint.x}, (${width} - _oledTextWidth(_oledBuf_${display.id})) / 2), ${g.hint.y}, _oledBuf_${display.id});`,
    )
  } else if (display.layout === 'Pattern Browser') {
    const b = display.browser
    const stem = b?.tableStem ?? display.id
    const sel = b?.selVar ?? `_sel_${display.id}`
    const count = `THUMB_COUNT_${stem}`
    const g = browserGeometry(width, height)
    lines.push(
      // No _selUpdate here. The player advances the selection, from the
      // controls bundle; this panel reads it. A display that also stepped it
      // would be a second opinion about what a click meant.
      `      if (${count} == 0) {`,
      `        _oledText(${p}, ${g.empty.x}, ${g.empty.y}, "NO PATTERNS");`,
      `      } else {`,
      `        uint16_t _oledSel_${display.id} = ${sel}.highlight;`,
      // Every coordinate from BROWSER_LAYOUT rather than written out again.
      `        _oledThumb(${p}, ${g.thumb.x}, ${g.thumb.y}, ` +
        `THUMB_W_${stem}, THUMB_H_${stem}, _thumbByte_${stem}, _oledSel_${display.id});`,
      `        char _oledName_${display.id}[40];`,
      `        _thumbName_${stem}_read(_oledName_${display.id}, sizeof(_oledName_${display.id}), _oledSel_${display.id});`,
      `        _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), _oledName_${display.id}, ${g.name.w});`,
      `        _oledText(${p}, ${g.name.x}, ${g.name.y}, _oledBuf_${display.id});`,
      `        snprintf(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), "%u/%u", ` +
        `(unsigned)(_oledSel_${display.id} + 1), (unsigned)${count});`,
      `        _oledText(${p}, ${g.ordinal.x}, ${g.ordinal.y}, _oledBuf_${display.id});`,
      // A word, not a glyph: the shared 3x5 font has no tick or triangle.
      `        _oledText(${p}, ${g.status.x}, ${g.status.y}, ` +
        `_selBrowsing(${sel}) ? "SELECT?" : "PLAYING");`,
    )
    // Without this the panel confidently describes something the LEDs are not
    // doing, which is the whole reason active and highlight are separate — but
    // a panel with no room for it says less rather than drawing over the
    // picture.
    if (g.playing) lines.push(
      `        if (_selBrowsing(${sel})) {`,
      `          _oledHLine(${p}, ${g.playing.rule.x}, ${g.playing.rule.y}, ${g.playing.rule.w});`,
      `          _thumbName_${stem}_read(_oledName_${display.id}, sizeof(_oledName_${display.id}), ${sel}.active);`,
      `          char _oledPlaying_${display.id}[48];`,
      `          snprintf(_oledPlaying_${display.id}, sizeof(_oledPlaying_${display.id}), "PLAYING %s", _oledName_${display.id});`,
      `          _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), _oledPlaying_${display.id}, ${g.playing.label.w});`,
      `          _oledText(${p}, ${g.playing.label.x}, ${g.playing.label.y}, _oledBuf_${display.id});`,
      `        }`,
    )
    lines.push(`      }`)
  } else {
    const g = nowPlayingGeometry(width, height)
    lines.push(
      `      _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), ${text(display.titleExpr)}, ${g.title.w});`,
      `      _oledText(${p}, ${g.title.x}, ${g.title.y}, _oledBuf_${display.id});`,
      `      _oledText(${p}, ${g.state.x}, ${g.state.y}, (${display.playingExpr}) ? "PLAY" : "PAUSE");`,
      `      char _oledE_${display.id}[12]; char _oledD_${display.id}[12]; char _oledTimes_${display.id}[26];`,
      `      _oledTime(_oledE_${display.id}, sizeof(_oledE_${display.id}), ${display.valueExpr});`,
      `      _oledTime(_oledD_${display.id}, sizeof(_oledD_${display.id}), ${display.durationExpr});`,
      `      snprintf(_oledTimes_${display.id}, sizeof(_oledTimes_${display.id}), "%s/%s", _oledE_${display.id}, _oledD_${display.id});`,
      `      _oledText(${p}, ${g.times.x + g.times.w} - _oledTextWidth(_oledTimes_${display.id}), ${g.times.y}, _oledTimes_${display.id});`,
      `      _oledBar(${p}, ${g.bar.x}, ${g.bar.y}, ${g.bar.w}, ${g.bar.h}, ${display.progressExpr});`,
    )
    if (g.volume) lines.push(
      `      snprintf(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), "VOL %d", ` +
        `(int)lroundf(constrain(${display.volumeExpr}, 0.0f, 1.0f) * 100));`,
      `      _oledText(${p}, ${g.volume.x}, ${g.volume.y}, _oledBuf_${display.id});`,
    )
  }

  lines.push(
    `    }`,
    `    _oledFlush(${p}, _oledOn_${display.id});`,
    `  }`,
  )
  return lines
}

/** Column offset for the controller a part declares. */
export function columnOffsetFor(controller: OledController | null): number {
  return controller?.columnOffset ?? 0
}

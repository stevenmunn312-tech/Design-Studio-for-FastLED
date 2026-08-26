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
import { INFO_LAYOUT, STATUS_MAX_INDICATORS, infoRowY, BROWSER_LAYOUT, type InfoDisplayLayout } from '../state/infoDisplay'
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

export function infoDisplayHelpersCpp(): string {
  const font = fontTableCpp()
  return `// ── 1-bit OLED (SH1106 / SSD1306) ───────────────────────────────────────────
// Mirrors src/state/oledSurface.ts and src/state/infoDisplay.ts so the panel
// draws what the preview drew.
#define OLED_W        128
#define OLED_H        64
#define OLED_PAGE_H   ${OLED_PAGE_HEIGHT}
#define OLED_PAGES    (OLED_H / OLED_PAGE_H)
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
  uint8_t buf[OLED_W * OLED_PAGES];
  uint8_t last[OLED_W * OLED_PAGES];
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
    for (uint8_t x = 0; x < OLED_W; x += OLED_I2C_CHUNK) {
      Wire.beginTransmission(p.addr);
      Wire.write((uint8_t)OLED_I2C_DATA);
      for (uint8_t i = 0; i < OLED_I2C_CHUNK; i++) Wire.write(page[x + i]);
      Wire.endTransmission();
    }
    return;
  }
  digitalWrite(p.dc, HIGH);
  digitalWrite(p.cs, LOW);
  for (uint8_t x = 0; x < OLED_W; x++) _oledSpiByte(p, page[x]);
  digitalWrite(p.cs, HIGH);
}

/** The controller setup both transports share, once the wires are up. */
static void _oledInit(OledPanel &p) {
  _oledCommand(p, 0xAE);              // display off
  _oledCommand(p, 0xD5); _oledCommand(p, 0x80);
  _oledCommand(p, 0xA8); _oledCommand(p, 0x3F);
  _oledCommand(p, 0xD3); _oledCommand(p, 0x00);
  _oledCommand(p, 0x40);
  _oledCommand(p, 0xAD); _oledCommand(p, 0x8B);   // SH1106 charge pump; ignored by SSD1306
  _oledCommand(p, p.segmentRemap);    // segment remap, per mounted rotation
  _oledCommand(p, p.comScan);         // COM scan direction, likewise
  _oledCommand(p, 0xDA); _oledCommand(p, 0x12);
  _oledCommand(p, 0x81); _oledCommand(p, 0x80);   // contrast
  _oledCommand(p, 0xD9); _oledCommand(p, 0x22);
  _oledCommand(p, 0xDB); _oledCommand(p, 0x35);
  _oledCommand(p, 0xA4);              // resume from RAM
  _oledCommand(p, 0xA6);              // normal, not inverted
  _oledCommand(p, 0xAF);              // display on
}

/** Fields neither transport can do without, so neither begin can forget them. */
static void _oledCommon(OledPanel &p, uint8_t transport, uint8_t columnOffset,
                        uint8_t segmentRemap, uint8_t comScan) {
  p.transport = transport;
  p.columnOffset = columnOffset;
  p.segmentRemap = segmentRemap; p.comScan = comScan;
  p.written = false; p.lastWriteMs = 0;
  for (uint16_t i = 0; i < sizeof(p.buf); i++) { p.buf[i] = 0; p.last[i] = 0; }
}

static void _oledBeginSpi(OledPanel &p, uint8_t cs, uint8_t dc, uint8_t rst,
                          uint8_t sck, uint8_t mosi, uint8_t columnOffset,
                          uint8_t segmentRemap, uint8_t comScan) {
  _oledCommon(p, OLED_SPI, columnOffset, segmentRemap, comScan);
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
static void _oledBeginI2c(OledPanel &p, uint8_t addr, uint8_t columnOffset,
                          uint8_t segmentRemap, uint8_t comScan) {
  _oledCommon(p, OLED_I2C, columnOffset, segmentRemap, comScan);
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
  bool changed = !p.written;
  for (uint16_t i = 0; i < sizeof(p.buf) && !changed; i++) changed = p.buf[i] != p.last[i];
  if (!changed && (now - p.lastWriteMs) < OLED_REFRESH_MS) return;
  for (uint16_t i = 0; i < sizeof(p.buf); i++) p.last[i] = p.buf[i];
  p.written = true;
  p.lastWriteMs = now;

  if (!lit) { _oledCommand(p, 0xAE); return; }
  _oledCommand(p, 0xAF);

  for (uint8_t page = 0; page < OLED_PAGES; page++) {
    _oledCommand(p, (uint8_t)(0xB0 + page));
    _oledCommand(p, (uint8_t)(0x00 | (p.columnOffset & 0x0F)));
    _oledCommand(p, (uint8_t)(0x10 | ((p.columnOffset >> 4) & 0x0F)));
    _oledPage(p, &p.buf[page * OLED_W]);
  }
}

// ── Drawing ─────────────────────────────────────────────────────────────────

static void _oledClear(OledPanel &p) {
  for (uint16_t i = 0; i < sizeof(p.buf); i++) p.buf[i] = 0;
}

static void _oledPixel(OledPanel &p, int x, int y) {
  if (x < 0 || x >= OLED_W || y < 0 || y >= OLED_H) return;
  p.buf[((y / OLED_PAGE_H) * OLED_W) + x] |= (uint8_t)(1 << (y % OLED_PAGE_H));
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

static void _oledIndicator(OledPanel &p, int x, int y, bool on, int size) {
  if (on) _oledFill(p, x, y, size, size);
  else _oledRect(p, x, y, size, size);
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
  enabledExpr: string
  titleExpr: string | null
  line2Expr: string | null
  valueExpr: string
  progressExpr: string
  playingExpr: string
  volumeExpr: string
  durationExpr: string
  dateTimeExpr: string | null
  indicatorExprs: readonly string[]
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
        `${display.columnOffset}, ${rotation});`,
    ]
  }
  return [
    `  _oledBeginSpi(_oled_${display.id}, ${display.csPin}, ${display.dcPin}, ${display.resetPin}, ` +
      `${display.sckPin}, ${display.mosiPin}, ${display.columnOffset}, ${rotation});`,
  ]
}

/**
 * Per-frame layout and flush.
 *
 * Every coordinate here comes from `INFO_LAYOUT` and `infoRowY` rather than
 * being written out again, so the emitted geometry cannot drift from the
 * preview's.
 */
export function infoDisplayLoopCpp(display: InfoDisplayEmit): string[] {
  const p = `_oled_${display.id}`
  const m = INFO_LAYOUT.margin
  const inner = 128 - (m * 2)
  const bar = INFO_LAYOUT.barHeight
  // The browser's text column is narrower: the picture takes the left edge.
  const browserInner = 128 - BROWSER_LAYOUT.textX - m
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
      `      _oledText(${p}, max(${m}, (OLED_W - _oledTextWidth(_oledT_${display.id})) / 2), ${infoRowY(0)}, _oledT_${display.id});`,
      `      _oledText(${p}, max(${m}, (OLED_W - _oledTextWidth(_oledD_${display.id})) / 2), ${infoRowY(1)}, _oledD_${display.id});`,
      `      _oledHLine(${p}, ${m}, ${infoRowY(2) + 1}, ${inner});`,
      `      const char *_oledH_${display.id} = !_oledValid_${display.id} ? "NO CLOCK" : ` +
        `(${dt ? `(${dt}.synced && !${dt}.stale)` : 'false'} ? "SYNCED" : "NOT SYNCED");`,
      `      _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), _oledH_${display.id}, ${inner});`,
      `      _oledText(${p}, ${m}, ${infoRowY(3)}, _oledBuf_${display.id});`,
    )
  } else if (display.layout === 'Status') {
    lines.push(
      `      _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), ${text(display.titleExpr)}, ${inner});`,
      `      _oledText(${p}, ${m}, ${infoRowY(0)}, _oledBuf_${display.id});`,
      `      _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), ${text(display.line2Expr)}, ${inner});`,
      `      _oledText(${p}, ${m}, ${infoRowY(1)}, _oledBuf_${display.id});`,
      `      char _oledV_${display.id}[16];`,
      `      snprintf(_oledV_${display.id}, sizeof(_oledV_${display.id}), "%ld", (long)lroundf(${display.valueExpr}));`,
      `      _oledText(${p}, OLED_W - ${m} - _oledTextWidth(_oledV_${display.id}), ${infoRowY(2)}, _oledV_${display.id});`,
    )
    display.indicatorExprs.slice(0, STATUS_MAX_INDICATORS).forEach((expr, i) => {
      const x = m + (i * (INFO_LAYOUT.indicatorSize + 2))
      lines.push(`      _oledIndicator(${p}, ${x}, ${infoRowY(2)}, ${expr}, ${INFO_LAYOUT.indicatorSize});`)
    })
    lines.push(`      _oledBar(${p}, ${m}, ${infoRowY(3) + 2}, ${inner}, ${bar}, ${display.progressExpr});`)
  } else if (display.layout === 'Pattern Browser') {
    const b = display.browser
    const stem = b?.tableStem ?? display.id
    const sel = b?.selVar ?? `_sel_${display.id}`
    const count = `THUMB_COUNT_${stem}`
    lines.push(
      // No _selUpdate here. The player advances the selection, from the
      // controls bundle; this panel reads it. A display that also stepped it
      // would be a second opinion about what a click meant.
      `      if (${count} == 0) {`,
      `        _oledText(${p}, ${m}, ${infoRowY(1)}, "NO PATTERNS");`,
      `      } else {`,
      `        uint16_t _oledSel_${display.id} = ${sel}.highlight;`,
      // Every coordinate from BROWSER_LAYOUT rather than written out again.
      `        _oledThumb(${p}, ${BROWSER_LAYOUT.thumbX}, ${BROWSER_LAYOUT.thumbY}, ` +
        `THUMB_W_${stem}, THUMB_H_${stem}, _thumbByte_${stem}, _oledSel_${display.id});`,
      `        char _oledName_${display.id}[40];`,
      `        _thumbName_${stem}_read(_oledName_${display.id}, sizeof(_oledName_${display.id}), _oledSel_${display.id});`,
      `        _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), _oledName_${display.id}, ${browserInner});`,
      `        _oledText(${p}, ${BROWSER_LAYOUT.textX}, ${infoRowY(0)}, _oledBuf_${display.id});`,
      `        snprintf(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), "%u/%u", ` +
        `(unsigned)(_oledSel_${display.id} + 1), (unsigned)${count});`,
      `        _oledText(${p}, ${BROWSER_LAYOUT.textX}, ${infoRowY(1)}, _oledBuf_${display.id});`,
      // A word, not a glyph: the shared 3x5 font has no tick or triangle.
      `        _oledText(${p}, ${BROWSER_LAYOUT.textX}, ${infoRowY(2)}, ` +
        `_selBrowsing(${sel}) ? "SELECT?" : "PLAYING");`,
      `        if (_selBrowsing(${sel})) {`,
      // Without this the panel confidently describes something the LEDs are not
      // doing, which is the whole reason active and highlight are separate.
      `          _oledHLine(${p}, ${m}, ${infoRowY(4)}, ${inner});`,
      `          _thumbName_${stem}_read(_oledName_${display.id}, sizeof(_oledName_${display.id}), ${sel}.active);`,
      `          char _oledPlaying_${display.id}[48];`,
      `          snprintf(_oledPlaying_${display.id}, sizeof(_oledPlaying_${display.id}), "PLAYING %s", _oledName_${display.id});`,
      `          _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), _oledPlaying_${display.id}, ${inner});`,
      `          _oledText(${p}, ${m}, ${infoRowY(5)}, _oledBuf_${display.id});`,
      `        }`,
      `      }`,
    )
  } else {
    lines.push(
      `      _oledFit(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), ${text(display.titleExpr)}, ${inner});`,
      `      _oledText(${p}, ${m}, ${infoRowY(0)}, _oledBuf_${display.id});`,
      `      _oledText(${p}, ${m}, ${infoRowY(1)}, (${display.playingExpr}) ? "PLAY" : "PAUSE");`,
      `      char _oledE_${display.id}[12]; char _oledD_${display.id}[12]; char _oledTimes_${display.id}[26];`,
      `      _oledTime(_oledE_${display.id}, sizeof(_oledE_${display.id}), ${display.valueExpr});`,
      `      _oledTime(_oledD_${display.id}, sizeof(_oledD_${display.id}), ${display.durationExpr});`,
      `      snprintf(_oledTimes_${display.id}, sizeof(_oledTimes_${display.id}), "%s/%s", _oledE_${display.id}, _oledD_${display.id});`,
      `      _oledText(${p}, OLED_W - ${m} - _oledTextWidth(_oledTimes_${display.id}), ${infoRowY(1)}, _oledTimes_${display.id});`,
      `      _oledBar(${p}, ${m}, ${infoRowY(2) + 1}, ${inner}, ${bar}, ${display.progressExpr});`,
      `      snprintf(_oledBuf_${display.id}, sizeof(_oledBuf_${display.id}), "VOL %d", ` +
        `(int)lroundf(constrain(${display.volumeExpr}, 0.0f, 1.0f) * 100));`,
      `      _oledText(${p}, ${m}, ${infoRowY(3) + bar}, _oledBuf_${display.id});`,
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

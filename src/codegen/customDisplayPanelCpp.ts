// The physical half of the custom Display screen: an LVGL 9 `lv_display_t`
// driving an ST7789/ST7789V panel over SPI, and (when the module has one) an
// `lv_indev_t` sampling its XPT2046 touch controller.
//
// customDisplayLvglCpp.ts stops at the LVGL boundary on purpose — everything
// there is a pure function of a DisplayDocument. This module is the other
// half: getting LVGL's own draw buffer onto real glass and a finger's
// position out of real glass. It does not reuse tftDisplayCpp.ts's `TftPanel`,
// which is a cached-field renderer for the *fixed* transport layouts and has
// no notion of flushing an arbitrary pixel buffer; it emits its own minimal
// ST7789 register sequence instead, using the same datasheet-verified values
// tftDisplayCpp.ts already carries; the two never both draw the same panel.
// Touch is not re-implemented: XPT2046 sampling stays in tftTouchCpp.ts's
// `_xptPoint`, and this module's indev callback is a thin wrapper around it.

import {
  asTftRotation, PARALLEL_TOUCH_ELECTRODES, TFT_CONTROLLERS, tftMadctl, tftRotatedSize,
  tftWindowOrigin,
  type TftController, type TftRotation,
} from '../state/tftSurface'
import { TELEMETRY_TOUCH_INTERVAL_MS } from '../state/deviceTelemetry'
import { tftControllerForProps, tftTransportForProps } from '../state/nodeLibrary'
import { displayHasTouch } from '../state/partCatalogue'
import { emittedTouchBounds } from '../state/transportTouch'
import { MAX_PIN_NUMBER } from '../state/boardGpio'
import { customDisplayId } from './customDisplayId'
import { TELEMETRY_TOUCH_PRESS_CPP, telemetryTouchSampleCpp } from './deviceTelemetryCpp'
import { tftTouchIrqSetupCpp } from './tftTouchCpp'

export const CUSTOM_DISPLAY_PANEL_CPP_INCLUDES = '#include <SPI.h>'

// No forward declaration is needed here, unlike InfoDisplay/SegmentDisplay/
// TftDisplay's panel structs: every function below reads its state through the
// file-scope `_cdPanel_<id>` global rather than taking `CustomDisplayPanel &`
// as a parameter, so the struct's own definition never needs to exist before a
// hoisted prototype does. `displayForwardDeclarations.test.ts`'s derived check
// (scans for any by-reference struct parameter) is what would catch it if that
// ever stopped being true.

/** Rows of the panel kept in the LVGL draw buffer at once. Small and fixed:
 * a full 240x320 RGB565 frame is 150 KB, which does not fit beside FastLED and
 * an audio pipeline. LVGL flushes in bands of this height instead. */
export const CUSTOM_DISPLAY_PANEL_BUFFER_LINES = 20

/** 32-bit target allowance for panel pins/window, SPI settings, display/input
 * handles and the screen pointer. LVGL objects themselves live in its heap. */
export const CUSTOM_DISPLAY_PANEL_RAM_BYTES = 32

export function customDisplayPanelBufferPixels(controller: TftController, rotation: TftRotation): number {
  return tftRotatedSize(controller, rotation).width * CUSTOM_DISPLAY_PANEL_BUFFER_LINES
}

export interface CustomDisplayPanelTouch {
  csPin: number; irqPin: number; sckPin: number; mosiPin: number; misoPin: number
  xFrom: number; xTo: number; yFrom: number; yTo: number
}

export interface CustomDisplayPanelEmit {
  /** Codegen-owned identifier stem, shared with the CustomDisplayLvglEmit for
   * the same node. */
  id: string
  /** Stamp each press for bench telemetry; set only when the Board asks. */
  telemetry?: boolean
  controller: TftController
  rotation: TftRotation
  csPin: number
  dcPin: number
  resetPin: number
  sckPin: number
  mosiPin: number
  backlightPin: number
  /**
   * Set only for an 8-bit parallel module, and the whole of what selects the
   * transport — an SPI panel leaves it undefined and emits exactly what it did
   * before. A parallel panel has no SCK or MOSI to name, which is why one
   * cannot be driven by falling back to the SPI defaults: those are pins it
   * never had, on a bus it does not speak.
   */
  parallel?: { dataPins: readonly number[]; wrPin: number; rdPin: number }
  /** Present only for a touch-capable module. */
  touch?: CustomDisplayPanelTouch
  /**
   * A bare resistive sheet reads four of the panel's own LCD lines as
   * electrodes rather than naming a digitiser of its own, so these are the
   * panel's pins borrowed — the same map the fixed layouts read.
   */
  resistive?: { xpPin: number; xmPin: number; ypPin: number; ymPin: number }
  /** Template controllers sample touch explicitly before evaluating controls. */
  manualTouch?: boolean
  /**
   * Runtime gate, from the panel's Enabled property or the wire feeding it.
   *
   * A disabled panel is still built and still initialised — it is fitted
   * hardware either way — but it is dark, reads no touch and rests its widget
   * outputs, exactly as a disabled fixed layout is. Defaults to always on.
   */
  enabledExpr?: string
}

export function customDisplayPanelFromProps(
  id: string,
  p: Record<string, unknown>,
  calibration: Record<string, unknown> = p,
): CustomDisplayPanelEmit {
  const integer = (key: string, fallback: number, max = MAX_PIN_NUMBER) => {
    const value = Math.round(Number(p[key] ?? fallback))
    return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback
  }
  // The module's own bus, from the part rather than from anything the graph
  // says — the same question `tftTransportForProps` answers for a fixed layout.
  const parallel = tftTransportForProps(p) === 'parallel'
  return {
    id: customDisplayId(id), controller: tftControllerForProps(p) ?? TFT_CONTROLLERS.ST7789V,
    rotation: asTftRotation(p.tftRotation),
    csPin: integer('csPin', 5), dcPin: integer('dcPin', 16), resetPin: integer('resetPin', 17),
    sckPin: integer('sckPin', 18), mosiPin: integer('mosiPin', 23), backlightPin: integer('backlightPin', 4),
    ...(parallel
      ? {
        parallel: {
          dataPins: Array.from({ length: 8 }, (_, bit) => integer(`d${bit}Pin`, bit)),
          wrPin: integer('wrPin', 33),
          rdPin: integer('rdPin', 34),
        },
        // Borrowed lines, not a second claim: exactly what the fixed layouts do.
        resistive: {
          xpPin: integer(PARALLEL_TOUCH_ELECTRODES.xp, 7),
          xmPin: integer(PARALLEL_TOUCH_ELECTRODES.xm, 9),
          ypPin: integer(PARALLEL_TOUCH_ELECTRODES.yp, 5),
          ymPin: integer(PARALLEL_TOUCH_ELECTRODES.ym, 8),
        },
      }
      : {}),
    touch: displayHasTouch(String(p.partId ?? '')) ? {
      csPin: integer('touchCsPin', 15), irqPin: integer('touchIrqPin', 2),
      sckPin: integer('touchSckPin', 18), mosiPin: integer('touchMosiPin', 23), misoPin: integer('touchMisoPin', 19),
      // See emittedTouchBounds: a reversed axis leaves here as a descending
      // span rather than a flag the LVGL read callback branches on.
      ...emittedTouchBounds(calibration),
    } : undefined,
  }
}

function rotationCode(rotation: TftRotation): number {
  return { '0': 0, '90': 1, '180': 2, '270': 3 }[rotation]
}

function hex2(value: number): string {
  return `0x${(value & 0xff).toString(16).padStart(2, '0')}`
}

/** Per-panel globals: the LVGL display/indev handles, its draw buffer, and the
 * runtime state its command primitives need. Nothing here is authored text —
 * only the codegen-owned display stem occurs in an identifier. */
export function customDisplayPanelGlobalCpp(emit: CustomDisplayPanelEmit): string {
  const id = emit.id
  const bufPixels = customDisplayPanelBufferPixels(emit.controller, emit.rotation)
  const lines = [
    `struct CustomDisplayPanel_${id} {`,
    `  uint8_t cs, dc, rst, sck, mosi, bl;`,
    `  uint16_t colStart, rowStart;`,
    `  bool parallel;`,
    `  uint8_t d[8], wr, rd;`,
    `};`,
    `static CustomDisplayPanel_${id} _cdPanel_${id};`,
    `static SPISettings _cdPanelSpi_${id}(40000000, MSBFIRST, SPI_MODE0);`,
    `static lv_display_t *_cdDisp_${id} = nullptr;`,
    `static uint8_t _cdPanelBuf_${id}[${bufPixels} * 2];`,
    // File scope, not a loop local: touch sampling and widget-output snapshots
    // both read it, and both run before the point in the pass where a wired
    // Enabled has a value. They therefore see the previous pass's state on the
    // one frame it changes, which is the cost of evaluating the expression
    // once rather than in three places that could disagree.
    `static bool _cdPanelOn_${id} = ${emit.enabledExpr === 'false' ? 'false' : 'true'};`,
  ]
  if (emit.touch) {
    lines.push(`static lv_indev_t *_cdIndev_${id} = nullptr;`)
    if (emit.telemetry) lines.push(`static uint32_t _cdTouchSampleMs_${id} = 0;`)
  }
  return lines.join('\n')
}

/** ST7789 command/data primitives, one pair of static functions per panel
 * rather than shared with tftDisplayCpp.ts's — the two drivers never draw the
 * same physical panel, and sharing state across two independently-pinned
 * SPISettings would only add a coupling neither side needs. */
function panelBusCpp(emit: CustomDisplayPanelEmit): string {
  const id = emit.id
  return `static inline void _cdTxnBegin_${id}() {
  if (!_cdPanel_${id}.parallel) SPI.beginTransaction(_cdPanelSpi_${id});
}
static inline void _cdTxnEnd_${id}() {
  if (!_cdPanel_${id}.parallel) SPI.endTransaction();
}
static inline void _cdWrite8_${id}(uint8_t value) {
  if (_cdPanel_${id}.parallel) {
    for (uint8_t b = 0; b < 8; b++) digitalWrite(_cdPanel_${id}.d[b], (value >> b) & 1);
    // The controller latches on WR's rising edge, so the low pulse comes first
    // and the line is left high ready for the next byte.
    digitalWrite(_cdPanel_${id}.wr, LOW);
    digitalWrite(_cdPanel_${id}.wr, HIGH);
  } else {
    SPI.transfer(value);
  }
}
static void _cdPanelCmd_${id}(uint8_t value) {
  _cdTxnBegin_${id}();
  digitalWrite(_cdPanel_${id}.dc, LOW);
  digitalWrite(_cdPanel_${id}.cs, LOW);
  _cdWrite8_${id}(value);
  digitalWrite(_cdPanel_${id}.cs, HIGH);
  _cdTxnEnd_${id}();
}
static void _cdPanelCmdData_${id}(uint8_t command, const uint8_t *data, uint8_t count) {
  _cdTxnBegin_${id}();
  digitalWrite(_cdPanel_${id}.dc, LOW);
  digitalWrite(_cdPanel_${id}.cs, LOW);
  _cdWrite8_${id}(command);
  digitalWrite(_cdPanel_${id}.dc, HIGH);
  for (uint8_t i = 0; i < count; i++) _cdWrite8_${id}(data[i]);
  digitalWrite(_cdPanel_${id}.cs, HIGH);
  _cdTxnEnd_${id}();
}
static void _cdPanelWindow_${id}(int32_t x, int32_t y, int32_t w, int32_t h) {
  uint16_t x0 = (uint16_t)(x + _cdPanel_${id}.colStart);
  uint16_t x1 = (uint16_t)(x + w - 1 + _cdPanel_${id}.colStart);
  uint16_t y0 = (uint16_t)(y + _cdPanel_${id}.rowStart);
  uint16_t y1 = (uint16_t)(y + h - 1 + _cdPanel_${id}.rowStart);
  uint8_t cols[4] = { (uint8_t)(x0 >> 8), (uint8_t)x0, (uint8_t)(x1 >> 8), (uint8_t)x1 };
  uint8_t rows[4] = { (uint8_t)(y0 >> 8), (uint8_t)y0, (uint8_t)(y1 >> 8), (uint8_t)y1 };
  _cdPanelCmdData_${id}(0x2A, cols, 4);
  _cdPanelCmdData_${id}(0x2B, rows, 4);
}`
}

/** The flush callback LVGL calls with a finished band of pixels.
 *
 * `SPI.transfer16` sends its argument's bits MSB-first regardless of the
 * host's own byte order, matching what the ST7789 expects over the wire — the
 * same big-endian byte pair tftDisplayCpp.ts's `_tftRun` writes by hand for a
 * solid fill. Reading `px_map` through a `uint16_t*` likewise recovers each
 * pixel's logical RGB565 value regardless of host endianness, so there is no
 * dependency on how LVGL happened to lay the buffer out in memory.
 */
function panelFlushCpp(emit: CustomDisplayPanelEmit): string {
  const id = emit.id
  return `static void _cdFlush_${id}(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map) {
  int32_t w = area->x2 - area->x1 + 1;
  int32_t h = area->y2 - area->y1 + 1;
  _cdPanelWindow_${id}(area->x1, area->y1, w, h);
  uint32_t count = (uint32_t)w * (uint32_t)h;
  const uint16_t *pixels = (const uint16_t *)px_map;
  _cdTxnBegin_${id}();
  digitalWrite(_cdPanel_${id}.dc, LOW);
  digitalWrite(_cdPanel_${id}.cs, LOW);
  _cdWrite8_${id}((uint8_t)0x2C);
  digitalWrite(_cdPanel_${id}.dc, HIGH);
  // High byte first: the order the controller reads a pixel in, and what the
  // serial path sent as one 16-bit word. A transport changes how a byte
  // leaves, never the order the panel expects them in.
  for (uint32_t i = 0; i < count; i++) {
    _cdWrite8_${id}((uint8_t)(pixels[i] >> 8));
    _cdWrite8_${id}((uint8_t)pixels[i]);
  }
  digitalWrite(_cdPanel_${id}.cs, HIGH);
  _cdTxnEnd_${id}();
  lv_display_flush_ready(disp);
}`
}

/** The indev read callback: one `_xptPoint` sample per poll, reported in the
 * panel's mounted coordinate space — the same space `_xptPoint` already
 * resolves rotation into for the fixed Transport Display's own touch sampling,
 * so no second rotation mapping is written here. */
function panelIndevCpp(emit: CustomDisplayPanelEmit): string {
  if (!emit.touch) return ''
  const id = emit.id
  const t = emit.touch
  return `static void _cdIndevRead_${id}(lv_indev_t *indev, lv_indev_data_t *data) {
  // LVGL uses the pointer position on the release sample too. Keep the last
  // pressed point: _xptPoint returns before writing x/y when IRQ goes high,
  // and resetting them to (0, 0) here would snap sliders back to minimum.
  static int16_t x = 0, y = 0;
  uint16_t rawX = 0, rawY = 0;
  if (!_cdPanelOn_${id}) { data->state = LV_INDEV_STATE_RELEASED; return; }
  bool pressed = ${emit.resistive
    ? `_resPoint(${emit.resistive.xpPin}, ${emit.resistive.xmPin}, `
      + `${emit.resistive.ypPin}, ${emit.resistive.ymPin}, `
    : `_xptPoint(${t.csPin}, ${t.irqPin}, ${t.sckPin}, ${t.mosiPin}, ${t.misoPin}, `}`
    + `${t.xFrom}, ${t.xTo}, ${t.yFrom}, ${t.yTo}, `
    + `${emit.controller.width}, ${emit.controller.height}, ${rotationCode(emit.rotation)}, x, y, rawX, rawY);
  data->point.x = x;
  data->point.y = y;
  data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
${emit.telemetry ? `  static bool _cdTouchPrev_${id} = false;
  if (pressed && !_cdTouchPrev_${id}) ${TELEMETRY_TOUCH_PRESS_CPP}
  if (pressed) {
    uint32_t sampleNow = millis();
    if (_cdTouchSampleMs_${id} == 0 || (uint32_t)(sampleNow - _cdTouchSampleMs_${id}) >= ${TELEMETRY_TOUCH_INTERVAL_MS}u) {
      ${telemetryTouchSampleCpp('rawX', 'rawY')}
      _cdTouchSampleMs_${id} = sampleNow;
    }
  } else { _cdTouchSampleMs_${id} = 0; }
  _cdTouchPrev_${id} = pressed;
` : ''}}`
}

/** Every static function this panel needs, emitted once per display. Grouped
 * with the globals pass rather than a shared once-per-sketch helper block: the
 * pins, and therefore every SPI call in these functions, differ per display,
 * so there is nothing here two custom displays could share. */
export function customDisplayPanelHelpersCpp(emit: CustomDisplayPanelEmit): string {
  return [panelBusCpp(emit), panelFlushCpp(emit), panelIndevCpp(emit)].filter(Boolean).join('\n')
}

/**
 * Apply the panel's Enabled state, once per pass.
 *
 * Backlight only, and only on a change: the panel keeps its last image while
 * dark, so re-enabling shows what was there rather than a blank screen waiting
 * for the next redraw. Skipping the LVGL bindings while off is what stops
 * anything being invalidated, so a dark panel costs no SPI traffic either.
 */
export function customDisplayPanelEnableCpp(emit: CustomDisplayPanelEmit): string[] {
  const id = emit.id
  const expression = emit.enabledExpr ?? 'true'
  // A constant is the latch's initial value already, so there is nothing to
  // re-decide every pass.
  if (expression === 'true' || expression === 'false') return []
  return [
    `  { // ${id} enabled`,
    `    bool _cdOn_${id} = ${expression};`,
    `    if (_cdOn_${id} != _cdPanelOn_${id}) {`,
    `      _cdPanelOn_${id} = _cdOn_${id};`,
    `      if (_cdPanel_${id}.bl != 255) digitalWrite(_cdPanel_${id}.bl, _cdOn_${id} ? HIGH : LOW);`,
    `    }`,
    `  }`,
  ]
}

/**
 * Panel init and LVGL display/indev registration.
 *
 * The register sequence (porch, gate, VCOM, power) is the ST7789 application
 * note's recommended set, copied from the values tftDisplayCpp.ts already
 * carries for the same two catalogued modules rather than re-derived, so the
 * two drivers cannot quietly disagree about what a working panel needs.
 */
export function customDisplayPanelSetupCpp(emit: CustomDisplayPanelEmit): string[] {
  const id = emit.id
  const size = tftRotatedSize(emit.controller, emit.rotation)
  const origin = tftWindowOrigin(emit.controller, emit.rotation)
  const madctl = tftMadctl(emit.controller, emit.rotation)
  const lines = [
    `  _cdPanel_${id}.cs = ${emit.csPin}; _cdPanel_${id}.dc = ${emit.dcPin}; _cdPanel_${id}.rst = ${emit.resetPin};`,
    `  _cdPanel_${id}.sck = ${emit.sckPin}; _cdPanel_${id}.mosi = ${emit.mosiPin}; _cdPanel_${id}.bl = ${emit.backlightPin};`,
    `  _cdPanel_${id}.colStart = ${origin.col}; _cdPanel_${id}.rowStart = ${origin.row};`,
    `  _cdPanel_${id}.parallel = ${emit.parallel ? 'true' : 'false'};`,
    ...(emit.parallel
      ? [
        `  _cdPanel_${id}.wr = ${emit.parallel.wrPin}; _cdPanel_${id}.rd = ${emit.parallel.rdPin};`,
        ...emit.parallel.dataPins.map((pin, bit) => `  _cdPanel_${id}.d[${bit}] = ${pin};`),
        // Data lines idle low and WR idles high, so the first strobe is a real
        // edge. RD is driven high and left there: floating or low lets the
        // controller drive the data lines back, and every write then collides
        // with its own output — which presents as a dead panel, not a bus fault.
        `  for (uint8_t b = 0; b < 8; b++) { pinMode(_cdPanel_${id}.d[b], OUTPUT); digitalWrite(_cdPanel_${id}.d[b], LOW); }`,
        `  pinMode(_cdPanel_${id}.wr, OUTPUT); digitalWrite(_cdPanel_${id}.wr, HIGH);`,
        `  pinMode(_cdPanel_${id}.rd, OUTPUT); digitalWrite(_cdPanel_${id}.rd, HIGH);`,
      ]
      : []),
    `  pinMode(_cdPanel_${id}.cs, OUTPUT); pinMode(_cdPanel_${id}.dc, OUTPUT); digitalWrite(_cdPanel_${id}.cs, HIGH);`,
    `  if (_cdPanel_${id}.rst != 255) pinMode(_cdPanel_${id}.rst, OUTPUT);`,
    `  if (_cdPanel_${id}.bl != 255) { pinMode(_cdPanel_${id}.bl, OUTPUT); digitalWrite(_cdPanel_${id}.bl, LOW); }`,
    // A parallel panel starts no SPI bus: it would claim an SCK and MOSI this
    // module does not have, on pins that are either in use here or absent from
    // the board entirely.
    ...(emit.parallel ? [] : [
      `#if defined(ESP32)`,
      `  SPI.begin(_cdPanel_${id}.sck, -1, _cdPanel_${id}.mosi, -1);`,
      `#elif defined(ESP8266)`,
      `  SPI.pins(_cdPanel_${id}.sck, MISO, _cdPanel_${id}.mosi, -1);`,
      `  SPI.begin();`,
      `#else`,
      `  SPI.begin();`,
      `#endif`,
    ]),
    `  if (_cdPanel_${id}.rst != 255) {`,
    `    digitalWrite(_cdPanel_${id}.rst, HIGH); delay(10);`,
    `    digitalWrite(_cdPanel_${id}.rst, LOW);  delay(10);`,
    `    digitalWrite(_cdPanel_${id}.rst, HIGH); delay(120);`,
    `  }`,
    `  _cdPanelCmd_${id}(0x01); delay(150);`, // SWRESET
    `  _cdPanelCmd_${id}(0x11); delay(120);`, // SLPOUT
    `  { uint8_t colmod = 0x55; _cdPanelCmdData_${id}(0x3A, &colmod, 1); }`, // 16 bpp
    `  { uint8_t v = ${hex2(madctl)}; _cdPanelCmdData_${id}(0x36, &v, 1); }`, // MADCTL
    `  { uint8_t porch[5] = { 0x0C, 0x0C, 0x00, 0x33, 0x33 }; _cdPanelCmdData_${id}(0xB2, porch, 5); }`,
    `  { uint8_t v = 0x35; _cdPanelCmdData_${id}(0xB7, &v, 1); }`,
    `  { uint8_t v = 0x19; _cdPanelCmdData_${id}(0xBB, &v, 1); }`,
    `  { uint8_t v = 0x2C; _cdPanelCmdData_${id}(0xC0, &v, 1); }`,
    `  { uint8_t v[2] = { 0x01, 0xFF }; _cdPanelCmdData_${id}(0xC2, v, 2); }`,
    `  { uint8_t v = 0x12; _cdPanelCmdData_${id}(0xC3, &v, 1); }`,
    `  { uint8_t v = 0x20; _cdPanelCmdData_${id}(0xC4, &v, 1); }`,
    `  { uint8_t v = 0x0F; _cdPanelCmdData_${id}(0xC6, &v, 1); }`,
    `  { uint8_t v[2] = { 0xA4, 0xA1 }; _cdPanelCmdData_${id}(0xD0, v, 2); }`,
    // IPS glass on both catalogued modules is wired normally-black.
    `  _cdPanelCmd_${id}(${emit.controller.invert ? '0x21' : '0x20'});`, // INVON / INVOFF
    `  _cdPanelCmd_${id}(0x13); delay(10);`, // NORON
    `  _cdPanelCmd_${id}(0x29); delay(100);`, // DISPON
    `  if (_cdPanel_${id}.bl != 255) digitalWrite(_cdPanel_${id}.bl, _cdPanelOn_${id} ? HIGH : LOW);`,
    ``,
    `  _cdDisp_${id} = lv_display_create(${size.width}, ${size.height});`,
    `  lv_display_set_default(_cdDisp_${id});`,
    `  lv_display_set_color_format(_cdDisp_${id}, LV_COLOR_FORMAT_RGB565);`,
    `  lv_display_set_flush_cb(_cdDisp_${id}, _cdFlush_${id});`,
    `  lv_display_set_buffers(_cdDisp_${id}, _cdPanelBuf_${id}, nullptr, sizeof(_cdPanelBuf_${id}), LV_DISPLAY_RENDER_MODE_PARTIAL);`,
  ]
  if (emit.touch) {
    const t = emit.touch
    lines.push(
      `  pinMode(${t.csPin}, OUTPUT); digitalWrite(${t.csPin}, HIGH);`,
      `  pinMode(${t.sckPin}, OUTPUT); digitalWrite(${t.sckPin}, LOW);`,
      `  pinMode(${t.mosiPin}, OUTPUT); pinMode(${t.misoPin}, INPUT);`,
      ...tftTouchIrqSetupCpp(t.irqPin),
      `  _cdIndev_${id} = lv_indev_create();`,
      `  lv_indev_set_type(_cdIndev_${id}, LV_INDEV_TYPE_POINTER);`,
      `  lv_indev_set_read_cb(_cdIndev_${id}, _cdIndevRead_${id});`,
      `  lv_indev_set_display(_cdIndev_${id}, _cdDisp_${id});`,
    )
    if (emit.manualTouch) lines.push(`  lv_indev_set_mode(_cdIndev_${id}, LV_INDEV_MODE_EVENT);`)
  }
  return lines
}

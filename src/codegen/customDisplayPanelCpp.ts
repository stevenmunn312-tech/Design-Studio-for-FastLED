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
  asTftRotation, TFT_CONTROLLERS, tftMadctl, tftRotatedSize, tftWindowOrigin,
  type TftController, type TftRotation,
} from '../state/tftSurface'
import { tftControllerForProps } from '../state/nodeLibrary'
import { partById } from '../state/partCatalogue'
import { MAX_PIN_NUMBER } from '../state/boardGpio'
import { customDisplayId } from './customDisplayId'

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
  xMin: number; xMax: number; yMin: number; yMax: number
}

export interface CustomDisplayPanelEmit {
  /** Codegen-owned identifier stem, shared with the CustomDisplayLvglEmit for
   * the same node. */
  id: string
  controller: TftController
  rotation: TftRotation
  csPin: number
  dcPin: number
  resetPin: number
  sckPin: number
  mosiPin: number
  backlightPin: number
  /** Present only for a touch-capable module. */
  touch?: CustomDisplayPanelTouch
  /** Template controllers sample touch explicitly before evaluating controls. */
  manualTouch?: boolean
}

export function customDisplayPanelFromProps(id: string, p: Record<string, unknown>): CustomDisplayPanelEmit {
  const integer = (key: string, fallback: number, max = MAX_PIN_NUMBER) => {
    const value = Math.round(Number(p[key] ?? fallback))
    return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback
  }
  return {
    id: customDisplayId(id), controller: tftControllerForProps(p) ?? TFT_CONTROLLERS.ST7789V,
    rotation: asTftRotation(p.tftRotation),
    csPin: integer('csPin', 5), dcPin: integer('dcPin', 16), resetPin: integer('resetPin', 17),
    sckPin: integer('sckPin', 18), mosiPin: integer('mosiPin', 23), backlightPin: integer('backlightPin', 4),
    touch: partById(String(p.partId ?? ''))?.display?.touchController ? {
      csPin: integer('touchCsPin', 15), irqPin: integer('touchIrqPin', 2),
      sckPin: integer('touchSckPin', 18), mosiPin: integer('touchMosiPin', 23), misoPin: integer('touchMisoPin', 19),
      xMin: integer('touchXMin', 200, 4095), xMax: integer('touchXMax', 3900, 4095),
      yMin: integer('touchYMin', 200, 4095), yMax: integer('touchYMax', 3900, 4095),
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
    `};`,
    `static CustomDisplayPanel_${id} _cdPanel_${id};`,
    `static SPISettings _cdPanelSpi_${id}(40000000, MSBFIRST, SPI_MODE0);`,
    `static lv_display_t *_cdDisp_${id} = nullptr;`,
    `static uint8_t _cdPanelBuf_${id}[${bufPixels} * 2];`,
  ]
  if (emit.touch) {
    lines.push(`static lv_indev_t *_cdIndev_${id} = nullptr;`)
  }
  return lines.join('\n')
}

/** ST7789 command/data primitives, one pair of static functions per panel
 * rather than shared with tftDisplayCpp.ts's — the two drivers never draw the
 * same physical panel, and sharing state across two independently-pinned
 * SPISettings would only add a coupling neither side needs. */
function panelBusCpp(emit: CustomDisplayPanelEmit): string {
  const id = emit.id
  return `static void _cdPanelCmd_${id}(uint8_t value) {
  SPI.beginTransaction(_cdPanelSpi_${id});
  digitalWrite(_cdPanel_${id}.dc, LOW);
  digitalWrite(_cdPanel_${id}.cs, LOW);
  SPI.transfer(value);
  digitalWrite(_cdPanel_${id}.cs, HIGH);
  SPI.endTransaction();
}
static void _cdPanelCmdData_${id}(uint8_t command, const uint8_t *data, uint8_t count) {
  SPI.beginTransaction(_cdPanelSpi_${id});
  digitalWrite(_cdPanel_${id}.dc, LOW);
  digitalWrite(_cdPanel_${id}.cs, LOW);
  SPI.transfer(command);
  digitalWrite(_cdPanel_${id}.dc, HIGH);
  for (uint8_t i = 0; i < count; i++) SPI.transfer(data[i]);
  digitalWrite(_cdPanel_${id}.cs, HIGH);
  SPI.endTransaction();
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
  SPI.beginTransaction(_cdPanelSpi_${id});
  digitalWrite(_cdPanel_${id}.dc, LOW);
  digitalWrite(_cdPanel_${id}.cs, LOW);
  SPI.transfer((uint8_t)0x2C);
  digitalWrite(_cdPanel_${id}.dc, HIGH);
  for (uint32_t i = 0; i < count; i++) SPI.transfer16(pixels[i]);
  digitalWrite(_cdPanel_${id}.cs, HIGH);
  SPI.endTransaction();
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
  int16_t x = 0, y = 0; uint16_t rawX = 0, rawY = 0;
  bool pressed = _xptPoint(${t.csPin}, ${t.irqPin}, ${t.sckPin}, ${t.mosiPin}, ${t.misoPin}, `
    + `${t.xMin}, ${t.xMax}, ${t.yMin}, ${t.yMax}, `
    + `${emit.controller.width}, ${emit.controller.height}, ${rotationCode(emit.rotation)}, x, y, rawX, rawY);
  data->point.x = x;
  data->point.y = y;
  data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}`
}

/** Every static function this panel needs, emitted once per display. Grouped
 * with the globals pass rather than a shared once-per-sketch helper block: the
 * pins, and therefore every SPI call in these functions, differ per display,
 * so there is nothing here two custom displays could share. */
export function customDisplayPanelHelpersCpp(emit: CustomDisplayPanelEmit): string {
  return [panelBusCpp(emit), panelFlushCpp(emit), panelIndevCpp(emit)].filter(Boolean).join('\n')
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
    `  pinMode(_cdPanel_${id}.cs, OUTPUT); pinMode(_cdPanel_${id}.dc, OUTPUT); digitalWrite(_cdPanel_${id}.cs, HIGH);`,
    `  if (_cdPanel_${id}.rst != 255) pinMode(_cdPanel_${id}.rst, OUTPUT);`,
    `  if (_cdPanel_${id}.bl != 255) { pinMode(_cdPanel_${id}.bl, OUTPUT); digitalWrite(_cdPanel_${id}.bl, LOW); }`,
    `#if defined(ESP32) || defined(ESP8266)`,
    `  SPI.begin(_cdPanel_${id}.sck, -1, _cdPanel_${id}.mosi, -1);`,
    `#else`,
    `  SPI.begin();`,
    `#endif`,
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
    `  if (_cdPanel_${id}.bl != 255) digitalWrite(_cdPanel_${id}.bl, HIGH);`,
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
      `  pinMode(${t.irqPin}, INPUT_PULLUP);`,
      `  _cdIndev_${id} = lv_indev_create();`,
      `  lv_indev_set_type(_cdIndev_${id}, LV_INDEV_TYPE_POINTER);`,
      `  lv_indev_set_read_cb(_cdIndev_${id}, _cdIndevRead_${id});`,
      `  lv_indev_set_display(_cdIndev_${id}, _cdDisp_${id});`,
    )
    if (emit.manualTouch) lines.push(`  lv_indev_set_mode(_cdIndev_${id}, LV_INDEV_MODE_EVENT);`)
  }
  return lines
}

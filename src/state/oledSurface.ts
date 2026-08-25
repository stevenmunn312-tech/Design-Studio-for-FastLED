// The 1-bit drawing surface every monochrome OLED shares.
//
// Two rules shape this module.
//
// The first is that the surface knows nothing about the bus. The SH1106 on the
// bench is a 7-pin SPI module and the SSD1306 to come is 4-pin I2C, and the
// layout, the page addressing and the column offset are identical either way.
// Only the byte-shipping differs, and that belongs to the driver.
//
// The second is that the controller's own geometry lives here rather than being
// fixed up per device. An SH1106 has 132 columns of RAM behind a 128-column
// panel, so its window starts two columns in. Drive one as an SSD1306 and the
// image sits two pixels off with the wrapped remainder down the edge — which
// looks like a wiring fault, not a software one, and costs an evening.
//
// Text comes from the same bitmap font the LED Text node draws with, so a
// character that renders in the preview is a character the firmware has a glyph
// for. See `textColumns` in state/font.ts.

import { DEFAULT_FONT, textColumns, type BitmapFont } from './font'
import { coerceGlyphs, truncateUtf8 } from './displayText'

/** Rows of pixels packed into one byte of controller RAM. */
export const OLED_PAGE_HEIGHT = 8

export interface OledController {
  id: string
  /** Visible panel size in pixels. */
  width: number
  height: number
  /**
   * First column of controller RAM the panel actually shows.
   *
   * 2 on the 1.3-inch SH1106, whose 132-column RAM is wider than its glass;
   * 0 on the SSD1306, where they match.
   */
  columnOffset: number
}

export const OLED_CONTROLLERS: Record<string, OledController> = {
  SH1106: { id: 'SH1106', width: 128, height: 64, columnOffset: 2 },
  SSD1306: { id: 'SSD1306', width: 128, height: 64, columnOffset: 0 },
}

/**
 * The controller a catalogued part drives, by its declared controller string.
 *
 * `SH1106G` and `SH1106` are the same silicon in different package markings, so
 * the lookup matches on the family rather than the exact string an asset
 * happens to print.
 */
export function oledControllerFor(controller: string | undefined): OledController | null {
  if (!controller) return null
  const upper = controller.toUpperCase()
  for (const key of Object.keys(OLED_CONTROLLERS)) {
    if (upper.startsWith(key)) return OLED_CONTROLLERS[key]
  }
  return null
}

/**
 * A page-major 1-bit framebuffer, laid out exactly as the controller wants it.
 *
 * One byte covers eight vertically stacked pixels, bit 0 at the top. Storing it
 * in the controller's own order means the driver ships the buffer verbatim
 * rather than transposing it every frame on a microcontroller.
 */
export interface OledSurface {
  width: number
  height: number
  pages: number
  data: Uint8Array
}

export function createOledSurface(controller: OledController): OledSurface {
  const pages = Math.ceil(controller.height / OLED_PAGE_HEIGHT)
  return {
    width: controller.width,
    height: controller.height,
    pages,
    data: new Uint8Array(controller.width * pages),
  }
}

export function clearOledSurface(surface: OledSurface): void {
  surface.data.fill(0)
}

export function setPixel(surface: OledSurface, x: number, y: number, on = true): void {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || px >= surface.width || py < 0 || py >= surface.height) return
  const index = (Math.floor(py / OLED_PAGE_HEIGHT) * surface.width) + px
  const bit = 1 << (py % OLED_PAGE_HEIGHT)
  if (on) surface.data[index] |= bit
  else surface.data[index] &= ~bit
}

export function getPixel(surface: OledSurface, x: number, y: number): boolean {
  if (x < 0 || x >= surface.width || y < 0 || y >= surface.height) return false
  const index = (Math.floor(y / OLED_PAGE_HEIGHT) * surface.width) + x
  return (surface.data[index] & (1 << (y % OLED_PAGE_HEIGHT))) !== 0
}

/** Spacing between glyphs, in blank columns. */
export const OLED_LETTER_SPACING = 1

/** Width in pixels the shared font needs for `text`. */
export function oledTextWidth(text: string, font: BitmapFont = DEFAULT_FONT): number {
  const glyphs = text.length
  if (glyphs === 0) return 0
  return (glyphs * (font.w + OLED_LETTER_SPACING)) - OLED_LETTER_SPACING
}

/** Characters that fit in `pixels`, for truncating before drawing. */
export function oledTextCapacity(pixels: number, font: BitmapFont = DEFAULT_FONT): number {
  const stride = font.w + OLED_LETTER_SPACING
  if (pixels < font.w) return 0
  return Math.floor((pixels + OLED_LETTER_SPACING) / stride)
}

/**
 * Fit `text` to `pixels`, marking any cut with an ellipsis.
 *
 * Truncation happens in characters against the real font metrics rather than by
 * clipping pixels, so a cut word ends at a glyph boundary and the marker is
 * visible instead of being the first casualty of the clip.
 */
export function fitOledText(text: string, pixels: number, font: BitmapFont = DEFAULT_FONT): string {
  const folded = coerceGlyphs(text, font)
  const capacity = oledTextCapacity(pixels, font)
  if (capacity <= 0) return ''
  if (folded.length <= capacity) return folded
  if (capacity <= 3) return folded.slice(0, capacity)
  return `${folded.slice(0, capacity - 3)}...`
}

/**
 * Draw `text` with its top-left corner at (x, y).
 *
 * Columns come from `textColumns`, the same function the LED Text node and its
 * generated C++ use, so the glyph set and spacing cannot drift between an LED
 * matrix and an OLED.
 */
export function drawOledText(
  surface: OledSurface,
  x: number,
  y: number,
  text: string,
  font: BitmapFont = DEFAULT_FONT,
): number {
  const columns = textColumns(coerceGlyphs(text, font), font, OLED_LETTER_SPACING)
  for (let c = 0; c < columns.length; c++) {
    const column = columns[c]
    if (column === 0) continue
    for (let r = 0; r < font.h; r++) {
      if (column & (1 << r)) setPixel(surface, x + c, y + r, true)
    }
  }
  // Trailing letter spacing is not part of the drawn width.
  return Math.max(0, columns.length - OLED_LETTER_SPACING)
}

export function drawHLine(surface: OledSurface, x: number, y: number, width: number): void {
  for (let i = 0; i < width; i++) setPixel(surface, x + i, y, true)
}

export function drawVLine(surface: OledSurface, x: number, y: number, height: number): void {
  for (let i = 0; i < height; i++) setPixel(surface, x, y + i, true)
}

export function drawRect(surface: OledSurface, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return
  drawHLine(surface, x, y, w)
  drawHLine(surface, x, y + h - 1, w)
  drawVLine(surface, x, y, h)
  drawVLine(surface, x + w - 1, y, h)
}

export function fillRect(surface: OledSurface, x: number, y: number, w: number, h: number): void {
  for (let row = 0; row < h; row++) drawHLine(surface, x, y + row, w)
}

/**
 * An outlined bar filled to `value`.
 *
 * The fill is clamped to the inside of the outline, so a full bar reads as full
 * rather than overwriting its own border, and a value past 1 cannot spill into
 * whatever is drawn beside it.
 */
export function drawProgressBar(
  surface: OledSurface,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
): void {
  if (w <= 2 || h <= 2) return
  drawRect(surface, x, y, w, h)
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const inner = w - 2
  const filled = Math.round(inner * clamped)
  if (filled > 0) fillRect(surface, x + 1, y + 1, filled, h - 2)
}

/** A small filled marker, for a boolean indicator that is on. */
export function drawIndicator(surface: OledSurface, x: number, y: number, on: boolean, size = 5): void {
  if (on) fillRect(surface, x, y, size, size)
  else drawRect(surface, x, y, size, size)
}

/**
 * The surface as one row of text per pixel row, `#` lit and `.` dark.
 *
 * For tests and debugging. Comparing rendered rows is how a layout regression
 * shows up as a picture rather than as a byte diff nobody can read.
 */
export function oledSurfaceRows(surface: OledSurface): string[] {
  const rows: string[] = []
  for (let y = 0; y < surface.height; y++) {
    let row = ''
    for (let x = 0; x < surface.width; x++) row += getPixel(surface, x, y) ? '#' : '.'
    rows.push(row)
  }
  return rows
}

/** Bounded single line for a display row, before it is fitted to a width. */
export function oledLine(value: unknown, maxBytes = 48): string {
  return truncateUtf8(String(value ?? ''), maxBytes)
}

// The RGB565 drawing surface every colour TFT shares.
//
// The colour analogue of state/oledSurface.ts, and it keeps that module's two
// rules for the same reasons.
//
// The surface knows nothing about the bus. An ST7789 reaches the panel over
// SPI here and would reach it over a parallel bus on another module, and the
// window addressing, the pixel format and the rotation handling are identical
// either way. Only the byte-shipping differs, and that belongs to the driver.
// The SH1106/SSD1306 split already cost a successful build against a dark
// panel because the surface was bus-independent and the driver was not.
//
// The controller's own geometry lives on its descriptor rather than being
// fixed up per device. An ST7789 driving a 240x240 panel has 240x320 of RAM
// behind it, so a rotation that scans rows backwards puts the visible window
// eighty rows in. Miss that and the picture sits off the glass with a band of
// noise down one edge, which looks like a wiring fault rather than a software
// one.
//
// Both descriptors state their NATIVE PORTRAIT size. Rotation is a property of
// how the panel is bolted down, not of the part, so recording the 2.4-inch
// module as 320x240 would bake one orientation into the catalogue and leave
// the other unrepresentable.
//
// Text comes from the same bitmap font the LED Text node draws with, so a
// character that renders in the preview is a character the firmware has a
// glyph for. See `textColumns` in state/font.ts.

import { DEFAULT_FONT, textColumns, type BitmapFont } from './font'
import { coerceGlyphs, truncateUtf8 } from './displayText'

/**
 * A colour TFT controller, as the panel in front of it behaves.
 *
 * `width`/`height` are the visible glass in its native portrait orientation;
 * `ramWidth`/`ramHeight` are the controller's frame memory behind it. The two
 * differ on the 1.3-inch module, and that difference is the whole reason
 * `tftWindowOrigin` exists.
 */
export interface TftController {
  id: string
  /** Visible panel size, native portrait. */
  width: number
  height: number
  /** Controller frame memory, which may be larger than the glass. */
  ramWidth: number
  ramHeight: number
  /**
   * First column and row of frame memory the panel shows at rotation 0.
   *
   * The colour analogue of the SH1106's `columnOffset`. Zero on both
   * catalogued modules at rotation 0; the offsets that matter are the ones
   * `tftWindowOrigin` derives for the flipped rotations.
   */
  columnOffset: number
  rowOffset: number
  /**
   * Order the panel's subpixels are wired in, which MADCTL bit 3 selects.
   *
   * A module wired the other way shows a plausible picture with red and blue
   * swapped — plausible enough that it reads as a palette choice rather than a
   * fault, which is why it belongs on the descriptor and not in a comment.
   */
  colorOrder: 'RGB' | 'BGR'
  /**
   * Whether the panel needs INVON.
   *
   * True on both ST7789 modules: the IPS glass is wired normally-black, so a
   * controller left in its normal mode renders a photographic negative.
   */
  invert: boolean
}

/**
 * The catalogued colour controllers.
 *
 * One driver covers both. The 2.4-inch module turned out to be an ST7789V
 * rather than the ILI9341 its form factor suggests, which is what let the two
 * share everything below.
 */
export const TFT_CONTROLLERS: Record<string, TftController> = {
  ST7789: {
    id: 'ST7789', width: 240, height: 240, ramWidth: 240, ramHeight: 320,
    columnOffset: 0, rowOffset: 0, colorOrder: 'RGB', invert: true,
  },
  ST7789V: {
    id: 'ST7789V', width: 240, height: 320, ramWidth: 240, ramHeight: 320,
    columnOffset: 0, rowOffset: 0, colorOrder: 'RGB', invert: true,
  },
}

/**
 * The controller a catalogued part drives, by its declared controller string.
 *
 * Longest name first, which is not a stylistic preference: `ST7789V` starts
 * with `ST7789`, so a shortest-match lookup silently hands the 240x320 module
 * the 240x240 descriptor and every layout below it is drawn eighty rows short.
 */
export function tftControllerFor(controller: string | undefined): TftController | null {
  if (!controller) return null
  const upper = controller.toUpperCase()
  const keys = Object.keys(TFT_CONTROLLERS).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (upper.startsWith(key)) return TFT_CONTROLLERS[key]
  }
  return null
}

/**
 * How the panel is mounted, in degrees.
 *
 * A physical fact about the build rather than anything the graph knows, which
 * is why it is a property on the part. Unlike the OLED's two-way flip, a TFT
 * offers all four: 90 and 270 swap the visible axes, so a 240x320 module
 * mounted on its side is a 320x240 surface and the layouts have to be told.
 */
export const TFT_ROTATIONS = ['0', '90', '180', '270'] as const
export type TftRotation = (typeof TFT_ROTATIONS)[number]

export function asTftRotation(value: unknown): TftRotation {
  const rotation = String(value ?? '')
  return (TFT_ROTATIONS as readonly string[]).includes(rotation)
    ? (rotation as TftRotation)
    : '0'
}

/** MADCTL bits, as the ST7789 datasheet names them. */
const MADCTL_MY = 0x80
const MADCTL_MX = 0x40
const MADCTL_MV = 0x20
const MADCTL_BGR = 0x08

/** Row/column mirroring and axis exchange for each mounted rotation. */
const ROTATION_BITS: Record<TftRotation, { mx: boolean; my: boolean; mv: boolean }> = {
  '0': { mx: false, my: false, mv: false },
  '90': { mx: true, my: false, mv: true },
  '180': { mx: true, my: true, mv: false },
  '270': { mx: false, my: true, mv: true },
}

/** The MADCTL byte for a controller mounted at `rotation`. */
export function tftMadctl(controller: TftController, rotation: TftRotation): number {
  const bits = ROTATION_BITS[rotation]
  let value = 0
  if (bits.my) value |= MADCTL_MY
  if (bits.mx) value |= MADCTL_MX
  if (bits.mv) value |= MADCTL_MV
  if (controller.colorOrder === 'BGR') value |= MADCTL_BGR
  return value
}

/** Visible size after mounting: 90 and 270 exchange the axes. */
export function tftRotatedSize(
  controller: TftController,
  rotation: TftRotation,
): { width: number; height: number } {
  return ROTATION_BITS[rotation].mv
    ? { width: controller.height, height: controller.width }
    : { width: controller.width, height: controller.height }
}

/**
 * Where the visible window starts in controller RAM, at this rotation.
 *
 * Derived rather than tabulated. Mirroring an axis does not move the glass, it
 * renumbers the memory behind it, so a panel shorter than its frame memory
 * ends up addressed from the far end: the well-known "the 1.3-inch ST7789
 * needs a row offset of 80 at 180 degrees, and a column offset of 80 at 270"
 * falls out of that one sentence. Listing the four cases instead is how the
 * fifth rotation of the next module gets it wrong.
 */
export function tftWindowOrigin(
  controller: TftController,
  rotation: TftRotation,
): { col: number; row: number } {
  const bits = ROTATION_BITS[rotation]
  const col = bits.mx
    ? controller.ramWidth - controller.width - controller.columnOffset
    : controller.columnOffset
  const row = bits.my
    ? controller.ramHeight - controller.height - controller.rowOffset
    : controller.rowOffset
  return bits.mv ? { col: row, row: col } : { col, row }
}

// ── Colour ──────────────────────────────────────────────────────────────────

/** Bytes one pixel occupies, here and on the wire. */
export const TFT_BYTES_PER_PIXEL = 2

/**
 * Pack 8-bit RGB into the controller's 16-bit pixel format.
 *
 * 5 bits of red, 6 of green, 5 of blue. Truncating rather than dithering: this
 * is a UI surface of flat fills and text, where a dither would show as visible
 * banding on a solid panel rather than as a smoother gradient.
 */
export function rgb565(r: number, g: number, b: number): number {
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))
  return ((clamp(r) & 0xf8) << 8) | ((clamp(g) & 0xfc) << 3) | (clamp(b) >> 3)
}

/** The 8-bit channels a packed pixel represents, for tests and previews. */
export function rgb565Components(value: number): { r: number; g: number; b: number } {
  const r = (value >> 11) & 0x1f
  const g = (value >> 5) & 0x3f
  const b = value & 0x1f
  // Replicate the high bits into the low ones so full-scale stays full-scale.
  return {
    r: (r << 3) | (r >> 2),
    g: (g << 2) | (g >> 4),
    b: (b << 3) | (b >> 2),
  }
}

// ── Surface ─────────────────────────────────────────────────────────────────

/** A rectangle in surface pixels. */
export interface TftRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A row-major RGB565 framebuffer with a dirty bounding box.
 *
 * Row-major and native-endian in a `Uint16Array` rather than the wire's
 * big-endian bytes, because everything above this reasons in pixels;
 * `tftSurfaceBytes` does the byte-order conversion at the one place it
 * matters.
 *
 * The dirty box is not an optimisation, it is the reason the panel is usable.
 * 240x240 is 115 KB of pixels and 240x320 is 153 KB, and an LED loop runs
 * hundreds of times a second: shipping a whole frame per LED frame is not
 * slower, it is impossible. The box is a single rectangle rather than a set of
 * regions on purpose — two changes far apart merge into their bounding box,
 * which over-sends but can never under-send, and a fixed layout keeps the
 * fields that change every second next to each other anyway.
 */
export interface TftSurface {
  width: number
  height: number
  data: Uint16Array
  /** Union of everything written since the last `clearTftDirty`, or null. */
  dirty: TftRect | null
}

export function createTftSurface(width: number, height: number): TftSurface {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  return { width: w, height: h, data: new Uint16Array(w * h), dirty: null }
}

/** A surface sized for `controller` as mounted at `rotation`. */
export function createTftSurfaceFor(controller: TftController, rotation: TftRotation): TftSurface {
  const size = tftRotatedSize(controller, rotation)
  return createTftSurface(size.width, size.height)
}

/** Widen the dirty box to cover a rectangle, clipped to the panel. */
export function markTftDirty(surface: TftSurface, x: number, y: number, w: number, h: number): void {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(surface.width, Math.ceil(x + w))
  const y1 = Math.min(surface.height, Math.ceil(y + h))
  if (x1 <= x0 || y1 <= y0) return
  const d = surface.dirty
  if (!d) {
    surface.dirty = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    return
  }
  const left = Math.min(d.x, x0)
  const top = Math.min(d.y, y0)
  const right = Math.max(d.x + d.w, x1)
  const bottom = Math.max(d.y + d.h, y1)
  surface.dirty = { x: left, y: top, w: right - left, h: bottom - top }
}

/** Forget what changed. Called after a flush has shipped it. */
export function clearTftDirty(surface: TftSurface): void {
  surface.dirty = null
}

/** Pixels the pending dirty box would ship. Zero when nothing changed. */
export function tftDirtyPixels(surface: TftSurface): number {
  return surface.dirty ? surface.dirty.w * surface.dirty.h : 0
}

/**
 * Fill the whole surface and mark it entirely dirty.
 *
 * A cleared surface really is dirty everywhere, so this is the honest answer
 * rather than a special case — and it is why the firmware paints its
 * background once at setup instead of once per frame.
 */
export function clearTftSurface(surface: TftSurface, color = 0): void {
  surface.data.fill(color & 0xffff)
  markTftDirty(surface, 0, 0, surface.width, surface.height)
}

export function setTftPixel(surface: TftSurface, x: number, y: number, color: number): void {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || px >= surface.width || py < 0 || py >= surface.height) return
  surface.data[(py * surface.width) + px] = color & 0xffff
  markTftDirty(surface, px, py, 1, 1)
}

export function getTftPixel(surface: TftSurface, x: number, y: number): number {
  if (x < 0 || x >= surface.width || y < 0 || y >= surface.height) return 0
  return surface.data[(Math.round(y) * surface.width) + Math.round(x)]
}

export function fillTftRect(
  surface: TftSurface, x: number, y: number, w: number, h: number, color: number,
): void {
  if (w <= 0 || h <= 0) return
  const x0 = Math.max(0, Math.round(x))
  const y0 = Math.max(0, Math.round(y))
  const x1 = Math.min(surface.width, Math.round(x + w))
  const y1 = Math.min(surface.height, Math.round(y + h))
  if (x1 <= x0 || y1 <= y0) return
  const value = color & 0xffff
  for (let row = y0; row < y1; row++) {
    const start = row * surface.width
    surface.data.fill(value, start + x0, start + x1)
  }
  markTftDirty(surface, x0, y0, x1 - x0, y1 - y0)
}

export function drawTftHLine(surface: TftSurface, x: number, y: number, w: number, color: number): void {
  fillTftRect(surface, x, y, w, 1, color)
}

export function drawTftVLine(surface: TftSurface, x: number, y: number, h: number, color: number): void {
  fillTftRect(surface, x, y, 1, h, color)
}

export function drawTftRect(
  surface: TftSurface, x: number, y: number, w: number, h: number, color: number,
): void {
  if (w <= 0 || h <= 0) return
  drawTftHLine(surface, x, y, w, color)
  drawTftHLine(surface, x, y + h - 1, w, color)
  drawTftVLine(surface, x, y, h, color)
  drawTftVLine(surface, x + w - 1, y, h, color)
}

// ── Text ────────────────────────────────────────────────────────────────────

/** Blank columns between glyphs, in font units before scaling. */
export const TFT_LETTER_SPACING = 1

/**
 * How many times each font pixel is repeated on each axis.
 *
 * The shared font is three pixels wide. Drawn 1:1 on a 240-pixel panel it is a
 * smear, so every layout picks a scale and the geometry carries it. Integer
 * scaling only: a fractional scale would need filtering, and a filtered 3x5
 * bitmap is mud.
 */
export type TftTextScale = number

/** Width in pixels the shared font needs for `text` at `scale`. */
export function tftTextWidth(text: string, scale: TftTextScale, font: BitmapFont = DEFAULT_FONT): number {
  const glyphs = text.length
  if (glyphs === 0) return 0
  return ((glyphs * (font.w + TFT_LETTER_SPACING)) - TFT_LETTER_SPACING) * Math.max(1, Math.round(scale))
}

/** Height in pixels of one row of text at `scale`. */
export function tftTextHeight(scale: TftTextScale, font: BitmapFont = DEFAULT_FONT): number {
  return font.h * Math.max(1, Math.round(scale))
}

/** Characters that fit in `pixels` at `scale`, for truncating before drawing. */
export function tftTextCapacity(pixels: number, scale: TftTextScale, font: BitmapFont = DEFAULT_FONT): number {
  const s = Math.max(1, Math.round(scale))
  const stride = (font.w + TFT_LETTER_SPACING) * s
  if (pixels < font.w * s) return 0
  return Math.floor((pixels + (TFT_LETTER_SPACING * s)) / stride)
}

/**
 * Fit `text` to `pixels`, marking any cut with an ellipsis.
 *
 * Character-wise against the real metrics, exactly as `fitOledText` does, so a
 * cut ends at a glyph boundary and the marker survives instead of being the
 * first casualty of the clip. Unsupported characters fold to the fallback here
 * rather than at the wire, so the panel and the firmware agree on what a
 * stranger's ID3 tag looks like.
 */
export function fitTftText(
  text: string, pixels: number, scale: TftTextScale, font: BitmapFont = DEFAULT_FONT,
): string {
  const folded = coerceGlyphs(text, font)
  const capacity = tftTextCapacity(pixels, scale, font)
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
 * matrix, an OLED and a colour panel.
 *
 * Returns the drawn width, spacing after the last glyph excluded.
 */
export function drawTftText(
  surface: TftSurface,
  x: number,
  y: number,
  text: string,
  color: number,
  scale: TftTextScale = 1,
  font: BitmapFont = DEFAULT_FONT,
): number {
  const s = Math.max(1, Math.round(scale))
  const columns = textColumns(coerceGlyphs(text, font), font, TFT_LETTER_SPACING)
  for (let c = 0; c < columns.length; c++) {
    const column = columns[c]
    if (column === 0) continue
    for (let r = 0; r < font.h; r++) {
      if (column & (1 << r)) fillTftRect(surface, x + (c * s), y + (r * s), s, s, color)
    }
  }
  return Math.max(0, (columns.length - TFT_LETTER_SPACING) * s)
}

/** Where text sits inside a field wider than it is. */
export type TftAlign = 'left' | 'center' | 'right'

/**
 * A fixed cell a layout repaints in place.
 *
 * Fields rather than free text, because the firmware has no framebuffer to
 * clear: it repaints the cell's background and draws into it, and a cell whose
 * width came from the previous string would leave the tail of a longer one
 * behind. The geometry states the cell, so both sides erase the same pixels.
 */
export interface TftField extends TftRect {
  scale: TftTextScale
  align: TftAlign
}

/** X where `text` starts inside `field`. */
export function tftFieldTextX(field: TftField, text: string, font: BitmapFont = DEFAULT_FONT): number {
  const width = tftTextWidth(text, field.scale, font)
  if (field.align === 'right') return field.x + field.w - width
  if (field.align === 'center') return field.x + Math.floor((field.w - width) / 2)
  return field.x
}

/**
 * Repaint one field: background, then the fitted, aligned text.
 *
 * A `background` of null draws the glyphs over whatever is already there,
 * which only a caption over artwork wants; every fixed layout passes a colour
 * so the cell erases itself.
 */
export function drawTftField(
  surface: TftSurface,
  field: TftField,
  text: string,
  color: number,
  background: number | null,
  font: BitmapFont = DEFAULT_FONT,
): void {
  if (background !== null) fillTftRect(surface, field.x, field.y, field.w, field.h, background)
  const fitted = fitTftText(text, field.w, field.scale, font)
  if (fitted.length === 0) return
  drawTftText(surface, tftFieldTextX(field, fitted, font), field.y, fitted, color, field.scale, font)
}

// ── Widgets ─────────────────────────────────────────────────────────────────

/**
 * Pixels of an outlined bar's interior that a value fills.
 *
 * Shared with the driver's change detection, which compares this number rather
 * than the float behind it: a progress value moves every frame and the drawn
 * bar does not, so comparing floats would repaint a panel that had not
 * changed.
 */
export function tftBarFill(width: number, value: number): number {
  const inner = width - 2
  if (inner <= 0) return 0
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return Math.round(inner * clamped)
}

/**
 * An outlined bar filled to `value`.
 *
 * The unfilled interior is painted with `track` rather than left alone, so the
 * bar erases its own previous fill without the layout clearing around it.
 */
export function drawTftBar(
  surface: TftSurface,
  rect: TftRect,
  value: number,
  fill: number,
  track: number,
  outline: number,
): void {
  if (rect.w <= 2 || rect.h <= 2) return
  drawTftRect(surface, rect.x, rect.y, rect.w, rect.h, outline)
  const filled = tftBarFill(rect.w, value)
  fillTftRect(surface, rect.x + 1, rect.y + 1, filled, rect.h - 2, fill)
  fillTftRect(surface, rect.x + 1 + filled, rect.y + 1, rect.w - 2 - filled, rect.h - 2, track)
}

/** A filled or outlined marker, for a boolean or a beat position. */
export function drawTftIndicator(
  surface: TftSurface, x: number, y: number, size: number, on: boolean, color: number, off: number,
): void {
  if (on) fillTftRect(surface, x, y, size, size, color)
  else drawTftRect(surface, x, y, size, size, off)
}

/**
 * Blit baked RGB565 artwork at (x, y).
 *
 * `data` is big-endian pairs, the order the wire and a PROGMEM table both
 * want, because that is what the device blits. Artwork is rendered in the
 * browser at export and only copied on the device — the same deliberate
 * exception the 1-bit thumbnails make to the shared-helper rule, and for the
 * same reason: there is no second scaler in C++ to disagree with this one, so
 * do not add one. See state/patternThumbnail.ts.
 *
 * A short buffer draws as far as it reaches rather than throwing: art that
 * baked badly should be a poor picture, not a failed export.
 */
export function drawTftArtwork(
  surface: TftSurface, x: number, y: number, w: number, h: number, data: Uint8Array,
): void {
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const at = ((sy * w) + sx) * TFT_BYTES_PER_PIXEL
      if (at + 1 >= data.length) return
      setTftPixel(surface, x + sx, y + sy, (data[at] << 8) | data[at + 1])
    }
  }
}

// ── Shipping and inspection ─────────────────────────────────────────────────

/**
 * A rectangle of the surface as big-endian bytes, ready for the bus.
 *
 * The one place byte order is decided. Defaults to the whole panel; pass the
 * dirty box to ship only what changed.
 */
export function tftSurfaceBytes(surface: TftSurface, rect?: TftRect | null): Uint8Array {
  const r = rect ?? { x: 0, y: 0, w: surface.width, h: surface.height }
  const out = new Uint8Array(Math.max(0, r.w) * Math.max(0, r.h) * TFT_BYTES_PER_PIXEL)
  let at = 0
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const pixel = getTftPixel(surface, x, y)
      out[at++] = (pixel >> 8) & 0xff
      out[at++] = pixel & 0xff
    }
  }
  return out
}

/**
 * The surface as one row of text per pixel row, `#` for anything that is not
 * `background`.
 *
 * For tests and debugging, the colour twin of `oledSurfaceRows`. Comparing
 * rendered rows is how a layout regression shows up as a picture rather than
 * as a byte diff nobody can read.
 */
export function tftSurfaceRows(surface: TftSurface, background = 0): string[] {
  const rows: string[] = []
  for (let y = 0; y < surface.height; y++) {
    let row = ''
    for (let x = 0; x < surface.width; x++) row += getTftPixel(surface, x, y) === background ? '.' : '#'
    rows.push(row)
  }
  return rows
}

/** Bounded single line for a display field, before it is fitted to a width. */
export function tftLine(value: unknown, maxBytes = 48): string {
  return truncateUtf8(String(value ?? ''), maxBytes)
}

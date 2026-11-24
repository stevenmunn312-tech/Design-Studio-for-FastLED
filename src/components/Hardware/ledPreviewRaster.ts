// A large LED thumbnail as one picture instead of one element per LED.
//
// HardwareLedPreview draws each LED as an SVG group and writes its `fill` as
// frames arrive. That is cheap for 256 LEDs. For 1024 it is not: two such
// thumbnails changing eight times a second cost 17 ms of style recalculation
// and 5 ms of paint per update on integrated graphics, enough to hold a
// 32 x 32 or 64 x 64 project at 48 frames a second while they were on screen.
//
// Above `RASTER_CELLS` the thumbnail is instead one pixel per LED, drawn into
// a canvas that is never in the page and shown as an SVG `<image>` through a
// mask of LED-shaped holes: one attribute to change, 0.7 ms per update.
//
// The canvas is off the page on purpose. A visible canvas that is redrawn
// becomes its own compositor layer and leaks renderer memory in Chromium (see
// HardwareLedPreview). An image does not: at 120 new pictures a second the
// renderer levelled off at 127 MB and stayed there, below what the same
// thumbnails cost as SVG groups.

/** Grids up to this many LEDs (16 x 16) stay one SVG group per LED. */
export const RASTER_CELLS = 256

let context: CanvasRenderingContext2D | null | undefined
let pixels: ImageData | null = null

function rasterContext(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context
  context = null
  // jsdom has no canvas; a test then gets the per-LED SVG, as a small grid does.
  if (typeof document === 'undefined' || import.meta.env.VITEST) return context
  try {
    context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  } catch {
    context = null
  }
  return context
}

export function canRasterThumbnails(): boolean {
  return rasterContext() !== null
}

/**
 * A `cols` x `rows` picture of `colours` (one 0xRRGGBB per LED, in row
 * order) as a data URL, or null where there is no canvas to draw it with.
 */
export function thumbnailUrl(colours: Uint32Array, cols: number, rows: number): string | null {
  const ctx = rasterContext()
  if (!ctx) return null
  const canvas = ctx.canvas
  if (canvas.width !== cols || canvas.height !== rows) {
    canvas.width = cols
    canvas.height = rows
  }
  if (!pixels || pixels.width !== cols || pixels.height !== rows) pixels = ctx.createImageData(cols, rows)
  const data = pixels.data
  const count = Math.min(colours.length, cols * rows)
  for (let index = 0, at = 0; index < count; index++, at += 4) {
    const colour = colours[index]
    data[at] = colour >> 16
    data[at + 1] = (colour >> 8) & 255
    data[at + 2] = colour & 255
    data[at + 3] = 255
  }
  ctx.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}

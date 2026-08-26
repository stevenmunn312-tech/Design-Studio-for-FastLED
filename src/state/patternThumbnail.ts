// A pattern reduced to a one-bit thumbnail, baked once at export.
//
// The Pattern Browser has to show *which* pattern you are about to select on a
// panel with no colour and 128x64 pixels. A name alone is not enough — a
// collection is full of names like "Fire 2" — so it shows a picture, and the
// picture has to be a real render of that pattern rather than an icon someone
// drew.
//
// Baking happens in the browser at export. The device receives finished bytes
// and blits them, which is the whole reason this is safe: there is no second
// dithering implementation on the firmware side to disagree with this one, and
// the preview can show exactly the bytes that were shipped. Compare that with
// rendering on-device, which would need the pattern's whole evaluator in
// firmware just to draw a 32x32 icon.

import { OLED_PAGE_HEIGHT } from './oledSurface'

/** Thumbnail edge, in pixels. */
export const THUMBNAIL_W = 32
/**
 * Thumbnail height — exactly four OLED pages.
 *
 * A page is eight rows and the controller addresses whole pages, so a height
 * off that grid would make every blit a read-modify-write of the rows above
 * and below it. 32 divides cleanly and still leaves ~90px beside it for a
 * name on a 128-wide panel.
 */
export const THUMBNAIL_H = 32

/**
 * Render scale before downsampling.
 *
 * A pattern evaluated straight at 32x32 loses thin features — a Scanner's line
 * either lands on a pixel or vanishes. Rendering at 2x and box-averaging gives
 * the dither something in between to work with, which is what stops a
 * one-bit thumbnail turning into noise or a blank square.
 */
export const THUMBNAIL_SUPERSAMPLE = 2

/**
 * The tick every pattern is baked at.
 *
 * Fixed, because a thumbnail that changed between two exports of the same
 * collection would be indistinguishable from a pattern that had been edited.
 * Not zero: plenty of patterns start black and grow, so t=0 bakes a collection
 * of empty squares. Two and a half seconds is past the opening of everything
 * in the library and still inside the first cycle of the slow ones.
 */
export const THUMBNAIL_TICK_SEC = 2.5

/** Packed size of one thumbnail. */
export const THUMBNAIL_BYTES = (THUMBNAIL_W * THUMBNAIL_H) / 8

/**
 * How many thumbnails a build will carry.
 *
 * Flash is the scarce resource: a player sketch with a real collection already
 * runs into the high eighties as a percentage, so this is a budget rather than
 * a formality. 64 thumbnails is 8 KB, which is affordable next to the pattern
 * renderers themselves, and a collection past that has outgrown a 128x64
 * browser anyway.
 */
export const MAX_THUMBNAILS = 64
export const MAX_THUMBNAIL_FLASH_BYTES = MAX_THUMBNAILS * THUMBNAIL_BYTES

/** Just enough of a frame to read luminance from, without pulling in the evaluator. */
interface RgbLike { r: number; g: number; b: number }
type FrameLike = readonly (readonly RgbLike[])[]

/**
 * One baked thumbnail, packed the way the panel wants it.
 *
 * Page-major and bit-0-at-top, matching `OledSurface`, so the driver ships the
 * bytes verbatim instead of transposing 128 bytes per frame on a
 * microcontroller.
 */
export interface PatternThumbnail {
  width: number
  height: number
  data: Uint8Array
}

export function blankThumbnail(): PatternThumbnail {
  return { width: THUMBNAIL_W, height: THUMBNAIL_H, data: new Uint8Array(THUMBNAIL_BYTES) }
}

/**
 * Rec. 709 luminance, 0-1.
 *
 * Perceptual weights rather than a flat average, because the decision here is
 * "does this pixel read as lit" on a monochrome panel. A flat average makes
 * pure blue as bright as pure green, and a blue pattern then dithers to a
 * solid block where the eye expects something dim.
 */
export function luminance(pixel: RgbLike): number {
  const value = (0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b) / 255
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * Ordered 4x4 Bayer thresholds, 0-1.
 *
 * Ordered rather than error-diffused on purpose. Floyd-Steinberg looks better
 * on a photograph but carries error left-to-right, so the result depends on
 * traversal order and a single changed pixel can shift the whole row. A
 * position-only threshold makes the bake reproducible, which is what lets the
 * preview claim to be showing the bytes that shipped.
 */
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

export function ditherThreshold(x: number, y: number): number {
  const cell = BAYER_4X4[((y % 4) + 4) % 4][((x % 4) + 4) % 4]
  return (cell + 0.5) / 16
}

/** Average luminance of the supersampled block behind thumbnail pixel (x, y). */
function blockLuminance(frame: FrameLike, x: number, y: number, scale: number): number {
  let total = 0
  let counted = 0
  for (let sy = 0; sy < scale; sy++) {
    const row = frame[y * scale + sy]
    if (!row) continue
    for (let sx = 0; sx < scale; sx++) {
      const pixel = row[x * scale + sx]
      if (!pixel) continue
      total += luminance(pixel)
      counted++
    }
  }
  return counted > 0 ? total / counted : 0
}

/**
 * Bake a rendered frame down to a one-bit thumbnail.
 *
 * `frame` is expected at `THUMBNAIL_W * scale` by `THUMBNAIL_H * scale`. A
 * frame that is smaller is read as far as it goes and the rest stays dark,
 * rather than throwing: a pattern that renders an odd size should produce a
 * poor thumbnail, not a failed export.
 */
export function thumbnailFromFrame(
  frame: FrameLike,
  scale = THUMBNAIL_SUPERSAMPLE,
): PatternThumbnail {
  const thumbnail = blankThumbnail()
  const step = Math.max(1, Math.round(scale))
  for (let y = 0; y < THUMBNAIL_H; y++) {
    for (let x = 0; x < THUMBNAIL_W; x++) {
      if (blockLuminance(frame, x, y, step) <= ditherThreshold(x, y)) continue
      const index = (Math.floor(y / OLED_PAGE_HEIGHT) * THUMBNAIL_W) + x
      thumbnail.data[index] |= 1 << (y % OLED_PAGE_HEIGHT)
    }
  }
  return thumbnail
}

/** Whether thumbnail pixel (x, y) is lit. The preview reads baked bytes through this. */
export function thumbnailPixel(thumbnail: PatternThumbnail, x: number, y: number): boolean {
  if (x < 0 || x >= thumbnail.width || y < 0 || y >= thumbnail.height) return false
  const index = (Math.floor(y / OLED_PAGE_HEIGHT) * thumbnail.width) + x
  return (thumbnail.data[index] & (1 << (y % OLED_PAGE_HEIGHT))) !== 0
}

/** Flash cost of `count` thumbnails, in bytes. */
export function thumbnailFlashCost(count: number): number {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  return n * THUMBNAIL_BYTES
}

/**
 * Why a collection cannot have thumbnails baked, or null when it can.
 *
 * Said in bytes the user can act on rather than as a bare refusal: the point
 * of the cap is that flash runs out during someone else's build, long after
 * the collection was assembled.
 */
export function thumbnailBudgetIssue(count: number): string | null {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (n <= MAX_THUMBNAILS) return null
  return `A Pattern Browser can carry ${MAX_THUMBNAILS} baked thumbnails (${MAX_THUMBNAIL_FLASH_BYTES} bytes of flash); `
    + `this collection has ${n}, which would need ${thumbnailFlashCost(n)} bytes. `
    + 'Trim the collection, or drive the display from a layout that names patterns without picturing them.'
}

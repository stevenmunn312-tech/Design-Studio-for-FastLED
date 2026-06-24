// A small RGB bitmap shared by the Image node's live evaluator and the C++
// generator, so an uploaded picture previews and flashes identically.
//
// Pixels are stored row-major as a flat [r,g,b, r,g,b, …] byte list of length
// w*h*3. Uploads are downscaled to MAX_DIM so the generated PROGMEM array stays
// small; the evaluator and firmware nearest-neighbour sample it to the matrix.

import type { RGB, Frame } from './graphEvaluator'

/** Largest stored image edge — caps the baked-in pixel array size. */
export const IMAGE_MAX_DIM = 32

export interface ImageData {
  w: number
  h: number
  pixels: number[] // flat r,g,b triples, length w*h*3
}

/** Validate an unknown value as ImageData, or null if it isn't one. */
export function asImage(value: unknown): ImageData | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const w = v.w, h = v.h, pixels = v.pixels
  if (typeof w !== 'number' || typeof h !== 'number') return null
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
  if (!Array.isArray(pixels) || pixels.length !== w * h * 3) return null
  return { w, h, pixels: pixels as number[] }
}

/** Nearest-neighbour sample an image to a W×H frame. */
export function sampleImageToFrame(img: ImageData, W: number, H: number): Frame {
  const frame: Frame = []
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    const sy = Math.min(img.h - 1, Math.floor((y / H) * img.h))
    for (let x = 0; x < W; x++) {
      const sx = Math.min(img.w - 1, Math.floor((x / W) * img.w))
      const i = (sy * img.w + sx) * 3
      row.push({ r: img.pixels[i], g: img.pixels[i + 1], b: img.pixels[i + 2] })
    }
    frame.push(row)
  }
  return frame
}

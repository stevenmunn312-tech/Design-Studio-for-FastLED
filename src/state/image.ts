// A small RGB bitmap shared by the Image node's live evaluator and the C++
// generator, so an uploaded picture previews and flashes identically.
//
// Pixels are stored row-major as a flat [r,g,b, r,g,b, …] byte list of length
// w*h*3. Uploads are downscaled to MAX_DIM so the generated PROGMEM array stays
// small; the evaluator and firmware sample it to the matrix with matching
// placement and colour treatment.

import type { RGB, Frame } from './graphEvaluator'

/** Largest stored image edge — caps the baked-in pixel array size. */
export const IMAGE_MAX_DIM = 32

export interface ImageData {
  w: number
  h: number
  pixels: number[] // flat r,g,b triples, length w*h*3
  alpha?: number[] // optional row-major alpha bytes, length w*h
}

export type ImageFit = 'stretch' | 'contain' | 'cover' | 'original'
export type ImageSampling = 'nearest' | 'smooth'

export interface ImageTransform {
  fit?: ImageFit
  positionX?: number
  positionY?: number
  rotation?: number | string
  flipX?: boolean
  flipY?: boolean
  sampling?: ImageSampling
  brightness?: number
  background?: RGB
  zoom?: number
  cropX?: number
  cropY?: number
}

/** Validate an unknown value as ImageData, or null if it isn't one. */
export function asImage(value: unknown): ImageData | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const w = v.w, h = v.h, pixels = v.pixels, alpha = v.alpha
  if (typeof w !== 'number' || typeof h !== 'number') return null
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
  if (!Array.isArray(pixels) || pixels.length !== w * h * 3) return null
  if (alpha !== undefined && (!Array.isArray(alpha) || alpha.length !== w * h)) return null
  return alpha === undefined
    ? { w, h, pixels: pixels as number[] }
    : { w, h, pixels: pixels as number[], alpha: alpha as number[] }
}

/** Sample an image to a W×H frame with placement and colour transforms. */
export function sampleImageToFrame(
  img: ImageData,
  W: number,
  H: number,
  transform: ImageTransform = {},
): Frame {
  const fit: ImageFit = ['contain', 'cover', 'original'].includes(String(transform.fit))
    ? transform.fit as ImageFit
    : 'stretch'
  const position = (value: unknown) => {
    const n = Number(value ?? 0.5)
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5
  }
  const positionX = position(transform.positionX)
  const positionY = position(transform.positionY)
  const rotation = ((Number(transform.rotation ?? 0) % 360) + 360) % 360
  const sampling: ImageSampling = transform.sampling === 'smooth' ? 'smooth' : 'nearest'
  const rawBrightness = Number(transform.brightness ?? 1)
  const brightness = Number.isFinite(rawBrightness) ? Math.max(0, Math.min(1, rawBrightness)) : 1
  const background = transform.background ?? { r: 0, g: 0, b: 0 }
  const rawZoom = Number(transform.zoom ?? 1)
  const zoom = Number.isFinite(rawZoom) ? Math.max(1, Math.min(8, rawZoom)) : 1
  const cropX = position(transform.cropX)
  const cropY = position(transform.cropY)
  const scaleRgb = (color: RGB): RGB => ({
    r: Math.round(color.r * brightness),
    g: Math.round(color.g * brightness),
    b: Math.round(color.b * brightness),
  })
  const rotated = rotation === 90 || rotation === 270
  const rw = rotated ? img.h : img.w
  const rh = rotated ? img.w : img.h

  let drawW = W
  let drawH = H
  if (fit === 'contain' || fit === 'cover') {
    const scale = fit === 'contain'
      ? Math.min(W / rw, H / rh)
      : Math.max(W / rw, H / rh)
    drawW = rw * scale
    drawH = rh * scale
  } else if (fit === 'original') {
    drawW = rw
    drawH = rh
  }
  const offsetX = (W - drawW) * positionX
  const offsetY = (H - drawH) * positionY

  type PremultipliedPixel = RGB & { a: number }
  const sourcePixel = (orientedX: number, orientedY: number): PremultipliedPixel => {
    let ox = orientedX
    let oy = orientedY
    if (transform.flipX) ox = rw - 1 - ox
    if (transform.flipY) oy = rh - 1 - oy

    let sx: number, sy: number
    if (rotation === 90) {
      sx = oy; sy = img.h - 1 - ox
    } else if (rotation === 180) {
      sx = img.w - 1 - ox; sy = img.h - 1 - oy
    } else if (rotation === 270) {
      sx = img.w - 1 - oy; sy = ox
    } else {
      sx = ox; sy = oy
    }
    const i = (sy * img.w + sx) * 3
    const a = (img.alpha?.[sy * img.w + sx] ?? 255) / 255
    return { r: img.pixels[i] * a, g: img.pixels[i + 1] * a, b: img.pixels[i + 2] * a, a }
  }
  const composite = (pixel: PremultipliedPixel): RGB => ({
    r: Math.round((pixel.r + background.r * (1 - pixel.a)) * brightness),
    g: Math.round((pixel.g + background.g * (1 - pixel.a)) * brightness),
    b: Math.round((pixel.b + background.b * (1 - pixel.a)) * brightness),
  })

  const frame: Frame = []
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    for (let x = 0; x < W; x++) {
      let u = (x + 0.5 - offsetX) / drawW
      let v = (y + 0.5 - offsetY) / drawH
      if (u < 0 || u >= 1 || v < 0 || v >= 1) {
        row.push(scaleRgb(background))
        continue
      }
      const view = 1 / zoom
      u = (1 - view) * cropX + u * view
      v = (1 - view) * cropY + v * view

      if (sampling === 'smooth') {
        const fx = u * rw - 0.5
        const fy = v * rh - 0.5
        const floorX = Math.floor(fx)
        const floorY = Math.floor(fy)
        const tx = fx - floorX
        const ty = fy - floorY
        const x0 = Math.max(0, Math.min(rw - 1, floorX))
        const y0 = Math.max(0, Math.min(rh - 1, floorY))
        const x1 = Math.max(0, Math.min(rw - 1, floorX + 1))
        const y1 = Math.max(0, Math.min(rh - 1, floorY + 1))
        const c00 = sourcePixel(x0, y0), c10 = sourcePixel(x1, y0)
        const c01 = sourcePixel(x0, y1), c11 = sourcePixel(x1, y1)
        const channel = (key: keyof PremultipliedPixel) => {
          const top = c00[key] + (c10[key] - c00[key]) * tx
          const bottom = c01[key] + (c11[key] - c01[key]) * tx
          return top + (bottom - top) * ty
        }
        row.push(composite({ r: channel('r'), g: channel('g'), b: channel('b'), a: channel('a') }))
      } else {
        const ox = Math.min(rw - 1, Math.floor(u * rw))
        const oy = Math.min(rh - 1, Math.floor(v * rh))
        row.push(composite(sourcePixel(ox, oy)))
      }
    }
    frame.push(row)
  }
  return frame
}

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
export const ANIMATED_IMAGE_MAX_FRAMES = 48

export interface ImageData {
  w: number
  h: number
  pixels: number[] // flat r,g,b triples, length w*h*3
  alpha?: number[] // optional row-major alpha bytes, length w*h
}

export interface AnimatedImageData {
  frames: ImageData[]
  durations: number[] // milliseconds per frame
}

export type ImageFit = 'stretch' | 'contain' | 'cover' | 'original'
export type ImageSampling = 'nearest' | 'smooth'
export type ImageDithering = 'none' | 'ordered2x2' | 'ordered4x4'

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
  saturation?: number
  contrast?: number
  hueShift?: number
  monochrome?: boolean
  gamma?: number
  paletteLevels?: number | string
  dithering?: ImageDithering
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

/** Validate a decoded animated image. All frames must share one geometry. */
export function asAnimatedImage(value: unknown): AnimatedImageData | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.frames) || !Array.isArray(v.durations)) return null
  if (v.frames.length === 0 || v.frames.length > ANIMATED_IMAGE_MAX_FRAMES || v.durations.length !== v.frames.length) return null
  const frames = v.frames.map(asImage)
  if (frames.some((frame) => !frame)) return null
  const typedFrames = frames as ImageData[]
  if (typedFrames.some((frame) => frame.w !== typedFrames[0].w || frame.h !== typedFrames[0].h)) return null
  const durations = v.durations.map(Number)
  if (durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) return null
  return { frames: typedFrames, durations }
}

/** Select the active frame at an elapsed millisecond timestamp. */
export function animatedImageFrame(animation: AnimatedImageData, elapsedMs: number, loop = true): ImageData {
  const total = animation.durations.reduce((sum, duration) => sum + duration, 0)
  const safeElapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0)
  let cursor = loop ? safeElapsed % total : Math.min(safeElapsed, Math.max(0, total - 0.001))
  for (let i = 0; i < animation.frames.length; i++) {
    if (cursor < animation.durations[i]) return animation.frames[i]
    cursor -= animation.durations[i]
  }
  return animation.frames[animation.frames.length - 1]
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
  const finite = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Number(value ?? fallback)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
  }
  const saturation = transform.monochrome ? 0 : finite(transform.saturation, 1, 0, 2)
  const contrast = finite(transform.contrast, 1, 0, 2)
  const hueShift = finite(transform.hueShift, 0, -180, 180) * Math.PI / 180
  const gamma = finite(transform.gamma, 1, 1, 3.5)
  const rawLevels = Number(transform.paletteLevels)
  const paletteLevels = Number.isFinite(rawLevels) && rawLevels >= 2 ? Math.min(32, Math.round(rawLevels)) : 0
  const dithering: ImageDithering = transform.dithering === 'ordered2x2' || transform.dithering === 'ordered4x4'
    ? transform.dithering
    : 'none'
  const hueCos = Math.cos(hueShift), hueSin = Math.sin(hueShift)
  const hueMatrix = [
    .213 + .787 * hueCos - .213 * hueSin, .715 - .715 * hueCos - .715 * hueSin, .072 - .072 * hueCos + .928 * hueSin,
    .213 - .213 * hueCos + .143 * hueSin, .715 + .285 * hueCos + .140 * hueSin, .072 - .072 * hueCos - .283 * hueSin,
    .213 - .213 * hueCos - .787 * hueSin, .715 - .715 * hueCos + .715 * hueSin, .072 + .928 * hueCos + .072 * hueSin,
  ]
  const bayer2 = [0, 2, 3, 1]
  const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  const finishColor = (color: RGB, x: number, y: number): RGB => {
    const hr = color.r * hueMatrix[0] + color.g * hueMatrix[1] + color.b * hueMatrix[2]
    const hg = color.r * hueMatrix[3] + color.g * hueMatrix[4] + color.b * hueMatrix[5]
    const hb = color.r * hueMatrix[6] + color.g * hueMatrix[7] + color.b * hueMatrix[8]
    const lum = hr * .2126 + hg * .7152 + hb * .0722
    const adjusted = [hr, hg, hb].map((channel) => {
      const saturated = lum + (channel - lum) * saturation
      const contrasted = (saturated - 127.5) * contrast + 127.5
      return Math.pow(Math.max(0, Math.min(255, contrasted)) / 255, gamma) * 255
    })
    let threshold = 0.5
    if (dithering === 'ordered2x2') threshold = (bayer2[(y & 1) * 2 + (x & 1)] + 0.5) / 4
    else if (dithering === 'ordered4x4') threshold = (bayer4[(y & 3) * 4 + (x & 3)] + 0.5) / 16
    const finish = (channel: number) => {
      if (!paletteLevels) return Math.round(channel)
      const scaled = channel * (paletteLevels - 1) / 255
      const base = Math.floor(scaled)
      const level = dithering === 'none' ? Math.round(scaled) : base + (scaled - base >= threshold ? 1 : 0)
      return Math.round(Math.max(0, Math.min(paletteLevels - 1, level)) * 255 / (paletteLevels - 1))
    }
    return { r: finish(adjusted[0]), g: finish(adjusted[1]), b: finish(adjusted[2]) }
  }
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
  const composite = (pixel: PremultipliedPixel, x: number, y: number): RGB => finishColor({
    r: (pixel.r + background.r * (1 - pixel.a)) * brightness,
    g: (pixel.g + background.g * (1 - pixel.a)) * brightness,
    b: (pixel.b + background.b * (1 - pixel.a)) * brightness,
  }, x, y)

  const frame: Frame = []
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    for (let x = 0; x < W; x++) {
      let u = (x + 0.5 - offsetX) / drawW
      let v = (y + 0.5 - offsetY) / drawH
      if (u < 0 || u >= 1 || v < 0 || v >= 1) {
        row.push(finishColor({ r: background.r * brightness, g: background.g * brightness, b: background.b * brightness }, x, y))
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
        row.push(composite({ r: channel('r'), g: channel('g'), b: channel('b'), a: channel('a') }, x, y))
      } else {
        const ox = Math.min(rw - 1, Math.floor(u * rw))
        const oy = Math.min(rh - 1, Math.floor(v * rh))
        row.push(composite(sourcePixel(ox, oy), x, y))
      }
    }
    frame.push(row)
  }
  return frame
}

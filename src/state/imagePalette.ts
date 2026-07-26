import {
  asAnimatedImage,
  asImage,
  type AnimatedImageData,
  type ImageData,
} from './image'
import { customPaletteStops16, type RGB } from './customPalette'

export const IMAGE_PALETTE_MIN_COLORS = 2
export const IMAGE_PALETTE_MAX_COLORS = 8
export const IMAGE_PALETTE_DEFAULT_COLORS = 6

export type ImagePaletteSource = ImageData | AnimatedImageData

const paletteCache = new WeakMap<object, Map<number, RGB[]>>()

interface HistogramColor extends RGB {
  weight: number
}

interface ColorBox {
  colors: HistogramColor[]
  weight: number
  range: [number, number, number]
}

function byte(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : 0
}

function colorCount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n)
    ? Math.max(IMAGE_PALETTE_MIN_COLORS, Math.min(IMAGE_PALETTE_MAX_COLORS, Math.round(n)))
    : IMAGE_PALETTE_DEFAULT_COLORS
}

function sourceFrames(value: unknown): Array<{ image: ImageData; duration: number }> {
  const animation = asAnimatedImage(value)
  if (animation) {
    return animation.frames.map((image, index) => ({
      image,
      duration: Math.max(1, animation.durations[index] ?? 1),
    }))
  }
  const image = asImage(value)
  return image ? [{ image, duration: 1 }] : []
}

function histogram(value: unknown): HistogramColor[] {
  const bins = new Map<number, { r: number; g: number; b: number; weight: number }>()
  for (const { image, duration } of sourceFrames(value)) {
    for (let i = 0; i < image.w * image.h; i++) {
      const alpha = byte(image.alpha?.[i] ?? 255) / 255
      if (alpha <= 1 / 255) continue
      const r = byte(image.pixels[i * 3])
      const g = byte(image.pixels[i * 3 + 1])
      const b = byte(image.pixels[i * 3 + 2])
      // Five bits per channel keeps photographs bounded to at most 32K bins
      // while retaining enough separation for an eight-colour LED palette.
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
      const weight = alpha * duration
      const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 }
      bin.r += r * weight
      bin.g += g * weight
      bin.b += b * weight
      bin.weight += weight
      bins.set(key, bin)
    }
  }
  return [...bins.values()].map((bin) => ({
    r: bin.r / bin.weight,
    g: bin.g / bin.weight,
    b: bin.b / bin.weight,
    weight: bin.weight,
  }))
}

function makeBox(colors: HistogramColor[]): ColorBox {
  let minR = 255, minG = 255, minB = 255
  let maxR = 0, maxG = 0, maxB = 0
  let weight = 0
  for (const color of colors) {
    minR = Math.min(minR, color.r); maxR = Math.max(maxR, color.r)
    minG = Math.min(minG, color.g); maxG = Math.max(maxG, color.g)
    minB = Math.min(minB, color.b); maxB = Math.max(maxB, color.b)
    weight += color.weight
  }
  return {
    colors,
    weight,
    range: [maxR - minR, maxG - minG, maxB - minB],
  }
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] | null {
  if (box.colors.length < 2) return null
  const channel = box.range[1] > box.range[0] && box.range[1] >= box.range[2]
    ? 'g'
    : box.range[2] > box.range[0]
      ? 'b'
      : 'r'
  const colors = [...box.colors].sort((a, b) => a[channel] - b[channel])
  let cumulative = 0
  let splitAt = 1
  for (let i = 0; i < colors.length - 1; i++) {
    cumulative += colors[i].weight
    if (cumulative >= box.weight / 2) {
      splitAt = i + 1
      break
    }
  }
  return [makeBox(colors.slice(0, splitAt)), makeBox(colors.slice(splitAt))]
}

function average(box: ColorBox): RGB {
  if (box.weight <= 0) return { r: 0, g: 0, b: 0 }
  const total = box.colors.reduce(
    (sum, color) => ({
      r: sum.r + color.r * color.weight,
      g: sum.g + color.g * color.weight,
      b: sum.b + color.b * color.weight,
    }),
    { r: 0, g: 0, b: 0 },
  )
  return {
    r: Math.round(total.r / box.weight),
    g: Math.round(total.g / box.weight),
    b: Math.round(total.b / box.weight),
  }
}

function luminance(color: RGB): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
}

/**
 * Extract representative colours with weighted median-cut quantisation.
 *
 * Animated-image frames are weighted by their display duration, transparent
 * pixels contribute proportionally to alpha, and the final anchors run from
 * dark to light so the result reads as a useful FastLED gradient rather than
 * an arbitrary list of histogram buckets.
 */
export function dominantImageColors(value: unknown, requestedCount = IMAGE_PALETTE_DEFAULT_COLORS): RGB[] {
  const colors = histogram(value)
  if (colors.length === 0) return [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }]

  const target = colorCount(requestedCount)
  const boxes = [makeBox(colors)]
  while (boxes.length < target) {
    let splitIndex = -1
    let splitScore = -1
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (box.colors.length < 2) continue
      const score = Math.max(...box.range) * Math.sqrt(box.weight)
      if (score > splitScore) {
        splitScore = score
        splitIndex = i
      }
    }
    if (splitIndex < 0) break
    const split = splitBox(boxes[splitIndex])
    if (!split) break
    boxes.splice(splitIndex, 1, ...split)
  }

  const anchors = boxes.map(average).sort((a, b) => luminance(a) - luminance(b))
  if (anchors.length === 1) anchors.push({ ...anchors[0] })
  return anchors
}

/** Convert extracted anchors into the standard 16-stop palette representation. */
export function imagePaletteStops16(value: unknown, requestedCount = IMAGE_PALETTE_DEFAULT_COLORS): RGB[] {
  const target = colorCount(requestedCount)
  if (value && typeof value === 'object') {
    const cached = paletteCache.get(value)?.get(target)
    if (cached) return cached
  }
  const anchors = dominantImageColors(value, target)
  const positions = anchors.map((_, index) => index / Math.max(1, anchors.length - 1))
  const stops = customPaletteStops16(anchors, positions)
  if (value && typeof value === 'object') {
    const byCount = paletteCache.get(value) ?? new Map<number, RGB[]>()
    byCount.set(target, stops)
    paletteCache.set(value, byCount)
  }
  return stops
}

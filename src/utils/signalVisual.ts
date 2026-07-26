import { paletteStops, type Frame, type RGB } from '../state/graphEvaluator'

export interface SignalVisual {
  color: string
  emissive: string
  glow: string
  softGlow: string
  energy: number
}

export interface FrameAmbient {
  colors: [string, string, string, string]
  energy: number
}

function isRgb(value: unknown): value is RGB {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RGB>
  return [candidate.r, candidate.g, candidate.b].every((channel) =>
    typeof channel === 'number' && Number.isFinite(channel)
  )
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function summarise(samples: RGB[]): SignalVisual | null {
  if (!samples.length) return null

  // RMS mixing keeps a vivid moving highlight from being washed into grey by
  // the many dark pixels around it, which is exactly what we want for light
  // spilling from a small LED matrix.
  let rr = 0
  let gg = 0
  let bb = 0
  let brightness = 0
  for (const sample of samples) {
    const r = clampByte(sample.r)
    const g = clampByte(sample.g)
    const b = clampByte(sample.b)
    rr += r * r
    gg += g * g
    bb += b * b
    brightness += Math.max(r, g, b) / 255
  }

  const r = clampByte(Math.sqrt(rr / samples.length))
  const g = clampByte(Math.sqrt(gg / samples.length))
  const b = clampByte(Math.sqrt(bb / samples.length))
  const energy = Math.round((brightness / samples.length) * 100) / 100
  const peak = Math.max(r, g, b)
  const emissiveScale = peak > 0 ? Math.max(1, 180 / peak) : 0
  const er = clampByte(r * emissiveScale)
  const eg = clampByte(g * emissiveScale)
  const eb = clampByte(b * emissiveScale)
  const glowAlpha = energy > 0.01 ? Math.round((0.045 + energy * 0.24) * 1000) / 1000 : 0
  const softAlpha = energy > 0.01 ? Math.round((0.018 + energy * 0.11) * 1000) / 1000 : 0

  return {
    color: `rgb(${r} ${g} ${b})`,
    emissive: `rgb(${er} ${eg} ${eb})`,
    glow: `rgba(${er}, ${eg}, ${eb}, ${glowAlpha})`,
    softGlow: `rgba(${er}, ${eg}, ${eb}, ${softAlpha})`,
    energy,
  }
}

function sampleFrame(frame: Frame, region?: { x0: number; y0: number; x1: number; y1: number }) {
  const height = frame.length
  const width = frame[0]?.length ?? 0
  if (!width || !height) return []

  const x0 = Math.floor((region?.x0 ?? 0) * width)
  const y0 = Math.floor((region?.y0 ?? 0) * height)
  const x1 = Math.max(x0 + 1, Math.ceil((region?.x1 ?? 1) * width))
  const y1 = Math.max(y0 + 1, Math.ceil((region?.y1 ?? 1) * height))
  const area = Math.max(1, (x1 - x0) * (y1 - y0))
  const stride = Math.max(1, Math.floor(Math.sqrt(area / 64)))
  const samples: RGB[] = []

  for (let y = y0; y < Math.min(y1, height); y += stride) {
    for (let x = x0; x < Math.min(x1, width); x += stride) {
      const pixel = frame[y]?.[x]
      if (isRgb(pixel)) samples.push(pixel)
    }
  }
  return samples
}

/** Pick the strongest chromatic family in a region instead of averaging every
 * hue together. A rainbow quadrant has plenty of light but a straight RGB/RMS
 * average converges toward gray, which makes an Ambilight spill look detached
 * from the pixels that produced it. */
function dominantAmbientColor(samples: RGB[], fallback: string): string {
  const bins = Array.from({ length: 12 }, () => ({ weight: 0, rr: 0, gg: 0, bb: 0 }))

  for (const sample of samples) {
    const r = clampByte(sample.r)
    const g = clampByte(sample.g)
    const b = clampByte(sample.b)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const chroma = max - min
    if (max < 12 || chroma < 8) continue

    let hue = 0
    if (max === r) hue = ((g - b) / chroma + 6) % 6
    else if (max === g) hue = (b - r) / chroma + 2
    else hue = (r - g) / chroma + 4

    const saturation = chroma / max
    const weight = (max / 255) * saturation * saturation
    const bin = bins[Math.floor((hue * 2) % bins.length)]
    bin.weight += weight
    bin.rr += r * r * weight
    bin.gg += g * g * weight
    bin.bb += b * b * weight
  }

  const dominant = bins.reduce((best, bin) => bin.weight > best.weight ? bin : best, bins[0])
  if (dominant.weight === 0) return fallback

  const r = clampByte(Math.sqrt(dominant.rr / dominant.weight))
  const g = clampByte(Math.sqrt(dominant.gg / dominant.weight))
  const b = clampByte(Math.sqrt(dominant.bb / dominant.weight))
  const peak = Math.max(r, g, b)
  const scale = peak > 0 ? Math.max(1, 180 / peak) : 0
  return `rgb(${clampByte(r * scale)} ${clampByte(g * scale)} ${clampByte(b * scale)})`
}

/** Reduce a frame, palette, or colour port to a stable visual signal. */
export function signalVisual(value: unknown): SignalVisual | null {
  if (isRgb(value)) return summarise([value])
  if (typeof value === 'string') return summarise(paletteStops(value, 16))
  if (!Array.isArray(value) || value.length === 0) return null

  if (Array.isArray(value[0])) return summarise(sampleFrame(value as Frame))
  const colors = value.filter(isRgb)
  return colors.length ? summarise(colors) : null
}

/** Four-corner colour sampling for the LED preview's ambient light spill. */
export function frameAmbient(frame: Frame): FrameAmbient {
  const regions = [
    { x0: 0, y0: 0, x1: 0.5, y1: 0.5 },
    { x0: 0.5, y0: 0, x1: 1, y1: 0.5 },
    { x0: 0, y0: 0.5, x1: 0.5, y1: 1 },
    { x0: 0.5, y0: 0.5, x1: 1, y1: 1 },
  ]
  const samples = regions.map((region) => sampleFrame(frame, region))
  const visuals = samples.map(summarise)
  const fallback = 'rgb(0 0 0)'
  return {
    colors: visuals.map((visual, index) => dominantAmbientColor(samples[index], visual?.emissive ?? fallback)) as FrameAmbient['colors'],
    energy: Math.round((visuals.reduce((sum, visual) => sum + (visual?.energy ?? 0), 0) / 4) * 100) / 100,
  }
}

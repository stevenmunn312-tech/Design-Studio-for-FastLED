import { type Frame, type RGB, type Palette, samplePaletteClamped } from '../ledColor'
import { allocFrame, instanceState } from './memory'
import type { Field } from './types'

// Default grid dimensions; overridden by evaluateGraph params
export const DEFAULT_W = 16
export const DEFAULT_H = 16

interface SparkState { frame: Frame; w: number; h: number }
export const sparkState = instanceState('sparkState', new Map<string, SparkState>())

// Unpooled blank frame for persistent per-node state (trailState, sparkState):
// those buffers live across passes, so they must never enter the pool.
export function rawBlankFrame(W: number, H: number): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
}

/** Fill a pooled frame from a per-pixel function, writing into the existing
 *  pixel objects — the pooled replacement for the nested Array.from pattern. */
export function buildFrame(W: number, H: number, fn: (x: number, y: number) => RGB): Frame {
  const frame = allocFrame(W, H)
  for (let y = 0; y < H; y++) {
    const row = frame[y]
    for (let x = 0; x < W; x++) {
      const c = fn(x, y)
      const px = row[x]
      px.r = c.r; px.g = c.g; px.b = c.b
    }
  }
  return frame
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

// ── Colour helpers ────────────────────────────────────────────────────────────
// hsv/samplePalette/palAt/CRGB_CONSTANTS/CODE_PALETTES/CLOUD_STOPS live in
// `./ledColor` (imported above) — shared with the Code-node sandbox worker.
export function byte(v: number): number { return Math.max(0, Math.min(255, Math.round(v * 255))) }

export function solidFrame(color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, () => color)
}

export function blankFrame(W = DEFAULT_W, H = DEFAULT_H): Frame {
  const frame = allocFrame(W, H)
  for (let y = 0; y < H; y++) {
    const row = frame[y]
    for (let x = 0; x < W; x++) { const px = row[x]; px.r = 0; px.g = 0; px.b = 0 }
  }
  return frame
}

// Copy into a pooled frame so painting onto a base frame never mutates an
// upstream node's memoised output.
export function cloneFrame(frame: Frame): Frame {
  const H = frame.length, W = frame[0]?.length ?? 0
  const out = allocFrame(W, H)
  for (let y = 0; y < H; y++) {
    const src = frame[y], dst = out[y]
    for (let x = 0; x < W; x++) {
      const s = src[x], d = dst[x]
      d.r = s.r; d.g = s.g; d.b = s.b
    }
  }
  return out
}

export function scaleRgb(color: RGB, amount: number): RGB {
  const t = Math.max(0, amount)
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r * t))),
    g: Math.max(0, Math.min(255, Math.round(color.g * t))),
    b: Math.max(0, Math.min(255, Math.round(color.b * t))),
  }
}

export function addRgb(a: RGB, b: RGB): RGB {
  return {
    r: Math.min(255, a.r + b.r),
    g: Math.min(255, a.g + b.g),
    b: Math.min(255, a.b + b.b),
  }
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const m = Math.max(0, Math.min(1, t))
  const mix = (av: number, bv: number) => Math.round(av * (1 - m) + bv * m)
  return { r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) }
}

export type FrameEdgeMode = 'clamp' | 'wrap' | 'black'

function sampleCoordinate(value: number, size: number, edgeMode: FrameEdgeMode): number | null {
  if (edgeMode === 'wrap') return ((value % size) + size) % size
  if (edgeMode === 'black' && (value < 0 || value >= size)) return null
  return Math.max(0, Math.min(size - 1, value))
}

function framePixel(frame: Frame, x: number, y: number, edgeMode: FrameEdgeMode): RGB {
  const H = frame.length
  const W = frame[0]?.length ?? 0
  if (W === 0 || H === 0) return { r: 0, g: 0, b: 0 }
  const sx = sampleCoordinate(x, W, edgeMode)
  const sy = sampleCoordinate(y, H, edgeMode)
  if (sx == null || sy == null) return { r: 0, g: 0, b: 0 }
  return frame[sy][sx]
}

/** Sample a frame at floating-point pixel coordinates. Integer coordinates
 * address pixel centres. */
export function sampleFrame(
  frame: Frame,
  fx: number,
  fy: number,
  edgeMode: FrameEdgeMode = 'clamp',
  bilinear = true,
): RGB {
  return sampleFrameScaled(frame, fx, fy, edgeMode, bilinear, 1)
}

/** Transition-only shaded form. Keeping the scale inside the weighted sum
 * preserves the existing single-rounding behaviour. */
export function sampleFrameScaled(
  frame: Frame,
  fx: number,
  fy: number,
  edgeMode: FrameEdgeMode,
  bilinear: boolean,
  scale: number,
): RGB {
  if (!bilinear) {
    const p = framePixel(frame, Math.round(fx), Math.round(fy), edgeMode)
    return {
      r: Math.floor(p.r * scale + 0.5),
      g: Math.floor(p.g * scale + 0.5),
      b: Math.floor(p.b * scale + 0.5),
    }
  }
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = fx - x0, ty = fy - y0
  const p00 = framePixel(frame, x0, y0, edgeMode)
  const p10 = framePixel(frame, x0 + 1, y0, edgeMode)
  const p01 = framePixel(frame, x0, y0 + 1, edgeMode)
  const p11 = framePixel(frame, x0 + 1, y0 + 1, edgeMode)
  const w00 = (1 - tx) * (1 - ty) * scale, w10 = tx * (1 - ty) * scale
  const w01 = (1 - tx) * ty * scale, w11 = tx * ty * scale
  return {
    r: Math.floor(p00.r * w00 + p10.r * w10 + p01.r * w01 + p11.r * w11 + 0.5),
    g: Math.floor(p00.g * w00 + p10.g * w10 + p01.g * w01 + p11.g * w11 + 0.5),
    b: Math.floor(p00.b * w00 + p10.b * w10 + p01.b * w01 + p11.b * w11 + 0.5),
  }
}

// Soft circular splat centred at a subpixel coordinate. Coverage is based on
// the distance from each pixel centre to the splat centre, so animating the
// point across fractional coordinates yields smooth anti-aliased motion.
export function splatDisc(frame: Frame, x: number, y: number, radius: number, color: RGB): void {
  const H = frame.length, W = frame[0]?.length ?? 0
  const x0 = Math.max(0, Math.floor(x - radius - 1))
  const x1 = Math.min(W - 1, Math.ceil(x + radius + 1))
  const y0 = Math.max(0, Math.floor(y - radius - 1))
  const y1 = Math.min(H - 1, Math.ceil(y + radius + 1))
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.hypot((px + 0.5) - x, (py + 0.5) - y)
      const coverage = clamp01(radius + 0.5 - dist)
      if (coverage <= 0) continue
      frame[py][px] = addRgb(frame[py][px], scaleRgb(color, coverage))
    }
  }
}

export function heatColor(temperature: number): RGB {
  const t192 = Math.floor(temperature * 191 / 255)
  const ramp = (t192 & 0x3F) << 2
  if (t192 > 0x80) return { r: 255, g: 255, b: ramp }
  if (t192 > 0x40) return { r: 255, g: ramp, b: 0 }
  return { r: ramp, g: 0, b: 0 }
}

/**
 * A field's value is an amount, so 1 is the palette's last colour. A wrapping
 * lookup turned every full-scale pixel (a solid Slice Tiling slice, a filled
 * Shape Field, anything above Field Levels' High) into the first colour, the
 * same as 0. Firmware pairs this with `LINEARBLEND_NOWRAP`.
 */
export function evalFieldToFrame(field: Field | null, palette: Palette, brightness: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const bv = Math.max(0, Math.min(1, brightness))
  const b8 = (v: number) => Math.max(0, Math.min(255, Math.round(v * bv)))
  return buildFrame(W, H, (x, y) => {
      if (!field) return { r: 0, g: 0, b: 0 }
      const c = samplePaletteClamped(palette, field[y * W + x])
      return { r: b8(c.r), g: b8(c.g), b: b8(c.b) }
    })
}

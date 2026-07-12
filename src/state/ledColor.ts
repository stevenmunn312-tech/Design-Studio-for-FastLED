// Color/palette primitives shared by the main-thread evaluator
// (`graphEvaluator.ts`, which re-exports these for zero behavior change) and
// the Code-node sandbox worker (`codeSandbox.worker.ts`). Pulled into their
// own zero-import module so the worker can use them without pulling in
// `graphEvaluator.ts`'s main-thread-only store imports.

import { sampleNamedPalette } from './paletteCatalog'

export interface RGB { r: number; g: number; b: number }
export type Frame = RGB[][]   // row-major [y][x]

/** A palette is either a named preset or an ordered list of custom colors. */
export type Palette = string | RGB[]

function byte(v: number): number { return Math.max(0, Math.min(255, Math.round(v * 255))) }

export function hsv(h: number, s: number, v: number): RGB {
  h = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if      (h < 60)  { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else              { r = c; b = x }
  return { r: byte(r + m), g: byte(g + m), b: byte(b + m) }
}

export function samplePalette(palette: Palette, t: number): RGB {
  const h = ((t % 1) + 1) % 1
  if (Array.isArray(palette)) {
    const stops = palette
    if (stops.length === 0) return { r: 0, g: 0, b: 0 }
    if (stops.length === 1) return { ...stops[0] }
    const scaled = h * (stops.length - 1)
    const i = Math.floor(scaled)
    const f = scaled - i
    const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)]
    return {
      r: Math.round(a.r * (1 - f) + b.r * f),
      g: Math.round(a.g * (1 - f) + b.g * f),
      b: Math.round(a.b * (1 - f) + b.b * f),
    }
  }
  return sampleNamedPalette(palette, h) ?? hsv(h * 360, 1, 1)
}

// Sample a palette at a 0–255 index, scaled by 0–255 brightness (FastLED's
// ColorFromPalette semantics) — shared by ColorFromPalette and fill_palette.
export function palAt(pal: Palette, index: number, bright: number): RGB {
  const c8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const c = samplePalette(pal ?? 'rainbow', ((((index | 0) % 256) + 256) % 256) / 255)
  const k = c8(bright) / 255
  return { r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k) }
}

// Common FastLED named colours for `CRGB::<Name>` (extend as needed).
export const CRGB_CONSTANTS: Record<string, RGB> = {
  Black: { r: 0, g: 0, b: 0 }, White: { r: 255, g: 255, b: 255 },
  Red: { r: 255, g: 0, b: 0 }, Green: { r: 0, g: 255, b: 0 }, Blue: { r: 0, g: 0, b: 255 },
  Yellow: { r: 255, g: 255, b: 0 }, Cyan: { r: 0, g: 255, b: 255 }, Magenta: { r: 255, g: 0, b: 255 },
  Orange: { r: 255, g: 165, b: 0 }, Purple: { r: 128, g: 0, b: 128 }, Pink: { r: 255, g: 192, b: 203 },
  Gold: { r: 255, g: 215, b: 0 }, Aqua: { r: 0, g: 255, b: 255 }, Lime: { r: 0, g: 255, b: 0 },
}

// FastLED preset palette constants mapped onto the evaluator's palette model
// (named presets where samplePalette has them, RGB stops otherwise).
export const CLOUD_STOPS: RGB[] = [
  { r: 0, g: 0, b: 255 }, { r: 0, g: 0, b: 139 }, { r: 135, g: 206, b: 235 }, { r: 255, g: 255, b: 255 },
]
export const CODE_PALETTES: Record<string, Palette> = {
  RainbowColors_p: 'rainbow', RainbowStripeColors_p: 'rainbow',
  OceanColors_p: 'ocean', LavaColors_p: 'lava', ForestColors_p: 'forest',
  PartyColors_p: 'party', HeatColors_p: 'heat', CloudColors_p: CLOUD_STOPS,
}

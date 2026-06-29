// Palette generation via poline (https://meodai.github.io/poline/): polar
// interpolation between two or more anchor colours, producing a smooth multi-stop
// palette. Shared by the Poline node's evaluator and the C++ generator so the
// preview and baked firmware palette match.

import { Poline, positionFunctions } from 'poline'

export interface RGB { r: number; g: number; b: number }

// Position-function names exposed by the Poline node (kept in sync with the
// `position` PROPERTY_META options in nodeLibrary.ts).
const POSITION_FNS = {
  linear: positionFunctions.linearPosition,
  sinusoidal: positionFunctions.sinusoidalPosition,
  quadratic: positionFunctions.quadraticPosition,
  cubic: positionFunctions.cubicPosition,
  arc: positionFunctions.arcPosition,
  smoothStep: positionFunctions.smoothStepPosition,
  exponential: positionFunctions.exponentialPosition,
} as const

export const POLINE_POSITIONS = Object.keys(POSITION_FNS)

/** Parse a `#rrggbb` string to RGB (falls back to black). */
export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

// HSL with h in [0,360], s/l in [0,1] — poline's anchor format.
function rgbToHsl({ r, g, b }: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return [h * 60, s, l]
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v } }
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if      (h < 60)  { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else              { r = c; b = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

/**
 * Generate a poline palette as ordered RGB stops across the given anchors with
 * `points` intermediate steps via the named position function.
 */
export function polinePalette(anchors: RGB[], points: number, position: string): RGB[] {
  const fn = POSITION_FNS[position as keyof typeof POSITION_FNS] ?? positionFunctions.sinusoidalPosition
  const numPoints = Math.max(1, Math.min(16, Math.floor(points)))
  const anchorColors = anchors.slice(0, 3).map(rgbToHsl)
  if (anchorColors.length < 2) return []
  const poline = new Poline({
    anchorColors,
    numPoints,
    positionFunction: fn,
  })
  return poline.colors.map(([h, s, l]) => hslToRgb(h, s, l))
}

/** Resample a poline palette to exactly 16 stops for a FastLED CRGBPalette16. */
export function polineStops16(anchors: RGB[], points: number, position: string): RGB[] {
  const pal = polinePalette(anchors, points, position)
  if (pal.length === 0) return Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0 }))
  const out: RGB[] = []
  for (let i = 0; i < 16; i++) {
    const idx = Math.round((i / 15) * (pal.length - 1))
    out.push(pal[idx])
  }
  return out
}

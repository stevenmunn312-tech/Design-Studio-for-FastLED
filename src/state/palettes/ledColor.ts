// Color/palette primitives shared by the main-thread evaluator
// (`graphEvaluator.ts`, which re-exports these for zero behavior change) and
// the Code-node sandbox worker (`codeSandbox.worker.ts`). Pulled into their
// own zero-import module so the worker can use them without pulling in
// `graphEvaluator.ts`'s main-thread-only store imports.

import { sampleNamedPalette } from './paletteCatalog'

export interface RGB { r: number; g: number; b: number }
export type Frame = RGB[][]   // row-major [y][x]

/**
 * A palette is either a named preset or an ordered list of custom colors.
 *
 * The union is resolved from the value here, at evaluation time. Firmware has
 * no equivalent: which arm a wire carries is decided once at generation time
 * from the *source node* — a builder emits its own `pal_<id>` table, a selector
 * resolves to a shared preset constant. See `PALETTE_BUILDER_NODE_TYPES` in
 * `state/nodeLibrary.ts` for how the two are told apart without a list.
 */
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

/** The colour at a position that cycles round the palette: 1 wraps to 0. */
export function samplePalette(palette: Palette, t: number): RGB {
  return paletteAt(palette, ((t % 1) + 1) % 1)
}

/**
 * The colour for a 0–1 amount, with the ends held rather than joined: 1 is
 * the palette's last colour, where `samplePalette` would wrap it round to the
 * first. Use it wherever full scale means "most" (a field's value, a 16-entry
 * table sampled at i/15), not "once round". Firmware's twin is FastLED's
 * `LINEARBLEND_NOWRAP`.
 */
export function samplePaletteClamped(palette: Palette, t: number): RGB {
  return paletteAt(palette, Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0)
}

function paletteAt(palette: Palette, h: number): RGB {
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

/** FastLED's `TBlendType` values as the Code node's shim exposes them. */
export const NOBLEND = 0, LINEARBLEND = 1, LINEARBLEND_NOWRAP = 2

// Sample a palette at a 0–255 index, scaled by 0–255 brightness (FastLED's
// ColorFromPalette semantics) — shared by ColorFromPalette and fill_palette.
// An RGB[] is read as FastLED reads a CRGBPaletteN: its n entries sit at
// index i·256/n and LINEARBLEND blends each into the next, the last back
// into the first (NOWRAP holds the last; NOBLEND takes the entry alone). A
// 16-entry table therefore samples exactly as a CRGBPalette16 does and a
// 256-entry one (a gradient from `gradientPaletteStops`) indexes directly.
// A named preset goes through `samplePalette`.
export function palAt(pal: Palette, index: number, bright: number, blend: number = LINEARBLEND): RGB {
  const c8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const i8 = (((index | 0) % 256) + 256) % 256
  let c: RGB
  if (Array.isArray(pal)) {
    const n = pal.length
    if (n === 0) c = { r: 0, g: 0, b: 0 }
    else {
      const pos = (i8 * n) / 256
      const i = Math.floor(pos)
      const f = pos - i
      const a = pal[i]
      const b = blend === NOBLEND ? a : pal[blend === LINEARBLEND_NOWRAP ? Math.min(i + 1, n - 1) : (i + 1) % n]
      c = { r: Math.round(a.r + (b.r - a.r) * f), g: Math.round(a.g + (b.g - a.g) * f), b: Math.round(a.b + (b.b - a.b) * f) }
    }
  } else {
    c = samplePalette(pal ?? 'rainbow', i8 / 255)
  }
  const k = c8(bright) / 255
  return { r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k) }
}

/**
 * Resolve a FastLED gradient table — `DEFINE_GRADIENT_PALETTE` bytes, four
 * per stop: position 0–255, r, g, b — into the 256 colours it spans, linear
 * between stops, so `ColorFromPalette` indexes it directly. Positions before
 * the first stop hold the first colour and after the last stop the last, as
 * FastLED's `CRGBPalette16(TProgmemRGBGradientPalette)` constructor does.
 */
export function gradientPaletteStops(bytes: number[]): RGB[] {
  const stops: { pos: number; c: RGB }[] = []
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    const b = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    stops.push({ pos: b(bytes[i]), c: { r: b(bytes[i + 1]), g: b(bytes[i + 2]), b: b(bytes[i + 3]) } })
  }
  if (stops.length === 0) return Array.from({ length: 256 }, () => ({ r: 0, g: 0, b: 0 }))
  stops.sort((a, b) => a.pos - b.pos)
  const out: RGB[] = []
  let k = 0
  for (let i = 0; i < 256; i++) {
    while (k + 1 < stops.length && stops[k + 1].pos <= i) k++
    const a = stops[k]
    const next = stops[k + 1]
    if (!next || i <= a.pos) { out.push({ ...a.c }); continue }
    const f = (i - a.pos) / (next.pos - a.pos)
    out.push({
      r: Math.round(a.c.r + (next.c.r - a.c.r) * f),
      g: Math.round(a.c.g + (next.c.g - a.c.g) * f),
      b: Math.round(a.c.b + (next.c.b - a.c.b) * f),
    })
  }
  return out
}

// Common FastLED named colours for `CRGB::<Name>` (the HTML colour values
// FastLED uses; extend as needed). `crgbConst` hands out copies, so a user
// `px.r = …` on one never edits the table.
const hex = (v: number): RGB => ({ r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 })
export const CRGB_CONSTANTS: Record<string, RGB> = {
  Black: hex(0x000000), White: hex(0xFFFFFF), Red: hex(0xFF0000), Green: hex(0x008000), Blue: hex(0x0000FF),
  Yellow: hex(0xFFFF00), Cyan: hex(0x00FFFF), Magenta: hex(0xFF00FF), Orange: hex(0xFFA500), Purple: hex(0x800080),
  Pink: hex(0xFFC0CB), Gold: hex(0xFFD700), Aqua: hex(0x00FFFF), Lime: hex(0x00FF00), Grey: hex(0x808080),
  Gray: hex(0x808080), DarkGrey: hex(0xA9A9A9), DarkGray: hex(0xA9A9A9), DimGrey: hex(0x696969), DimGray: hex(0x696969),
  LightGrey: hex(0xD3D3D3), LightGray: hex(0xD3D3D3), Silver: hex(0xC0C0C0), Navy: hex(0x000080), DarkBlue: hex(0x00008B),
  MediumBlue: hex(0x0000CD), RoyalBlue: hex(0x4169E1), SkyBlue: hex(0x87CEEB), LightBlue: hex(0xADD8E6),
  DeepSkyBlue: hex(0x00BFFF), DodgerBlue: hex(0x1E90FF), SteelBlue: hex(0x4682B4), Teal: hex(0x008080),
  Turquoise: hex(0x40E0D0), DarkRed: hex(0x8B0000), Maroon: hex(0x800000), Crimson: hex(0xDC143C), Coral: hex(0xFF7F50),
  Salmon: hex(0xFA8072), Tomato: hex(0xFF6347), OrangeRed: hex(0xFF4500), DarkOrange: hex(0xFF8C00), Brown: hex(0xA52A2A),
  Chocolate: hex(0xD2691E), Tan: hex(0xD2B48C), Khaki: hex(0xF0E68C), Olive: hex(0x808000), DarkGreen: hex(0x006400),
  ForestGreen: hex(0x228B22), SeaGreen: hex(0x2E8B57), SpringGreen: hex(0x00FF7F), Chartreuse: hex(0x7FFF00),
  YellowGreen: hex(0x9ACD32), GreenYellow: hex(0xADFF2F), LawnGreen: hex(0x7CFC00), Violet: hex(0xEE82EE),
  Indigo: hex(0x4B0082), MediumPurple: hex(0x9370DB), DarkViolet: hex(0x9400D3), BlueViolet: hex(0x8A2BE2),
  Plum: hex(0xDDA0DD), Orchid: hex(0xDA70D6), Fuchsia: hex(0xFF00FF), HotPink: hex(0xFF69B4), DeepPink: hex(0xFF1493),
  Lavender: hex(0xE6E6FA), Amethyst: hex(0x6600FF), Azure: hex(0xF0FFFF), Ivory: hex(0xFFFFF0), Beige: hex(0xF5F5DC),
  FairyLight: hex(0xFFE42D), FairyLightNCC: hex(0xFF9D2A),
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

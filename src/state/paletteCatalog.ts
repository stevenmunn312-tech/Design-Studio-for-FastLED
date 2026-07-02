export interface PaletteRgb {
  r: number
  g: number
  b: number
}

export interface PaletteDefinition {
  id: string
  label: string
  stops: readonly string[]
  fastled?: string
}

export const PALETTE_DEFS: readonly PaletteDefinition[] = [
  { id: 'rainbow',      label: 'Rainbow',       fastled: 'RainbowColors_p', stops: ['#FF0000', '#FF7A00', '#FFD500', '#00C853', '#00B0FF', '#304FFE', '#D500F9'] },
  { id: 'heat',         label: 'Heat',          fastled: 'HeatColors_p',    stops: ['#000000', '#6A040F', '#D00000', '#FF7B00', '#FFD166', '#FFF3B0'] },
  { id: 'ocean',        label: 'Ocean',         fastled: 'OceanColors_p',   stops: ['#031D44', '#0A4DA2', '#0E90D2', '#57CCF2', '#D8F3FF'] },
  { id: 'lava',         label: 'Lava',          fastled: 'LavaColors_p',    stops: ['#140000', '#5E0000', '#B22222', '#FF5A00', '#FFC857'] },
  { id: 'forest',       label: 'Forest',        fastled: 'ForestColors_p',  stops: ['#081C15', '#1B4332', '#2D6A4F', '#52B788', '#D8F3DC'] },
  { id: 'party',        label: 'Party',         fastled: 'PartyColors_p',   stops: ['#FF006E', '#FB5607', '#FFBE0B', '#8338EC', '#3A86FF'] },
  { id: 'fire',         label: 'Fire',                              stops: ['#120000', '#7F0000', '#FF3D00', '#FF9E00', '#FFF0A8'] },
  { id: 'ice',          label: 'Ice',                               stops: ['#031926', '#468FAF', '#89C2D9', '#D6F0FF', '#FFFFFF'] },
  { id: 'purple',       label: 'Purple',                            stops: ['#1B1037', '#4C1D95', '#7C3AED', '#C084FC', '#F5D0FE'] },
  { id: 'sunset',       label: 'Sunset',                            stops: ['#2B0B3F', '#8C1C7C', '#FF5E5B', '#FFB347', '#FFE39F'] },
  { id: 'aurora',       label: 'Aurora',                            stops: ['#061826', '#0E4D64', '#17A398', '#7BD389', '#D6F6DD'] },
  { id: 'synthwave',    label: 'Synthwave',                         stops: ['#120136', '#6A00F4', '#FF2D95', '#FF8A00', '#FFE66D'] },
  { id: 'cottoncandy',  label: 'Cotton Candy',                      stops: ['#5BCEFA', '#A0E7E5', '#FFB3DE', '#FFC1F3', '#FFF5FB'] },
  { id: 'emberglow',    label: 'Ember Glow',                        stops: ['#1B0C0C', '#6E1F1F', '#C44900', '#FF7B00', '#FFD166'] },
  { id: 'deepsea',      label: 'Deep Sea',                          stops: ['#031926', '#023E73', '#035AA6', '#0487D9', '#74D3F2'] },
  { id: 'mojito',       label: 'Mojito',                            stops: ['#0B3D20', '#1B7F3A', '#7BC043', '#D9ED92', '#FFF9C4'] },
  { id: 'rosegold',     label: 'Rose Gold',                         stops: ['#2E1F27', '#8C5E58', '#C08A80', '#E6B8A2', '#F7E7CE'] },
  { id: 'arctic',       label: 'Arctic',                            stops: ['#081B33', '#1C5D99', '#639FAB', '#BBCDE5', '#EAF6FF'] },
  { id: 'citrus',       label: 'Citrus',                            stops: ['#274001', '#70E000', '#C0FF4D', '#FFD23F', '#FF8C42'] },
  { id: 'amethyst',     label: 'Amethyst',                          stops: ['#14001F', '#4B1D6B', '#7B2CBF', '#C77DFF', '#F1E4FF'] },
  { id: 'peacock',      label: 'Peacock',                           stops: ['#001219', '#005F73', '#0A9396', '#94D2BD', '#EE9B00'] },
  { id: 'volcano',      label: 'Volcano',                           stops: ['#1A0F0A', '#5C1A1B', '#9E2A2B', '#E76F51', '#F4A261'] },
  { id: 'meadow',       label: 'Meadow',                            stops: ['#102A13', '#2F5233', '#5C8A3D', '#A4C963', '#E8F7A1'] },
  { id: 'noir',         label: 'Noir',                              stops: ['#05070A', '#16213E', '#30475E', '#7E8A97', '#D7E1EA'] },
  { id: 'coralreef',    label: 'Coral Reef',                        stops: ['#003B46', '#07575B', '#66A5AD', '#FF6F61', '#FFD9C0'] },
  { id: 'ultraviolet',  label: 'Ultraviolet',                       stops: ['#0B032D', '#240046', '#5A189A', '#9D4EDD', '#E0AAFF'] },
  { id: 'honeycomb',    label: 'Honeycomb',                         stops: ['#2B1600', '#8C510A', '#D98F00', '#F6C445', '#FFF0A8'] },
  { id: 'laguna',       label: 'Laguna',                            stops: ['#041C32', '#04293A', '#064663', '#3E92CC', '#A7C7E7'] },
  { id: 'opal',         label: 'Opal',                              stops: ['#1E2A38', '#4F6D7A', '#9DD9D2', '#F7F7FF', '#F4C2C2'] },
] as const

export const STUDIO_PALETTES = PALETTE_DEFS.map((palette) => palette.id)

const PALETTE_MAP = new Map(PALETTE_DEFS.map((palette) => [palette.id, palette]))

export const PALETTE_IDS: Record<string, number> = Object.fromEntries(
  STUDIO_PALETTES.map((palette, index) => [palette, index]),
)

function hexToRgb(hex: string): PaletteRgb {
  const clean = hex.replace('#', '')
  const n = Number.parseInt(clean, 16)
  return {
    r: (n >> 16) & 0xff,
    g: (n >> 8) & 0xff,
    b: n & 0xff,
  }
}

const RGB_STOPS: Record<string, PaletteRgb[]> = Object.fromEntries(
  PALETTE_DEFS.map((palette) => [palette.id, palette.stops.map(hexToRgb)]),
)

function lerpRgb(a: PaletteRgb, b: PaletteRgb, t: number): PaletteRgb {
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
  }
}

function sampleStops(stops: readonly PaletteRgb[], t: number): PaletteRgb {
  if (stops.length === 0) return { r: 0, g: 0, b: 0 }
  if (stops.length === 1) return { ...stops[0] }
  const h = ((t % 1) + 1) % 1
  const scaled = h * (stops.length - 1)
  const index = Math.floor(scaled)
  const mix = scaled - index
  const a = stops[index]
  const b = stops[Math.min(stops.length - 1, index + 1)]
  return lerpRgb(a, b, mix)
}

function cppId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

export function isStudioPalette(name: string): boolean {
  return PALETTE_MAP.has(name)
}

export function getPaletteStops(name: string): PaletteRgb[] | null {
  return RGB_STOPS[name] ? RGB_STOPS[name].map((stop) => ({ ...stop })) : null
}

export function sampleNamedPalette(name: string, t: number): PaletteRgb | null {
  const stops = RGB_STOPS[name]
  return stops ? sampleStops(stops, t) : null
}

export function paletteStops16(name: string): PaletteRgb[] {
  const stops = RGB_STOPS[name]
  if (!stops) return []
  return Array.from({ length: 16 }, (_, index) => sampleStops(stops, index / 15))
}

export function paletteCppRef(name: string): string {
  const palette = PALETTE_MAP.get(name)
  if (!palette) return 'RainbowColors_p'
  return palette.fastled ?? `paldef_${cppId(palette.id)}`
}

export function customPaletteDeclarationsCpp(): string[] {
  return PALETTE_DEFS
    .filter((palette) => !palette.fastled)
    .map((palette) => {
      const stops = paletteStops16(palette.id)
      const cppStops = stops.map((stop) => `CRGB(${stop.r},${stop.g},${stop.b})`).join(', ')
      return `CRGBPalette16 paldef_${cppId(palette.id)}(${cppStops});`
    })
}

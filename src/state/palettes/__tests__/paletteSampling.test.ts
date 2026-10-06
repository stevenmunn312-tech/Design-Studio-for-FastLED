import { describe, expect, it } from 'vitest'
import { customPaletteDeclarationsCpp, getPaletteStops, paletteStops16, STUDIO_PALETTES } from '../paletteCatalog'
import { type Palette, samplePalette, samplePaletteClamped } from '../ledColor'

const OCEAN_FIRST = { r: 3, g: 29, b: 68 }
const OCEAN_LAST = { r: 216, g: 243, b: 255 }
const CUSTOM: Palette = [{ r: 10, g: 20, b: 30 }, { r: 90, g: 180, b: 40 }, { r: 250, g: 5, b: 120 }]

describe('palette sampling', () => {
  it('bakes every firmware palette from its first stop to its last', () => {
    for (const id of STUDIO_PALETTES) {
      const stops = getPaletteStops(id)!
      const table = paletteStops16(id)
      expect(table, id).toHaveLength(16)
      expect(table[0], id).toEqual(stops[0])
      expect(table[15], id).toEqual(stops[stops.length - 1])
    }
    // What the sketch compiles is that table, last entry included.
    const [ocean] = customPaletteDeclarationsCpp(['ocean'])
    expect(ocean.endsWith(`CRGB(${OCEAN_LAST.r},${OCEAN_LAST.g},${OCEAN_LAST.b}));`)).toBe(true)
  })

  it('holds the ends for an amount and wraps a position once round', () => {
    expect(samplePaletteClamped('ocean', 1)).toEqual(OCEAN_LAST)
    expect(samplePaletteClamped('ocean', 1.5)).toEqual(OCEAN_LAST)
    expect(samplePaletteClamped('ocean', -0.5)).toEqual(OCEAN_FIRST)
    expect(samplePaletteClamped('ocean', Number.NaN)).toEqual(OCEAN_FIRST)
    expect(samplePalette('ocean', 1)).toEqual(OCEAN_FIRST)
    expect(samplePaletteClamped(CUSTOM, 1)).toEqual({ r: 250, g: 5, b: 120 })
    expect(samplePalette(CUSTOM, 1)).toEqual({ r: 10, g: 20, b: 30 })
  })

  it('agrees with the wrapping sampler everywhere below full scale', () => {
    for (const palette of ['ocean', 'rainbow', CUSTOM] as Palette[]) {
      for (let t = 0; t < 1; t += 1 / 64) {
        expect(samplePaletteClamped(palette, t)).toEqual(samplePalette(palette, t))
      }
    }
  })
})

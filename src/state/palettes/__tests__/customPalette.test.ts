import { describe, expect, it } from 'vitest'
import { customPaletteStops16, hexToRgb, normalizeCustomPalette } from '../customPalette'

describe('customPalette', () => {
  it('normalizes colors and positions into sorted anchored stops', () => {
    const p = normalizeCustomPalette(['#0000ff', '#ff0000', 'bad'], [1, 0])

    expect(p.colors).toEqual(['#ff0000', '#0000ff'])
    expect(p.positions).toEqual([0, 1])
  })

  it('samples positioned stops into a 16-entry palette', () => {
    const stops = customPaletteStops16(
      ['#000000', '#ffffff'].map(hexToRgb),
      [0, 1],
    )

    expect(stops).toHaveLength(16)
    expect(stops[0]).toEqual({ r: 0, g: 0, b: 0 })
    expect(stops[15]).toEqual({ r: 255, g: 255, b: 255 })
    expect(stops[8].r).toBeGreaterThan(stops[7].r)
  })
})

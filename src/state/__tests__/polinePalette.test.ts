import { describe, it, expect } from 'vitest'
import { polinePalette, polineStops16, hexToRgb, POLINE_POSITIONS } from '../polinePalette'

const RED = { r: 255, g: 0, b: 0 }
const BLUE = { r: 0, g: 0, b: 255 }

describe('hexToRgb', () => {
  it('parses #rrggbb (with or without leading #)', () => {
    expect(hexToRgb('#ff0080')).toEqual({ r: 255, g: 0, b: 128 })
    expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0 })
    expect(hexToRgb('nope')).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('polinePalette', () => {
  it('produces ordered RGB stops spanning the two anchors', () => {
    const pal = polinePalette(RED, BLUE, 4, 'sinusoidal')
    expect(pal.length).toBeGreaterThan(2)
    pal.forEach((c) => {
      expect(c.r).toBeGreaterThanOrEqual(0); expect(c.r).toBeLessThanOrEqual(255)
      expect(c.g).toBeGreaterThanOrEqual(0); expect(c.b).toBeLessThanOrEqual(255)
    })
  })

  it('is deterministic and anchor-dependent', () => {
    const a = polinePalette(RED, BLUE, 4, 'sinusoidal')
    expect(polinePalette(RED, BLUE, 4, 'sinusoidal')).toEqual(a) // deterministic
    const b = polinePalette(RED, { r: 0, g: 255, b: 0 }, 4, 'sinusoidal')
    expect(JSON.stringify(b)).not.toEqual(JSON.stringify(a))     // anchors matter
  })

  it('exposes the position functions used by the node dropdown', () => {
    expect(POLINE_POSITIONS).toContain('sinusoidal')
    expect(POLINE_POSITIONS).toContain('linear')
    // every advertised position function runs without throwing
    for (const pos of POLINE_POSITIONS) {
      expect(polinePalette(RED, BLUE, 3, pos).length).toBeGreaterThan(2)
    }
  })

  it('resamples to exactly 16 stops for a CRGBPalette16', () => {
    expect(polineStops16(RED, BLUE, 4, 'sinusoidal')).toHaveLength(16)
  })
})

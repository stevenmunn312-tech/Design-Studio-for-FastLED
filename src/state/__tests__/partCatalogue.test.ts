import { describe, expect, it } from 'vitest'
import {
  PART_CATALOGUE,
  catalogueRings,
  partById,
  partDimensionsMm,
  partRenderSrc,
  ringDiameterMm,
} from '../partCatalogue'

describe('part catalogue', () => {
  it('carries the modelled parts', () => {
    expect(Object.keys(PART_CATALOGUE).length).toBeGreaterThanOrEqual(16)
    expect(partById('max98357a-i2s-amplifier')).toBeDefined()
    expect(partById('inmp441-i2s-microphone')).toBeDefined()
  })

  it('states datasheet-verified dimensions, not remembered ones', () => {
    // The two the app had guessed wrong. 0.70 x 1.00 inch for the amplifier,
    // per Adafruit's fabrication print; the app had said 17.8 x 13.2 and drew
    // the board at about half its real length.
    expect(partById('max98357a-i2s-amplifier')!.dimensionsMm).toEqual({ width: 17.78, height: 25.4 })
    expect(partById('inmp441-i2s-microphone')!.dimensionsMm).toEqual({ width: 15, height: 10.5 })
  })

  it('falls back for a part nobody has modelled yet', () => {
    const fallback = { width: 5, height: 5 }
    expect(partDimensionsMm('not-a-real-part', fallback)).toBe(fallback)
    expect(partRenderSrc('not-a-real-part')).toBeNull()
  })

  it('serves renders from the site root', () => {
    expect(partRenderSrc('max98357a-i2s-amplifier')).toBe('/parts/max98357a-i2s-amplifier.webp')
  })

  it('records the LED pitch each output was modelled at', () => {
    expect(partById('hub75-panel-64x64-p4')!.ledLayout).toMatchObject({ form: 'hub75', pitchMm: 4 })
    expect(partById('ws2812b-matrix-16x16')!.ledLayout).toMatchObject({ form: 'matrix', pitchMm: 10 })
  })
})

describe('ringDiameterMm', () => {
  it('knows the rings that were actually modelled', () => {
    expect(catalogueRings().map((ring) => ring.count)).toEqual([8, 12, 16, 24, 60])
    expect(ringDiameterMm(8)).toBe(32.2)
    expect(ringDiameterMm(12)).toBe(37)
    expect(ringDiameterMm(16)).toBe(44.5)
    expect(ringDiameterMm(24)).toBe(65.5)
    expect(ringDiameterMm(60)).toBe(158)
  })

  it('does not reproduce the old formula, which was wrong at both ends', () => {
    // `N x 10 / pi` predicted 25.5 mm at 8 LEDs and 191 mm at 60.
    expect(ringDiameterMm(8)).toBeGreaterThan((8 * 10) / Math.PI)
    expect(ringDiameterMm(60)).toBeLessThan((60 * 10) / Math.PI)
  })

  it('interpolates between neighbouring counts', () => {
    // 20 sits halfway between the 16 (44.5) and 24 (65.5) rings.
    expect(ringDiameterMm(20)).toBeCloseTo((44.5 + 65.5) / 2, 5)
  })

  it('holds the nearest ring pitch outside the modelled range', () => {
    // Past 60 the hub stops mattering and only circumference grows.
    expect(ringDiameterMm(120)).toBeCloseTo(316, 5)
    expect(ringDiameterMm(4)).toBeCloseTo(16.1, 5)
  })

  it('is monotonic — more LEDs is never a smaller ring', () => {
    let previous = 0
    for (let count = 1; count <= 120; count++) {
      const diameter = ringDiameterMm(count)
      expect(diameter).toBeGreaterThanOrEqual(previous)
      previous = diameter
    }
  })
})

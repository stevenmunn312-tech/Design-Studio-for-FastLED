import { describe, expect, it } from 'vitest'
import { performanceOptionsFromProperties } from '../performanceGenerator'

describe('performanceOptionsFromProperties', () => {
  it('normalises node controls into safe generator options', () => {
    expect(performanceOptionsFromProperties({
      beatIntensity: 2,
      energySensitivity: -1,
      transitionDuration: 9,
      paletteMode: 'fixed',
      fixedPalette: 'ice',
    })).toEqual({
      beatIntensity: 1,
      energySensitivity: 0,
      transitionDuration: 3,
      paletteMode: 'fixed',
      fixedPalette: 'ice',
    })
  })

  it('falls back from invalid saved values', () => {
    expect(performanceOptionsFromProperties({
      beatIntensity: 'nope',
      energySensitivity: null,
      paletteMode: 'surprise',
      fixedPalette: 'not-a-palette',
    })).toMatchObject({ beatIntensity: 0.8, energySensitivity: 0.7, paletteMode: 'mood', fixedPalette: 'rainbow' })
  })
})

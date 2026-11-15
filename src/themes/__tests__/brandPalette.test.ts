import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND_KELVIN, kelvinColour } from '../brandPalette'

const BRAND_TOKENS = [
  'brand-candle',
  'brand-warm-white',
  'brand-soft-white',
  'brand-neutral',
  'brand-daylight',
  'brand-cool-white',
  'brand-sky',
]

describe('brand palette', () => {
  it('matches the --brand-* tokens in tokens.css, candle to sky', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/themes/tokens.css'), 'utf8')
    const tokens = BRAND_TOKENS.map((name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1].toLowerCase())
    expect(tokens).toEqual([...BRAND_KELVIN])
  })

  it('sweeps between swatches and shades toward white or black', () => {
    expect(kelvinColour(0)).toBe('rgba(255, 137, 18, 1)')
    expect(kelvinColour(1)).toBe('rgba(191, 211, 255, 1)')
    expect(kelvinColour(2, 0, 0.5)).toBe('rgba(191, 211, 255, 0.5)')
    expect(kelvinColour(0, 1)).toBe('rgba(255, 255, 255, 1)')
    expect(kelvinColour(0, -1)).toBe('rgba(0, 0, 0, 1)')
    expect(kelvinColour(0.5)).toBe('rgba(255, 206, 166, 1)')
    expect(kelvinColour(0.75)).toBe('rgba(241, 235, 239, 1)')
  })
})

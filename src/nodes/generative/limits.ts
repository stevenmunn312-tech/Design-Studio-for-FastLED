/** Spiral arm count, bounded in the slider, the preview and the sketch. */
export const SPIRAL_ARMS = { min: 1, max: 8 } as const

/**
 * Rainbow runs along the string's own LED order (FastLED's fill_rainbow), or
 * steps once per column or per row so a matrix shows a straight gradient
 * rather than a band skewed by each row restarting further round the wheel.
 */
export const RAINBOW_AXES = ['string', 'horizontal', 'vertical'] as const
export type RainbowAxis = typeof RAINBOW_AXES[number]
export function rainbowAxis(value: unknown): RainbowAxis {
  return (RAINBOW_AXES as readonly string[]).includes(String(value)) ? value as RainbowAxis : 'string'
}

/**
 * Confetti speckles a frame per unit of Density, times the square root of
 * the LED count. Density alone sets the amount; Speed only drifts the colours.
 */
export const CONFETTI_SPAWN = 0.5

/** Pride 2015's rainbow saturation, the `CHSV(_hue, 230, _bri)` the sketch converts. */
export const PRIDE_SAT = 230

/**
 * Scanner reads its beam colour from this point of the palette to its end,
 * as the beam travels: lava and fire start almost black, and a beam sampled
 * from 0 vanished at one end of its sweep.
 */
export const SCANNER_PALETTE_FLOOR = 0.3

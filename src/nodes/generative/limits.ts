/** Spiral arm count, bounded in the slider, the preview and the sketch. */
export const SPIRAL_ARMS = { min: 1, max: 8 } as const

/**
 * Scanner reads its beam colour from this point of the palette to its end,
 * as the beam travels: lava and fire start almost black, and a beam sampled
 * from 0 vanished at one end of its sweep.
 */
export const SCANNER_PALETTE_FLOOR = 0.3

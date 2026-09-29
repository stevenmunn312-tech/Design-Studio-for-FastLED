// Fire's `smoke` style: a second noise layer, drifting away from the flame's
// base, that dims the heat before it reaches the palette. Fire2023's idea.
// The preview samples `_snoise2` and the sketch samples `inoise8`; `inoise8`
// takes 8.8 fixed point, so one noise unit is 256 there.

export const FIRE_STYLES = ['classic', 'smoke'] as const
export type FireStyle = typeof FIRE_STYLES[number]
export const fireStyle = (v: unknown): FireStyle => (v === 'smoke' ? 'smoke' : 'classic')

/** How much of the flame the noise can take away at its darkest. */
export const FIRE_SMOKE_DEPTH = 0.65
/** Noise units per LED across the flame, and along it. */
export const FIRE_SMOKE_SCALE_ACROSS = 0.35
export const FIRE_SMOKE_SCALE_ALONG = 0.3
/** Noise units per second the smoke drifts toward the tip. */
export const FIRE_SMOKE_SPEED = 0.8
/** inoise8's fixed-point units per noise unit. */
export const INOISE_UNIT = 256

/** Heat left after the smoke layer, for noise value `n` in 0–1. */
export const fireSmokeDim = (n: number) => 1 - FIRE_SMOKE_DEPTH * Math.max(0, Math.min(1, n))

/**
 * How Palette Sampler and Palette Sweep read their palette, shared by the
 * preview and the generator.
 *
 * A position either wraps round the palette or holds its ends
 * (docs/development/patterns/graph-and-nodes.md, "A palette lookup either
 * wraps or holds its ends"): `wrap` is `samplePalette` and FastLED's default
 * LINEARBLEND, right for a scrolling index; `hold` is `samplePaletteClamped`
 * and LINEARBLEND_NOWRAP, right for an amount, where full scale means the
 * last colour rather than the first again.
 */
export const PALETTE_ENDS = ['wrap', 'hold'] as const
export type PaletteEnds = typeof PALETTE_ENDS[number]

export function paletteEnds(value: unknown): PaletteEnds {
  return value === 'hold' ? 'hold' : 'wrap'
}

/**
 * Palette Sweep's motion: `pingPong` runs start to end and back, its ends
 * held; `loop` runs start to end and round again, wrapping, so a cyclic
 * palette scrolls one way.
 */
export const SWEEP_MOTIONS = ['pingPong', 'loop'] as const
export type SweepMotion = typeof SWEEP_MOTIONS[number]

export function sweepMotion(value: unknown): SweepMotion {
  return value === 'loop' ? 'loop' : 'pingPong'
}

/** The 0–1 leg position for a 0–1 phase of one round trip (ping-pong) or one pass (loop). */
export function sweepLeg(phase: number, motion: SweepMotion): number {
  if (motion === 'loop') return phase
  return phase < 0.5 ? phase * 2 : (1 - phase) * 2
}

/** The Glitter overlay's sparkle budget, shared by preview and firmware. */

/** Sparkles per frame at density 1, per LED: 256 LEDs at full density get
 *  four a frame, so a strip and a panel sparkle at the same visual rate. */
export const GLITTER_PER_LED = 1 / 64

export const GLITTER_MODES = ['add', 'replace'] as const
export type GlitterMode = typeof GLITTER_MODES[number]

export function glitterMode(value: unknown): GlitterMode {
  return value === 'replace' ? 'replace' : 'add'
}

/** Expected sparkles this frame; the fraction is a chance of one more. */
export function glitterBudget(density: number, ledCount: number): number {
  const d = Math.max(0, Math.min(1, Number.isFinite(density) ? density : 0))
  return d * ledCount * GLITTER_PER_LED
}

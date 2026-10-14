/**
 * The one-dimensional classics' shared rules — Theater Chase, Color Wipe and
 * Breathe. Preview and firmware both read these, so a spacing bound, the
 * palette step a wipe takes, or a breathing curve lands on both sides at once.
 */

/** Theater Chase: lit LEDs are `spacing` apart. */
export const CHASE_SPACING = { min: 2, max: 16, default: 3 } as const

export function chaseSpacing(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : CHASE_SPACING.default)
  return Math.max(CHASE_SPACING.min, Math.min(CHASE_SPACING.max, n))
}

/** How far round the palette the chase colour drifts per step. */
export const CHASE_DRIFT = 0.05

/** Color Wipe: how far round the palette each successive wipe moves. */
export const WIPE_PALETTE_STEP = 0.2

/** Palette position of wipe number `n` (0, 1, 2 …), wrapped. */
export function wipePalettePosition(n: number): number {
  const v = n * WIPE_PALETTE_STEP
  return ((v % 1) + 1) % 1
}

export const CHASE_DIRECTIONS = ['forward', 'reverse'] as const
export const WIPE_DIRECTIONS = ['forward', 'reverse', 'bounce'] as const

/** Whether wipe `n` runs from the far end. */
export function wipeReversed(direction: unknown, n: number): boolean {
  const mode = String(direction ?? 'forward')
  if (mode === 'reverse') return true
  if (mode === 'bounce') return (n & 1) === 1
  return false
}

export const BREATHE_CURVES = ['natural', 'sine', 'triangle'] as const
export type BreatheCurve = typeof BREATHE_CURVES[number]

export function breatheCurve(value: unknown): BreatheCurve {
  return (BREATHE_CURVES as readonly string[]).includes(String(value)) ? value as BreatheCurve : 'natural'
}

/** Breaths per minute the slider, preview and sketch all allow. */
export const BREATHE_BPM = { min: 1, max: 120, default: 12 } as const

const E = Math.E
const E_INV = 1 / Math.E

/** 0–1 envelope at `phase` (0–1, one breath) — rises then falls. The natural
 *  curve is the exp(sin) breathing function (Sean Voisen's), normalised. */
export function breatheEnvelope(curve: BreatheCurve, phase: number): number {
  const p = ((phase % 1) + 1) % 1
  switch (curve) {
    case 'sine': return 0.5 - 0.5 * Math.cos(p * Math.PI * 2)
    case 'triangle': return p < 0.5 ? p * 2 : 2 - p * 2
    case 'natural':
    default: return (Math.exp(Math.sin(p * Math.PI * 2 - Math.PI / 2)) - E_INV) / (E - E_INV)
  }
}

/** The C++ expression for `breatheEnvelope`, over a 0–1 `phase` expression. */
export function breatheEnvelopeCpp(curve: BreatheCurve, phase: string): string {
  switch (curve) {
    case 'sine': return `(0.5f-0.5f*cosf((${phase})*6.283185307f))`
    case 'triangle': return `((${phase})<0.5f?(${phase})*2.0f:2.0f-(${phase})*2.0f)`
    case 'natural':
    default: return `((expf(sinf((${phase})*6.283185307f-1.570796327f))-${E_INV.toFixed(7)}f)/${(E - E_INV).toFixed(7)}f)`
  }
}

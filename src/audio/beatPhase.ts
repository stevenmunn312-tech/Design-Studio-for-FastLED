/** Beat Phase's bounds, shared by the preview and the sketch. */

export const BEAT_PHASE_BPM = { min: 20, max: 300, default: 120 } as const
export const BEAT_PHASE_BAR = { min: 1, max: 16, default: 4 } as const

export function beatPhaseBeatsPerBar(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : BEAT_PHASE_BAR.default)
  return Math.max(BEAT_PHASE_BAR.min, Math.min(BEAT_PHASE_BAR.max, n))
}

/** Beat Phase's bounds, shared by the preview and the sketch. */

export const BEAT_PHASE_BPM = { min: 20, max: 300, default: 120 } as const
export const BEAT_PHASE_BAR = { min: 1, max: 16, default: 4 } as const

export function beatPhaseBeatsPerBar(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : BEAT_PHASE_BAR.default)
  return Math.max(BEAT_PHASE_BAR.min, Math.min(BEAT_PHASE_BAR.max, n))
}

/**
 * How Beat Phase follows the beats it is given. Once two beats have arrived it
 * runs at the measured beat interval rather than the BPM field, and while the
 * beats keep coming it holds Phase at 1 until the next one lands instead of
 * wrapping on its own. Free-running at the field's tempo, a BPM faster than
 * the song wrapped before the beat (Count and Bar stepped twice, Phase sawed
 * twice a beat) and a slower one jumped from about 0.8 to 0.
 *
 * - `follow`: how far each new interval moves the measured one (0–1).
 * - `holdBeats`: beats without a pulse before it lets go and free-runs at the
 *   measured tempo, counting on, so a break in the music keeps the grid.
 * - `shortest`: a beat sooner than this share of the interval (a flam or a
 *   stray offbeat) resyncs Phase but does not change the tempo; a longer gap
 *   is divided by the beats it spans, so a missed beat does not halve it.
 */
export const BEAT_PHASE_SYNC = { follow: 0.5, holdBeats: 2, shortest: 0.5 } as const

export interface BeatPhaseState {
  phase: number
  count: number
  /** Seconds at the previous pass. */
  lastT: number
  prevBeat: boolean
  /** Seconds at the last rising beat edge, or -1 before the first. */
  lastBeat: number
  /** Measured seconds per beat, or 0 until two beats have arrived. */
  interval: number
}

/** One pass of Beat Phase at `now` seconds of the wall clock. The firmware
 *  twin is `beatPhaseLines` in src/nodes/audio/codegen.ts. */
export function beatPhaseStep(prev: BeatPhaseState | undefined, now: number, bpm: number, beat: boolean): BeatPhaseState {
  const state = prev ?? { phase: 0, count: 0, lastT: now, prevBeat: false, lastBeat: -1, interval: 0 }
  const dt = Math.max(0, now - state.lastT)
  let { phase, count, lastBeat, interval } = state
  if (beat && !state.prevBeat) {
    if (lastBeat >= 0) {
      let gap = now - lastBeat
      if (interval > 0) gap = gap < interval * BEAT_PHASE_SYNC.shortest ? -1 : gap / Math.max(1, Math.round(gap / interval))
      if (gap >= 60 / BEAT_PHASE_BPM.max && gap <= 60 / BEAT_PHASE_BPM.min) {
        interval = interval > 0 ? interval + (gap - interval) * BEAT_PHASE_SYNC.follow : gap
      }
    }
    lastBeat = now
    phase = 0
    count += 1
  } else {
    phase += dt * (interval > 0 ? 1 / interval : bpm / 60)
    if (interval > 0 && now - lastBeat < interval * BEAT_PHASE_SYNC.holdBeats) phase = Math.min(phase, 1)
    else if (phase >= 1) { count += Math.floor(phase); phase -= Math.floor(phase) }
  }
  return { phase, count, lastT: now, prevBeat: beat, lastBeat, interval }
}

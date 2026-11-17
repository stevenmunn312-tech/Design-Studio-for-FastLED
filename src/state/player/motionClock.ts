// The pattern clock a player runs its patterns on: track time, sped up or
// slowed down by how loud the music is and how fast its beat is. Shared by
// the Music Player and Pattern Slideshow previews and by their sketches
// (codegen/player/motionClockCpp.ts emits these numbers), so a pattern moves
// at the same pace on the LEDs as on screen.
//
// Only the animation clock is warped. Envelopes, smoothers, beat gates and
// transitions read the real-time clock, so a beat still lands when it lands.

/** Motion at silence and at the loud peak, as a multiple of a pattern's own
 *  speed. A quiet passage drifts rather than freezing; a loud one runs a
 *  little faster than the pattern was authored at. */
export const MOTION_QUIET = 0.4
export const MOTION_LOUD = 1.25
/** Loudness (the room scale Audio Features reads) at which motion is full:
 *  the energy stage's loud peak. */
export const MOTION_LOUDNESS_FULL = 0.3
/** Tempo the patterns were authored at; a beat this fast leaves motion as is. */
export const MOTION_TEMPO_REFERENCE = 120
/** Detected tempo is folded into this octave first. The detector often reads
 *  half or double time (104-220 BPM across one song), and a pattern that
 *  doubled its speed on an octave error would lurch. */
export const MOTION_TEMPO_RANGE: readonly [number, number] = [80, 160]
/** Seconds the loudness and the tempo take to move the clock (63% of a step).
 *  Slow enough that a speed change reads as the music changing, not jitter. */
export const MOTION_LOUDNESS_TAU = 0.6
export const MOTION_TEMPO_TAU = 4
/** The longest real-time step one pass may advance, so a stalled tab or a
 *  seek does not leap the pattern. */
export const MOTION_MAX_STEP_SEC = 0.1
/** A tempo reading above this is broken, not fast; it reads as the reference. */
export const MOTION_TEMPO_SANE_MAX = 10000

export interface MotionClock {
  /** The warped pattern clock, seconds. */
  t: number
  /** Smoothed loudness and folded tempo. */
  loudness: number
  tempo: number
  /** The real time of the previous pass, seconds; null before the first. */
  lastReal: number | null
}

export function blankMotionClock(startT = 0): MotionClock {
  return { t: startT, loudness: 0, tempo: MOTION_TEMPO_REFERENCE, lastReal: null }
}

/** Tempo folded into `MOTION_TEMPO_RANGE`; a missing or broken reading is the reference. */
export function foldMotionTempo(bpm: number): number {
  if (!(bpm > 0) || bpm > MOTION_TEMPO_SANE_MAX) return MOTION_TEMPO_REFERENCE
  const [lo, hi] = MOTION_TEMPO_RANGE
  let b = bpm
  while (b < lo) b *= 2
  while (b >= hi) b /= 2
  return b
}

/** The clock's rate from smoothed loudness and tempo. */
export function motionRate(loudness: number, tempo: number): number {
  const drive = Math.max(0, Math.min(1, loudness / MOTION_LOUDNESS_FULL))
  return (MOTION_QUIET + (MOTION_LOUD - MOTION_QUIET) * drive) * (tempo / MOTION_TEMPO_REFERENCE)
}

/**
 * Advance the clock to real time `real` (seconds). `loudness` is Audio
 * Features' room-scale Loudness (0 in silence) and `bpm` the detected tempo
 * (the reference while the analysis is idle), or null when the player has no
 * audio to read: the clock then runs at the patterns' own speed.
 */
export function motionClockStep(c: MotionClock, real: number, loudness: number, bpm: number | null): number {
  const dt = c.lastReal === null ? 0 : Math.max(0, Math.min(MOTION_MAX_STEP_SEC, real - c.lastReal))
  c.lastReal = real
  if (bpm === null) {
    c.t += dt
    return c.t
  }
  c.loudness += (Math.max(0, loudness) - c.loudness) * (1 - Math.exp(-dt / MOTION_LOUDNESS_TAU))
  c.tempo += (foldMotionTempo(bpm) - c.tempo) * (1 - Math.exp(-dt / MOTION_TEMPO_TAU))
  c.t += dt * motionRate(c.loudness, c.tempo)
  return c.t
}

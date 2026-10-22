// How long the Music Player holds each pattern, shared between the browser
// preview (nodes/show/evaluate.ts) and the generic SD player sketch
// (codegen/player/patternPacingCpp.ts emits these numbers), so a show paces
// its changes the same way on both.
//
// Two opt-in behaviours vary the plain random hold between Min Time and Max
// Time:
// - Energy Pacing leans each hold toward Min Time while the track is intense
//   and toward Max Time while it is calm. Intensity is relative to the
//   track's own recent range, so a quiet song and a loud master both vary.
// - Dwells & Bursts now and then holds one pattern for a long dwell, and now
//   and then changes several patterns in quick succession. Every change still
//   waits for a beat when Beat Transitions is on.

/** A dwell holds this many times Max Time. */
export const DWELL_HOLD_FACTOR = 2
/** Chance a normal hold is followed by a dwell. */
export const DWELL_CHANCE = 0.12
/** Chance a normal hold is followed by a burst. */
export const BURST_CHANCE = 0.12
/** A burst changes pattern this many times. Min and max match, so every burst is eight. */
export const BURST_CHANGES_MIN = 8
export const BURST_CHANGES_MAX = 8
/** A burst holds this fraction of the transition time after each change, so
 *  changes come slightly slower than the transitions themselves... */
export const BURST_HOLD_FRACTION = 0.25
/** ...but never less than this. Min Time still caps it. */
export const BURST_HOLD_MIN_SEC = 0.5
/** How far intensity moves a normal hold: 0.5 puts an intense track in the
 *  lower half of the range and a calm one in the upper half. */
export const ENERGY_LEAN = 0.5
/** Smoothing of the track's energy, so a drum hit does not count as intense. */
export const PACING_LEVEL_TAU_MS = 1500
/** How quickly the remembered loudest and quietest levels forget. */
export const PACING_RANGE_TAU_MS = 20000
/** Below this spread between loudest and quietest, intensity is neutral. */
export const PACING_RANGE_MIN = 0.05

export type PatternHoldKind = 'normal' | 'dwell' | 'burst'

/** The hold the player is in: its kind, a random draw that places a normal
 *  hold in the range, and the burst changes still owed after this one. */
export interface PatternHold { kind: PatternHoldKind; u: number; burstLeft: number }

/** The track's smoothed energy and the range it has recently moved in. */
export interface PacingEnergy { level: number; lo: number; hi: number }

export interface PacingOptions {
  minTime: number
  maxTime: number
  transitionSec: number
  energyPacing: boolean
}

/** A normal hold: the start of a show, after a seek, or after a confirm. */
export function firstPatternHold(rand: () => number): PatternHold {
  return { kind: 'normal', u: rand(), burstLeft: 0 }
}

/**
 * The hold after a change. A burst runs out its changes first; a dwell or a
 * burst is always followed by at least one normal hold. Without Dwells &
 * Bursts every hold is normal and draws exactly one random number, as the
 * player always has.
 */
export function nextPatternHold(prev: PatternHold, rand: () => number, dwellsAndBursts: boolean): PatternHold {
  if (!dwellsAndBursts) return firstPatternHold(rand)
  if (prev.burstLeft > 0) return { kind: 'burst', u: rand(), burstLeft: prev.burstLeft - 1 }
  if (prev.kind !== 'normal') return firstPatternHold(rand)
  const r = rand()
  if (r < DWELL_CHANCE) return { kind: 'dwell', u: rand(), burstLeft: 0 }
  if (r < DWELL_CHANCE + BURST_CHANCE) {
    const changes = BURST_CHANGES_MIN + Math.floor(rand() * (BURST_CHANGES_MAX - BURST_CHANGES_MIN + 1))
    return { kind: 'burst', u: rand(), burstLeft: changes - 1 }
  }
  return firstPatternHold(rand)
}

/**
 * Seconds a hold lasts. Evaluated every frame, so a normal hold shortens as
 * the music builds while it plays.
 */
export function patternHoldSeconds(hold: PatternHold, o: PacingOptions, intensity: number): number {
  if (hold.kind === 'dwell') return DWELL_HOLD_FACTOR * o.maxTime
  if (hold.kind === 'burst') {
    return Math.min(o.minTime, Math.max(BURST_HOLD_MIN_SEC, o.transitionSec * BURST_HOLD_FRACTION))
  }
  const lean = o.energyPacing ? ENERGY_LEAN : 0
  const span = Math.max(0, o.maxTime - o.minTime)
  return o.minTime + span * (hold.u * (1 - lean) + (1 - intensity) * lean)
}

export function blankPacingEnergy(): PacingEnergy {
  return { level: 0, lo: 0, hi: 0 }
}

/** Advance the energy tracker by `dtMs` with the track's mean band energy. A
 *  negative step (a seek or a new track) moves nothing. */
export function pacingEnergyStep(e: PacingEnergy, energy: number, dtMs: number): void {
  const dt = Math.max(0, dtMs)
  e.level += (Math.max(0, Math.min(1, energy)) - e.level) * (1 - Math.exp(-dt / PACING_LEVEL_TAU_MS))
  const k = 1 - Math.exp(-dt / PACING_RANGE_TAU_MS)
  e.hi = e.level > e.hi ? e.level : e.hi + (e.level - e.hi) * k
  e.lo = e.level < e.lo ? e.level : e.lo + (e.level - e.lo) * k
}

/** Where the track sits in its recent range, 0 (calmest) to 1 (most intense);
 *  0.5 when it has barely moved. */
export function pacingIntensity(e: PacingEnergy): number {
  const range = e.hi - e.lo
  if (range < PACING_RANGE_MIN) return 0.5
  return Math.max(0, Math.min(1, (e.level - e.lo) / range))
}

import { floatLit } from '../../codegen/cppLiterals'

/*
 * Audio Features' Level: Loudness made ready for a 0–1 input.
 *
 * Loudness is the raw meter (audio/stereoLevels.ts). Music heard by a laptop
 * microphone in a room sits at about 0.02, 0.09 and 0.17 of it at its 10th,
 * 50th and 90th percentiles, peaking near 0.34, so wired straight into a 0–1
 * input it barely moves. Level multiplies Loudness by a gain Sensitivity
 * sets, eases it over `response` seconds of wall clock (an exponential
 * follower, as the Smooth node runs, so 63% of a step arrives in that time
 * at any frame rate) and then clamps it to 0–1.
 *
 * The gain is `gainAtDefault` to the power `2 × Sensitivity`: 0 passes
 * Loudness through (a line input or the player already fills the meter), the
 * default 0.5 multiplies it by `gainAtDefault`, and 1 by its square for a
 * distant microphone. The default was set on a 45 s room recording: at 0.5
 * Level's 90th percentile reads about 0.8 (0.26 and 0.61 at the 10th and
 * 50th) and only the loudest moments reach 1. The easing lowers the peaks, so
 * the gain is above the 0.8 / 0.17 the raw percentile alone would suggest.
 *
 * Loudness itself, and the shared energy stage that reads it through its own
 * 0.15 s Smooth (patterns/energyDynamics.ts), are untouched: the stage's
 * ranges were set by ear on the raw meter.
 */
export const AUDIO_LEVEL = { gainAtDefault: 6.4, response: 0.15 } as const

/** Level's gain on Loudness at `sensitivity` (0–1). */
export function audioLevelGain(sensitivity: number): number {
  return Math.pow(AUDIO_LEVEL.gainAtDefault, 2 * Math.max(0, Math.min(1, sensitivity)))
}

/**
 * One pass of Level's follower: `prev` eased toward `target` over `dt`
 * seconds, or `target` itself on the first pass. The result is not clamped,
 * so a burst above full scale holds Level at 1 for as long as it eases down.
 */
export function audioLevelEase(prev: number | undefined, target: number, dt: number): number {
  return prev === undefined ? target : target + (prev - target) * Math.exp(-Math.max(0, dt) / AUDIO_LEVEL.response)
}

/** Level as the sketch's output reads it. */
export function audioLevelOutput(eased: number): number {
  return Math.max(0, Math.min(1, eased))
}

/**
 * The firmware twin, as statements: `state` is a `static float` that starts
 * at -1 (no pass yet), `loudness` the clamped meter, `sensitivity` the
 * clamped knob and `dt` the pass's seconds (`envelopeDtCpp`).
 */
export function audioLevelCpp(state: string, loudness: string, sensitivity: string, dt: string): string {
  const target = `${loudness}*powf(${floatLit(AUDIO_LEVEL.gainAtDefault)},2.0f*${sensitivity})`
  return `{ float _lvT=${target}; ${state}=${state}<0.0f?_lvT:_lvT+(${state}-_lvT)*expf(-${dt}/${floatLit(AUDIO_LEVEL.response)}); }`
}

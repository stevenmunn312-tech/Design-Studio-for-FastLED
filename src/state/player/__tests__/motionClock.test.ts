import { describe, expect, it } from 'vitest'
import {
  MOTION_LOUD, MOTION_LOUDNESS_FULL, MOTION_MAX_STEP_SEC, MOTION_QUIET,
  blankMotionClock, foldMotionTempo, motionClockStep, motionRate,
} from '../motionClock'
import { motionClockCpp } from '../../../codegen/player/motionClockCpp'

/** Run the clock for `seconds` of real time at 60 passes a second. */
function run(seconds: number, loudness: number, bpm: number | null) {
  const clock = blankMotionClock(0)
  for (let i = 0; i <= seconds * 60; i++) motionClockStep(clock, i / 60, loudness, bpm)
  return clock
}

describe('motion clock', () => {
  it('folds half- and double-time readings into one octave', () => {
    expect(foldMotionTempo(220)).toBe(110)
    expect(foldMotionTempo(60)).toBe(120)
    expect(foldMotionTempo(128)).toBe(128)
    expect(foldMotionTempo(Number.NaN)).toBe(120)
    expect(foldMotionTempo(Number.POSITIVE_INFINITY)).toBe(120)
    expect(foldMotionTempo(0)).toBe(120)
  })

  it('runs slowly in silence and faster as the music gets louder and quicker', () => {
    expect(motionRate(0, 120)).toBeCloseTo(MOTION_QUIET)
    expect(motionRate(MOTION_LOUDNESS_FULL, 120)).toBeCloseTo(MOTION_LOUD)
    expect(motionRate(MOTION_LOUDNESS_FULL / 2, 120)).toBeCloseTo((MOTION_QUIET + MOTION_LOUD) / 2)
    expect(motionRate(MOTION_LOUDNESS_FULL, 150)).toBeCloseTo(MOTION_LOUD * 1.25)
  })

  it('settles on that rate rather than jumping to it', () => {
    // Loud music at 120 BPM: the smoothed loudness reaches the rate within seconds.
    const loud = run(20, MOTION_LOUDNESS_FULL, 120)
    expect(loud.t).toBeGreaterThan(20 * MOTION_LOUD - 1)
    expect(loud.t).toBeLessThan(20 * MOTION_LOUD)
    const quiet = run(20, 0, 120)
    expect(quiet.t).toBeCloseTo(20 * MOTION_QUIET, 5)
  })

  it('keeps the patterns\' own speed without audio to read', () => {
    expect(run(10, 0, null).t).toBeCloseTo(10, 5)
  })

  it('advances no further than one capped step through a stall or a seek', () => {
    const clock = blankMotionClock(0)
    motionClockStep(clock, 0, 0, null)
    motionClockStep(clock, 30, 0, null)
    expect(clock.t).toBeCloseTo(MOTION_MAX_STEP_SEC)
    motionClockStep(clock, 5, 0, null)
    expect(clock.t).toBeCloseTo(MOTION_MAX_STEP_SEC)
  })

  it('emits the same constants for the sketch', () => {
    const cpp = motionClockCpp().join('\n')
    expect(cpp).toContain('while (bpm < 80.0000f) bpm *= 2.0f;')
    expect(cpp).toContain('while (bpm >= 160.0000f) bpm *= 0.5f;')
    expect(cpp).toContain(`(${MOTION_QUIET.toFixed(4)}f + ${(MOTION_LOUD - MOTION_QUIET).toFixed(4)}f * drive)`)
    expect(cpp).toContain('const uint32_t motionMs = (uint32_t)motionMsF;')
  })
})

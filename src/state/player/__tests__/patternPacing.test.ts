import { describe, expect, it } from 'vitest'
import {
  BURST_CHANGES_MAX, BURST_CHANGES_MIN, BURST_HOLD_MIN_SEC, DWELL_HOLD_FACTOR, PACING_RANGE_TAU_MS,
  blankPacingEnergy, firstPatternHold, nextPatternHold, pacingEnergyStep, pacingIntensity, patternHoldSeconds,
  type PatternHold,
} from '../patternPacing'

const TIMING = { minTime: 4, maxTime: 12, transitionSec: 1, energyPacing: false }

/** A deterministic stand-in for the show's seeded random source. */
function lcg(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return s / 2 ** 32
  }
}

describe('pattern holds', () => {
  it('without pacing places a hold uniformly in the range, as the player always has', () => {
    const rand = lcg()
    const hold = nextPatternHold(firstPatternHold(rand), rand, false)
    expect(hold.kind).toBe('normal')
    expect(patternHoldSeconds(hold, TIMING, 0.5)).toBe(4 + hold.u * 8)
  })

  it('draws one random number per hold without Dwells & Bursts', () => {
    let draws = 0
    const rand = () => { draws++; return 0.05 }
    nextPatternHold(firstPatternHold(rand), rand, false)
    expect(draws).toBe(2)
  })

  it('dwells for four times Max Time and then returns to normal', () => {
    const dwell = nextPatternHold(firstPatternHold(() => 0.5), () => 0.01, true)
    expect(dwell.kind).toBe('dwell')
    expect(patternHoldSeconds(dwell, TIMING, 0.5)).toBe(DWELL_HOLD_FACTOR * 12)
    expect(nextPatternHold(dwell, () => 0.01, true).kind).toBe('normal')
  })

  it('bursts through three to five quick changes, each just after its transition', () => {
    const sequence = [0.15, 0.99, 0.5]  // a burst, the most changes, its draw
    const rand = () => sequence.shift() ?? 0.5
    let hold: PatternHold = nextPatternHold(firstPatternHold(() => 0.5), rand, true)
    const kinds: string[] = []
    while (hold.kind === 'burst') {
      kinds.push(hold.kind)
      expect(patternHoldSeconds(hold, TIMING, 0.5)).toBe(BURST_HOLD_MIN_SEC)
      hold = nextPatternHold(hold, () => 0.01, true)
    }
    expect(kinds).toHaveLength(BURST_CHANGES_MAX)
    // A burst is followed by a normal hold even when the draw says dwell.
    expect(hold.kind).toBe('normal')
  })

  it('makes a burst of at least the minimum changes', () => {
    const hold = nextPatternHold(firstPatternHold(() => 0.5), (() => {
      const sequence = [0.15, 0]
      return () => sequence.shift() ?? 0.5
    })(), true)
    expect(hold.burstLeft + 1).toBe(BURST_CHANGES_MIN)
  })

  it('keeps a burst hold within Min Time and scales it with a long transition', () => {
    const burst: PatternHold = { kind: 'burst', u: 0.5, burstLeft: 0 }
    expect(patternHoldSeconds(burst, { ...TIMING, transitionSec: 4 }, 0.5)).toBe(1)
    expect(patternHoldSeconds(burst, { ...TIMING, minTime: 0.2 }, 0.5)).toBe(0.2)
  })

  it('happens now and then rather than every change', () => {
    const rand = lcg(7)
    let hold = firstPatternHold(rand)
    const counts = { normal: 0, dwell: 0, burst: 0 }
    for (let i = 0; i < 2000; i++) {
      hold = nextPatternHold(hold, rand, true)
      counts[hold.kind]++
    }
    expect(counts.normal).toBeGreaterThan(counts.dwell + counts.burst)
    expect(counts.dwell).toBeGreaterThan(100)
    expect(counts.burst).toBeGreaterThan(300)
  })
})

describe('Energy Pacing', () => {
  const paced = { ...TIMING, energyPacing: true }
  const hold: PatternHold = { kind: 'normal', u: 0.5, burstLeft: 0 }

  it('leans toward Min Time when intense and Max Time when calm', () => {
    expect(patternHoldSeconds(hold, paced, 1)).toBe(4 + 8 * 0.25)
    expect(patternHoldSeconds(hold, paced, 0)).toBe(4 + 8 * 0.75)
    expect(patternHoldSeconds({ ...hold, u: 0 }, paced, 1)).toBe(4)
    expect(patternHoldSeconds({ ...hold, u: 1 }, paced, 0)).toBe(12)
  })

  it('reads intensity against the track’s own recent range', () => {
    const e = blankPacingEnergy()
    // No movement yet: neutral.
    expect(pacingIntensity(e)).toBe(0.5)
    // A quiet verse, then a loud chorus.
    for (let ms = 0; ms < 20000; ms += 50) pacingEnergyStep(e, 0.15, 50)
    for (let ms = 0; ms < 6000; ms += 50) pacingEnergyStep(e, 0.45, 50)
    expect(pacingIntensity(e)).toBeGreaterThan(0.9)
    // Back to the verse: calm again.
    for (let ms = 0; ms < 6000; ms += 50) pacingEnergyStep(e, 0.15, 50)
    expect(pacingIntensity(e)).toBeLessThan(0.15)
  })

  it('settles to neutral when the level stops moving', () => {
    const e = blankPacingEnergy()
    for (let ms = 0; ms < 5000; ms += 50) pacingEnergyStep(e, 0.4, 50)
    for (let ms = 0; ms < PACING_RANGE_TAU_MS * 6; ms += 50) pacingEnergyStep(e, 0.4, 50)
    expect(pacingIntensity(e)).toBe(0.5)
  })

  it('does not move on a rewound clock', () => {
    const e = blankPacingEnergy()
    pacingEnergyStep(e, 1, -5000)
    expect(e).toEqual(blankPacingEnergy())
  })
})

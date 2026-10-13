import { describe, expect, it } from 'vitest'
import {
  PARTICLE_MIN_GAP_MS, SILENCE_ATTACK_RATE, SILENCE_ENERGY_FLOOR, SILENCE_RELEASE_RATE,
  silenceFadeStep, silenceFadeTarget,
} from '../playerDynamics'

describe('playerDynamics', () => {
  it('keeps bursts apart by more than one dance-tempo beat', () => {
    // 120 BPM is a 500 ms beat; the gap must swallow at least two of them.
    expect(PARTICLE_MIN_GAP_MS).toBeGreaterThan(1000)
  })

  it('targets black at and below the silence floor and full well above it', () => {
    expect(silenceFadeTarget(0)).toBe(0)
    expect(silenceFadeTarget(SILENCE_ENERGY_FLOOR)).toBe(0)
    expect(silenceFadeTarget(0.5)).toBe(1)
    const half = silenceFadeTarget(SILENCE_ENERGY_FLOOR + 0.09)
    expect(half).toBeGreaterThan(0.4)
    expect(half).toBeLessThan(0.6)
  })

  it('releases slower than it attacks', () => {
    expect(SILENCE_RELEASE_RATE).toBeLessThan(SILENCE_ATTACK_RATE)
    const down = 1 - silenceFadeStep(1, 0)
    const up = silenceFadeStep(0, 1)
    expect(down).toBeCloseTo(SILENCE_RELEASE_RATE)
    expect(up).toBeCloseTo(SILENCE_ATTACK_RATE)
  })

  it('settles on its target', () => {
    let fade = 1
    for (let i = 0; i < 200; i++) fade = silenceFadeStep(fade, 0)
    expect(fade).toBeLessThan(0.001)
    for (let i = 0; i < 200; i++) fade = silenceFadeStep(fade, 1)
    expect(fade).toBeGreaterThan(0.999)
  })
})

import { describe, expect, it } from 'vitest'
import {
  PARTICLE_REST_MS, PARTICLE_VOLLEY_BURSTS, SILENCE_ATTACK_RATE, SILENCE_ENERGY_FLOOR, SILENCE_RELEASE_RATE,
  blankParticleVolley, particleEnergyGate, particleEnergyPasses, particleRestMs, particleVolleyBursts, particleVolleyFire,
  silenceFadeStep, silenceFadeTarget,
} from '../playerDynamics'

const DEFAULT_SPACING = { volleyBursts: PARTICLE_VOLLEY_BURSTS, restMs: PARTICLE_REST_MS }

describe('particle volleys', () => {
  // Beats at 120 BPM.
  const beats = (count: number, from = 0) => Array.from({ length: count }, (_, i) => from + i * 500)

  it('fires a few beats in a row, then rests for seconds', () => {
    const volley = blankParticleVolley()
    const fired = beats(20).map((ms) => particleVolleyFire(volley, ms, DEFAULT_SPACING))
    // The first volley fires at once, one burst per beat.
    expect(fired.slice(0, PARTICLE_VOLLEY_BURSTS)).toEqual(Array(PARTICLE_VOLLEY_BURSTS).fill(true))
    // Then nothing until the rest has passed since the volley's last burst.
    const lastBurstMs = (PARTICLE_VOLLEY_BURSTS - 1) * 500
    const restBeats = fired.slice(PARTICLE_VOLLEY_BURSTS).filter((_, i) =>
      (PARTICLE_VOLLEY_BURSTS + i) * 500 - lastBurstMs < PARTICLE_REST_MS)
    expect(restBeats).toEqual(Array(restBeats.length).fill(false))
    expect(restBeats.length).toBeGreaterThanOrEqual(7)
    // And the next volley follows.
    expect(fired.filter(Boolean).length).toBeGreaterThanOrEqual(PARTICLE_VOLLEY_BURSTS * 2)
  })

  it('rests for seconds, not beats', () => {
    expect(PARTICLE_REST_MS).toBeGreaterThanOrEqual(3000)
  })

  it('starts a fresh volley when the clock goes backwards', () => {
    const volley = blankParticleVolley()
    for (const ms of beats(PARTICLE_VOLLEY_BURSTS)) particleVolleyFire(volley, ms, DEFAULT_SPACING)
    expect(particleVolleyFire(volley, PARTICLE_VOLLEY_BURSTS * 500, DEFAULT_SPACING)).toBe(false)
    // A new track rewinds to zero: its first beat bursts.
    expect(particleVolleyFire(volley, 0, DEFAULT_SPACING)).toBe(true)
  })

  it("follows the node's bursts in a row and rest", () => {
    const volley = blankParticleVolley()
    const spacing = { volleyBursts: 1, restMs: 1200 }
    const fired = beats(8).map((ms) => particleVolleyFire(volley, ms, spacing))
    // One burst, then rest until 1.2 s after it: beats at 1.5, 3.0 s fire.
    expect(fired).toEqual([true, false, false, true, false, false, true, false])
  })

  it('bursts on every beat with no rest', () => {
    const volley = blankParticleVolley()
    expect(beats(6).map((ms) => particleVolleyFire(volley, ms, { volleyBursts: 2, restMs: 0 })))
      .toEqual(Array(6).fill(true))
  })

  it('normalises stored bursts in a row and rest', () => {
    expect(particleVolleyBursts(undefined)).toBe(PARTICLE_VOLLEY_BURSTS)
    expect(particleVolleyBursts(0)).toBe(1)
    expect(particleVolleyBursts(99)).toBe(8)
    expect(particleVolleyBursts('nope')).toBe(PARTICLE_VOLLEY_BURSTS)
    expect(particleRestMs(undefined)).toBe(PARTICLE_REST_MS)
    expect(particleRestMs(-2)).toBe(0)
    expect(particleRestMs(2.5)).toBe(2500)
    expect(particleRestMs(60)).toBe(30000)
  })

  it('lets a beat burst only at or above the energy gate', () => {
    expect(particleEnergyPasses(0.1, 0)).toBe(true)
    expect(particleEnergyPasses(0.1, 0.3)).toBe(false)
    expect(particleEnergyPasses(0.3, 0.3)).toBe(true)
    // Unknown energy (no audio wired) never blocks.
    expect(particleEnergyPasses(null, 0.9)).toBe(true)
    expect(particleEnergyGate(undefined)).toBe(0)
    expect(particleEnergyGate(2)).toBe(1)
    expect(particleEnergyGate('x')).toBe(0)
  })
})

describe('silence fade', () => {
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
    expect(1 - silenceFadeStep(1, 0)).toBeCloseTo(SILENCE_RELEASE_RATE)
    expect(silenceFadeStep(0, 1)).toBeCloseTo(SILENCE_ATTACK_RATE)
  })

  it('settles on its target', () => {
    let fade = 1
    for (let i = 0; i < 200; i++) fade = silenceFadeStep(fade, 0)
    expect(fade).toBeLessThan(0.001)
    for (let i = 0; i < 200; i++) fade = silenceFadeStep(fade, 1)
    expect(fade).toBeGreaterThan(0.999)
  })
})

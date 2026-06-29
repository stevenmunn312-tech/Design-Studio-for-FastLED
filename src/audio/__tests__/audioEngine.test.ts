import { describe, expect, it } from 'vitest'
import { averageFrequencyBand, logarithmicSpectrum, applyNoiseGate } from '../audioEngine'
import {
  createBeatDetectorState,
  denormalizeBeatParam,
  updateBeatDetectorFromSpectrum,
} from '../beatDetection'

describe('audioEngine FFT helpers', () => {
  it('selects bands using the actual sample rate', () => {
    const data = new Uint8Array(256)
    // 48 kHz / 512 = 93.75 Hz per bin; bin 2 is 187.5 Hz (bass).
    data[2] = 255
    expect(averageFrequencyBand(data, 48_000, 512, 30, 250)).toBeGreaterThan(0)
    expect(averageFrequencyBand(data, 48_000, 512, 250, 2_000)).toBe(0)
  })

  it('builds a low-to-high logarithmic spectrum at the requested resolution', () => {
    const data = new Uint8Array(256)
    data[1] = 255
    const spectrum = logarithmicSpectrum(data, 48_000, 512, 24)
    expect(spectrum).toHaveLength(24)
    expect(Math.max(...spectrum.slice(0, 8))).toBeGreaterThan(0)
    expect(Math.max(...spectrum.slice(16))).toBe(0)
  })

  it('suppresses values at or below the ambient floor', () => {
    const quiet = applyNoiseGate(0.05, { floor: 0.04, level: 0 }, { threshold: 0.08, attack: 0.2, decay: 0.05 })
    const loud = applyNoiseGate(0.5, { floor: 0.04, level: 0.4 }, { threshold: 0.08, attack: 0.2, decay: 0.05 })
    expect(quiet.level).toBe(0)
    expect(loud.level).toBeGreaterThan(0.4)
  })

  it('detects a beat from a rising spectral-flux peak and smooths BPM', () => {
    let state = createBeatDetectorState()
    state = updateBeatDetectorFromSpectrum([0.02, 0.01, 0, 0], 0, state).state
    state = updateBeatDetectorFromSpectrum([0.04, 0.03, 0.01, 0], 250, state).state
    state = updateBeatDetectorFromSpectrum([0.10, 0.08, 0.03, 0.01], 500, state).state
    const hit = updateBeatDetectorFromSpectrum([0.26, 0.22, 0.10, 0.03], 750, state, {
      threshold: 0.035,
      attack: 0.55,
      decay: 0.12,
    })
    expect(hit.beat).toBe(true)
    expect(hit.bpm).toBeGreaterThan(100)
  })

  it('maps the BeatDetect sliders from 0..1 into their tuned ranges', () => {
    expect(denormalizeBeatParam('threshold', 0)).toBe(0)
    expect(denormalizeBeatParam('threshold', 1)).toBeCloseTo(0.25)
    expect(denormalizeBeatParam('attack', 0)).toBeCloseTo(0.02)
    expect(denormalizeBeatParam('attack', 1)).toBeCloseTo(0.8)
    expect(denormalizeBeatParam('decay', 0)).toBeCloseTo(0.01)
    expect(denormalizeBeatParam('decay', 1)).toBeCloseTo(0.5)
  })
})

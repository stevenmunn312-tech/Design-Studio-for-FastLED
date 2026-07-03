import { describe, it, expect } from 'vitest'
import {
  sampleEnvelope,
  bandsToSpectrum,
  showAudioOverride,
  BASS_BIN_END,
  MID_BIN_END,
  SPECTRUM_BINS,
} from '../showAudio'

describe('showAudio envelope sampling', () => {
  it('linearly interpolates the envelope at a playback position', () => {
    const env = { rateHz: 10, bass: [0, 1], mids: [0, 0], treble: [0, 0] } // frame every 100ms
    expect(sampleEnvelope(env, 0).bass).toBe(0)
    expect(sampleEnvelope(env, 50).bass).toBeCloseTo(0.5) // halfway between frame 0 and 1
    expect(sampleEnvelope(env, 100).bass).toBe(1)
    expect(sampleEnvelope(env, 999).bass).toBe(1) // clamps past the end
  })

  it('maps the three bands onto the firmware bin layout', () => {
    const spec = bandsToSpectrum(0.2, 0.5, 0.9)
    expect(spec).toHaveLength(SPECTRUM_BINS)
    expect(spec[0]).toBe(0.2)
    expect(spec[BASS_BIN_END - 1]).toBe(0.2)
    expect(spec[BASS_BIN_END]).toBe(0.5)
    expect(spec[MID_BIN_END - 1]).toBe(0.5)
    expect(spec[MID_BIN_END]).toBe(0.9)
    expect(spec[SPECTRUM_BINS - 1]).toBe(0.9)
  })

  it('returns null when the show carries no envelope', () => {
    expect(showAudioOverride(undefined, 0)).toBeNull()
    expect(showAudioOverride({ rateHz: 50, bass: [], mids: [], treble: [] }, 0)).toBeNull()
  })

  it('builds an active override from the envelope', () => {
    const env = { rateHz: 10, bass: [0.4], mids: [0.6], treble: [0.8] }
    const o = showAudioOverride(env, 0)!
    expect(o.active).toBe(true)
    expect(o.micActive).toBe(true)
    expect(o.micBass).toBeCloseTo(0.4)
    expect(o.micMids).toBeCloseTo(0.6)
    expect(o.micTreble).toBeCloseTo(0.8)
    expect(o.detectorSpectrum[0]).toBeCloseTo(0.4) // bass bin
    expect(o.detectorSpectrum[SPECTRUM_BINS - 1]).toBeCloseTo(0.8) // treble bin
  })
})

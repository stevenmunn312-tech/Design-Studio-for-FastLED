import { describe, it, expect } from 'vitest'
import {
  sampleEnvelope,
  bandsToSpectrum,
  showAudioSpectrum,
  showAudioOverride,
  BASS_BIN_END,
  MID_BIN_END,
  SPECTRUM_BINS,
} from '../showAudio'
import type { AudioEnvelope } from '../../../types/showFile'
import { encodeSpectrumBytes, SPECTRUM_TRACK_BINS } from '../../../audio/spectrumTrack'

// Equalizer frames as base64; each frame is SPECTRUM_TRACK_BINS bytes.
function spectrum(frames: number[][]): string {
  const bytes = new Uint8Array(frames.length * SPECTRUM_TRACK_BINS)
  frames.forEach((frame, k) => frame.forEach((v, b) => { bytes[k * SPECTRUM_TRACK_BINS + b] = v }))
  return encodeSpectrumBytes(bytes)
}

// A mono envelope whose level rail and spectrum are silent unless a test supplies them.
function envelope(
  rateHz: number, bass: number[], mids: number[], treble: number[],
  level = bass.map(() => 0), eq: number[][] = bass.map(() => []),
): AudioEnvelope {
  return {
    version: 3, rateHz, bass, mids, treble, leftLevel: level, rightLevel: level, channelCount: 1,
    spectrum: spectrum(eq),
  }
}

describe('showAudio envelope sampling', () => {
  it('linearly interpolates the envelope at a playback position', () => {
    const env = envelope(10, [0, 1], [0, 0], [0, 0]) // frame every 100ms
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
    expect(showAudioSpectrum(undefined, 0)).toBeNull()
    expect(showAudioOverride(undefined, 0)).toBeNull()
    expect(showAudioSpectrum(envelope(50, [], [], []), 0)).toBeNull()
    expect(showAudioOverride(envelope(50, [], [], []), 0)).toBeNull()
  })

  it('builds the preview spectrum from the baked equalizer bins, two slots per bin', () => {
    // Bin b reads 16b; the bands disagree with it so a band fill would show.
    const eq = [Array.from({ length: SPECTRUM_TRACK_BINS }, (_, b) => 16 * b)]
    const spectrum = showAudioSpectrum(envelope(10, [1], [1], [1], [0], eq), 0)!
    expect(spectrum).toHaveLength(SPECTRUM_BINS)
    expect(spectrum[0]).toBe(0)
    expect(spectrum[1]).toBe(0)
    expect(spectrum[2]).toBeCloseTo(16 / 255)
    expect(spectrum[SPECTRUM_BINS - 1]).toBeCloseTo(240 / 255)
  })

  it('interpolates the baked bins between frames', () => {
    const env = envelope(10, [0, 0], [0, 0], [0, 0], [0, 0], [[0], [200]])
    expect(showAudioSpectrum(env, 50)![0]).toBeCloseTo(100 / 255)
  })

  it('builds an active override from the envelope', () => {
    const env = envelope(10, [0.4], [0.6], [0.8], [0.6], [[51, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 204]])
    const o = showAudioOverride(env, 0)!
    expect(o.active).toBe(true)
    expect(o.micActive).toBe(true)
    expect(o.micBass).toBeCloseTo(0.4)
    expect(o.micMids).toBeCloseTo(0.6)
    expect(o.micTreble).toBeCloseTo(0.8)
    expect(o.detectorSpectrum[0]).toBeCloseTo(0.2) // lowest equalizer bin
    expect(o.detectorSpectrum[SPECTRUM_BINS - 1]).toBeCloseTo(0.8) // highest equalizer bin
    expect(o.leftLevel).toBeCloseTo(0.6)
    expect(o.rightLevel).toBeCloseTo(0.6)
    expect(o.channelCount).toBe(1)
  })

  it('retains baked stereo levels and labels mono mirrors honestly', () => {
    const stereo = showAudioOverride({
      version: 3, rateHz: 10,
      bass: [0.2, 0.2], mids: [0.3, 0.3], treble: [0.4, 0.4],
      leftLevel: [0.8, 0.6], rightLevel: [0.2, 0.4], channelCount: 2, spectrum: '',
    }, 50)!
    expect(stereo.leftLevel).toBeCloseTo(0.7)
    expect(stereo.rightLevel).toBeCloseTo(0.3)
    expect(stereo.channelCount).toBe(2)

    const mono = showAudioOverride({
      version: 3, rateHz: 10,
      bass: [0], mids: [0], treble: [0],
      leftLevel: [0.45], rightLevel: [0.45], channelCount: 1, spectrum: '',
    }, 0)!
    expect(mono.leftLevel).toBeCloseTo(0.45)
    expect(mono.rightLevel).toBeCloseTo(0.45)
    expect(mono.channelCount).toBe(1)
  })
})

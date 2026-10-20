import { describe, expect, it } from 'vitest'
import { analyzeSongSamples, detectKey, SPECTRUM_RATE_HZ } from '../fastledSongAnalysis'
import { spectrumBytes, SPECTRUM_TRACK_BINS } from '../spectrumTrack'

const SR = 44100

/** Decaying noise bursts on a steady grid, starting at `offsetS`. */
function clickTrack(bpm: number, seconds: number, offsetS = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  let seed = 1
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x3fffffff - 1
  }
  const period = 60 / bpm
  for (let t = offsetS; t < seconds; t += period) {
    const start = Math.round(t * SR)
    for (let i = 0; i < 2000 && start + i < out.length; i++) out[start + i] += 0.8 * noise() * Math.exp(-i / 300)
  }
  return out
}

/** A sustained triad of sine partials. */
function chord(midiNotes: number[], seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  for (const midi of midiNotes) {
    const hz = 440 * 2 ** ((midi - 69) / 12)
    for (let i = 0; i < out.length; i++) out[i] += 0.2 * Math.sin((2 * Math.PI * hz * i) / SR)
  }
  return out
}

describe('fastledSongAnalysis', () => {
  it('tracks a steady grid at its tempo and phase', () => {
    const mono = clickTrack(128, 30)
    const a = analyzeSongSamples(mono, SR, 30_000, 'clicks')
    expect(a.beats.bpm).toBe(128)
    const period = 60_000 / 128
    const beats = a.beats.timestamps
    expect(beats.length).toBeGreaterThan(55)
    for (const t of beats) {
      const phase = ((t - 500) % period + period) % period
      expect(Math.min(phase, period - phase)).toBeLessThan(25)
    }
  })

  it('prefers the beat to its double or half for fast music', () => {
    const a = analyzeSongSamples(clickTrack(145, 30), SR, 30_000, 'psy')
    expect(a.beats.bpm).toBe(145)
  })

  it('names the key of a sustained minor triad', () => {
    // A minor: A3, C4, E4, with the root doubled an octave down.
    expect(detectKey(chord([45, 57, 60, 64], 6), SR)).toEqual({ key: 'A', scale: 'minor' })
    expect(detectKey(chord([48, 60, 64, 67], 6), SR)).toEqual({ key: 'C', scale: 'major' })
  })

  it('bakes equalizer bins that follow the song from low to high', () => {
    // 3 s of a 100 Hz tone, then 3 s of 2 kHz.
    const mono = new Float32Array(SR * 6)
    for (let i = 0; i < mono.length; i++) {
      const hz = i < SR * 3 ? 100 : 2000
      mono[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / SR)
    }
    const a = analyzeSongSamples(mono, SR, 6000, 'sweep')
    expect(a.spectrum.rateHz).toBe(SPECTRUM_RATE_HZ)
    const bytes = spectrumBytes(a.spectrum, a.spectrum.data)
    expect(bytes.length).toBe(6 * SPECTRUM_RATE_HZ * SPECTRUM_TRACK_BINS)
    const frame = (s: number) => bytes.subarray(s * SPECTRUM_RATE_HZ * SPECTRUM_TRACK_BINS, (s * SPECTRUM_RATE_HZ + 1) * SPECTRUM_TRACK_BINS)
    const loudest = (f: Uint8Array) => f.indexOf(Math.max(...f))
    expect(loudest(frame(2))).toBeLessThan(3)
    expect(loudest(frame(5))).toBeGreaterThan(10)
  })

  it('returns an empty but well-formed analysis for silence', () => {
    const a = analyzeSongSamples(new Float32Array(SR * 5), SR, 5000, 'silence')
    expect(a.energy.every((p) => Number.isFinite(p.overall))).toBe(true)
    expect(Number.isFinite(a.mood.energy)).toBe(true)
    expect(a.mood.key).toBe('C major')
  })
})

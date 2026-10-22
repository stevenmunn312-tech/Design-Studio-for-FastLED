import { describe, expect, it } from 'vitest'
import { analyzeSongSamples, bakeDetectorTracks, SPECTRUM_RATE_HZ } from '../fastledSongAnalysis'
import {
  decodePitchRecord, decodeStructureRecord, decodeVibeRecord, detectorBytes, detectorFrameCount,
  PITCH_RECORD_BYTES, STRUCTURE_RECORD_BYTES, VIBE_RECORD_BYTES,
} from '../detectorTrack'

const SR = 44100

/** Silence, then a tone burst at 80% scale from `onS` to `offS`. */
function toneBurst(seconds: number, onS: number, offS: number, hz = 440): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  for (let i = Math.round(onS * SR); i < Math.min(out.length, Math.round(offS * SR)); i++) {
    out[i] = 0.8 * Math.sin((2 * Math.PI * hz * i) / SR)
  }
  return out
}

describe('bakeDetectorTracks', () => {
  it('bakes one record per envelope frame for each detector and is deterministic', () => {
    const mono = toneBurst(2, 0.5, 1.5)
    const a = bakeDetectorTracks(mono, SR)
    const b = bakeDetectorTracks(mono, SR)
    expect(a.rateHz).toBe(SPECTRUM_RATE_HZ)
    expect(a).toEqual(b)
    const frames = Math.ceil(2 * SPECTRUM_RATE_HZ)
    expect(detectorFrameCount(detectorBytes(a, 'vibe', a.vibe!), 'vibe')).toBe(frames)
    expect(detectorFrameCount(detectorBytes(a, 'structure', a.structure!), 'structure')).toBe(frames)
    expect(detectorFrameCount(detectorBytes(a, 'pitch', a.pitch!), 'pitch')).toBe(frames)
  })

  it('hears the tone burst: one Pitch note-on, A4 held, and a Vibe spike at the onset', () => {
    const tracks = bakeDetectorTracks(toneBurst(2, 0.5, 1.5), SR)
    const pitch = detectorBytes(tracks, 'pitch', tracks.pitch!)
    const vibe = detectorBytes(tracks, 'vibe', tracks.vibe!)
    const frames = detectorFrameCount(pitch, 'pitch')
    const pitchAt = (k: number) => decodePitchRecord(pitch, k * PITCH_RECORD_BYTES)
    const vibeAt = (k: number) => decodeVibeRecord(vibe, k * VIBE_RECORD_BYTES)
    // Silence before the burst: no note, no key, and Vibe's silence envelope
    // (seeded at 1.0 like the C++) decaying towards 0.
    expect(pitchAt(10).note).toBe(0)
    expect(pitchAt(10).keyConfidence).toBe(0)
    expect(vibeAt(10).bass).toBeLessThan(1)
    expect(vibeAt(20).bass).toBeLessThan(vibeAt(10).bass)
    // Mid-burst (1.0 s = frame 50): A4 at a whole-lag 440 Hz, voiced.
    const held = pitchAt(50)
    expect(held.note).toBe(69)
    expect(held.hz).toBeGreaterThan(430)
    expect(held.hz).toBeLessThan(450)
    expect(held.confidence).toBeGreaterThan(0.5)
    // Exactly one note-on across the whole burst, on the frame it starts (the
    // chunk straddling the onset is stamped at its start, as a live chunk is).
    const noteOns = Array.from({ length: frames }, (_, k) => k).filter((k) => pitchAt(k).noteOn)
    expect(noteOns).toHaveLength(1)
    expect(noteOns[0]).toBeGreaterThanOrEqual(24)
    expect(noteOns[0]).toBeLessThan(30)
    // Vibe: the onset reads above its smoothed copy in the band it lands in.
    const onset = Array.from({ length: 6 }, (_, i) => vibeAt(25 + i))
    expect(onset.some((v) => v.midSpike || v.bassSpike || v.trebleSpike)).toBe(true)
    expect(vibeAt(50).mid).toBeGreaterThan(0)
    expect(vibeAt(50).volume).toBeCloseTo((vibeAt(50).bass + vibeAt(50).mid + vibeAt(50).treble) / 3)
    // Structure records are present and well formed through the burst.
    const structure = detectorBytes(tracks, 'structure', tracks.structure!)
    const mid = decodeStructureRecord(structure, 50 * STRUCTURE_RECORD_BYTES)
    expect(mid.arousal).toBeGreaterThanOrEqual(0)
    expect(mid.arousal).toBeLessThanOrEqual(1)
  })

  it('analyzeSongSamples carries the baked tracks beside the spectrum', () => {
    const a = analyzeSongSamples(toneBurst(1, 0.2, 0.8), SR, 1000, 'burst')
    expect(a.detectors?.rateHz).toBe(SPECTRUM_RATE_HZ)
    expect(typeof a.detectors?.vibe).toBe('string')
    expect(typeof a.detectors?.structure).toBe('string')
    expect(typeof a.detectors?.pitch).toBe('string')
  })
})

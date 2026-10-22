import { describe, expect, it } from 'vitest'
import { generateShow, showFileToBinary } from '../performanceGenerator'
import type { SongAnalysis } from '../../types/showFile'
import { encodeSpectrumBytes, SPECTRUM_TRACK_BINS } from '../../audio/spectrumTrack'
import {
  encodeDetectorBytes, encodePitchRecord, encodeStructureRecord, encodeVibeRecord, detectorBytes,
  PITCH_RECORD_BYTES, STRUCTURE_RECORD_BYTES, VIBE_RECORD_BYTES, type DetectorTracks,
} from '../../audio/detectorTrack'

// A two-second analysis with an energy track, so generateShow bakes an envelope.
const withEnergy: SongAnalysis = {
  title: 'E', durationMs: 2000,
  beats: { timestamps: [], bpm: 120, confidence: 0.9 },
  energy: [
    { t: 0, bass: 0, mids: 0.2, treble: 0.4, overall: 0.2 },
    { t: 1000, bass: 1, mids: 0.6, treble: 0.8, overall: 0.8 },
    { t: 2000, bass: 0.5, mids: 0.5, treble: 0.5, overall: 0.5 },
  ],
  sections: [{ startMs: 0, endMs: 2000, type: 'drop', energy: 0.8 }],
  mood: { energy: 0.7, valence: 0.6, key: 'C major' },
  spectrum: { rateHz: 50, data: encodeSpectrumBytes(new Uint8Array(100 * SPECTRUM_TRACK_BINS)) },
  channelLevels: [],
  channelCount: 1,
}

/** Detector tracks at `rateHz` for `frames` frames: vibe bass k/32, beat number k, hz k, a downbeat every tenth frame. */
function detectorTracks(rateHz: number, frames: number, blocks: ('vibe' | 'structure' | 'pitch')[] = ['vibe', 'structure', 'pitch']): DetectorTracks {
  const vibe = new Uint8Array(frames * VIBE_RECORD_BYTES)
  const structure = new Uint8Array(frames * STRUCTURE_RECORD_BYTES)
  const pitch = new Uint8Array(frames * PITCH_RECORD_BYTES)
  for (let k = 0; k < frames; k++) {
    encodeVibeRecord({
      bass: k / 32, mid: 1, treble: 1, volume: 1, bassAtt: 1, midAtt: 1, trebleAtt: 1,
      bassSpike: false, midSpike: false, trebleSpike: false,
    }, vibe, k * VIBE_RECORD_BYTES)
    encodeStructureRecord({
      downbeat: k % 10 === 0, beatNumber: k, measurePhase: 0, building: false, buildupProgress: 0,
      drop: false, dropImpact: 0, tempoStable: true, valence: 0, arousal: 0,
    }, structure, k * STRUCTURE_RECORD_BYTES)
    encodePitchRecord({
      hz: k, note: 0, noteOn: false, velocity: 0, confidence: 0, keyRoot: 0, keyMinor: false, keyConfidence: 0,
    }, pitch, k * PITCH_RECORD_BYTES)
  }
  return {
    rateHz,
    ...(blocks.includes('vibe') ? { vibe: encodeDetectorBytes(vibe) } : {}),
    ...(blocks.includes('structure') ? { structure: encodeDetectorBytes(structure) } : {}),
    ...(blocks.includes('pitch') ? { pitch: encodeDetectorBytes(pitch) } : {}),
  }
}

/** Byte offset just past the AENV trailer's fixed header: at the first level byte. */
function envelopeBodyOffset(view: DataView): { off: number; frames: number } {
  let off = 15
  const count = view.getUint32(11, true)
  for (let i = 0; i < count; i++) { off += 5; const pc = view.getUint8(off); off += 1 + pc * 4 }
  expect(String.fromCharCode(...new Uint8Array(view.buffer, off, 4))).toBe('AENV')
  off += 7
  const frames = view.getUint32(off, true)
  off += 5
  return { off, frames }
}

describe('bakeEnvelope + ADET trailer', () => {
  it('carries the analysis detectors at the envelope frames and writes them after the envelope', () => {
    const show = generateShow({ ...withEnergy, detectors: detectorTracks(50, 100) })
    const env = show.audio!
    expect(env.bass).toHaveLength(100)
    expect(typeof env.vibe).toBe('string')
    expect(typeof env.structure).toBe('string')
    expect(typeof env.pitch).toBe('string')
    expect(detectorBytes(env, 'vibe', env.vibe!)[50 * VIBE_RECORD_BYTES]).toBe(50)

    const view = new DataView(showFileToBinary(show))
    const body = envelopeBodyOffset(view)
    const frames = body.frames
    let off = body.off + frames * (5 + SPECTRUM_TRACK_BINS)
    expect(String.fromCharCode(...new Uint8Array(view.buffer, off, 4))).toBe('ADET')
    off += 4
    expect(view.getUint8(off++)).toBe(1)                // trailer version
    expect(view.getUint8(off++)).toBe(1 | 2 | 4)        // vibe, structure, pitch
    expect(view.getUint32(off, true)).toBe(frames); off += 4
    // Blocks in flag order, each frames × record bytes, nothing trailing.
    expect(view.byteLength).toBe(off + frames * (VIBE_RECORD_BYTES + STRUCTURE_RECORD_BYTES + PITCH_RECORD_BYTES))
    expect(view.getUint8(off + 50 * VIBE_RECORD_BYTES)).toBe(50)                       // vibe bass of frame 50
    const structureOff = off + frames * VIBE_RECORD_BYTES
    expect(view.getUint8(structureOff + 50 * STRUCTURE_RECORD_BYTES + 1)).toBe(50)     // beat number of frame 50
    expect(view.getUint8(structureOff + 50 * STRUCTURE_RECORD_BYTES)).toBe(1 | 8)      // downbeat + tempo stable
    const pitchOff = structureOff + frames * STRUCTURE_RECORD_BYTES
    expect(view.getUint8(pitchOff + 50 * PITCH_RECORD_BYTES)).toBe(50)                 // hz low byte of frame 50
  })

  it('resamples a track baked at another rate onto the envelope frames, each downbeat once', () => {
    const show = generateShow({ ...withEnergy, detectors: detectorTracks(100, 200) })
    const env = show.audio!
    const structure = detectorBytes(env, 'structure', env.structure!)
    expect(structure.length).toBe(100 * STRUCTURE_RECORD_BYTES)
    expect(structure[10 * STRUCTURE_RECORD_BYTES + 1]).toBe(21)   // frame 10 holds source frame 21
    const downbeats = Array.from({ length: 100 }, (_, k) => structure[k * STRUCTURE_RECORD_BYTES] & 1).filter(Boolean)
    expect(downbeats).toHaveLength(20)                             // every tenth source frame, none doubled
  })

  it('writes only the blocks the analysis has, and no trailer at all without any', () => {
    const show = generateShow({ ...withEnergy, detectors: detectorTracks(50, 100, ['structure']) })
    expect(show.audio!.vibe).toBeUndefined()
    expect(show.audio!.pitch).toBeUndefined()
    const view = new DataView(showFileToBinary(show))
    const body = envelopeBodyOffset(view)
    const off = body.off + body.frames * (5 + SPECTRUM_TRACK_BINS)
    expect(String.fromCharCode(...new Uint8Array(view.buffer, off, 4))).toBe('ADET')
    expect(view.getUint8(off + 5)).toBe(2)
    expect(view.byteLength).toBe(off + 10 + body.frames * STRUCTURE_RECORD_BYTES)

    const bare = new DataView(showFileToBinary(generateShow(withEnergy)))
    const bareBody = envelopeBodyOffset(bare)
    expect(bare.byteLength).toBe(bareBody.off + bareBody.frames * (5 + SPECTRUM_TRACK_BINS))
  })
})

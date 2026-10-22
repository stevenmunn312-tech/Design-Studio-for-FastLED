import { describe, it, expect } from 'vitest'
import { createShowDetectorCursor, showAudioOverride, showDetectorSignals } from '../showAudio'
import type { AudioEnvelope } from '../../../types/showFile'
import { encodeSpectrumBytes, SPECTRUM_TRACK_BINS } from '../../../audio/spectrumTrack'
import {
  encodeDetectorBytes, encodePitchRecord, encodeStructureRecord, encodeVibeRecord,
  PITCH_RECORD_BYTES, STRUCTURE_RECORD_BYTES, VIBE_RECORD_BYTES,
} from '../../../audio/detectorTrack'
import type { PitchSignal, SongStructureSignal, VibeSignal } from '../../evaluator/types'

const VIBE0: VibeSignal = {
  bass: 0, mid: 0, treble: 0, volume: 0, bassAtt: 0, midAtt: 0, trebleAtt: 0,
  bassSpike: false, midSpike: false, trebleSpike: false,
}
const STRUCTURE0: SongStructureSignal = {
  downbeat: false, beatNumber: 0, measurePhase: 0, building: false, buildupProgress: 0,
  drop: false, dropImpact: 0, tempoStable: false, valence: 0, arousal: 0,
}
const PITCH0: PitchSignal = {
  hz: 0, note: 0, noteOn: false, velocity: 0, confidence: 0, keyRoot: 0, keyMinor: false, keyConfidence: 0,
}

/** A silent mono 50 Hz envelope of `frames` frames with no detector block. */
function plainEnvelope(frames: number): AudioEnvelope {
  const zeros = Array.from({ length: frames }, () => 0)
  return {
    version: 3, rateHz: 50, bass: zeros, mids: zeros, treble: zeros, leftLevel: zeros, rightLevel: zeros, channelCount: 1,
    spectrum: encodeSpectrumBytes(new Uint8Array(frames * SPECTRUM_TRACK_BINS)),
  }
}

/** The same envelope with every detector block, built per frame. */
function bakedEnvelope(
  frames: number,
  vibeAt: (k: number) => VibeSignal,
  structureAt: (k: number) => SongStructureSignal,
  pitchAt: (k: number) => PitchSignal,
): AudioEnvelope {
  const vibe = new Uint8Array(frames * VIBE_RECORD_BYTES)
  const structure = new Uint8Array(frames * STRUCTURE_RECORD_BYTES)
  const pitch = new Uint8Array(frames * PITCH_RECORD_BYTES)
  for (let k = 0; k < frames; k++) {
    encodeVibeRecord(vibeAt(k), vibe, k * VIBE_RECORD_BYTES)
    encodeStructureRecord(structureAt(k), structure, k * STRUCTURE_RECORD_BYTES)
    encodePitchRecord(pitchAt(k), pitch, k * PITCH_RECORD_BYTES)
  }
  return {
    ...plainEnvelope(frames),
    vibe: encodeDetectorBytes(vibe),
    structure: encodeDetectorBytes(structure),
    pitch: encodeDetectorBytes(pitch),
  }
}

describe('showAudio baked detectors', () => {
  it('leaves the detector fields absent on an envelope baked without them', () => {
    const o = showAudioOverride(plainEnvelope(1), 0)!
    expect(o.active).toBe(true)
    expect(o.vibe).toBeUndefined()
    expect(o.structure).toBeUndefined()
    expect(o.pitch).toBeUndefined()
    expect(showDetectorSignals(plainEnvelope(1), 0)).toEqual({})
  })

  it('serves the baked signals of the frame holding the position, without interpolation', () => {
    const env = bakedEnvelope(
      3,
      (k) => ({ ...VIBE0, bass: 1 + k, mid: 2, treble: 0.5, bassSpike: k === 1 }),
      (k) => ({ ...STRUCTURE0, beatNumber: k + 1, measurePhase: k / 2, valence: -0.5 }),
      (k) => ({ ...PITCH0, hz: 440 + 10 * k, note: 69, velocity: 1, confidence: 0.8, keyRoot: 2, keyConfidence: 0.7 }),
    )
    const at = (ms: number) => showAudioOverride(env, ms)!
    expect(at(0).vibe!.bass).toBe(1)
    expect(at(25).vibe!.bass).toBe(2)           // frame 1 holds 20-40 ms
    expect(at(25).vibe!.bassSpike).toBe(true)
    expect(at(25).vibe!.volume).toBeCloseTo((2 + 2 + 0.5) / 3)
    expect(at(45).vibe!.bass).toBe(3)
    expect(at(999).vibe!.bass).toBe(3)          // clamps past the end
    expect(at(25).structure!.beatNumber).toBe(2)
    expect(at(25).structure!.measurePhase).toBeCloseTo(0.5, 2)
    expect(at(25).structure!.valence).toBeCloseTo(-0.5, 2)
    expect(at(45).pitch!.hz).toBe(460)
    expect(at(45).pitch!.keyRoot).toBe(2)
    expect(at(45).pitch!.keyConfidence).toBeCloseTo(0.7, 2)
  })

  it('fires downbeat, drop and noteOn once per flagged frame across 60 fps samples of the 50 Hz bake', () => {
    // Frames 0 and 5 are flagged; at 60 fps both are served twice (0 and 16.7 ms, 100 and 116.7 ms).
    const flagged = (k: number) => k === 0 || k === 5
    const env = bakedEnvelope(
      12,
      () => VIBE0,
      (k) => ({ ...STRUCTURE0, downbeat: flagged(k), drop: k === 5 }),
      (k) => ({ ...PITCH0, noteOn: flagged(k), note: 60, hz: 262 }),
    )
    const samples = Array.from({ length: 13 }, (_, n) => (n * 1000) / 60)
    const cursor = createShowDetectorCursor()
    let downbeats = 0
    let drops = 0
    let noteOns = 0
    let bare = 0
    for (const ms of samples) {
      const o = showAudioOverride(env, ms, cursor)!
      if (o.structure!.downbeat) downbeats++
      if (o.structure!.drop) drops++
      if (o.pitch!.noteOn) noteOns++
      if (showAudioOverride(env, ms)!.structure!.downbeat) bare++
    }
    expect(downbeats).toBe(2)
    expect(drops).toBe(1)
    expect(noteOns).toBe(2)
    expect(bare).toBe(4)   // without the cursor each repeated serve reports the flag again
    // The levels of a repeated frame are still served; only its events are spent.
    expect(showAudioOverride(env, 110, cursor)!.pitch!.note).toBe(60)
  })

  it('fires a flagged frame again after a rewind lands on it', () => {
    const env = bakedEnvelope(4, () => VIBE0, (k) => ({ ...STRUCTURE0, downbeat: k === 2 }), () => PITCH0)
    const cursor = createShowDetectorCursor()
    expect(showAudioOverride(env, 50, cursor)!.structure!.downbeat).toBe(true)
    expect(showAudioOverride(env, 70, cursor)!.structure!.downbeat).toBe(false)
    expect(showAudioOverride(env, 45, cursor)!.structure!.downbeat).toBe(true)
  })
})

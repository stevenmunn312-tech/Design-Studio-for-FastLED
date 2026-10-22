import { describe, expect, it } from 'vitest'
import {
  decodePitchRecord, decodeStructureRecord, decodeVibeRecord, detectorBytes, detectorFrameCount,
  encodeDetectorBytes, encodePitchRecord, encodeStructureRecord, encodeVibeRecord,
  PITCH_FLAG_KEY_MINOR, PITCH_FLAG_NOTE_ON, PITCH_NO_KEY, PITCH_RECORD_BYTES, resampleDetectorBytes,
  STRUCTURE_FLAG_BUILDING, STRUCTURE_FLAG_DOWNBEAT, STRUCTURE_FLAG_DROP, STRUCTURE_FLAG_TEMPO_STABLE,
  STRUCTURE_RECORD_BYTES, VIBE_FLAG_BASS_SPIKE, VIBE_FLAG_TREBLE_SPIKE, VIBE_LEVEL_SCALE, VIBE_RECORD_BYTES,
} from '../detectorTrack'
import type { PitchSignal, SongStructureSignal, VibeSignal } from '../../state/evaluator/types'

const vibe: VibeSignal = {
  bass: 1.5, mid: 0.75, treble: 2, volume: 0,
  bassAtt: 1, midAtt: 0.5, trebleAtt: 7.97,
  bassSpike: true, midSpike: false, trebleSpike: true,
}
const structure: SongStructureSignal = {
  downbeat: true, beatNumber: 3, measurePhase: 0.5, building: true, buildupProgress: 0.25,
  drop: false, dropImpact: 0.8, tempoStable: true, valence: -0.5, arousal: 0.6,
}
const pitch: PitchSignal = {
  hz: 440, note: 69, noteOn: true, velocity: 0.5, confidence: 0.9, keyRoot: 9, keyMinor: true, keyConfidence: 0.7,
}

describe('detector records', () => {
  it('lays a Vibe record out as six levels at scale 32 and a spike flags byte', () => {
    const out = new Uint8Array(VIBE_RECORD_BYTES)
    encodeVibeRecord(vibe, out, 0)
    expect([...out]).toEqual([48, 24, 64, 32, 16, 255, VIBE_FLAG_BASS_SPIKE | VIBE_FLAG_TREBLE_SPIKE])
    const back = decodeVibeRecord(out, 0)
    expect(back.bass).toBeCloseTo(1.5)
    expect(back.mid).toBeCloseTo(0.75)
    expect(back.treble).toBe(2)
    expect(back.trebleAtt).toBeCloseTo(255 / VIBE_LEVEL_SCALE)
    // volume is derived: the mean of the three levels.
    expect(back.volume).toBeCloseTo((1.5 + 0.75 + 2) / 3)
    expect(back.bassSpike).toBe(true)
    expect(back.midSpike).toBe(false)
    expect(back.trebleSpike).toBe(true)
  })

  it('clamps a Vibe level above the byte range instead of wrapping', () => {
    const out = new Uint8Array(VIBE_RECORD_BYTES)
    encodeVibeRecord({ ...vibe, bass: 40 }, out, 0)
    expect(out[0]).toBe(255)
  })

  it('lays a Song Structure record out as flags, beat, four x255 bytes, an i8 valence and arousal', () => {
    const out = new Uint8Array(STRUCTURE_RECORD_BYTES)
    encodeStructureRecord(structure, out, 0)
    expect([...out]).toEqual([
      STRUCTURE_FLAG_DOWNBEAT | STRUCTURE_FLAG_BUILDING | STRUCTURE_FLAG_TEMPO_STABLE,
      3, 128, 64, 204, (-63) & 0xff, 153,   // round(-63.5) is -63 in JS
    ])
    const back = decodeStructureRecord(out, 0)
    expect(back).toMatchObject({ downbeat: true, drop: false, building: true, tempoStable: true, beatNumber: 3 })
    expect(back.measurePhase).toBeCloseTo(0.5, 2)
    expect(back.buildupProgress).toBeCloseTo(0.25, 2)
    expect(back.dropImpact).toBeCloseTo(0.8, 2)
    expect(back.valence).toBeCloseTo(-0.5, 2)
    expect(back.arousal).toBeCloseTo(0.6, 2)
  })

  it('lays a Pitch record out as hz u16 LE, note, velocity, confidence, key root, flags and key confidence', () => {
    const out = new Uint8Array(PITCH_RECORD_BYTES)
    encodePitchRecord({ ...pitch, hz: 1000 }, out, 0)
    expect([...out]).toEqual([0xe8, 0x03, 69, 128, 230, 9, PITCH_FLAG_NOTE_ON | PITCH_FLAG_KEY_MINOR, 179])
    const back = decodePitchRecord(out, 0)
    expect(back.hz).toBe(1000)
    expect(back.note).toBe(69)
    expect(back.noteOn).toBe(true)
    expect(back.velocity).toBeCloseTo(0.5, 2)
    expect(back.confidence).toBeCloseTo(0.9, 2)
    expect(back.keyRoot).toBe(9)
    expect(back.keyMinor).toBe(true)
    expect(back.keyConfidence).toBeCloseTo(0.7, 2)
  })

  it('stores no key as root 255 and reads it back as root 0, major, confidence 0', () => {
    const out = new Uint8Array(PITCH_RECORD_BYTES)
    encodePitchRecord({ ...pitch, keyRoot: 9, keyMinor: true, keyConfidence: 0 }, out, 0)
    expect(out[5]).toBe(PITCH_NO_KEY)
    expect(out[6] & PITCH_FLAG_KEY_MINOR).toBe(0)
    expect(out[7]).toBe(0)
    const back = decodePitchRecord(out, 0)
    expect(back.keyRoot).toBe(0)
    expect(back.keyMinor).toBe(false)
    expect(back.keyConfidence).toBe(0)
  })

  it('round-trips a track through base64 and caches the decode per owner', () => {
    const bytes = new Uint8Array(3 * VIBE_RECORD_BYTES)
    for (let k = 0; k < 3; k++) encodeVibeRecord({ ...vibe, bass: k }, bytes, k * VIBE_RECORD_BYTES)
    const owner = { vibe: encodeDetectorBytes(bytes) }
    const decoded = detectorBytes(owner, 'vibe', owner.vibe)
    expect([...decoded]).toEqual([...bytes])
    expect(detectorFrameCount(decoded, 'vibe')).toBe(3)
    expect(detectorBytes(owner, 'vibe', owner.vibe)).toBe(decoded)
    expect(decodeVibeRecord(decoded, 2 * VIBE_RECORD_BYTES).bass).toBe(2)
  })
})

describe('resampleDetectorBytes', () => {
  // Six structure frames at 100 Hz; downbeats on frames 1 and 4, a drop on 2.
  const src = new Uint8Array(6 * STRUCTURE_RECORD_BYTES)
  for (let k = 0; k < 6; k++) {
    encodeStructureRecord({
      ...structure, downbeat: k === 1 || k === 4, drop: k === 2, beatNumber: k,
    }, src, k * STRUCTURE_RECORD_BYTES)
  }

  it('copies 1:1 at an equal rate', () => {
    expect([...resampleDetectorBytes(src, 'structure', 100, 100, 6)]).toEqual([...src])
  })

  it('takes the last source frame per destination frame and carries every event once', () => {
    const out = resampleDetectorBytes(src, 'structure', 100, 50, 3)
    const at = (k: number) => decodeStructureRecord(out, k * STRUCTURE_RECORD_BYTES)
    // Frame 0 covers source 0-1: downbeat from 1, level from 1.
    expect(at(0)).toMatchObject({ downbeat: true, drop: false, beatNumber: 1 })
    // Frame 1 covers source 2-3: the drop from 2, level from 3.
    expect(at(1)).toMatchObject({ downbeat: false, drop: true, beatNumber: 3 })
    expect(at(2)).toMatchObject({ downbeat: true, drop: false, beatNumber: 5 })
    const flags = [...out].filter((_, i) => i % STRUCTURE_RECORD_BYTES === 0)
    expect(flags.filter((f) => f & STRUCTURE_FLAG_DOWNBEAT)).toHaveLength(2)
    expect(flags.filter((f) => f & STRUCTURE_FLAG_DROP)).toHaveLength(1)
  })

  it('holds the last record, eventless, past the end of the source', () => {
    const out = resampleDetectorBytes(src, 'structure', 100, 100, 8)
    expect(decodeStructureRecord(out, 7 * STRUCTURE_RECORD_BYTES)).toMatchObject({ beatNumber: 5, downbeat: false, drop: false })
  })

  it('upsamples by repeating a frame with its event on the first copy only', () => {
    const out = resampleDetectorBytes(src, 'structure', 100, 200, 12)
    const downbeats = [...out].filter((_, i) => i % STRUCTURE_RECORD_BYTES === 0).map((f) => (f & STRUCTURE_FLAG_DOWNBEAT) !== 0)
    expect(downbeats).toEqual([false, false, true, false, false, false, false, false, true, false, false, false])
  })

  it('returns zeros for an empty source', () => {
    expect([...resampleDetectorBytes(new Uint8Array(0), 'pitch', 50, 50, 2)]).toEqual(new Array(2 * PITCH_RECORD_BYTES).fill(0))
  })
})

// ── Baked detector tracks ────────────────────────────────────────────────────
// Per-frame output of FastLED's Vibe, Song Structure and Pitch detectors, run
// offline over a song by song analysis and stored beside the show envelope so
// a show preview, the pattern card and the SD player's fallback all read the
// song the way a live decoder tap would. One fixed-width record per envelope
// frame, base64 like the spectrum track; the firmware reads the same bytes
// from the `ADET` trailer (see performanceGenerator.showFileToBinary and
// playerSketchGenerator.updateShowAudio), so the layout here is the contract.
//
// Waveform is deliberately not baked: 128 samples per frame is 1.5 MB for a
// four-minute song, beyond internal RAM, so it stays inactive in shows.

import type { PitchSignal, SongStructureSignal, VibeSignal } from '../state/evaluator/types'
import { decodeBase64Bytes, encodeSpectrumBytes } from './spectrumTrack'

/** Vibe record: six u8 levels at scale 32 (1.0 = 32, top 7.97), then flags. */
export const VIBE_RECORD_BYTES = 7
/** Level × VIBE_LEVEL_SCALE, clamped to a byte. Levels sit near 1.0 and are
 *  unbounded above, so a byte at scale 32 keeps the spike headroom. */
export const VIBE_LEVEL_SCALE = 32
export const VIBE_FLAG_BASS_SPIKE = 1
export const VIBE_FLAG_MID_SPIKE = 2
export const VIBE_FLAG_TREBLE_SPIKE = 4

/** Song Structure record: flags, beatNumber, four ×255 bytes, valence i8 ×127, arousal ×255. */
export const STRUCTURE_RECORD_BYTES = 7
export const STRUCTURE_FLAG_DOWNBEAT = 1
export const STRUCTURE_FLAG_DROP = 2
export const STRUCTURE_FLAG_BUILDING = 4
export const STRUCTURE_FLAG_TEMPO_STABLE = 8
/** The one-frame events of a structure record; everything else is a level. */
export const STRUCTURE_EVENT_MASK = STRUCTURE_FLAG_DOWNBEAT | STRUCTURE_FLAG_DROP

/** Pitch record: hz u16 LE, note, velocity, confidence, keyRoot, flags, keyConfidence. */
export const PITCH_RECORD_BYTES = 8
export const PITCH_FLAG_NOTE_ON = 1
export const PITCH_FLAG_KEY_MINOR = 2
export const PITCH_EVENT_MASK = PITCH_FLAG_NOTE_ON
/** keyRoot while no key is accepted; the reader turns it into root 0. */
export const PITCH_NO_KEY = 255

/** Byte offset of the flags byte in each record, for the event merge. */
export const VIBE_FLAGS_OFFSET = 6
export const STRUCTURE_FLAGS_OFFSET = 0
export const PITCH_FLAGS_OFFSET = 6

/** `ADET` trailer: version and the block flags, in block order. */
export const DETECTOR_TRAILER_VERSION = 1
export const DETECTOR_TRAILER_FLAG_VIBE = 1
export const DETECTOR_TRAILER_FLAG_STRUCTURE = 2
export const DETECTOR_TRAILER_FLAG_PITCH = 4

export type DetectorKind = 'vibe' | 'structure' | 'pitch'

export const DETECTOR_KINDS: readonly DetectorKind[] = ['vibe', 'structure', 'pitch']

export const DETECTOR_RECORD_BYTES: Record<DetectorKind, number> = {
  vibe: VIBE_RECORD_BYTES,
  structure: STRUCTURE_RECORD_BYTES,
  pitch: PITCH_RECORD_BYTES,
}

/** Which byte of each record holds its one-frame events, and which bits. */
export const DETECTOR_EVENTS: Record<DetectorKind, { offset: number; mask: number }> = {
  vibe: { offset: VIBE_FLAGS_OFFSET, mask: 0 },
  structure: { offset: STRUCTURE_FLAGS_OFFSET, mask: STRUCTURE_EVENT_MASK },
  pitch: { offset: PITCH_FLAGS_OFFSET, mask: PITCH_EVENT_MASK },
}

/** Base64 records, one per frame at `rateHz`; a missing track reads inactive. */
export interface DetectorTracks {
  rateHz: number
  vibe?: string
  structure?: string
  pitch?: string
}

const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const i8 = (v: number) => Math.max(-127, Math.min(127, Math.round(v))) & 0xff
const fromI8 = (b: number) => (b > 127 ? b - 256 : b)

// ── Vibe ─────────────────────────────────────────────────────────────────────

export function encodeVibeRecord(signal: VibeSignal, out: Uint8Array, at: number): void {
  const s = VIBE_LEVEL_SCALE
  out[at] = u8(signal.bass * s)
  out[at + 1] = u8(signal.mid * s)
  out[at + 2] = u8(signal.treble * s)
  out[at + 3] = u8(signal.bassAtt * s)
  out[at + 4] = u8(signal.midAtt * s)
  out[at + 5] = u8(signal.trebleAtt * s)
  out[at + VIBE_FLAGS_OFFSET] = (signal.bassSpike ? VIBE_FLAG_BASS_SPIKE : 0)
    | (signal.midSpike ? VIBE_FLAG_MID_SPIKE : 0)
    | (signal.trebleSpike ? VIBE_FLAG_TREBLE_SPIKE : 0)
}

/** `volume` is the mean of the three levels, which is its definition. */
export function decodeVibeRecord(bytes: Uint8Array, at: number): VibeSignal {
  const s = VIBE_LEVEL_SCALE
  const bass = bytes[at] / s
  const mid = bytes[at + 1] / s
  const treble = bytes[at + 2] / s
  const flags = bytes[at + VIBE_FLAGS_OFFSET]
  return {
    bass, mid, treble,
    volume: (bass + mid + treble) / 3,
    bassAtt: bytes[at + 3] / s,
    midAtt: bytes[at + 4] / s,
    trebleAtt: bytes[at + 5] / s,
    bassSpike: (flags & VIBE_FLAG_BASS_SPIKE) !== 0,
    midSpike: (flags & VIBE_FLAG_MID_SPIKE) !== 0,
    trebleSpike: (flags & VIBE_FLAG_TREBLE_SPIKE) !== 0,
  }
}

// ── Song Structure ───────────────────────────────────────────────────────────

export function encodeStructureRecord(signal: SongStructureSignal, out: Uint8Array, at: number): void {
  out[at + STRUCTURE_FLAGS_OFFSET] = (signal.downbeat ? STRUCTURE_FLAG_DOWNBEAT : 0)
    | (signal.drop ? STRUCTURE_FLAG_DROP : 0)
    | (signal.building ? STRUCTURE_FLAG_BUILDING : 0)
    | (signal.tempoStable ? STRUCTURE_FLAG_TEMPO_STABLE : 0)
  out[at + 1] = u8(signal.beatNumber)
  out[at + 2] = u8(signal.measurePhase * 255)
  out[at + 3] = u8(signal.buildupProgress * 255)
  out[at + 4] = u8(signal.dropImpact * 255)
  out[at + 5] = i8(signal.valence * 127)
  out[at + 6] = u8(signal.arousal * 255)
}

export function decodeStructureRecord(bytes: Uint8Array, at: number): SongStructureSignal {
  const flags = bytes[at + STRUCTURE_FLAGS_OFFSET]
  return {
    downbeat: (flags & STRUCTURE_FLAG_DOWNBEAT) !== 0,
    drop: (flags & STRUCTURE_FLAG_DROP) !== 0,
    building: (flags & STRUCTURE_FLAG_BUILDING) !== 0,
    tempoStable: (flags & STRUCTURE_FLAG_TEMPO_STABLE) !== 0,
    beatNumber: bytes[at + 1],
    measurePhase: bytes[at + 2] / 255,
    buildupProgress: bytes[at + 3] / 255,
    dropImpact: bytes[at + 4] / 255,
    valence: fromI8(bytes[at + 5]) / 127,
    arousal: bytes[at + 6] / 255,
  }
}

// ── Pitch ────────────────────────────────────────────────────────────────────

export function encodePitchRecord(signal: PitchSignal, out: Uint8Array, at: number): void {
  const hz = Math.max(0, Math.min(65535, Math.round(signal.hz)))
  out[at] = hz & 0xff
  out[at + 1] = (hz >> 8) & 0xff
  out[at + 2] = u8(signal.note)
  out[at + 3] = u8(signal.velocity * 255)
  out[at + 4] = u8(signal.confidence * 255)
  const keyed = signal.keyConfidence > 0 && signal.keyRoot >= 0 && signal.keyRoot < 12
  out[at + 5] = keyed ? Math.round(signal.keyRoot) : PITCH_NO_KEY
  out[at + PITCH_FLAGS_OFFSET] = (signal.noteOn ? PITCH_FLAG_NOTE_ON : 0)
    | (keyed && signal.keyMinor ? PITCH_FLAG_KEY_MINOR : 0)
  out[at + 7] = keyed ? u8(signal.keyConfidence * 255) : 0
}

export function decodePitchRecord(bytes: Uint8Array, at: number): PitchSignal {
  const flags = bytes[at + PITCH_FLAGS_OFFSET]
  const root = bytes[at + 5]
  return {
    hz: bytes[at] | (bytes[at + 1] << 8),
    note: bytes[at + 2],
    noteOn: (flags & PITCH_FLAG_NOTE_ON) !== 0,
    velocity: bytes[at + 3] / 255,
    confidence: bytes[at + 4] / 255,
    keyRoot: root === PITCH_NO_KEY ? 0 : root,
    keyMinor: root !== PITCH_NO_KEY && (flags & PITCH_FLAG_KEY_MINOR) !== 0,
    keyConfidence: root === PITCH_NO_KEY ? 0 : bytes[at + 7] / 255,
  }
}

// ── Storage ──────────────────────────────────────────────────────────────────

export const encodeDetectorBytes = encodeSpectrumBytes

const decoded = new WeakMap<object, Partial<Record<DetectorKind, Uint8Array>>>()

/** Decode `owner`'s base64 track for `kind` once and cache it on `owner`,
 *  because a show preview samples it every frame. */
export function detectorBytes(owner: object, kind: DetectorKind, data: string): Uint8Array {
  let cache = decoded.get(owner)
  if (!cache) {
    cache = {}
    decoded.set(owner, cache)
  }
  const cached = cache[kind]
  if (cached) return cached
  const bytes = decodeBase64Bytes(data)
  cache[kind] = bytes
  return bytes
}

/** Frames a decoded track holds; a partial trailing record is dropped. */
export function detectorFrameCount(bytes: Uint8Array, kind: DetectorKind): number {
  return Math.floor(bytes.length / DETECTOR_RECORD_BYTES[kind])
}

/**
 * Copy a track to `frameCount` frames at `rateHz` without interpolation: each
 * destination frame takes the newest source frame that starts inside it, and
 * the one-frame events of every source frame that starts inside it are OR-ed
 * into it, so a downbeat or note-on is neither lost nor doubled by the rate
 * change in either direction. An equal rate copies 1:1; a destination frame
 * before the next source frame repeats the last one, eventless, and so does
 * one past the end of the source.
 */
export function resampleDetectorBytes(
  src: Uint8Array, kind: DetectorKind, srcRateHz: number, rateHz: number, frameCount: number,
): Uint8Array {
  const size = DETECTOR_RECORD_BYTES[kind]
  const { offset, mask } = DETECTOR_EVENTS[kind]
  const srcFrames = detectorFrameCount(src, kind)
  const out = new Uint8Array(frameCount * size)
  if (srcFrames === 0) return out
  // Source frames starting in destination frame k: [first, last]. The small
  // guard keeps an exact boundary (equal or integer-ratio rates) on its frame.
  const bound = (k: number) => Math.ceil((k * srcRateHz) / rateHz - 1e-9)
  for (let k = 0; k < frameCount; k++) {
    const first = bound(k)
    const last = Math.min(srcFrames - 1, bound(k + 1) - 1)
    const hold = Math.min(srcFrames - 1, Math.max(0, last))
    out.set(src.subarray(hold * size, (hold + 1) * size), k * size)
    let events = 0
    for (let s = first; s <= last; s++) events |= src[s * size + offset] & mask
    out[k * size + offset] = (out[k * size + offset] & ~mask) | events
  }
  return out
}

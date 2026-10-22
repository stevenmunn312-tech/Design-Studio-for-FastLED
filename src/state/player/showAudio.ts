// Sampling the baked audio envelope (see performanceGenerator.bakeEnvelope) into
// the values the evaluator's audio-reactive nodes read. This is the browser-side
// mirror of the firmware player's `updateShowAudio` + `_audioSpectrum` fill
// (playerSketchGenerator.ts), so a collection pattern's FFTAnalyzer / BeatDetect
// react to the song identically in the preview and on-device.
import type { AudioEnvelope } from '../../types/showFile'
import type { AudioOverride } from '../graphEvaluator'
import type { PitchSignal, SongStructureSignal, VibeSignal } from '../evaluator/types'
import { resolveStereoLevels } from '../../audio/stereoLevels'
import { spectrumBytes, SPECTRUM_TRACK_BINS } from '../../audio/spectrumTrack'
import {
  decodePitchRecord, decodeStructureRecord, decodeVibeRecord, detectorBytes, detectorFrameCount,
  PITCH_RECORD_BYTES, STRUCTURE_RECORD_BYTES, VIBE_RECORD_BYTES,
} from '../../audio/detectorTrack'

export const SPECTRUM_BINS = 32
// Coarse band → bin split for audio that carries only three bands (pattern
// rating's synthetic signal): bins 0–5 = bass, 6–15 = mids, 16–31 = treble.
export const BASS_BIN_END = 6
export const MID_BIN_END = 16

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Linear-interpolate the envelope at `ms`, mirroring firmware `updateShowAudio`. */
export function sampleEnvelope(
  env: AudioEnvelope,
  ms: number,
): { bass: number; mids: number; treble: number; leftLevel: number; rightLevel: number; channelCount: 1 | 2 } {
  const n = env.bass.length
  if (n === 0) return { bass: 0, mids: 0, treble: 0, leftLevel: 0, rightLevel: 0, channelCount: 1 }
  const pos = (ms / 1000) * env.rateHz
  const i = Math.max(0, Math.min(n - 1, Math.floor(pos)))
  const j = Math.min(n - 1, i + 1)
  const frac = pos - i
  const lerp = (a: number[]) => a[i] + (a[j] - a[i]) * frac
  const bass = clamp01(lerp(env.bass))
  const mids = clamp01(lerp(env.mids))
  const treble = clamp01(lerp(env.treble))
  const levels = resolveStereoLevels({
    leftLevel: env.leftLevel.length === n ? lerp(env.leftLevel) : undefined,
    rightLevel: env.rightLevel.length === n ? lerp(env.rightLevel) : undefined,
    channelCount: env.channelCount,
    bass,
    mids,
    treble,
  })
  return { bass, mids, treble, leftLevel: levels.left, rightLevel: levels.right, channelCount: levels.channelCount }
}

/** Build the coarse 32-bin spectrum the firmware fills from the three bands. */
export function bandsToSpectrum(bass: number, mids: number, treble: number): number[] {
  return Array.from({ length: SPECTRUM_BINS }, (_, b) =>
    b < BASS_BIN_END ? bass : b < MID_BIN_END ? mids : treble,
  )
}

/**
 * The 32-bin spectrum from a baked show envelope's equalizer frames, linearly
 * interpolated at `ms`. Each of the 16 bins fills two adjacent slots, the
 * mapping the live analyzer and the firmware's `_audioSpectrum` fill both use.
 */
export function showAudioSpectrum(env: AudioEnvelope | undefined, ms: number): number[] | null {
  if (!env || env.bass.length === 0) return null
  const bytes = spectrumBytes(env, env.spectrum)
  const n = Math.floor(bytes.length / SPECTRUM_TRACK_BINS)
  if (n === 0) return new Array<number>(SPECTRUM_BINS).fill(0)
  const pos = (ms / 1000) * env.rateHz
  const i = Math.max(0, Math.min(n - 1, Math.floor(pos)))
  const j = Math.min(n - 1, i + 1)
  const frac = Math.max(0, Math.min(1, pos - i))
  return Array.from({ length: SPECTRUM_BINS }, (_, b) => {
    const bin = Math.floor((b * SPECTRUM_TRACK_BINS) / SPECTRUM_BINS)
    const a = bytes[i * SPECTRUM_TRACK_BINS + bin]
    return (a + (bytes[j * SPECTRUM_TRACK_BINS + bin] - a) * frac) / 255
  })
}

/**
 * The last envelope frame a preview served its detectors from. A show preview
 * runs at 60 fps over a 50 Hz bake, so a flagged frame can be served twice;
 * `downbeat`, `drop` and `noteOn` fire only when the served index changes,
 * once per flagged frame, as the firmware's `audioDetLast` does.
 */
export interface ShowDetectorCursor { lastFrame: number }

export function createShowDetectorCursor(): ShowDetectorCursor {
  return { lastFrame: -1 }
}

export interface ShowDetectorSignals {
  vibe?: VibeSignal
  structure?: SongStructureSignal
  pitch?: PitchSignal
}

/**
 * The baked detector signals at `ms`: the frame whose span holds the position
 * (the firmware's `i`, no interpolation). A block the envelope lacks stays
 * absent, so its node reads inactive. Without a cursor every served frame
 * reports its events as stored.
 */
export function showDetectorSignals(env: AudioEnvelope, ms: number, cursor?: ShowDetectorCursor): ShowDetectorSignals {
  const out: ShowDetectorSignals = {}
  if (!env.vibe && !env.structure && !env.pitch) return out
  const frames = Math.max(0, Math.floor((ms / 1000) * env.rateHz))
  const fresh = !cursor || frames !== cursor.lastFrame
  if (cursor) cursor.lastFrame = frames
  const at = (bytes: Uint8Array, kind: 'vibe' | 'structure' | 'pitch', size: number): number => {
    const n = detectorFrameCount(bytes, kind)
    return n === 0 ? -1 : Math.min(n - 1, frames) * size
  }
  if (env.vibe) {
    const bytes = detectorBytes(env, 'vibe', env.vibe)
    const i = at(bytes, 'vibe', VIBE_RECORD_BYTES)
    if (i >= 0) out.vibe = decodeVibeRecord(bytes, i)
  }
  if (env.structure) {
    const bytes = detectorBytes(env, 'structure', env.structure)
    const i = at(bytes, 'structure', STRUCTURE_RECORD_BYTES)
    if (i >= 0) {
      const structure = decodeStructureRecord(bytes, i)
      if (!fresh) {
        structure.downbeat = false
        structure.drop = false
      }
      out.structure = structure
    }
  }
  if (env.pitch) {
    const bytes = detectorBytes(env, 'pitch', env.pitch)
    const i = at(bytes, 'pitch', PITCH_RECORD_BYTES)
    if (i >= 0) {
      const pitch = decodePitchRecord(bytes, i)
      if (!fresh) pitch.noteOn = false
      out.pitch = pitch
    }
  }
  return out
}

/**
 * Build the AudioOverride a show preview feeds into a pattern group's evaluation,
 * or null when the show carries no baked envelope (nodes then fall back to the
 * live mic / zero, as on the plain canvas). The baked Vibe, Song Structure and
 * Pitch Detect blocks ride along when the envelope has them; `cursor` is the
 * preview's record of the last served frame, which keeps their one-frame
 * events from firing twice.
 */
export function showAudioOverride(env: AudioEnvelope | undefined, ms: number, cursor?: ShowDetectorCursor): AudioOverride | null {
  const spectrum = showAudioSpectrum(env, ms)
  if (!env || !spectrum) return null
  const { bass, mids, treble, leftLevel, rightLevel, channelCount } = sampleEnvelope(env, ms)
  return {
    active: true,
    micActive: true,
    bass,
    mids,
    treble,
    micBass: bass,
    micMids: mids,
    micTreble: treble,
    spectrum,
    detectorSpectrum: spectrum,
    leftLevel,
    rightLevel,
    channelCount,
    ...showDetectorSignals(env, ms, cursor),
  }
}

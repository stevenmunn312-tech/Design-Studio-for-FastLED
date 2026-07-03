// Sampling the baked audio envelope (see performanceGenerator.bakeEnvelope) into
// the values the evaluator's audio-reactive nodes read. This is the browser-side
// mirror of the firmware player's `updateShowAudio` + `_audioSpectrum` fill
// (playerSketchGenerator.ts), so a collection pattern's FFTAnalyzer / BeatDetect
// react to the song identically in the preview and on-device.
import type { AudioEnvelope } from '../types/showFile'
import type { AudioOverride } from './graphEvaluator'

export const SPECTRUM_BINS = 32
// Coarse band → bin split. MUST match playerSketchGenerator's `_audioSpectrum`
// fill (bins 0–5 = bass, 6–15 = mids, 16–31 = treble) so preview beat/percussion
// detection responds the same way it does on hardware.
export const BASS_BIN_END = 6
export const MID_BIN_END = 16

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Linear-interpolate the envelope at `ms`, mirroring firmware `updateShowAudio`. */
export function sampleEnvelope(
  env: AudioEnvelope,
  ms: number,
): { bass: number; mids: number; treble: number } {
  const n = env.bass.length
  if (n === 0) return { bass: 0, mids: 0, treble: 0 }
  const pos = (ms / 1000) * env.rateHz
  const i = Math.max(0, Math.min(n - 1, Math.floor(pos)))
  const j = Math.min(n - 1, i + 1)
  const frac = pos - i
  const lerp = (a: number[]) => a[i] + (a[j] - a[i]) * frac
  return { bass: clamp01(lerp(env.bass)), mids: clamp01(lerp(env.mids)), treble: clamp01(lerp(env.treble)) }
}

/** Build the coarse 32-bin spectrum the firmware fills from the three bands. */
export function bandsToSpectrum(bass: number, mids: number, treble: number): number[] {
  return Array.from({ length: SPECTRUM_BINS }, (_, b) =>
    b < BASS_BIN_END ? bass : b < MID_BIN_END ? mids : treble,
  )
}

/**
 * Build the AudioOverride a show preview feeds into a pattern group's evaluation,
 * or null when the show carries no baked envelope (nodes then fall back to the
 * live mic / zero, as on the plain canvas).
 */
export function showAudioOverride(env: AudioEnvelope | undefined, ms: number): AudioOverride | null {
  if (!env || env.bass.length === 0) return null
  const { bass, mids, treble } = sampleEnvelope(env, ms)
  const spectrum = bandsToSpectrum(bass, mids, treble)
  return {
    active: true,
    micActive: true,
    micBass: bass,
    micMids: mids,
    micTreble: treble,
    spectrum,
    detectorSpectrum: spectrum,
  }
}

// Pitch, note and key detection for the Pitch Detect node.
//
//   detector/pitch.cpp.hpp  → PitchTracker  (autocorrelation, peak lag, confidence)
//   detector/note.cpp.hpp   → NoteTracker   (note-on/off/change state machine)
//   detector/key.cpp.hpp    → KeyDetector   (chroma, Krumhansl-Schmuckler profiles)
//
// Two deliberate deviations from FastLED's `Pitch`. It needs 2 × (sampleRate /
// 80 Hz) = 1102 samples per chunk, but FastLED's I2S input hands the processor
// 512 (`I2S_AUDIO_BUFFER_LEN`, not overridable), so the stock detector never
// voices on a device; the low end of the range moves to 175 Hz, the lowest
// period that fits 512 samples. And its confidence is the raw autocorrelation
// peak, which only reaches 0.5 for a near full-scale signal; here the peak is
// divided by the zero-lag power, so confidence means "how periodic" at any
// level. FastLED also takes the single highest peak, which flips between a
// period and its double; the octave guard below takes the smallest local peak
// within 90% of the highest. Everything else keeps its arithmetic and
// thresholds. The
// emitted firmware (`pitchHelperCpp.ts`) runs the same code against
// `Processor::getSample()`, so preview and device agree. Key detection is
// FastLED's own and runs on the device through `Processor::onKey`.

import type { PitchSignal } from '../state/evaluator/types'

/** fl::audio::detector::Pitch, with the low bound raised to fit 512 samples. */
export const PITCH_SAMPLE_RATE = 44_100
export const PITCH_MIN_HZ = 175
export const PITCH_MAX_HZ = 1000
export const PITCH_MIN_LAG = Math.trunc(PITCH_SAMPLE_RATE / PITCH_MAX_HZ)
export const PITCH_MAX_LAG = Math.trunc(PITCH_SAMPLE_RATE / PITCH_MIN_HZ)
/** Autocorrelation needs two periods of signal. */
export const PITCH_MIN_SAMPLES = PITCH_MAX_LAG * 2
export const PITCH_CONFIDENCE_THRESHOLD = 0.5
export const PITCH_OCTAVE_GUARD = 0.9

/** fl::audio::detector::Note defaults. */
export const NOTE_ON_THRESHOLD = 0.6
export const NOTE_OFF_THRESHOLD = 0.4
export const NOTE_MIN_DURATION_MS = 50
export const NOTE_CHANGE_SEMITONES = 1
export const NO_NOTE = 255

export interface PitchResult {
  /** Frequency in Hz, 0 when not voiced. */
  hz: number
  confidence: number
  voiced: boolean
}

/**
 * Autocorrelation pitch over int16-scaled samples (`Sample::pcm()` units).
 * `sampleRate` only converts lag to Hz: the lag range is fixed at 44.1 kHz, as
 * the device's is.
 */
export class PitchTracker {
  private acf = new Float32Array(PITCH_MAX_LAG + 1)

  detect(pcm: Float32Array, sampleRate = PITCH_SAMPLE_RATE): PitchResult {
    const n = pcm.length
    if (n < PITCH_MIN_SAMPLES) return { hz: 0, confidence: 0, voiced: false }
    const norm = 1 / 32768
    const acf = this.acf
    acf.fill(0)
    let power = 0
    for (let i = 0; i < n; i++) power += (pcm[i] * norm) * (pcm[i] * norm)
    power /= n
    if (power < 1e-12) return { hz: 0, confidence: 0, voiced: false }
    for (let lag = PITCH_MIN_LAG; lag <= PITCH_MAX_LAG; lag++) {
      let sum = 0
      let valid = 0
      for (let i = 0; i + lag < n; i++) {
        sum += pcm[i] * norm * (pcm[i + lag] * norm)
        valid++
      }
      if (valid > 0) acf[lag] = sum / valid
    }
    let best = 0
    let max = -1
    for (let lag = PITCH_MIN_LAG; lag <= PITCH_MAX_LAG; lag++) {
      if (acf[lag] > max && acf[lag] > 0) {
        max = acf[lag]
        best = lag
      }
    }
    if (best <= 0) return { hz: 0, confidence: 0, voiced: false }
    // Octave guard: the smallest local peak within 90% of the highest.
    for (let lag = PITCH_MIN_LAG; lag < best; lag++) {
      const prev = lag > PITCH_MIN_LAG ? acf[lag - 1] : -Infinity
      if (acf[lag] >= max * PITCH_OCTAVE_GUARD && acf[lag] >= prev && acf[lag] >= acf[lag + 1]) {
        best = lag
        break
      }
    }
    const confidence = this.confidence(best, power)
    if (confidence < PITCH_CONFIDENCE_THRESHOLD) return { hz: 0, confidence, voiced: false }
    return { hz: sampleRate / best, confidence, voiced: true }
  }

  private confidence(peakLag: number, power: number): number {
    const acf = this.acf
    const peak = acf[peakLag]
    let confidence = Math.max(0, Math.min(1, peak / power))
    const window = Math.max(2, Math.trunc(peakLag / 10))
    let sum = 0
    let count = 0
    for (let offset = -window; offset <= window; offset++) {
      if (offset === 0) continue
      const lag = peakLag + offset
      if (lag >= PITCH_MIN_LAG && lag <= PITCH_MAX_LAG) {
        sum += Math.max(0, acf[lag])
        count++
      }
    }
    if (count > 0) {
      const avg = sum / count
      if (avg > 1e-6) {
        const clarity = Math.min(1, (peak - avg) / avg)
        confidence *= 0.7 + 0.3 * clarity
      }
    }
    return confidence
  }
}

export function frequencyToMidiNote(hz: number): number {
  if (hz <= 0) return NO_NOTE
  const semitones = 12 * (Math.log(hz / 440) / Math.log(2))
  return Math.max(0, Math.min(127, Math.trunc(69 + semitones + 0.5)))
}

/** Note::calculateVelocity: energy is int16-unit RMS, so it saturates at 1. */
export function noteVelocity(rms: number, confidence: number): number {
  const energy = Math.max(0, Math.min(1, rms))
  const velocity = Math.trunc(energy * confidence * 126) + 1
  return Math.max(1, Math.min(127, velocity))
}

export interface NoteState {
  /** MIDI note 0–127, or NO_NOTE. */
  note: number
  velocity: number
  /** True for the frame a note started or changed. */
  noteOn: boolean
}

export class NoteTracker {
  private note = NO_NOTE
  private velocity = 0
  private active = false
  private onMs = 0

  update(pitch: PitchResult, rms: number, timestampMs: number): NoteState {
    let noteOn = false
    if (!this.active) {
      if (pitch.confidence >= NOTE_ON_THRESHOLD && pitch.hz > 0) {
        this.note = frequencyToMidiNote(pitch.hz)
        this.velocity = noteVelocity(rms, pitch.confidence)
        this.active = true
        this.onMs = timestampMs
        noteOn = true
      }
    } else if (pitch.confidence < NOTE_OFF_THRESHOLD || !pitch.voiced) {
      if (timestampMs - this.onMs >= NOTE_MIN_DURATION_MS) {
        this.note = NO_NOTE
        this.velocity = 0
        this.active = false
      }
    } else if (pitch.confidence >= NOTE_ON_THRESHOLD) {
      const next = frequencyToMidiNote(pitch.hz)
      if (next !== NO_NOTE && Math.abs(next - this.note) >= NOTE_CHANGE_SEMITONES) {
        this.note = next
        this.velocity = noteVelocity(rms, pitch.confidence)
        this.onMs = timestampMs
        noteOn = true
      }
    }
    return { note: this.note, velocity: this.velocity, noteOn }
  }

  reset(): void {
    this.note = NO_NOTE
    this.velocity = 0
    this.active = false
    this.onMs = 0
  }
}

// ── detector/key ─────────────────────────────────────────────────────────────

/** Krumhansl-Schmuckler profiles, as in key.cpp.hpp. */
export const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88] as const
export const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] as const
export const KEY_CONFIDENCE_THRESHOLD = 0.65
export const KEY_MIN_DURATION_MS = 2000
export const KEY_AVERAGING_FRAMES = 8
/** getFFT(32) defaults: 32 linear bins across 90–14080 Hz. */
export const KEY_LINEAR_BINS = 32
export const KEY_FFT_MIN_HZ = 90
export const KEY_FFT_MAX_HZ = 14080

/** Sum the FFT magnitudes into FastLED's evenly spaced linear bins. */
export function keyLinearBins(mags: Float32Array, sampleRate: number, fftSize: number, out: Float32Array): void {
  const binHz = sampleRate / fftSize
  const half = binHz / 2
  const width = (KEY_FFT_MAX_HZ - KEY_FFT_MIN_HZ) / KEY_LINEAR_BINS
  out.fill(0)
  const start = KEY_FFT_MIN_HZ > half ? Math.ceil((KEY_FFT_MIN_HZ - half) / binHz) : 0
  const end = Math.min(mags.length, Math.ceil((KEY_FFT_MAX_HZ + half) / binHz))
  for (let k = start; k < end; k++) {
    const freq = k * binHz
    if (freq < KEY_FFT_MIN_HZ) {
      out[0] += mags[k]
      continue
    }
    out[Math.min(KEY_LINEAR_BINS - 1, Math.trunc((freq - KEY_FFT_MIN_HZ) / width))] += mags[k]
  }
}

function profileStats(profile: readonly number[]): { mean: number; sd: number } {
  let sum = 0
  let sq = 0
  for (const v of profile) {
    sum += v
    sq += v * v
  }
  const mean = sum / 12
  return { mean, sd: Math.sqrt(sq / 12 - mean * mean) }
}
const MAJOR_STATS = profileStats(MAJOR_PROFILE)
const MINOR_STATS = profileStats(MINOR_PROFILE)

/** Fold linear bins into 12 pitch classes, normalised to their maximum. */
export function extractChroma(bins: Float32Array, out: Float32Array): void {
  out.fill(0)
  const width = (KEY_FFT_MAX_HZ - KEY_FFT_MIN_HZ) / bins.length
  for (let bin = 0; bin < bins.length; bin++) {
    const magnitude = bins[bin]
    if (magnitude < 1e-6) continue
    const freq = KEY_FFT_MIN_HZ + (bin + 0.5) * width
    if (freq < 60) continue
    const midi = 69 + 12 * (Math.log(freq / 440) / Math.log(2))
    let pitchClass = Math.trunc(midi + 0.5) % 12
    if (pitchClass < 0) pitchClass += 12
    out[pitchClass] += magnitude
  }
  let max = 0
  for (let i = 0; i < 12; i++) if (out[i] > max) max = out[i]
  if (max > 1e-6) for (let i = 0; i < 12; i++) out[i] /= max
}

export function correlateWithProfile(
  chroma: ArrayLike<number>,
  profile: readonly number[],
  root: number,
): number {
  const stats = profile === MAJOR_PROFILE ? MAJOR_STATS : MINOR_STATS
  const profileSd = stats.sd < 1e-6 ? 1 : stats.sd
  let sum = 0
  let sq = 0
  for (let i = 0; i < 12; i++) {
    sum += chroma[i]
    sq += chroma[i] * chroma[i]
  }
  const mean = sum / 12
  let sd = Math.sqrt(sq / 12 - mean * mean)
  if (!(sd >= 1e-6)) sd = 1
  let correlation = 0
  for (let i = 0; i < 12; i++) {
    const index = (i - root + 12) % 12
    correlation += ((chroma[i] - mean) / sd) * ((profile[index] - stats.mean) / profileSd)
  }
  return correlation / 12
}

export interface KeyState {
  active: boolean
  root: number
  minor: boolean
  confidence: number
}

export class KeyDetector {
  private current = { root: 0, minor: false, confidence: 0, durationMs: 0 }
  private startMs = 0
  private active = false
  private history: Float32Array[] = []
  private historyIndex = 0
  private historySize = 0
  private readonly chroma = new Float32Array(12)
  private readonly averaged = new Float32Array(12)
  private readonly linear = new Float32Array(KEY_LINEAR_BINS)

  update(mags: Float32Array, sampleRate: number, fftSize: number, timestampMs: number): KeyState {
    keyLinearBins(mags, sampleRate, fftSize, this.linear)
    extractChroma(this.linear, this.chroma)
    if (this.history.length < KEY_AVERAGING_FRAMES) this.history.push(Float32Array.from(this.chroma))
    else this.history[this.historyIndex].set(this.chroma)
    this.historyIndex = (this.historyIndex + 1) % KEY_AVERAGING_FRAMES
    if (this.historySize < KEY_AVERAGING_FRAMES) this.historySize++
    for (let i = 0; i < 12; i++) {
      let sum = 0
      for (let j = 0; j < this.historySize; j++) sum += this.history[j][i]
      this.averaged[i] = sum / this.historySize
    }

    const detected = this.detect(this.averaged)
    const same = detected.root === this.current.root && detected.minor === this.current.minor
    if (this.active && same) this.current.durationMs = timestampMs - this.startMs
    if (!same) {
      let accept = false
      if (detected.confidence >= KEY_CONFIDENCE_THRESHOLD) {
        if (!this.active) accept = true
        else if (this.current.durationMs >= KEY_MIN_DURATION_MS) accept = true
        else if (detected.confidence > this.current.confidence * 1.2) accept = true
      }
      if (accept) {
        this.current = { ...detected, durationMs: 0 }
        this.startMs = timestampMs
        this.active = true
      }
    }
    if (this.active && detected.confidence < KEY_CONFIDENCE_THRESHOLD * 0.5) {
      this.active = false
      this.current.confidence = 0
    }
    return this.state()
  }

  state(): KeyState {
    return this.active
      ? { active: true, root: this.current.root, minor: this.current.minor, confidence: this.current.confidence }
      : { active: false, root: 0, minor: false, confidence: 0 }
  }

  reset(): void {
    this.current = { root: 0, minor: false, confidence: 0, durationMs: 0 }
    this.startMs = 0
    this.active = false
    this.history = []
    this.historyIndex = 0
    this.historySize = 0
  }

  private detect(chroma: Float32Array): { root: number; minor: boolean; confidence: number } {
    let best = -1
    let root = 0
    let minor = false
    for (let r = 0; r < 12; r++) {
      const major = correlateWithProfile(chroma, MAJOR_PROFILE, r)
      if (major > best) {
        best = major
        root = r
        minor = false
      }
      const min = correlateWithProfile(chroma, MINOR_PROFILE, r)
      if (min > best) {
        best = min
        root = r
        minor = true
      }
    }
    return { root, minor, confidence: Math.max(0, Math.min(1, (best + 1) / 2)) }
  }
}

// ── combined ─────────────────────────────────────────────────────────────────

export class PitchAnalyzer {
  private pitch = new PitchTracker()
  private note = new NoteTracker()
  private key = new KeyDetector()

  update(
    pcm: Float32Array,
    mags: Float32Array,
    sampleRate: number,
    fftSize: number,
    rms: number,
    timestampMs: number,
  ): PitchSignal {
    const pitch = this.pitch.detect(pcm, sampleRate)
    const note = this.note.update(pitch, rms, timestampMs)
    const key = this.key.update(mags, sampleRate, fftSize, timestampMs)
    return {
      hz: pitch.hz,
      note: note.note === NO_NOTE ? 0 : note.note,
      noteOn: note.noteOn,
      velocity: note.velocity / 127,
      confidence: pitch.confidence,
      keyRoot: key.root,
      keyMinor: key.minor,
      keyConfidence: key.confidence,
    }
  }

  reset(): void {
    this.note.reset()
    this.key.reset()
  }
}

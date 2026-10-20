// ── Offline song analysis built on FastLED's audio detectors ─────────────────
// The Music Library's whole-track analysis. It reads the same spectrum the
// firmware's fl::audio pipeline reads (Hann window, radix-2 FFT, int16-amplitude
// magnitudes) and reuses FastLED's detector pieces where they carry over to a
// whole file:
//
//   beats — FastLED's onset measure, spectral flux over log-spaced bins
//           (detector/beat), followed by an offline tempo fit and a
//           dynamic-programming beat tracker (Ellis 2007). FastLED's own
//           BeatDetector is causal and decides each beat as audio streams
//           in; a show is planned from the whole file, so the tracker can
//           look ahead and lock onto a steady grid.
//   key   — FastLED's Krumhansl-Schmuckler profiles and correlation
//           (detector/key), fed a whole-song harmonic-salience chroma. The
//           device's 32 linear bins are 437 Hz wide, too coarse to separate
//           semitones; offline there is no reason to share that limit.
//   energy — bass / mids / treble band energy every ENERGY_HOP_MS, the same
//           envelope shape the show generator already consumes.
//
// The harmonic weighting, tempo prior and mood map were tuned against real
// songs with scripts/bench/song-analysis-bench.ts; rerun it after any change.

import type { BeatInfo, EnergyPoint, SongAnalysis, SongAnalysisCore } from '../types/showFile'
import { aggregateLogBins, I16_FULL_SCALE } from './fastledReactive'
import { correlateWithProfile, MAJOR_PROFILE, MINOR_PROFILE } from './fastledPitch'
import { fftInPlace } from './micAnalysis'
import { ENERGY_HOP_MS, detectSections, normalizeEnergy } from './songAnalysisCommon'

const FRAME_SIZE = 2048
const HOP_SIZE = 512

/** Onset bins: detector/beat's 16 log bins over 30–14080 Hz. */
const ONSET_BINS = 16
const ONSET_MIN_HZ = 30
const ONSET_MAX_HZ = 14080

/** Tempo search range, the range RhythmExtractor2013 was run with. */
export const SONG_MIN_BPM = 40
export const SONG_MAX_BPM = 208
/** Log-Gaussian tempo prior: centre and width in octaves (Ellis 2007). */
const TEMPO_PRIOR_BPM = 120
const TEMPO_PRIOR_OCTAVES = 0.7
/** How strongly the tracker holds the fitted period against local onsets. */
const BEAT_TIGHTNESS = 100

/** Chroma pass: a long frame resolves semitones down to ~100 Hz. */
const CHROMA_FRAME = 8192

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  return w
}

/** One-sided magnitudes in int16-amplitude units, as FastLedAudioAnalyzer scales them. */
class Spectrum {
  readonly mags: Float32Array
  private re: Float32Array
  private im: Float32Array
  private window: Float32Array

  constructor(readonly size: number) {
    this.re = new Float32Array(size)
    this.im = new Float32Array(size)
    this.mags = new Float32Array(size / 2)
    this.window = hannWindow(size)
  }

  compute(mono: Float32Array, start: number): Float32Array {
    const n = this.size
    for (let i = 0; i < n; i++) {
      const j = start + i
      this.re[i] = (j >= 0 && j < mono.length ? mono[j] : 0) * I16_FULL_SCALE * this.window[i]
      this.im[i] = 0
    }
    fftInPlace(this.re, this.im)
    this.mags[0] = 0
    for (let i = 1; i < n / 2; i++) this.mags[i] = Math.hypot(this.re[i], this.im[i]) * (4 / n)
    return this.mags
  }
}

interface FramePass {
  /** Onset strength per hop. */
  onset: Float32Array
  /** Hops per second. */
  frameRate: number
  energy: EnergyPoint[]
}

function bandEnergy(mags: Float32Array, binHz: number, lo: number, hi: number): number {
  const from = Math.max(1, Math.ceil(lo / binHz))
  const to = Math.min(mags.length - 1, Math.floor(hi / binHz))
  let sum = 0
  for (let i = from; i <= to; i++) sum += mags[i] * mags[i]
  return sum
}

/**
 * One FFT pass over the song. The onset measure is detector/beat's: positive
 * flux between consecutive log-binned spectra. It is taken on log-compressed
 * magnitudes and across all 16 bins, because a whole-song tracker must follow
 * music whose pulse is not a kick drum; the device detector's bass-only, linear
 * flux suits a live beat flash, not a grid.
 */
function framePass(mono: Float32Array, sampleRate: number): FramePass {
  const spectrum = new Spectrum(FRAME_SIZE)
  const binHz = sampleRate / FRAME_SIZE
  const frameCount = Math.max(1, Math.ceil(mono.length / HOP_SIZE))
  const onset = new Float32Array(frameCount)
  const bins = new Float32Array(ONSET_BINS)
  const prev = new Float32Array(ONSET_BINS)
  const fmax = Math.min(ONSET_MAX_HZ, sampleRate / 2)
  const trebleMax = Math.min(16000, sampleRate / 2)

  interface Acc { b: number; m: number; t: number; o: number; n: number }
  const bucketCount = Math.max(1, Math.ceil((mono.length / sampleRate) * 1000 / ENERGY_HOP_MS))
  const buckets: Acc[] = Array.from({ length: bucketCount }, () => ({ b: 0, m: 0, t: 0, o: 0, n: 0 }))

  for (let f = 0; f < frameCount; f++) {
    // Centre each frame on its hop so onset times line up with sample time.
    const mags = spectrum.compute(mono, f * HOP_SIZE - FRAME_SIZE / 2)

    aggregateLogBins(mags, sampleRate, FRAME_SIZE, ONSET_BINS, ONSET_MIN_HZ, fmax, bins)
    let flux = 0
    for (let i = 0; i < ONSET_BINS; i++) {
      const v = Math.log1p(bins[i])
      const diff = v - prev[i]
      if (diff > 0) flux += diff
      prev[i] = v
    }
    onset[f] = f === 0 ? 0 : flux / ONSET_BINS

    const bass = bandEnergy(mags, binHz, 20, 250)
    const mids = bandEnergy(mags, binHz, 250, 4000)
    const treble = bandEnergy(mags, binHz, 4000, trebleMax)
    const tMs = (f * HOP_SIZE / sampleRate) * 1000
    const acc = buckets[Math.min(bucketCount - 1, Math.floor(tMs / ENERGY_HOP_MS))]
    acc.b += Math.sqrt(bass)
    acc.m += Math.sqrt(mids)
    acc.t += Math.sqrt(treble)
    acc.o += Math.sqrt(bass + mids + treble)
    acc.n += 1
  }

  const energy = buckets.map((acc, i): EnergyPoint => acc.n
    ? { t: i * ENERGY_HOP_MS, bass: acc.b / acc.n, mids: acc.m / acc.n, treble: acc.t / acc.n, overall: acc.o / acc.n }
    : { t: i * ENERGY_HOP_MS, bass: 0, mids: 0, treble: 0, overall: 0 })
  return { onset, frameRate: sampleRate / HOP_SIZE, energy: normalizeEnergy(energy) }
}

/** Remove the slow trend, half-wave rectify and scale to unit deviation. */
function conditionOnset(onset: Float32Array, frameRate: number): Float32Array {
  const n = onset.length
  const half = Math.max(1, Math.round(frameRate * 0.25))
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + onset[i]
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(n, i + half + 1)
    const v = onset[i] - (prefix[hi] - prefix[lo]) / (hi - lo)
    out[i] = v > 0 ? v : 0
  }
  let sq = 0
  for (let i = 0; i < n; i++) sq += out[i] * out[i]
  const sd = Math.sqrt(sq / Math.max(1, n))
  if (sd > 0) for (let i = 0; i < n; i++) out[i] /= sd
  return out
}

interface TempoFit {
  /** Beat period in hops (fractional). */
  period: number
  /** Autocorrelation at the chosen period against zero lag, 0–1. */
  clarity: number
}

function autocorrelate(env: Float32Array, maxLag: number): Float64Array {
  const ac = new Float64Array(maxLag + 1)
  const n = env.length
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0
    for (let i = lag; i < n; i++) s += env[i] * env[i - lag]
    ac[lag] = s / (n - lag)
  }
  return ac
}

/**
 * Global tempo from the onset autocorrelation, weighted by a log-Gaussian
 * prior around 120 BPM. Each candidate also takes half the weighted
 * autocorrelation at twice its period (Ellis's TPS2), so a beat whose half-time
 * pulse is also strong wins over that slower octave.
 */
function fitTempo(env: Float32Array, frameRate: number): TempoFit {
  const minLag = Math.max(1, Math.floor((60 / SONG_MAX_BPM) * frameRate))
  const maxLag = Math.ceil((60 / SONG_MIN_BPM) * frameRate)
  const ac = autocorrelate(env, Math.min(env.length - 1, maxLag * 2 + 1))
  const at = (lag: number) => {
    const i = Math.floor(lag)
    if (i + 1 >= ac.length) return 0
    const frac = lag - i
    return ac[i] * (1 - frac) + ac[i + 1] * frac
  }
  const weighted = (lag: number) => {
    const octaves = Math.log2((60 * frameRate) / lag / TEMPO_PRIOR_BPM) / TEMPO_PRIOR_OCTAVES
    return at(lag) * Math.exp(-0.5 * octaves * octaves)
  }

  let bestLag = Math.round((60 / TEMPO_PRIOR_BPM) * frameRate)
  let bestScore = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    const score = weighted(lag) + 0.5 * weighted(lag * 2)
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }

  // Parabolic refinement, then sharpen with the peak near four beats, which
  // pins the period to a quarter of a hop over a bar.
  let period = bestLag
  if (bestLag > minLag && bestLag < maxLag) {
    const a = at(bestLag - 1), b = at(bestLag), c = at(bestLag + 1)
    const denom = a - 2 * b + c
    if (denom < 0) period = bestLag + 0.5 * (a - c) / denom
  }
  const far = 4 * period
  const farLo = Math.floor(far - 2), farHi = Math.ceil(far + 2)
  if (farHi < ac.length) {
    let peak = farLo
    for (let lag = farLo; lag <= farHi; lag++) if (ac[lag] > ac[peak]) peak = lag
    if (peak > farLo && peak < farHi) {
      const a = ac[peak - 1], b = ac[peak], c = ac[peak + 1]
      const denom = a - 2 * b + c
      const refined = denom < 0 ? peak + 0.5 * (a - c) / denom : peak
      if (Math.abs(refined / 4 - period) < 0.5) period = refined / 4
    }
  }

  return { period, clarity: ac[0] > 0 ? clamp01(at(period) / ac[0]) : 0 }
}

/**
 * Dynamic-programming beat tracker (Ellis 2007, "Beat Tracking by Dynamic
 * Programming"): each frame's score is its onset strength plus the best
 * predecessor score, penalised by how far that gap strays from the period
 * on a log scale. Backtracking from the best final score gives the beats.
 */
function trackBeats(env: Float32Array, period: number): number[] {
  const n = env.length
  if (n === 0 || !(period > 1)) return []
  const score = new Float64Array(n)
  const back = new Int32Array(n).fill(-1)
  const lo = Math.max(1, Math.round(period / 2))
  const hi = Math.round(period * 2)
  for (let t = 0; t < n; t++) {
    let best = 0
    let bestPrev = -1
    for (let gap = lo; gap <= hi && gap <= t; gap++) {
      const d = Math.log(gap / period)
      const s = score[t - gap] - BEAT_TIGHTNESS * d * d
      if (bestPrev < 0 || s > best) {
        best = s
        bestPrev = t - gap
      }
    }
    score[t] = env[t] + (bestPrev >= 0 ? Math.max(0, best) : 0)
    back[t] = bestPrev >= 0 && best > 0 ? bestPrev : -1
  }

  // Start the backtrack from the strongest score within the last period.
  let end = n - 1
  for (let t = Math.max(0, n - Math.round(period)); t < n; t++) if (score[t] > score[end]) end = t
  const beats: number[] = []
  for (let t = end; t >= 0; t = back[t]) beats.push(t)
  beats.reverse()
  return beats
}

/**
 * Drop beats over leading and trailing quiet, where the tracker coasts on the
 * grid with no music under it. A beat is kept from the first one whose
 * smoothed onset reaches half of the song's typical beat strength.
 */
function trimSilentEnds(beats: number[], env: Float32Array): number[] {
  if (beats.length < 3) return beats
  const local = beats.map((t) => {
    let m = 0
    for (let i = Math.max(0, t - 2); i <= Math.min(env.length - 1, t + 2); i++) m = Math.max(m, env[i])
    return m
  })
  const sorted = [...local].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length / 2)] * 0.5
  let first = 0
  while (first < local.length && local[first] < floor) first++
  let last = local.length - 1
  while (last > first && local[last] < floor) last--
  return beats.slice(first, last + 1)
}

function extractBeats(onset: Float32Array, frameRate: number): { beats: BeatInfo; clarity: number } {
  const env = conditionOnset(onset, frameRate)
  const { period, clarity } = fitTempo(env, frameRate)
  const frames = trimSilentEnds(trackBeats(env, period), env)
  const timestamps = frames.map((f) => (f * 1000) / frameRate)
  return {
    beats: { timestamps, bpm: Math.round((60 * frameRate) / period), confidence: clarity },
    clarity,
  }
}

/** Pitch candidates for the salience pass: C2 to C6. */
const SALIENCE_LOW_MIDI = 36
const SALIENCE_HIGH_MIDI = 84
const SALIENCE_HARMONICS = 8
const SALIENCE_DECAY = 0.8

/**
 * Whole-song chroma from harmonic salience. A bass note's fifth harmonic sits
 * on its major third, so counting raw spectral peaks pulls minor songs towards
 * their parallel major. Instead each candidate pitch scores the peaks at its
 * first harmonics (weighted 0.8^h), which credits a partial to the note that
 * produced it. Each frame is normalised to its strongest class before it is
 * summed, as extractChroma does.
 */
function songChroma(mono: Float32Array, sampleRate: number): Float64Array {
  const spectrum = new Spectrum(CHROMA_FRAME)
  const binHz = sampleRate / CHROMA_FRAME
  const top = CHROMA_FRAME / 2 - 2
  const peaks = new Float32Array(CHROMA_FRAME / 2)
  const candidates = SALIENCE_HIGH_MIDI - SALIENCE_LOW_MIDI + 1
  // Each candidate's harmonic h covers ±half a semitone around h·f0.
  const ranges = Array.from({ length: candidates }, (_, c) => {
    const f0 = 440 * 2 ** ((SALIENCE_LOW_MIDI + c - 69) / 12)
    return Array.from({ length: SALIENCE_HARMONICS }, (_, h) => {
      const f = f0 * (h + 1)
      return [Math.max(2, Math.floor((f * 2 ** (-1 / 24)) / binHz)), Math.min(top, Math.ceil((f * 2 ** (1 / 24)) / binHz))]
    })
  })
  const total = new Float64Array(12)
  const frame = new Float64Array(12)
  for (let start = 0; start + CHROMA_FRAME <= mono.length; start += CHROMA_FRAME / 2) {
    const mags = spectrum.compute(mono, start)
    let mean = 0
    for (let k = 2; k <= top; k++) mean += mags[k]
    mean /= top - 1
    peaks.fill(0)
    for (let k = 2; k <= top; k++) {
      const m = mags[k]
      if (m > mean && m > mags[k - 1] && m >= mags[k + 1]) peaks[k] = Math.sqrt(m)
    }
    frame.fill(0)
    for (let c = 0; c < candidates; c++) {
      let salience = 0
      let weight = 1
      for (const [lo, hi] of ranges[c]) {
        let best = 0
        for (let k = lo; k <= hi; k++) if (peaks[k] > best) best = peaks[k]
        salience += weight * best
        weight *= SALIENCE_DECAY
      }
      frame[(SALIENCE_LOW_MIDI + c) % 12] += salience
    }
    let max = 0
    let min = Infinity
    for (let i = 0; i < 12; i++) {
      if (frame[i] > max) max = frame[i]
      if (frame[i] < min) min = frame[i]
    }
    if (max - min <= 1e-6) continue
    for (let i = 0; i < 12; i++) total[i] += (frame[i] - min) / (max - min)
  }
  return total
}

export function detectKey(mono: Float32Array, sampleRate: number): { key: string; scale: 'major' | 'minor' } | null {
  const chroma = songChroma(mono, sampleRate)
  if (!chroma.some((v) => v > 0)) return null
  let best = -Infinity
  let root = 0
  let minor = false
  for (let r = 0; r < 12; r++) {
    const major = correlateWithProfile(chroma, MAJOR_PROFILE, r)
    if (major > best) { best = major; root = r; minor = false }
    const min = correlateWithProfile(chroma, MINOR_PROFILE, r)
    if (min > best) { best = min; root = r; minor = true }
  }
  return { key: NOTE_NAMES[root], scale: minor ? 'minor' : 'major' }
}

/**
 * How strongly the song's rhythm lifts its mood energy, from tempo clarity.
 * Fitted against Essentia's danceability / 3 over a 41-song library, which this
 * replaced: shows keep the palettes they were tuned with. The two measures
 * barely correlate, so the map is deliberately shallow.
 */
function rhythmDrive(clarity: number): number {
  return 0.32 + 0.18 * clamp01(clarity)
}

/** Mood from the energy envelope, the key's mode and the rhythm drive (0–1). */
function estimateMood(energy: EnergyPoint[], key: string, scale: string, drive: number): SongAnalysis['mood'] {
  const avg = (sel: (p: EnergyPoint) => number) =>
    energy.length ? energy.reduce((sum, point) => sum + sel(point), 0) / energy.length : 0
  const avgO = avg((p) => p.overall)
  const avgB = avg((p) => p.bass)
  const avgT = avg((p) => p.treble)

  const major = scale.toLowerCase() === 'major'
  const valence = clamp01(0.5 + (major ? 0.15 : -0.15) + (avgT - avgB) * 0.25)
  const moodEnergy = clamp01(0.4 * Math.min(1, avgO * 1.5) + 0.6 * clamp01(drive))

  return { energy: moodEnergy, valence, key: key ? `${key} ${scale}` : 'C major' }
}

export function analyzeSongSamples(
  mono: Float32Array,
  sampleRate: number,
  durationMs: number,
  title: string,
): SongAnalysisCore {
  const { onset, frameRate, energy } = framePass(mono, sampleRate)
  const { beats, clarity } = extractBeats(onset, frameRate)
  const key = detectKey(mono, sampleRate)
  const sections = detectSections(energy, durationMs)
  const mood = estimateMood(energy, key?.key ?? '', key?.scale ?? 'major', rhythmDrive(clarity))
  return { title, durationMs, beats, energy, sections, mood }
}

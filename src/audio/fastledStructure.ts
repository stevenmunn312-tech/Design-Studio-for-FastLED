// Browser ports of FastLED's song-structure detectors, written from the C++ in
// src/fl/audio/detector/ with the same constants and update order:
//   downbeat.cpp.hpp        → DownbeatDetector (accent, meter vote, measure phase)
//   buildup.cpp.hpp         → BuildupDetector  (Savitzky-Golay energy/treble trends)
//   drop.cpp.hpp            → DropDetector     (energy and bass flux against baselines)
//   mood_analyzer.cpp.hpp   → MoodAnalyzer     (valence and arousal, 10-frame mean)
//   tempo_analyzer.cpp.hpp  → TempoAnalyzer    (only the `isStable` verdict is exposed)
//
// FastLED reads `Context::getFFT(bands)` (constant-Q, 90–14080 Hz). The browser
// folds its linear FFT into the same log-spaced bins with `aggregateLogBins`, as
// the beat detector already does, so absolute bin energy differs slightly and
// every threshold here that compares against a running baseline is unaffected.
// Absolute comparisons (`min(1, rms)`, `flux / 10`) saturate in the C++ too,
// because Sample::rms is in int16 units; they are kept as written.

import { aggregateLogBins, MovingAverage } from './fastledReactive'
import type { SongStructureSignal } from '../state/evaluator/types'

/** fft::Args::DefaultMinFrequency / DefaultMaxFrequency. */
export const STRUCTURE_FFT_MIN_HZ = 90
export const STRUCTURE_FFT_MAX_HZ = 14080

/** One frame of the shared inputs every detector here reads. */
export interface StructureFrame {
  timestampMs: number
  /** Log-rebinned FFT magnitudes: 16 bins for downbeat and tempo. */
  bins16: Float32Array
  /** The same spectrum in 32 bins for buildup, drop and mood. */
  bins32: Float32Array
  /** Context::getRMS, int16 units. */
  rms: number
  /** Context::getZCF: zero crossings per sample, 0–1. */
  zcf: number
  /** The shared Beat detector's verdict and tempo for this frame. */
  beat: boolean
  bpm: number
  /** Context::isSilent. */
  silent: boolean
}

export function structureBins(
  mags: Float32Array,
  sampleRate: number,
  fftSize: number,
  bands: number,
  out: Float32Array,
): void {
  const fmax = Math.min(STRUCTURE_FFT_MAX_HZ, sampleRate / 2)
  aggregateLogBins(mags, sampleRate, fftSize, bands, STRUCTURE_FFT_MIN_HZ, fmax, out)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ── Savitzky-Golay filter (fl/math/filter/savitzky_golay_filter_impl.h) ──────

export class SavitzkyGolay {
  private buf: number[] = []
  private last = 0
  constructor(private capacity: number) {}

  update(input: number): number {
    if (this.buf.length >= this.capacity) this.buf.shift()
    this.buf.push(input)
    const n = this.buf.length
    if (n < 5) {
      let sum = 0
      for (const v of this.buf) sum += v
      this.last = sum / n
      return this.last
    }
    const m = (n - 1) / 2 | 0
    const base = 3 * m * (m + 1) - 1
    let weighted = 0
    let total = 0
    for (let j = 0; j < n; j++) {
      const i = j - m
      const w = 3 * (base - 5 * i * i)
      weighted += this.buf[j] * w
      total += w
    }
    this.last = total !== 0 ? weighted / total : input
    return this.last
  }

  value(): number {
    return this.last
  }

  full(): boolean {
    return this.buf.length >= this.capacity
  }

  reset(): void {
    this.buf.length = 0
    this.last = 0
  }
}

/** fl::MedianFilter<float, N>: the middle of the last N values, `sorted[n/2]`. */
class MedianFilter {
  private ring: number[] = []
  constructor(private capacity: number) {}
  update(v: number): number {
    if (this.ring.length >= this.capacity) this.ring.shift()
    this.ring.push(v)
    const sorted = [...this.ring].sort((a, b) => a - b)
    return sorted[sorted.length >> 1]
  }
  reset(): void {
    this.ring.length = 0
  }
}

// ── detector/downbeat ────────────────────────────────────────────────────────

export const DOWNBEAT_CONFIDENCE_THRESHOLD = 0.6
export const DOWNBEAT_ACCENT_THRESHOLD = 1.2
const DOWNBEAT_MAX_BEAT_HISTORY = 32
const DOWNBEAT_METER_HISTORY = 8
const DOWNBEAT_METER_CANDIDATES = [2, 3, 4, 6, 8]

export class DownbeatDetector {
  downbeat = false
  currentBeat = 1
  beatsPerMeasure = 4
  measurePhase = 0
  confidence = 0
  private lastDownbeatTime = 0
  private beatsSinceDownbeat = 0
  private previousEnergy = 0
  private accents: number[] = []
  private meters: number[] = []

  update(frame: StructureFrame): void {
    const timestamp = frame.timestampMs
    this.downbeat = false
    if (frame.beat) {
      const raw = frame.bins16
      let bass = 0
      for (let i = 0; i < Math.min(4, raw.length); i++) bass += raw[i]
      bass /= 4
      const accent = this.beatAccent(raw, bass)
      if (this.accents.length >= DOWNBEAT_MAX_BEAT_HISTORY) this.accents.shift()
      this.accents.push(accent)

      this.downbeat = this.detect(timestamp, accent, frame.bpm)
      if (this.downbeat) {
        this.currentBeat = 1
        this.beatsSinceDownbeat = 0
        this.lastDownbeatTime = timestamp
        this.detectMeter()
      } else {
        this.beatsSinceDownbeat++
        this.currentBeat = (this.beatsSinceDownbeat % this.beatsPerMeasure) + 1
        if (this.beatsSinceDownbeat >= this.beatsPerMeasure) {
          // Force a downbeat on the measure boundary.
          this.downbeat = true
          this.currentBeat = 1
          this.beatsSinceDownbeat = 0
          this.lastDownbeatTime = timestamp
        }
      }
      this.previousEnergy = bass
    }
    this.updatePhase(timestamp, frame.bpm)
  }

  reset(): void {
    this.downbeat = false
    this.currentBeat = 1
    this.beatsPerMeasure = 4
    this.measurePhase = 0
    this.confidence = 0
    this.lastDownbeatTime = 0
    this.beatsSinceDownbeat = 0
    this.previousEnergy = 0
    this.accents.length = 0
    this.meters.length = 0
  }

  private meanAccent(): number {
    if (this.accents.length === 0) return 1
    let sum = 0
    for (const a of this.accents) sum += a
    return sum / this.accents.length
  }

  private beatAccent(raw: Float32Array, bass: number): number {
    const energyRatio = this.previousEnergy > 1e-6 ? bass / this.previousEnergy : 1
    let total = 0
    for (let i = 0; i < raw.length; i++) total += raw[i]
    total /= raw.length
    const bassRatio = total > 1e-6 ? bass / total : 1
    return energyRatio * 0.4 + bassRatio * 0.3 + total * 0.3
  }

  private detect(timestamp: number, accent: number, bpm: number): boolean {
    if (this.lastDownbeatTime === 0) {
      const mean = this.meanAccent()
      this.confidence = mean > 0
        ? clamp(accent / (mean * DOWNBEAT_ACCENT_THRESHOLD), 0, 1)
        : clamp(accent * 0.5, 0.3, 0.7)
      return true
    }
    const sinceDownbeat = timestamp - this.lastDownbeatTime
    const beatInterval = bpm > 0 ? 60000 / bpm : 500
    const expectedMeasure = beatInterval * this.beatsPerMeasure
    const timingError = Math.abs(sinceDownbeat - expectedMeasure)
    const nearBoundary = timingError < beatInterval * 0.4

    const mean = this.meanAccent()
    const strongAccent = accent > mean * DOWNBEAT_ACCENT_THRESHOLD
    const atBoundary = this.beatsSinceDownbeat >= this.beatsPerMeasure - 1

    const timingConfidence = clamp(1 - timingError / (beatInterval * 2), 0, 1)
    const accentConfidence = mean > 0 ? clamp(accent / (mean * DOWNBEAT_ACCENT_THRESHOLD), 0, 1) : 0.5
    const accentWeight = atBoundary ? 0.7 : 0.5
    const timingWeight = atBoundary ? 0.3 : 0.5
    this.confidence = timingConfidence * timingWeight + accentConfidence * accentWeight
    if (atBoundary && this.confidence < 0.6) this.confidence = Math.max(this.confidence, 0.55)

    if (atBoundary) return true
    if (nearBoundary && strongAccent) return this.confidence >= DOWNBEAT_CONFIDENCE_THRESHOLD
    if (strongAccent && this.beatsSinceDownbeat === 0) return this.confidence >= DOWNBEAT_CONFIDENCE_THRESHOLD
    return false
  }

  private detectMeter(): void {
    let detected = this.beatsPerMeasure
    if (this.accents.length >= 8) {
      let bestScore = 0
      let best = 4
      for (const meter of DOWNBEAT_METER_CANDIDATES) {
        let score = 0
        for (let i = 0; i < this.accents.length; i++) {
          score += i % meter === 0 ? this.accents[i] : (2 - this.accents[i]) * 0.5
        }
        if (score > bestScore) {
          bestScore = score
          best = meter
        }
      }
      detected = best
    }
    if (this.meters.length >= DOWNBEAT_METER_HISTORY) this.meters.shift()
    this.meters.push(detected)
    const consensus = this.mostCommonMeter()
    if (consensus !== this.beatsPerMeasure && this.meters.length >= DOWNBEAT_METER_HISTORY / 2) {
      this.beatsPerMeasure = consensus
      this.currentBeat = 1
      this.beatsSinceDownbeat = 0
    }
  }

  private mostCommonMeter(): number {
    if (this.meters.length === 0) return 4
    const counts = new Array<number>(16).fill(0)
    for (const m of this.meters) if (m >= 2 && m < 16) counts[m]++
    let max = 0
    let common = 4
    for (let m = 2; m < 16; m++) {
      if (counts[m] > max) {
        max = counts[m]
        common = m
      }
    }
    return common
  }

  private updatePhase(timestamp: number, bpm: number): void {
    if (this.lastDownbeatTime === 0) {
      this.measurePhase = 0
      return
    }
    const beatInterval = bpm > 0 ? 60000 / bpm : 500
    const measure = beatInterval * this.beatsPerMeasure
    if (measure > 0) {
      this.measurePhase = (timestamp - this.lastDownbeatTime) / measure
      while (this.measurePhase >= 1) this.measurePhase -= 1
    } else {
      this.measurePhase = 0
    }
  }
}

// ── detector/buildup ─────────────────────────────────────────────────────────

export const BUILDUP_MIN_DURATION_MS = 2000
export const BUILDUP_MAX_DURATION_MS = 16000
export const BUILDUP_INTENSITY_THRESHOLD = 0.6
export const BUILDUP_ENERGY_RISE_THRESHOLD = 0.3
const BUILDUP_ENERGY_HISTORY = 32
const BUILDUP_TREBLE_HISTORY = 16

export class BuildupDetector {
  active = false
  progress = 0
  intensity = 0
  private durationMs = 0
  private startMs = 0
  private peakFired = false
  private energy = new Float64Array(BUILDUP_ENERGY_HISTORY)
  private energyIndex = 0
  private energySize = 0
  private treble = new Float64Array(BUILDUP_TREBLE_HISTORY)
  private trebleIndex = 0
  private trebleSize = 0
  private energySG = new SavitzkyGolay(7)
  private trebleSG = new SavitzkyGolay(7)

  update(frame: StructureFrame): void {
    const rms = frame.rms
    const raw = frame.bins32
    const timestamp = frame.timestampMs
    const start = Math.trunc(raw.length * 0.75)
    let sum = 0
    let count = 0
    for (let i = start; i < raw.length; i++) {
      sum += raw[i]
      count++
    }
    const trebleEnergy = count > 0 ? sum / count : 0

    this.energy[this.energyIndex] = rms
    this.energyIndex = (this.energyIndex + 1) % BUILDUP_ENERGY_HISTORY
    if (this.energySize < BUILDUP_ENERGY_HISTORY) this.energySize++
    this.treble[this.trebleIndex] = trebleEnergy
    this.trebleIndex = (this.trebleIndex + 1) % BUILDUP_TREBLE_HISTORY
    if (this.trebleSize < BUILDUP_TREBLE_HISTORY) this.trebleSize++
    this.energySG.update(rms)
    this.trebleSG.update(trebleEnergy)

    const energyTrend = this.energyTrend()
    const trebleTrend = this.trebleTrend()
    const intensity = this.computeIntensity(energyTrend, trebleTrend, rms)

    if (!this.active) {
      if (this.energySize >= 8 && intensity >= BUILDUP_INTENSITY_THRESHOLD && energyTrend >= BUILDUP_ENERGY_RISE_THRESHOLD) {
        this.active = true
        this.peakFired = false
        this.startMs = timestamp
        this.intensity = intensity
        this.progress = 0
        this.durationMs = 0
      }
    } else {
      this.durationMs = timestamp - this.startMs
      this.intensity = intensity
      this.progress = Math.min(1, this.durationMs / BUILDUP_MAX_DURATION_MS)
      if (!this.peakFired && this.shouldPeak()) this.peakFired = true
      if (this.shouldEnd(energyTrend)) this.active = false
    }
  }

  reset(): void {
    this.active = false
    this.progress = 0
    this.intensity = 0
    this.durationMs = 0
    this.startMs = 0
    this.peakFired = false
    this.energy.fill(0)
    this.energyIndex = 0
    this.energySize = 0
    this.treble.fill(0)
    this.trebleIndex = 0
    this.trebleSize = 0
    this.energySG.reset()
    this.trebleSG.reset()
  }

  private energyTrend(): number {
    if (this.energySize < 8 || !this.energySG.full()) return 0
    const oldest = this.energy[this.energySize < BUILDUP_ENERGY_HISTORY ? 0 : this.energyIndex]
    if (oldest < 1e-6) return 0
    return clamp((this.energySG.value() - oldest) / oldest, 0, 2)
  }

  private trebleTrend(): number {
    if (this.trebleSize < 4 || !this.trebleSG.full()) return 0
    const oldest = this.treble[this.trebleSize < BUILDUP_TREBLE_HISTORY ? 0 : this.trebleIndex]
    if (oldest < 1e-6) return 0
    return clamp((this.trebleSG.value() - oldest) / oldest, 0, 2)
  }

  private computeIntensity(energyTrend: number, trebleTrend: number, rms: number): number {
    const value = (energyTrend / 2) * 0.5 + (trebleTrend / 2) * 0.3 + Math.min(1, rms) * 0.2
    return clamp(value, 0, 1)
  }

  private shouldPeak(): boolean {
    const durationOk = this.durationMs >= BUILDUP_MIN_DURATION_MS
    const nearEnd = this.progress >= 0.85
    const highIntensity = this.intensity >= 0.9
    const atMax = this.durationMs >= BUILDUP_MAX_DURATION_MS * 0.95
    return durationOk && (nearEnd || highIntensity || atMax)
  }

  private shouldEnd(energyTrend: number): boolean {
    if (this.durationMs > BUILDUP_MAX_DURATION_MS) return true
    if (energyTrend < -0.5) return true
    return this.intensity < BUILDUP_INTENSITY_THRESHOLD * 0.5
  }
}

// ── detector/drop ────────────────────────────────────────────────────────────

export const DROP_IMPACT_THRESHOLD = 0.75
export const DROP_MIN_INTERVAL_MS = 2000
export const DROP_BASS_THRESHOLD = 0.6
export const DROP_ENERGY_FLUX_THRESHOLD = 0.5
const DROP_BASELINE_ALPHA = 0.9

export class DropDetector {
  /** True for the frame a drop was detected. */
  drop = false
  /** Impact of the most recent drop; persists, as `getLastDrop().impact` does. */
  impact = 0
  private lastDropMs = 0
  private prevRms = 0
  private prevBass = 0
  private prevMid = 0
  private prevTreble = 0
  private energyBaseline = 0
  private bassBaseline = 0

  update(frame: StructureFrame): void {
    const raw = frame.bins32
    const rms = frame.rms
    const timestamp = frame.timestampMs
    const n = raw.length
    const bassEnd = Math.max(1, n >> 2)
    let bass = 0
    for (let i = 0; i < bassEnd; i++) bass += raw[i]
    bass /= bassEnd
    const midStart = n >> 2
    const midEnd = Math.trunc((n * 3) / 4)
    let mid = 0
    let midCount = 0
    for (let i = midStart; i < midEnd; i++) {
      mid += raw[i]
      midCount++
    }
    mid = midCount > 0 ? mid / midCount : 0
    let treble = 0
    let trebleCount = 0
    for (let i = midEnd; i < n; i++) {
      treble += raw[i]
      trebleCount++
    }
    treble = trebleCount > 0 ? treble / trebleCount : 0

    const energyFlux = this.flux(rms, this.energyBaseline)
    const bassFlux = this.flux(bass, this.bassBaseline)
    const novelty = Math.min(
      1,
      (Math.abs(bass - this.prevBass) * 0.5 + Math.abs(mid - this.prevMid) * 0.3 + Math.abs(treble - this.prevTreble) * 0.2) / 2,
    )
    const impact = clamp(
      energyFlux * 0.4 + bassFlux * 0.35 + novelty * 0.15 + Math.min(1, rms) * 0.1,
      0,
      1,
    )

    this.drop = false
    if (this.shouldTrigger(impact, timestamp)) {
      this.impact = impact
      this.lastDropMs = timestamp
      this.drop = true
    }

    if (this.energyBaseline < 1e-6) {
      this.energyBaseline = rms
      this.bassBaseline = bass
    } else {
      this.energyBaseline = DROP_BASELINE_ALPHA * this.energyBaseline + (1 - DROP_BASELINE_ALPHA) * rms
      this.bassBaseline = DROP_BASELINE_ALPHA * this.bassBaseline + (1 - DROP_BASELINE_ALPHA) * bass
    }
    this.prevRms = rms
    this.prevBass = bass
    this.prevMid = mid
    this.prevTreble = treble
  }

  reset(): void {
    this.drop = false
    this.impact = 0
    this.lastDropMs = 0
    this.prevRms = 0
    this.prevBass = 0
    this.prevMid = 0
    this.prevTreble = 0
    this.energyBaseline = 0
    this.bassBaseline = 0
  }

  private flux(current: number, baseline: number): number {
    if (baseline < 1e-6) return 0
    return clamp((current - baseline) / baseline / 2, 0, 1)
  }

  private shouldTrigger(impact: number, timestamp: number): boolean {
    if (impact < DROP_IMPACT_THRESHOLD) return false
    if (timestamp - this.lastDropMs < DROP_MIN_INTERVAL_MS) return false
    // The C++ tests the previous frame's values against the baselines that
    // were updated after them; both are read here before the update, as there.
    if (this.flux(this.prevRms, this.energyBaseline) < DROP_ENERGY_FLUX_THRESHOLD) return false
    if (this.flux(this.prevBass, this.bassBaseline) < DROP_BASS_THRESHOLD * 0.5) return false
    return true
  }
}

// ── detector/mood_analyzer ───────────────────────────────────────────────────

const MOOD_AVERAGING_FRAMES = 10

export class MoodAnalyzer {
  valence = 0
  arousal = 0
  private valenceHistory: number[] = []
  private arousalHistory: number[] = []
  private index = 0

  update(frame: StructureFrame): void {
    const raw = frame.bins32
    const centroid = this.centroid(raw)
    const rolloff = this.rolloff(raw)
    // Spectral flux needs Context::getHistoricalFFT(1), which the processor
    // never enables, so the C++ reads no previous frame and the flux is 0.
    const flux = 0
    const valence = this.calcValence(centroid, rolloff, flux)
    const arousal = this.calcArousal(frame.rms, frame.zcf, flux)

    if (this.valenceHistory.length < MOOD_AVERAGING_FRAMES) {
      this.valenceHistory.push(valence)
      this.arousalHistory.push(arousal)
      this.index = this.valenceHistory.length % MOOD_AVERAGING_FRAMES
    } else {
      this.valenceHistory[this.index] = valence
      this.arousalHistory[this.index] = arousal
      this.index = (this.index + 1) % MOOD_AVERAGING_FRAMES
    }
    let v = 0
    let a = 0
    for (let i = 0; i < this.valenceHistory.length; i++) {
      v += this.valenceHistory[i]
      a += this.arousalHistory[i]
    }
    this.valence = v / this.valenceHistory.length
    this.arousal = a / this.arousalHistory.length
  }

  reset(): void {
    this.valence = 0
    this.arousal = 0
    this.valenceHistory.length = 0
    this.arousalHistory.length = 0
    this.index = 0
  }

  private centroid(raw: Float32Array): number {
    let weighted = 0
    let magnitude = 0
    for (let i = 0; i < raw.length; i++) {
      weighted += i * raw[i]
      magnitude += raw[i]
    }
    return magnitude < 1e-6 ? 0 : weighted / magnitude
  }

  private rolloff(raw: Float32Array, threshold = 0.85): number {
    let total = 0
    for (let i = 0; i < raw.length; i++) total += raw[i] * raw[i]
    const limit = total * threshold
    let cumulative = 0
    for (let i = 0; i < raw.length; i++) {
      cumulative += raw[i] * raw[i]
      if (cumulative >= limit) return i / raw.length
    }
    return 1
  }

  private calcValence(centroid: number, rolloff: number, flux: number): number {
    const brightness = (centroid / 32) * rolloff
    const stability = 1 - Math.min(1, flux / 10)
    return clamp((brightness * 0.6 + stability * 0.4) * 2 - 1, -1, 1)
  }

  private calcArousal(rms: number, zcr: number, flux: number): number {
    return clamp(Math.min(1, rms) * 0.5 + Math.min(1, zcr) * 0.2 + Math.min(1, flux / 10) * 0.3, 0, 1)
  }
}

// ── detector/tempo_analyzer (stability only) ─────────────────────────────────

const TEMPO_MIN_BPM = 60
const TEMPO_MAX_BPM = 180
const TEMPO_STABILITY_THRESHOLD = 0.8
const TEMPO_MIN_INTERVAL_MS = 250
const TEMPO_MAX_INTERVAL_MS = 2000
const TEMPO_MAX_HYPOTHESES = 5
const TEMPO_MAX_ONSETS = 50
const TEMPO_BPM_HISTORY = 20
const TEMPO_STABLE_FRAMES = 10

interface TempoHypothesis {
  bpm: number
  score: number
  onsetCount: number
}

export class TempoAnalyzer {
  stable = false
  private stability = 0
  private stableFrames = 0
  private currentBpm = 120
  private previousFlux = 0
  private adaptiveThreshold = 0
  private previousMagnitudes = new Float32Array(8)
  private fluxAvg = new MovingAverage(43)
  private onsets: number[] = []
  private hypotheses: TempoHypothesis[] = []
  private median = new MedianFilter(21)
  private bpmHistory: number[] = []

  update(frame: StructureFrame): void {
    const raw = frame.bins16
    const timestamp = frame.timestampMs
    const numBins = Math.min(8, raw.length)
    let flux = 0
    for (let i = 0; i < numBins; i++) {
      const diff = raw[i] - this.previousMagnitudes[i]
      if (diff > 0) flux += diff
    }
    flux /= numBins

    this.adaptiveThreshold = this.fluxAvg.update(this.previousFlux) * 1.5
    if (this.detectOnset(timestamp)) {
      this.onsets.push(timestamp)
      if (this.onsets.length > TEMPO_MAX_ONSETS) this.onsets.shift()
      this.updateHypotheses(timestamp)
    }
    this.previousFlux = flux
    for (let i = 0; i < numBins; i++) this.previousMagnitudes[i] = raw[i]

    this.prune()
    if (this.hypotheses.length > 0) {
      this.currentBpm = this.median.update(this.hypotheses[0].bpm)
      this.bpmHistory.push(this.currentBpm)
      if (this.bpmHistory.length > TEMPO_BPM_HISTORY) this.bpmHistory.shift()
    }
    this.updateStability()
  }

  reset(): void {
    this.stable = false
    this.stability = 0
    this.stableFrames = 0
    this.currentBpm = 120
    this.previousFlux = 0
    this.adaptiveThreshold = 0
    this.previousMagnitudes.fill(0)
    this.fluxAvg.reset()
    this.onsets.length = 0
    this.hypotheses.length = 0
    this.median.reset()
    this.bpmHistory.length = 0
  }

  private detectOnset(timestamp: number): boolean {
    if (this.previousFlux <= this.adaptiveThreshold) return false
    if (this.onsets.length > 0 && timestamp - this.onsets[this.onsets.length - 1] < 50) return false
    return true
  }

  private intervalScore(interval: number): number {
    const bpm = 60000 / interval
    if (bpm >= TEMPO_MIN_BPM && bpm <= TEMPO_MAX_BPM) return 1
    const outside = bpm < TEMPO_MIN_BPM ? TEMPO_MIN_BPM - bpm : bpm - TEMPO_MAX_BPM
    return Math.max(0.1, 1 - outside / (TEMPO_MAX_BPM - TEMPO_MIN_BPM))
  }

  private updateHypotheses(timestamp: number): void {
    for (let i = 0; i < this.onsets.length - 1; i++) {
      const interval = timestamp - this.onsets[i]
      if (interval < TEMPO_MIN_INTERVAL_MS || interval > TEMPO_MAX_INTERVAL_MS) continue
      const bpm = 60000 / interval
      if (bpm < TEMPO_MIN_BPM || bpm > TEMPO_MAX_BPM) continue
      const existing = this.hypotheses.find((h) => Math.abs(h.bpm - bpm) < 3)
      if (existing) {
        existing.bpm = (existing.bpm + bpm) * 0.5
        existing.score += this.intervalScore(interval)
        existing.onsetCount++
      } else if (this.hypotheses.length < TEMPO_MAX_HYPOTHESES) {
        this.hypotheses.push({ bpm, score: this.intervalScore(interval), onsetCount: 1 })
      }
    }
  }

  private prune(): void {
    for (const h of this.hypotheses) h.score *= 0.95
    this.hypotheses = this.hypotheses.filter((h) => h.score >= 0.1)
    // The C++ exchange sort is not stable; ties are vanishingly rare with
    // float scores, so a stable descending sort gives the same order.
    this.hypotheses.sort((a, b) => b.score - a.score)
    if (this.hypotheses.length > TEMPO_MAX_HYPOTHESES) this.hypotheses.length = TEMPO_MAX_HYPOTHESES
  }

  private updateStability(): void {
    if (this.bpmHistory.length < 5) {
      this.stability = 0
      this.stable = false
      this.stableFrames = 0
      return
    }
    let sum = 0
    for (const b of this.bpmHistory) sum += b
    const mean = sum / this.bpmHistory.length
    let variance = 0
    for (const b of this.bpmHistory) variance += (b - mean) * (b - mean)
    variance /= this.bpmHistory.length
    this.stability = Math.max(0, 1 - Math.sqrt(variance) / 10)
    if (this.stability >= TEMPO_STABILITY_THRESHOLD) {
      this.stableFrames++
      if (this.stableFrames >= TEMPO_STABLE_FRAMES) this.stable = true
    } else {
      this.stableFrames = 0
      this.stable = false
    }
  }
}

// ── combined ─────────────────────────────────────────────────────────────────

export class SongStructureDetector {
  private downbeat = new DownbeatDetector()
  private buildup = new BuildupDetector()
  private drop = new DropDetector()
  private mood = new MoodAnalyzer()
  private tempo = new TempoAnalyzer()

  update(frame: StructureFrame): SongStructureSignal {
    this.downbeat.update(frame)
    this.buildup.update(frame)
    this.drop.update(frame)
    this.mood.update(frame)
    this.tempo.update(frame)
    return {
      downbeat: this.downbeat.downbeat,
      beatNumber: this.downbeat.currentBeat,
      measurePhase: clamp(this.downbeat.measurePhase, 0, 1),
      building: this.buildup.active,
      buildupProgress: clamp(this.buildup.progress, 0, 1),
      drop: this.drop.drop,
      dropImpact: clamp(this.drop.impact, 0, 1),
      tempoStable: this.tempo.stable,
      valence: clamp(this.mood.valence, -1, 1),
      arousal: clamp(this.mood.arousal, 0, 1),
    }
  }

  reset(): void {
    this.downbeat.reset()
    this.buildup.reset()
    this.drop.reset()
    this.mood.reset()
    this.tempo.reset()
  }
}

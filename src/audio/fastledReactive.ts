// TypeScript port of FastLED 3.10.3's fl::audio analysis pipeline — the same
// machinery the generated firmware gets from FastLED.add(Config::CreateInmp441(...)).
// Preview and firmware stay matched by construction: this file mirrors, class
// for class and constant for constant, the sources vendored at
// backend/.fbuild-project/lib/FastLED/src/fl/audio/ —
//   math/filter/*                  → ExponentialSmoother / AttackDecayFilter / MovingAverage
//   signal_conditioner.cpp.hpp     → conditionSamples (DC removal + hysteresis noise gate)
//   detector/frequency_bands.*     → FrequencyBands (bass/mid/treble, adaptive normalization)
//   detector/beat.*                → BeatDetector (bass spectral flux, adaptive threshold, BPM)
//   detector/vibe.*                → VibeDetector (MilkDrop self-normalising levels and spikes)
//
// Two deliberate deviations from the C++ originals, both documented inline:
// the spike filter is skipped (it rejects I2S wire glitches that browser audio
// cannot have), and the constant-Q FFT kernels are approximated by log-spaced
// aggregation of the plain radix-2 FFT (magnitude scale is comparable; the
// per-band adaptive normalization makes the band outputs scale-independent).
//
// All magnitudes are in "int16 amplitude" units (a full-scale sine ≈ 32767) so
// the absolute thresholds ported from C++ (noise gate 500/300, beat flux floor
// 50) keep their calibration.

import { fftInPlace } from './micAnalysis'
import type { PitchSignal, SongStructureSignal, VibeSignal } from '../state/evaluator/types'
import { SongStructureDetector, structureBins } from './fastledStructure'
import { PitchAnalyzer } from './fastledPitch'
import { decimateWave, WAVE_SAMPLES } from '../state/evaluator/waveform'

export const I16_FULL_SCALE = 32767
/** Sample::pcm() / 32768 is how the device normalises a chunk. */
const I16_FULL_SCALE_PCM = 32768

// ── fl/math/filter ───────────────────────────────────────────────────────────

/** Time-aware exponential smoother: y = x + (y − x)·e^(−dt/τ). */
export class ExponentialSmoother {
  private y: number
  constructor(private tau: number, initial = 0) {
    this.y = initial
  }
  update(input: number, dtSec: number): number {
    if (this.tau <= 0) {
      this.y = input
      return this.y
    }
    const decay = Math.exp(-dtSec / this.tau)
    this.y = input + (this.y - input) * decay
    return this.y
  }
  value(): number {
    return this.y
  }
  reset(initial = 0): void {
    this.y = initial
  }
}

/** Asymmetric smoother: attack τ when rising, decay τ when falling. With
 *  attack ≈ 0 and decay 4 s this is fl::audio's running-max tracker. */
export class AttackDecayFilter {
  private y: number
  constructor(private attackTau: number, private decayTau: number, initial = 0) {
    this.y = initial
  }
  update(input: number, dtSec: number): number {
    const tau = input > this.y ? this.attackTau : this.decayTau
    if (tau <= 0) {
      this.y = input
      return this.y
    }
    const decay = Math.exp(-dtSec / tau)
    this.y = input + (this.y - input) * decay
    return this.y
  }
  value(): number {
    return this.y
  }
  reset(initial = 0): void {
    this.y = initial
  }
}

/** O(1) running mean over the last `size` samples (partial mean until full). */
export class MovingAverage {
  private buf: Float64Array
  private idx = 0
  private count = 0
  private sum = 0
  constructor(size: number) {
    this.buf = new Float64Array(Math.max(1, size))
  }
  update(v: number): number {
    this.sum -= this.buf[this.idx]
    this.buf[this.idx] = v
    this.sum += v
    this.idx = (this.idx + 1) % this.buf.length
    if (this.count < this.buf.length) this.count++
    return this.sum / this.count
  }
  reset(): void {
    this.buf.fill(0)
    this.idx = 0
    this.count = 0
    this.sum = 0
  }
}

// ── signal_conditioner.cpp.hpp ───────────────────────────────────────────────

// C++ SignalConditionerConfig defaults (int16 units).
export const NOISE_GATE_OPEN = 500
export const NOISE_GATE_CLOSE = 300

export interface ConditionerState {
  gateOpen: boolean
}

export function createConditionerState(): ConditionerState {
  return { gateOpen: false }
}

/**
 * Port of SignalConditioner::processSample minus the spike filter (browser
 * audio has no I2S glitches to reject): per-buffer DC offset removal followed
 * by the hysteresis noise gate. The gate zeroing silence is load-bearing —
 * it is what stops the adaptive band normalization from slowly normalizing
 * ambient noise up to full scale.
 *
 * Mutates `samples` (int16-scale floats) in place.
 */
export function conditionSamples(samples: Float32Array, state: ConditionerState): void {
  const n = samples.length
  if (n === 0) return
  let sum = 0
  for (let i = 0; i < n; i++) sum += samples[i]
  const dc = sum / n
  let gateOpen = state.gateOpen
  for (let i = 0; i < n; i++) {
    let s = samples[i] - dc
    if (s > 32767) s = 32767
    else if (s < -32768) s = -32768
    const abs = s < 0 ? -s : s
    if (!gateOpen) {
      if (abs >= NOISE_GATE_OPEN) gateOpen = true
    } else if (abs < NOISE_GATE_CLOSE) {
      gateOpen = false
    }
    samples[i] = gateOpen ? s : 0
  }
  state.gateOpen = gateOpen
}

// ── constant-Q approximation: log-spaced bin aggregation ─────────────────────

/** Log-spaced bin centre frequency, matching fft::Bins::binToFreq:
 *  fmin · (fmax/fmin)^(i/(bands−1)). */
export function logBinToFreq(i: number, bands: number, fmin: number, fmax: number): number {
  if (bands <= 1) return fmin
  return fmin * Math.pow(fmax / fmin, i / (bands - 1))
}

/** Boundary between log bins i and i+1 — the geometric mean of their centres
 *  (matches fft::Bins::binBoundary). */
export function logBinBoundary(i: number, bands: number, fmin: number, fmax: number): number {
  return Math.sqrt(logBinToFreq(i, bands, fmin, fmax) * logBinToFreq(i + 1, bands, fmin, fmax))
}

/**
 * Fold a one-sided linear FFT magnitude spectrum into `bands` log-spaced bins
 * between fmin and fmax — the LOG_REBIN approximation of FastLED's CQ kernels.
 * Each output bin averages the linear bins whose centre falls inside its
 * boundaries; a log bin narrower than one linear bin samples its nearest.
 */
export function aggregateLogBins(
  mags: Float32Array,
  sampleRate: number,
  fftSize: number,
  bands: number,
  fmin: number,
  fmax: number,
  out: Float32Array,
): void {
  const binHz = sampleRate / fftSize
  const maxLinear = Math.min(mags.length - 1, fftSize / 2 - 1)
  for (let b = 0; b < bands; b++) {
    const lo = b === 0 ? fmin : logBinBoundary(b - 1, bands, fmin, fmax)
    const hi = b === bands - 1 ? fmax : logBinBoundary(b, bands, fmin, fmax)
    let from = Math.max(1, Math.ceil(lo / binHz))
    let to = Math.min(maxLinear, Math.floor(hi / binHz))
    if (to < from) {
      // Narrower than one linear bin — sample the nearest.
      const nearest = Math.max(1, Math.min(maxLinear, Math.round(logBinToFreq(b, bands, fmin, fmax) / binHz)))
      from = nearest
      to = nearest
    }
    let sum = 0
    for (let i = from; i <= to; i++) sum += mags[i]
    out[b] = sum / (to - from + 1)
  }
}

// ── detector/frequency_bands ─────────────────────────────────────────────────

// C++ anonymous-namespace constants in frequency_bands.cpp.hpp.
export const BANDS_NUM_BINS = 64
export const BANDS_FFT_MIN_HZ = 100
export const BANDS_FFT_MAX_HZ = 10000
// Band ranges from the FrequencyBands constructor.
export const BASS_RANGE: readonly [number, number] = [20, 250]
export const MID_RANGE: readonly [number, number] = [250, 4000]
export const TREBLE_RANGE: readonly [number, number] = [4000, 20000]

export interface BandLevels {
  /** Smoothed raw band energies (int16-amplitude units). */
  bass: number
  mid: number
  treble: number
  /** Adaptively normalized 0–1 levels — what Processor::getBassLevel() etc. return. */
  bassNorm: number
  midNorm: number
  trebleNorm: number
}

export class FrequencyBands {
  private bins = new Float32Array(BANDS_NUM_BINS)
  private bassSmoother = new ExponentialSmoother(0.05)
  private midSmoother = new ExponentialSmoother(0.05)
  private trebleSmoother = new ExponentialSmoother(0.05)
  private bassMax = new AttackDecayFilter(0.001, 4.0)
  private midMax = new AttackDecayFilter(0.001, 4.0)
  private trebleMax = new AttackDecayFilter(0.001, 4.0)

  update(mags: Float32Array, sampleRate: number, fftSize: number, dtSec: number): BandLevels {
    const fmax = Math.min(BANDS_FFT_MAX_HZ, sampleRate / 2)
    aggregateLogBins(mags, sampleRate, fftSize, BANDS_NUM_BINS, BANDS_FFT_MIN_HZ, fmax, this.bins)
    const bassE = this.bandEnergy(BASS_RANGE[0], BASS_RANGE[1], BANDS_FFT_MIN_HZ, fmax)
    const midE = this.bandEnergy(MID_RANGE[0], MID_RANGE[1], BANDS_FFT_MIN_HZ, fmax)
    const trebleE = this.bandEnergy(TREBLE_RANGE[0], TREBLE_RANGE[1], BANDS_FFT_MIN_HZ, fmax)
    const bass = this.bassSmoother.update(bassE, dtSec)
    const mid = this.midSmoother.update(midE, dtSec)
    const treble = this.trebleSmoother.update(trebleE, dtSec)
    const norm = (val: number, filter: AttackDecayFilter) => {
      let runningMax = filter.update(val, dtSec)
      if (runningMax < 0.001) runningMax = 0.001
      return Math.min(1, val / runningMax)
    }
    return {
      bass,
      mid,
      treble,
      bassNorm: norm(bass, this.bassMax),
      midNorm: norm(mid, this.midMax),
      trebleNorm: norm(treble, this.trebleMax),
    }
  }

  reset(): void {
    this.bassSmoother.reset()
    this.midSmoother.reset()
    this.trebleSmoother.reset()
    this.bassMax.reset()
    this.midMax.reset()
    this.trebleMax.reset()
  }

  /** Port of FrequencyBands::calculateBandEnergy — fractional-overlap weighted
   *  mean of the log bins covering [minFreq, maxFreq]. */
  private bandEnergy(minFreq: number, maxFreq: number, fftMin: number, fftMax: number): number {
    let totalEnergy = 0
    let totalWeight = 0
    for (let i = 0; i < BANDS_NUM_BINS; i++) {
      const binLow = i === 0 ? fftMin : logBinBoundary(i - 1, BANDS_NUM_BINS, fftMin, fftMax)
      const binHigh = i === BANDS_NUM_BINS - 1 ? fftMax : logBinBoundary(i, BANDS_NUM_BINS, fftMin, fftMax)
      const overlapMin = Math.max(binLow, minFreq)
      const overlapMax = Math.min(binHigh, maxFreq)
      if (overlapMax <= overlapMin) continue
      const overlapFraction = (overlapMax - overlapMin) / (binHigh - binLow)
      totalEnergy += this.bins[i] * overlapFraction
      totalWeight += overlapFraction
    }
    return totalWeight > 0 ? totalEnergy / totalWeight : 0
  }
}

// ── detector/beat ────────────────────────────────────────────────────────────

export const BEAT_NUM_BINS = 16
export const BEAT_FFT_MIN_HZ = 30
export const BEAT_FFT_MAX_HZ = 14080
export const MIN_BEAT_INTERVAL_MS = 250 // max 240 BPM
export const MAX_BEAT_INTERVAL_MS = 2000 // min 30 BPM
export const MIN_FLUX_THRESHOLD = 50 // absolute floor, int16-amplitude units
export const FLUX_HISTORY_SIZE = 43 // ~1 second of frames

export interface BeatResult {
  beat: boolean
  bpm: number
  confidence: number
  phase: number
  flux: number
}

export class BeatDetector {
  threshold = 1.3
  sensitivity = 1.0
  private bins = new Float32Array(BEAT_NUM_BINS)
  private prevMags = new Float32Array(BEAT_NUM_BINS)
  private fluxAvg = new MovingAverage(FLUX_HISTORY_SIZE)
  private adaptiveThreshold = 0
  private bpm = 120
  private beatIntervalMs = 500
  private lastBeatTime = 0
  private confidence = 0
  private phase = 0

  update(mags: Float32Array, sampleRate: number, fftSize: number, timestampMs: number): BeatResult {
    const fmax = Math.min(BEAT_FFT_MAX_HZ, sampleRate / 2)
    aggregateLogBins(mags, sampleRate, fftSize, BEAT_NUM_BINS, BEAT_FFT_MIN_HZ, fmax, this.bins)

    // Spectral flux over the bass half of the bins (kick fundamentals);
    // treble transients (hi-hats, cymbals) are deliberately excluded.
    const bassBins = BEAT_NUM_BINS / 2
    let flux = 0
    for (let i = 0; i < bassBins; i++) {
      const diff = this.bins[i] - this.prevMags[i]
      if (diff > 0) flux += diff
    }
    flux /= bassBins

    // Detect BEFORE updating the running average, so an onset's own (high)
    // flux cannot inflate the threshold at the moment it is needed lowest.
    const beat = this.detectBeat(flux, timestampMs)
    this.adaptiveThreshold = this.fluxAvg.update(flux) * this.threshold * this.sensitivity

    if (beat) {
      this.updateTempo(timestampMs)
      this.lastBeatTime = timestampMs
    }
    this.updatePhase(timestampMs)
    this.prevMags.set(this.bins)

    return { beat, bpm: this.bpm, confidence: this.confidence, phase: this.phase, flux }
  }

  reset(): void {
    this.prevMags.fill(0)
    this.fluxAvg.reset()
    this.adaptiveThreshold = 0
    this.bpm = 120
    this.beatIntervalMs = 500
    this.lastBeatTime = 0
    this.confidence = 0
    this.phase = 0
  }

  private detectBeat(flux: number, timestampMs: number): boolean {
    // Adaptive threshold with an absolute floor: the floor handles the
    // silence-to-signal transition (adaptive threshold near zero) and stops
    // spectral leakage from triggering false beats.
    const effectiveThreshold = Math.max(this.adaptiveThreshold, MIN_FLUX_THRESHOLD)
    if (flux <= effectiveThreshold) return false
    if (timestampMs - this.lastBeatTime < MIN_BEAT_INTERVAL_MS) return false
    this.confidence =
      this.adaptiveThreshold > 0
        ? Math.min(1, (flux - this.adaptiveThreshold) / this.adaptiveThreshold)
        : 1
    return true
  }

  private updateTempo(timestampMs: number): void {
    const interval = timestampMs - this.lastBeatTime
    if (interval >= MIN_BEAT_INTERVAL_MS && interval <= MAX_BEAT_INTERVAL_MS) {
      const alpha = 0.2
      this.beatIntervalMs = alpha * interval + (1 - alpha) * this.beatIntervalMs
      this.bpm = 60000 / this.beatIntervalMs
    }
  }

  private updatePhase(timestampMs: number): void {
    if (this.beatIntervalMs <= 0) {
      this.phase = 0
      return
    }
    this.phase = (timestampMs - this.lastBeatTime) / this.beatIntervalMs
    if (this.phase >= 1) this.phase = this.phase % 1
  }
}

// ── detector/vibe ────────────────────────────────────────────────────────────
// Port of fl::audio::detector::Vibe, itself Ryan Geiss's MilkDrop v2.25c
// DoCustomSoundAnalysis: three linear FFT bands, an asymmetric short average, a
// slow symmetric long average, and levels reported relative to that long
// average, so they sit near 1.0 for any song at any volume.

/** Context::getBandEnergy asks for 3 linear bins over 20–11025 Hz. */
export const VIBE_BAND_MIN_HZ = 20
export const VIBE_BAND_MAX_HZ = 11025
/** Per-frame rates are tuned at 30 fps and re-derived for the real interval. */
export const VIBE_TUNED_FPS = 30
export const VIBE_ATTACK_RATE = 0.2
export const VIBE_DECAY_RATE = 0.5
export const VIBE_LONG_RATE = 0.992
/** SilenceEnvelope tau in seconds; the target is 0, so music stopping fades. */
export const VIBE_SILENCE_TAU = 0.3
const VIBE_LONG_AVG_FLOOR = 0.001

/** Convert a per-frame retention tuned at `VIBE_TUNED_FPS` to the actual fps,
 *  keeping the per-second behaviour (Vibe::adjustRateToFPS). */
export function adjustVibeRate(rateAtTunedFps: number, actualFps: number): number {
  if (actualFps <= 0) return rateAtTunedFps
  return Math.pow(Math.pow(rateAtTunedFps, VIBE_TUNED_FPS), 1 / actualFps)
}

/** Mean magnitude of the linear bins falling in each third of [fmin, fmax]. */
export function linearBandEnergy(
  mags: Float32Array,
  sampleRate: number,
  fftSize: number,
  out: [number, number, number],
  fmin = VIBE_BAND_MIN_HZ,
  fmax = VIBE_BAND_MAX_HZ,
): void {
  const binHz = sampleRate / fftSize
  const top = Math.min(fmax, sampleRate / 2)
  const maxBin = Math.min(mags.length - 1, fftSize / 2 - 1)
  const width = (fmax - fmin) / 3
  for (let b = 0; b < 3; b++) {
    const lo = fmin + width * b
    const hi = Math.min(top, fmin + width * (b + 1))
    const from = Math.max(1, Math.ceil(lo / binHz))
    const to = Math.min(maxBin, Math.floor(hi / binHz))
    let sum = 0
    let count = 0
    for (let i = from; i <= to; i++) {
      sum += mags[i]
      count++
    }
    out[b] = count > 0 ? sum / count : 0
  }
}

export class VibeDetector {
  private frames = 0
  private imm = [0, 0, 0]
  private avg = [0, 0, 0]
  private longAvg = [0, 0, 0]
  private immRel = [1, 1, 1]
  private avgRel = [1, 1, 1]
  // SilenceEnvelope state, seeded at 1.0 like the C++ public state.
  private immEnv = [1, 1, 1]
  private avgEnv = [1, 1, 1]
  private spike = [false, false, false]
  private readonly energy: [number, number, number] = [0, 0, 0]

  /** One frame. `silent` is Context::isSilent(); `dtSec` the frame interval. */
  update(
    mags: Float32Array,
    sampleRate: number,
    fftSize: number,
    dtSec: number,
    silent: boolean,
  ): VibeSignal {
    this.frames++
    linearBandEnergy(mags, sampleRate, fftSize, this.energy)
    for (let i = 0; i < 3; i++) this.imm[i] = this.energy[i]
    const fps = dtSec > 0 ? 1 / dtSec : VIBE_TUNED_FPS

    if (this.frames === 1) {
      // First frame initialises the averages directly: no startup spike.
      for (let i = 0; i < 3; i++) {
        this.avg[i] = this.imm[i]
        this.longAvg[i] = this.imm[i]
      }
    } else {
      const attack = adjustVibeRate(VIBE_ATTACK_RATE, fps)
      const decay = adjustVibeRate(VIBE_DECAY_RATE, fps)
      const long = adjustVibeRate(VIBE_LONG_RATE, fps)
      for (let i = 0; i < 3; i++) {
        const rate = this.imm[i] > this.avg[i] ? attack : decay
        this.avg[i] = this.avg[i] * rate + this.imm[i] * (1 - rate)
        this.longAvg[i] = this.longAvg[i] * long + this.avg[i] * (1 - long)
      }
    }

    for (let i = 0; i < 3; i++) {
      if (this.longAvg[i] < VIBE_LONG_AVG_FLOOR) {
        this.immRel[i] = 1
        this.avgRel[i] = 1
      } else {
        this.immRel[i] = this.imm[i] / this.longAvg[i]
        this.avgRel[i] = this.avg[i] / this.longAvg[i]
      }
    }

    // Silence gate: pass through during audio, decay toward 0 in silence.
    for (let i = 0; i < 3; i++) {
      this.immRel[i] = this.envelope(this.immEnv, i, silent, this.immRel[i], dtSec)
      this.avgRel[i] = this.envelope(this.avgEnv, i, silent, this.avgRel[i], dtSec)
      this.spike[i] = this.immRel[i] > this.avgRel[i]
    }

    return {
      bass: this.immRel[0],
      mid: this.immRel[1],
      treble: this.immRel[2],
      volume: (this.immRel[0] + this.immRel[1] + this.immRel[2]) / 3,
      bassAtt: this.avgRel[0],
      midAtt: this.avgRel[1],
      trebleAtt: this.avgRel[2],
      bassSpike: this.spike[0],
      midSpike: this.spike[1],
      trebleSpike: this.spike[2],
    }
  }

  reset(): void {
    this.frames = 0
    for (let i = 0; i < 3; i++) {
      this.imm[i] = 0
      this.avg[i] = 0
      this.longAvg[i] = 0
      this.immRel[i] = 1
      this.avgRel[i] = 1
      this.immEnv[i] = 1
      this.avgEnv[i] = 1
      this.spike[i] = false
    }
  }

  /** SilenceEnvelope::update with target 0. */
  private envelope(state: number[], i: number, silent: boolean, value: number, dtSec: number): number {
    if (!silent) {
      state[i] = value
      return value
    }
    if (dtSec <= 0) {
      state[i] = 0
      return 0
    }
    state[i] += (0 - state[i]) * (1 - Math.exp(-dtSec / VIBE_SILENCE_TAU))
    return state[i]
  }
}

// ── detector/equalizer ───────────────────────────────────────────────────────
// FastLED's EqualizerDetector exposes 16 normalized log bins from 90–5120 Hz.
// Studio's established audio token carries 32 entries, so each FastLED bin is
// duplicated into two adjacent slots — the same mapping emitted by codegen.
// The C++ implementation additionally applies its CQT kernels, INMP441 response
// correction, and pink-noise compensation; those frequency-only multipliers
// largely cancel in the detector's per-bin adaptive normalization.

export const EQ_NUM_BINS = 16
export const EQ_MIN_HZ = 90
export const EQ_MAX_HZ = 5_120

export class EqualizerSpectrum {
  private bins = new Float32Array(EQ_NUM_BINS)
  private normalized = new Float32Array(EQ_NUM_BINS)
  private smoothers = Array.from({ length: EQ_NUM_BINS }, () => new ExponentialSmoother(0.05))
  private runningMax = Array.from({ length: EQ_NUM_BINS }, () => new AttackDecayFilter(0.001, 4.0))

  update(mags: Float32Array, sampleRate: number, fftSize: number, dtSec: number, out: number[]): void {
    const fmax = Math.min(EQ_MAX_HZ, sampleRate / 2)
    aggregateLogBins(mags, sampleRate, fftSize, EQ_NUM_BINS, EQ_MIN_HZ, fmax, this.bins)
    for (let i = 0; i < EQ_NUM_BINS; i++) {
      const smoothed = this.smoothers[i].update(this.bins[i], dtSec)
      const max = Math.max(0.001, this.runningMax[i].update(smoothed, dtSec))
      this.normalized[i] = Math.min(1, smoothed / max)
    }
    for (let i = 0; i < out.length; i++) {
      const source = Math.min(EQ_NUM_BINS - 1, Math.floor((i * EQ_NUM_BINS) / out.length))
      out[i] = this.normalized[source]
    }
  }

  reset(): void {
    for (const smoother of this.smoothers) smoother.reset()
    for (const max of this.runningMax) max.reset()
    this.bins.fill(0)
    this.normalized.fill(0)
  }
}

// ── orchestrator ─────────────────────────────────────────────────────────────

export interface FastLedAudioResult {
  bass: number
  mids: number
  treble: number
  beat: boolean
  bpm: number
  beatConfidence: number
  vibe: VibeSignal
  structure: SongStructureSignal
  pitch: PitchSignal
  samples: number[]
}

/**
 * The full per-frame analysis the AudioEngine runs: scale the browser's
 * −1…1 samples to int16 units (× MicInput gain), condition them, FFT once,
 * then feed the bands / beat / spectrum detectors. Mirrors what the firmware's
 * auto-pumped fl::audio::Processor computes from the INMP441.
 */
export class FastLedAudioAnalyzer {
  private re: Float32Array
  private im: Float32Array
  private mags: Float32Array
  private scaled: Float32Array
  private conditioner = createConditionerState()
  private bands = new FrequencyBands()
  private beat = new BeatDetector()
  private vibe = new VibeDetector()
  private structure = new SongStructureDetector()
  private pitch = new PitchAnalyzer()
  private wave = new Float32Array(WAVE_SAMPLES)
  private bins16 = new Float32Array(16)
  private bins32 = new Float32Array(32)
  private spectrum: EqualizerSpectrum
  private lastMs = 0

  constructor(private fftSize: number) {
    this.re = new Float32Array(fftSize)
    this.im = new Float32Array(fftSize)
    this.mags = new Float32Array(fftSize / 2)
    this.scaled = new Float32Array(fftSize)
    this.spectrum = new EqualizerSpectrum()
  }

  setBeatSensitivity(sensitivity: number): void {
    this.beat.sensitivity = Math.max(0.05, sensitivity)
  }

  process(
    samples: Float32Array,
    sampleRate: number,
    nowMs: number,
    gain: number,
    spectrumOut: number[],
  ): FastLedAudioResult {
    const n = this.fftSize
    const dtSec = this.lastMs > 0 ? Math.max(0.001, Math.min(0.5, (nowMs - this.lastMs) / 1000)) : 1 / 60
    this.lastMs = nowMs

    for (let i = 0; i < n; i++) {
      this.scaled[i] = (i < samples.length ? samples[i] : 0) * I16_FULL_SCALE * gain
    }
    conditionSamples(this.scaled, this.conditioner)
    // Context::isSilent stand-in: the conditioner's gate zeroed the whole
    // buffer, which is what FastLED's noise-floor tracker reports for it.
    let silent = true
    for (let i = 0; i < n; i++) {
      if (this.scaled[i] !== 0) {
        silent = false
        break
      }
    }

    // Hann window + radix-2 FFT; 4/N restores full-scale one-sided amplitude
    // (2/N one-sided × 2 for the Hann window's 0.5 coherent gain).
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
      this.re[i] = this.scaled[i] * w
      this.im[i] = 0
    }
    fftInPlace(this.re, this.im)
    this.mags[0] = 0
    for (let i = 1; i < n / 2; i++) {
      this.mags[i] = Math.hypot(this.re[i], this.im[i]) * (4 / n)
    }

    const levels = this.bands.update(this.mags, sampleRate, this.fftSize, dtSec)
    const beat = this.beat.update(this.mags, sampleRate, this.fftSize, nowMs)
    const vibe = this.vibe.update(this.mags, sampleRate, this.fftSize, dtSec, silent)
    structureBins(this.mags, sampleRate, this.fftSize, 16, this.bins16)
    structureBins(this.mags, sampleRate, this.fftSize, 32, this.bins32)
    let sumSquares = 0
    let crossings = 0
    for (let i = 0; i < n; i++) {
      sumSquares += this.scaled[i] * this.scaled[i]
      if (i > 0 && (this.scaled[i - 1] < 0) !== (this.scaled[i] < 0)) crossings++
    }
    const structure = this.structure.update({
      timestampMs: nowMs,
      bins16: this.bins16,
      bins32: this.bins32,
      rms: Math.sqrt(sumSquares / n),
      zcf: n > 1 ? crossings / (n - 1) : 0,
      beat: beat.beat,
      bpm: beat.bpm,
      silent,
    })
    const pitch = this.pitch.update(this.scaled, this.mags, sampleRate, this.fftSize, Math.sqrt(sumSquares / n), nowMs)
    decimateWave(this.scaled, this.wave)
    const waveSamples = Array.from(this.wave, (v) => v / I16_FULL_SCALE_PCM)
    this.spectrum.update(this.mags, sampleRate, this.fftSize, dtSec, spectrumOut)

    return {
      bass: levels.bassNorm,
      mids: levels.midNorm,
      treble: levels.trebleNorm,
      beat: beat.beat,
      bpm: beat.bpm,
      beatConfidence: beat.confidence,
      vibe,
      structure,
      pitch,
      samples: waveSamples,
    }
  }

  reset(): void {
    this.conditioner = createConditionerState()
    this.bands.reset()
    this.beat.reset()
    this.vibe.reset()
    this.structure.reset()
    this.pitch.reset()
    this.spectrum.reset()
    this.lastMs = 0
  }
}

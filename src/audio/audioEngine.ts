import { createBeatDetectorState, updateBeatDetectorFromSpectrum } from './beatDetection'
import {
  MIC_DEFAULTS,
  MIC_FFT_SIZE,
  MIC_MAX_GAIN,
  MIC_SAMPLE_RATE,
  MIC_SPECTRUM_BARS,
  MIC_SPECTRUM_MAX_HZ,
  MIC_SPECTRUM_MIN_HZ,
  MIC_SPECTRUM_SMOOTHING,
  MIC_THRESHOLD_RANGE,
  clamp01,
  elapsedAlpha,
  fillNormalizedFft,
  smoothingAlpha,
} from './micAnalysis'

const FFT_SIZE = MIC_FFT_SIZE
export const NUM_SPECTRUM_BARS = MIC_SPECTRUM_BARS

// Ask the browser for the physical microphone signal without conferencing DSP.
// In particular, Chrome's echo canceller can recognize audio played by this
// tab and remove it from the mic while leaving audio from an external player
// comparatively untouched. That makes identical speaker playback produce very
// different FFT balances. Studio owns gain, AGC, gating, and smoothing itself,
// and firmware receives a raw INMP441 signal, so browser processing belongs off.
export const MIC_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}

export interface AudioData {
  active: boolean
  bass: number
  mids: number
  treble: number
  beat: boolean
  bpm: number
  spectrum: number[]  // logarithmically spaced values, low → high
  detectorSpectrum: number[]
  previewSpectrum: number[]
  micActive: boolean
  micBass: number
  micMids: number
  micTreble: number
  micSpectrum: number[]
  micDetectorSpectrum: number[]
}

export interface MicNoiseGateConfig {
  gain: number
  agc: boolean
  threshold: number
  attack: number
  decay: number
}

interface NoiseGateState {
  floor: number
  level: number
}

const DEFAULT_GATE_STATE = (): NoiseGateState => ({ floor: 0.02, level: 0 })

// The 0..1 threshold slider maps onto a smaller portion of the normalized dB
// window. This keeps the useful adjustment range broad enough for microphones
// while exactly matching the generated firmware gate.
/**
 * Adaptive gate that tracks ambient noise, then only passes signal above the
 * floor + threshold. Attack/decay smooth the output to avoid chatter.
 */
export function applyNoiseGate(
  raw: number,
  prev: NoiseGateState,
  config: Pick<MicNoiseGateConfig, 'threshold' | 'attack' | 'decay'>,
  elapsedMs?: number,
): NoiseGateState {
  const floorTrack = elapsedAlpha(raw > prev.floor ? 0.0025 : 0.03, elapsedMs)
  const floor = clamp01(prev.floor + (raw - prev.floor) * floorTrack)
  const gate = clamp01(floor + clamp01(config.threshold) * MIC_THRESHOLD_RANGE)
  const target = raw > gate ? clamp01((raw - gate) / Math.max(1e-6, 1 - gate)) : 0
  const follow = elapsedAlpha(target > prev.level ? config.attack : config.decay, elapsedMs)
  const level = clamp01(prev.level + (target - prev.level) * follow)
  return { floor, level }
}

/** Average normalised FFT magnitude inside a frequency range. */
export function averageFrequencyBand(
  data: Uint8Array | Float32Array,
  sampleRate: number,
  fftSize: number,
  fromHz: number,
  toHz: number,
): number {
  const binHz = sampleRate / fftSize
  const last = Math.max(0, data.length - 1)
  const from = Math.max(0, Math.min(last, Math.ceil(fromHz / binHz)))
  // Frequency ranges are half-open [fromHz, toHz), matching the generated
  // firmware's <250 / <2000 splits and preventing boundary bins appearing in
  // two adjacent bands.
  const to = Math.max(from, Math.min(last, Math.ceil(toHz / binHz) - 1))
  let sum = 0
  const byteData = data instanceof Uint8Array
  for (let i = from; i <= to; i++) sum += byteData ? data[i] / 255 : data[i]
  return sum / (to - from + 1)
}

/** Log spacing gives bass detail instead of spending most bars above 10 kHz.
 *  Pass `out` to fill a reused buffer instead of allocating (the engine runs
 *  this every animation frame). */
export function logarithmicSpectrum(
  data: Uint8Array | Float32Array,
  sampleRate: number,
  fftSize: number,
  count = NUM_SPECTRUM_BARS,
  out?: number[],
): number[] {
  const nyquist = sampleRate / 2
  const high = Math.min(MIC_SPECTRUM_MAX_HZ, nyquist)
  const ratio = high / MIC_SPECTRUM_MIN_HZ
  const result = out ?? new Array<number>(count)
  result.length = count
  for (let i = 0; i < count; i++) {
    const from = MIC_SPECTRUM_MIN_HZ * ratio ** (i / count)
    const to = MIC_SPECTRUM_MIN_HZ * ratio ** ((i + 1) / count)
    result[i] = averageFrequencyBand(data, sampleRate, fftSize, from, to)
  }
  return result
}

export class AudioEngine {
  private static _instance: AudioEngine | null = null
  static get instance() {
    if (!AudioEngine._instance) AudioEngine._instance = new AudioEngine()
    return AudioEngine._instance
  }

  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private micSource: AudioNode | null = null
  private stream: MediaStream | null = null
  private buf: Float32Array | null = null
  private timeBuf: Float32Array | null = null
  private fftRe: Float32Array | null = null
  private fftIm: Float32Array | null = null
  private rawBinBuf: Float32Array | null = null
  private smoothedBuf: Float32Array | null = null
  private listeners = new Set<(data: AudioData) => void>()
  private rafId = 0
  private gateState = {
    bass: DEFAULT_GATE_STATE(),
    mids: DEFAULT_GATE_STATE(),
    treble: DEFAULT_GATE_STATE(),
    spectrum: Array.from({ length: NUM_SPECTRUM_BARS }, () => DEFAULT_GATE_STATE()),
  }
  private beatState = createBeatDetectorState()
  private agcPeak = 0.0001
  private lastTickMs = 0
  private lifecycleVersion = 0
  // Per-frame spectrum output buffers, in alternating pairs: consumers (the
  // audio store and its subscribers) dedupe on array identity, so each frame
  // must publish a *different* array object — alternating two reused buffers
  // gives that without allocating fresh arrays per animation frame.
  private specBufs: Record<'raw' | 'scaled' | 'gated', [number[], number[]]> = {
    raw: [[], []], scaled: [[], []], gated: [[], []],
  }
  private specFlip = 0
  private specBuf(name: 'raw' | 'scaled' | 'gated'): number[] {
    const buf = this.specBufs[name][this.specFlip]
    buf.length = NUM_SPECTRUM_BARS
    return buf
  }
  private micConfig: MicNoiseGateConfig = {
    ...MIC_DEFAULTS,
  }

  active = false

  configureMic(config: Partial<MicNoiseGateConfig>): void {
    this.micConfig = {
      gain: Number.isFinite(config.gain ?? NaN) ? Math.max(0, Math.min(MIC_MAX_GAIN, Number(config.gain))) : this.micConfig.gain,
      agc: typeof config.agc === 'boolean' ? config.agc : this.micConfig.agc,
      threshold: Number.isFinite(config.threshold ?? NaN) ? clamp01(Number(config.threshold)) : this.micConfig.threshold,
      attack: Number.isFinite(config.attack ?? NaN) ? clamp01(Number(config.attack)) : this.micConfig.attack,
      decay: Number.isFinite(config.decay ?? NaN) ? clamp01(Number(config.decay)) : this.micConfig.decay,
    }
  }

  async start(): Promise<void> {
    if (this.active) return
    this.stop()
    const version = ++this.lifecycleVersion
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: MIC_CAPTURE_CONSTRAINTS,
      video: false,
    })
    if (version !== this.lifecycleVersion) {
      stream.getTracks().forEach(track => track.stop())
      return
    }
    this.stream = stream
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE })
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = FFT_SIZE
    // Use AnalyserNode only as a time-domain sampler. Studio owns the FFT so
    // preview and firmware share the same Hann window and magnitude scaling.
    this.analyser.smoothingTimeConstant = 0
    this.micSource = this.ctx.createMediaStreamSource(this.stream)
    this.micSource.connect(this.analyser)
    this.buf = new Float32Array(this.analyser.frequencyBinCount)
    this.timeBuf = new Float32Array(FFT_SIZE)
    this.fftRe = new Float32Array(FFT_SIZE)
    this.fftIm = new Float32Array(FFT_SIZE)
    this.rawBinBuf = new Float32Array(this.analyser.frequencyBinCount)
    this.smoothedBuf = new Float32Array(this.analyser.frequencyBinCount)
    this.lastTickMs = 0
    this.active = true
    await this.ctx.resume()
    if (version !== this.lifecycleVersion) return
    this.tick()
  }

  stop(): void {
    this.lifecycleVersion++
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.micSource?.disconnect()
    this.analyser?.disconnect()
    this.stream?.getTracks().forEach(t => t.stop())
    this.analyser = null
    this.micSource = null
    this.stream = null
    this.buf = null
    this.timeBuf = null
    this.fftRe = null
    this.fftIm = null
    this.rawBinBuf = null
    this.smoothedBuf = null
    this.gateState = {
      bass: DEFAULT_GATE_STATE(),
      mids: DEFAULT_GATE_STATE(),
      treble: DEFAULT_GATE_STATE(),
      spectrum: Array.from({ length: NUM_SPECTRUM_BARS }, () => DEFAULT_GATE_STATE()),
    }
    this.beatState = createBeatDetectorState()
    this.agcPeak = 0.0001
    this.lastTickMs = 0
    this.active = false
    this.ctx?.close()
    this.ctx = null
    this.emit({
      active: false,
      bass: 0,
      mids: 0,
      treble: 0,
      beat: false,
      bpm: 120,
      spectrum: Array(NUM_SPECTRUM_BARS).fill(0),
      detectorSpectrum: Array(NUM_SPECTRUM_BARS).fill(0),
      previewSpectrum: Array(NUM_SPECTRUM_BARS).fill(0),
      micActive: false,
      micBass: 0,
      micMids: 0,
      micTreble: 0,
      micSpectrum: Array(NUM_SPECTRUM_BARS).fill(0),
      micDetectorSpectrum: Array(NUM_SPECTRUM_BARS).fill(0),
    })
  }

  subscribe(cb: (data: AudioData) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private tick = () => {
    this.rafId = requestAnimationFrame(this.tick)
    const micReady = !!this.analyser && !!this.buf
    if (!micReady) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
      return
    }
    const now = performance.now()
    const elapsedMs = this.lastTickMs > 0 ? Math.max(1, Math.min(500, now - this.lastTickMs)) : 1000 / 60
    this.lastTickMs = now
    if (this.analyser && this.buf && this.timeBuf && this.fftRe && this.fftIm && this.rawBinBuf && this.smoothedBuf) {
      this.analyser.getFloatTimeDomainData(this.timeBuf)
      fillNormalizedFft(this.timeBuf, this.fftRe, this.fftIm, this.rawBinBuf)
      const follow = smoothingAlpha(MIC_SPECTRUM_SMOOTHING, elapsedMs)
      for (let i = 0; i < this.buf.length; i++) {
        const current = this.rawBinBuf[i]
        this.smoothedBuf[i] += (current - this.smoothedBuf[i]) * follow
        this.buf[i] = this.smoothedBuf[i]
      }
    }

    const sampleRate = this.ctx?.sampleRate ?? 48_000
    this.specFlip = 1 - this.specFlip
    const bassRaw = micReady ? this.bandRaw(30, 250, sampleRate) : 0
    const midsRaw = micReady ? this.bandRaw(250, 2000, sampleRate) : 0
    const trebleRaw = micReady ? this.bandRaw(2000, 8000, sampleRate) : 0
    const rawSpectrumValues = micReady && this.buf
      ? logarithmicSpectrum(this.buf, sampleRate, FFT_SIZE, NUM_SPECTRUM_BARS, this.specBuf('raw'))
      : this.specBuf('raw').fill(0)
    let peak = Math.max(bassRaw, midsRaw, trebleRaw, 0.0001)
    for (const value of rawSpectrumValues) if (value > peak) peak = value
    this.agcPeak = this.micConfig.agc
      ? Math.max(peak, this.agcPeak * Math.pow(0.999, elapsedMs / (1000 / 60)))
      : 0.0001
    const scale = this.micConfig.agc ? this.micConfig.gain / Math.max(this.agcPeak, 0.0001) : this.micConfig.gain
    const bass = this.band(30, 250, bassRaw, scale, elapsedMs)
    const mids = this.band(250, 2000, midsRaw, scale, elapsedMs)
    const treble = this.band(2000, 8000, trebleRaw, scale, elapsedMs)
    const rawSpectrum = this.specBuf('scaled')
    const spectrum = this.specBuf('gated')
    for (let i = 0; i < NUM_SPECTRUM_BARS; i++) {
      rawSpectrum[i] = clamp01(rawSpectrumValues[i] * scale)
      spectrum[i] = this.gateSpectrum(rawSpectrum[i], i, elapsedMs)
    }
    const beatSource = rawSpectrum
    const beatResult = updateBeatDetectorFromSpectrum(beatSource, now, this.beatState)
    this.beatState = beatResult.state

    this.emit({
      active: micReady,
      bass,
      mids,
      treble,
      beat: beatResult.beat,
      bpm: beatResult.bpm,
      spectrum,
      detectorSpectrum: beatSource,
      previewSpectrum: spectrum,
      micActive: micReady,
      micBass: bass,
      micMids: mids,
      micTreble: treble,
      micSpectrum: spectrum,
      micDetectorSpectrum: rawSpectrum,
    })
  }

  private bandRaw(fromHz: number, toHz: number, sampleRate: number): number {
    if (!this.buf) return 0
    return averageFrequencyBand(this.buf, sampleRate, FFT_SIZE, fromHz, toHz)
  }

  private band(fromHz: number, toHz: number, raw: number, scale: number, elapsedMs: number): number {
    const key = fromHz < 250 ? 'bass' : toHz <= 2000 ? 'mids' : 'treble'
    const gated = applyNoiseGate(raw * scale, this.gateState[key], this.micConfig, elapsedMs)
    this.gateState[key] = gated
    return gated.level
  }

  private gateSpectrum(raw: number, index: number, elapsedMs: number): number {
    const gated = applyNoiseGate(raw, this.gateState.spectrum[index], this.micConfig, elapsedMs)
    this.gateState.spectrum[index] = gated
    return gated.level
  }

  private emit(data: AudioData) {
    this.listeners.forEach(cb => cb(data))
  }
}

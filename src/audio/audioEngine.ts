import { createBeatDetectorState, updateBeatDetectorFromSpectrum } from './beatDetection'

const FFT_SIZE = 512
const SMOOTHING = 0.75
export const NUM_SPECTRUM_BARS = 32

const DEFAULT_MIC_GAIN = 1
const DEFAULT_NOISE_THRESHOLD = 0.08
const DEFAULT_NOISE_ATTACK = 0.2
const DEFAULT_NOISE_DECAY = 0.05

const MIN_SPECTRUM_HZ = 30
const MAX_SPECTRUM_HZ = 12_000

export interface AudioData {
  bass: number
  mids: number
  treble: number
  beat: boolean
  bpm: number
  spectrum: number[]  // logarithmically spaced values, low → high
  detectorSpectrum: number[]
}

export interface MicNoiseGateConfig {
  gain: number
  threshold: number
  attack: number
  decay: number
}

interface NoiseGateState {
  floor: number
  level: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

const DEFAULT_GATE_STATE = (): NoiseGateState => ({ floor: 0.02, level: 0 })

/**
 * Adaptive gate that tracks ambient noise, then only passes signal above the
 * floor + threshold. Attack/decay smooth the output to avoid chatter.
 */
export function applyNoiseGate(
  raw: number,
  prev: NoiseGateState,
  config: Pick<MicNoiseGateConfig, 'threshold' | 'attack' | 'decay'>,
): NoiseGateState {
  const floorTrack = raw > prev.floor ? 0.0025 : 0.03
  const floor = clamp01(prev.floor + (raw - prev.floor) * floorTrack)
  const gate = clamp01(floor + clamp01(config.threshold))
  const target = raw > gate ? clamp01((raw - gate) / Math.max(1e-6, 1 - gate)) : 0
  const follow = target > prev.level ? clamp01(config.attack) : clamp01(config.decay)
  const level = clamp01(prev.level + (target - prev.level) * follow)
  return { floor, level }
}

/** Average normalised FFT magnitude inside a frequency range. */
export function averageFrequencyBand(
  data: Uint8Array,
  sampleRate: number,
  fftSize: number,
  fromHz: number,
  toHz: number,
): number {
  const binHz = sampleRate / fftSize
  const last = Math.max(0, data.length - 1)
  const from = Math.max(0, Math.min(last, Math.ceil(fromHz / binHz)))
  const to = Math.max(from, Math.min(last, Math.floor(toHz / binHz)))
  let sum = 0
  for (let i = from; i <= to; i++) sum += data[i]
  return sum / ((to - from + 1) * 255)
}

/** Log spacing gives bass detail instead of spending most bars above 10 kHz. */
export function logarithmicSpectrum(
  data: Uint8Array,
  sampleRate: number,
  fftSize: number,
  count = NUM_SPECTRUM_BARS,
): number[] {
  const nyquist = sampleRate / 2
  const high = Math.min(MAX_SPECTRUM_HZ, nyquist)
  const ratio = high / MIN_SPECTRUM_HZ
  return Array.from({ length: count }, (_, i) => {
    const from = MIN_SPECTRUM_HZ * ratio ** (i / count)
    const to = MIN_SPECTRUM_HZ * ratio ** ((i + 1) / count)
    return averageFrequencyBand(data, sampleRate, fftSize, from, to)
  })
}

export class AudioEngine {
  private static _instance: AudioEngine | null = null
  static get instance() {
    if (!AudioEngine._instance) AudioEngine._instance = new AudioEngine()
    return AudioEngine._instance
  }

  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private buf: Uint8Array | null = null
  private listeners = new Set<(data: AudioData) => void>()
  private rafId = 0
  private gateState = {
    bass: DEFAULT_GATE_STATE(),
    mids: DEFAULT_GATE_STATE(),
    treble: DEFAULT_GATE_STATE(),
    spectrum: Array.from({ length: NUM_SPECTRUM_BARS }, () => DEFAULT_GATE_STATE()),
  }
  private beatState = createBeatDetectorState()
  private micConfig: MicNoiseGateConfig = {
    gain: DEFAULT_MIC_GAIN,
    threshold: DEFAULT_NOISE_THRESHOLD,
    attack: DEFAULT_NOISE_ATTACK,
    decay: DEFAULT_NOISE_DECAY,
  }

  active = false

  configureMic(config: Partial<MicNoiseGateConfig>): void {
    this.micConfig = {
      gain: Number.isFinite(config.gain ?? NaN) ? Math.max(0, Number(config.gain)) : this.micConfig.gain,
      threshold: Number.isFinite(config.threshold ?? NaN) ? clamp01(Number(config.threshold)) : this.micConfig.threshold,
      attack: Number.isFinite(config.attack ?? NaN) ? clamp01(Number(config.attack)) : this.micConfig.attack,
      decay: Number.isFinite(config.decay ?? NaN) ? clamp01(Number(config.decay)) : this.micConfig.decay,
    }
  }

  async start(): Promise<void> {
    if (this.active) return
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = FFT_SIZE
    this.analyser.smoothingTimeConstant = SMOOTHING
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.source.connect(this.analyser)
    this.buf = new Uint8Array(this.analyser.frequencyBinCount)
    this.active = true
    this.tick()
  }

  stop(): void {
    if (!this.active) return
    cancelAnimationFrame(this.rafId)
    this.source?.disconnect()
    this.stream?.getTracks().forEach(t => t.stop())
    this.ctx?.close()
    this.ctx = null; this.analyser = null; this.source = null; this.stream = null; this.buf = null
    this.gateState = {
      bass: DEFAULT_GATE_STATE(),
      mids: DEFAULT_GATE_STATE(),
      treble: DEFAULT_GATE_STATE(),
      spectrum: Array.from({ length: NUM_SPECTRUM_BARS }, () => DEFAULT_GATE_STATE()),
    }
    this.beatState = createBeatDetectorState()
    this.active = false
    this.emit({
      bass: 0,
      mids: 0,
      treble: 0,
      beat: false,
      bpm: 120,
      spectrum: Array(NUM_SPECTRUM_BARS).fill(0),
      detectorSpectrum: Array(NUM_SPECTRUM_BARS).fill(0),
    })
  }

  subscribe(cb: (data: AudioData) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private tick = () => {
    this.rafId = requestAnimationFrame(this.tick)
    if (!this.analyser || !this.buf) return
    this.analyser.getByteFrequencyData(this.buf)

    const sampleRate = this.ctx?.sampleRate ?? 48_000
    const bass   = this.band(30, 250, sampleRate)
    const mids   = this.band(250, 2000, sampleRate)
    const treble = this.band(2000, 8000, sampleRate)
    const rawSpectrum = logarithmicSpectrum(this.buf, sampleRate, FFT_SIZE)
      .map((value) => clamp01(value * this.micConfig.gain))
    const spectrum = rawSpectrum
      .map((value, i) => this.gateSpectrum(value, i))
    const beatResult = updateBeatDetectorFromSpectrum(rawSpectrum, performance.now(), this.beatState)
    this.beatState = beatResult.state

    this.emit({
      bass,
      mids,
      treble,
      beat: beatResult.beat,
      bpm: beatResult.bpm,
      spectrum,
      detectorSpectrum: rawSpectrum,
    })
  }

  private band(fromHz: number, toHz: number, sampleRate: number): number {
    if (!this.buf) return 0
    const gain = this.micConfig.gain
    const raw = averageFrequencyBand(this.buf, sampleRate, FFT_SIZE, fromHz, toHz) * gain
    const key = fromHz < 250 ? 'bass' : toHz <= 2000 ? 'mids' : 'treble'
    const gated = applyNoiseGate(raw, this.gateState[key], this.micConfig)
    this.gateState[key] = gated
    return gated.level
  }

  private gateSpectrum(raw: number, index: number): number {
    const gain = this.micConfig.gain
    const gated = applyNoiseGate(raw * gain, this.gateState.spectrum[index], this.micConfig)
    this.gateState.spectrum[index] = gated
    return gated.level
  }

  private emit(data: AudioData) {
    this.listeners.forEach(cb => cb(data))
  }
}

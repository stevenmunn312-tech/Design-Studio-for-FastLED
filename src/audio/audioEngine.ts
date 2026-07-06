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
  active: boolean
  mode: AudioInputMode
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

export type AudioInputMode = 'mic' | 'media' | null

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

const DEFAULT_GATE_STATE = (): NoiseGateState => ({ floor: 0.02, level: 0 })

// The 0..1 threshold slider maps onto this much absolute FFT-magnitude head-room
// above the ambient floor. Per-band mic magnitudes rarely exceed ~0.3 even for
// loud audio, so a slider applied 1:1 would push the gate above the entire
// signal range and zero out every band once it left the low end — the whole
// point of the slider is to tune within that small range, not exceed it. This
// mirrors BeatDetect's denormalizeBeatParam('threshold') tuned max.
const THRESHOLD_RANGE = 0.25

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
  const gate = clamp01(floor + clamp01(config.threshold) * THRESHOLD_RANGE)
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
  private micSource: AudioNode | null = null
  private mediaSource: MediaElementAudioSourceNode | null = null
  private mediaAnalyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private mediaElement: HTMLMediaElement | null = null
  private buf: Uint8Array | null = null
  private mediaBuf: Uint8Array | null = null
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
  private micConfig: MicNoiseGateConfig = {
    gain: DEFAULT_MIC_GAIN,
    agc: false,
    threshold: DEFAULT_NOISE_THRESHOLD,
    attack: DEFAULT_NOISE_ATTACK,
    decay: DEFAULT_NOISE_DECAY,
  }

  active = false
  mode: AudioInputMode = null

  configureMic(config: Partial<MicNoiseGateConfig>): void {
    this.micConfig = {
      gain: Number.isFinite(config.gain ?? NaN) ? Math.max(0, Number(config.gain)) : this.micConfig.gain,
      agc: typeof config.agc === 'boolean' ? config.agc : this.micConfig.agc,
      threshold: Number.isFinite(config.threshold ?? NaN) ? clamp01(Number(config.threshold)) : this.micConfig.threshold,
      attack: Number.isFinite(config.attack ?? NaN) ? clamp01(Number(config.attack)) : this.micConfig.attack,
      decay: Number.isFinite(config.decay ?? NaN) ? clamp01(Number(config.decay)) : this.micConfig.decay,
    }
  }

  async start(): Promise<void> {
    if (this.active && this.mode === 'mic') return
    this.stop()
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = FFT_SIZE
    this.analyser.smoothingTimeConstant = SMOOTHING
    this.micSource = this.ctx.createMediaStreamSource(this.stream)
    this.micSource.connect(this.analyser)
    this.buf = new Uint8Array(this.analyser.frequencyBinCount)
    this.active = true
    this.mode = 'mic'
    await this.ctx.resume()
    this.tick()
  }

  async attachMediaElement(element: HTMLMediaElement): Promise<void> {
    if (this.mediaElement === element && this.mediaSource) {
      if (this.ctx?.state === 'suspended') await this.ctx.resume()
      return
    }

    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext()
    if (this.mediaSource) this.mediaSource.disconnect()
    this.mediaAnalyser?.disconnect()
    this.mediaSource = this.ctx.createMediaElementSource(element)
    this.mediaAnalyser = this.ctx.createAnalyser()
    this.mediaAnalyser.fftSize = FFT_SIZE
    this.mediaAnalyser.smoothingTimeConstant = SMOOTHING
    this.mediaSource.connect(this.mediaAnalyser)
    this.mediaAnalyser.connect(this.ctx.destination)
    this.mediaElement = element
    this.mediaBuf = new Uint8Array(this.mediaAnalyser.frequencyBinCount)
    await this.ctx.resume()
    if (!this.rafId) this.tick()
  }

  stop(): void {
    if (!this.mediaSource) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.micSource?.disconnect()
    this.analyser?.disconnect()
    this.stream?.getTracks().forEach(t => t.stop())
    this.analyser = null
    this.micSource = null
    this.stream = null
    this.buf = null
    this.gateState = {
      bass: DEFAULT_GATE_STATE(),
      mids: DEFAULT_GATE_STATE(),
      treble: DEFAULT_GATE_STATE(),
      spectrum: Array.from({ length: NUM_SPECTRUM_BARS }, () => DEFAULT_GATE_STATE()),
    }
    this.beatState = createBeatDetectorState()
    this.agcPeak = 0.0001
    this.active = false
    this.mode = null
    if (this.mediaSource) {
      if (!this.rafId) this.tick()
      return
    }
    this.mediaElement = null
    this.mediaAnalyser?.disconnect()
    this.mediaAnalyser = null
    this.mediaBuf = null
    this.ctx?.close()
    this.ctx = null
    this.emit({
      active: false,
      mode: null,
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
    const mediaReady = !!this.mediaAnalyser && !!this.mediaBuf
    if (!micReady && !mediaReady) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
      return
    }
    if (this.analyser && this.buf) this.analyser.getByteFrequencyData(this.buf)
    if (this.mediaAnalyser && this.mediaBuf) this.mediaAnalyser.getByteFrequencyData(this.mediaBuf)

    const sampleRate = this.ctx?.sampleRate ?? 48_000
    const mediaLive = mediaReady && this.mediaElementIsLive()
    const bassRaw = micReady ? this.bandRaw(30, 250, sampleRate) : 0
    const midsRaw = micReady ? this.bandRaw(250, 2000, sampleRate) : 0
    const trebleRaw = micReady ? this.bandRaw(2000, 8000, sampleRate) : 0
    const rawSpectrumValues = micReady && this.buf ? logarithmicSpectrum(this.buf, sampleRate, FFT_SIZE) : Array(NUM_SPECTRUM_BARS).fill(0)
    const mediaSpectrum = mediaReady && this.mediaBuf
      ? logarithmicSpectrum(this.mediaBuf, sampleRate, FFT_SIZE)
      : rawSpectrumValues
    const peak = Math.max(
      bassRaw,
      midsRaw,
      trebleRaw,
      ...rawSpectrumValues,
      0.0001,
    )
    this.agcPeak = this.micConfig.agc
      ? Math.max(peak, this.agcPeak * 0.999)
      : 0.0001
    const scale = this.micConfig.agc ? this.micConfig.gain / Math.max(this.agcPeak, 0.0001) : this.micConfig.gain
    const bass = this.band(30, 250, bassRaw, scale)
    const mids = this.band(250, 2000, midsRaw, scale)
    const treble = this.band(2000, 8000, trebleRaw, scale)
    const rawSpectrum = rawSpectrumValues.map((value) => clamp01(value * scale))
    const spectrum = rawSpectrum
      .map((value, i) => this.gateSpectrum(value, i))
    const sourceMode: AudioInputMode = mediaLive ? 'media' : micReady ? 'mic' : null
    const beatSource = sourceMode === 'media' ? mediaSpectrum : rawSpectrum
    const beatResult = updateBeatDetectorFromSpectrum(beatSource, performance.now(), this.beatState)
    this.beatState = beatResult.state
    const mediaBass = mediaReady && this.mediaBuf ? averageFrequencyBand(this.mediaBuf, sampleRate, FFT_SIZE, 30, 250) : 0
    const mediaMids = mediaReady && this.mediaBuf ? averageFrequencyBand(this.mediaBuf, sampleRate, FFT_SIZE, 250, 2000) : 0
    const mediaTreble = mediaReady && this.mediaBuf ? averageFrequencyBand(this.mediaBuf, sampleRate, FFT_SIZE, 2000, 8000) : 0
    const selectedSpectrum = sourceMode === 'media'
      ? mediaSpectrum
      : sourceMode === 'mic'
        ? spectrum
        : Array(NUM_SPECTRUM_BARS).fill(0)

    this.emit({
      active: sourceMode !== null,
      mode: sourceMode,
      bass: sourceMode === 'media' ? clamp01(mediaBass) : bass,
      mids: sourceMode === 'media' ? clamp01(mediaMids) : mids,
      treble: sourceMode === 'media' ? clamp01(mediaTreble) : treble,
      beat: beatResult.beat,
      bpm: beatResult.bpm,
      spectrum: selectedSpectrum,
      detectorSpectrum: beatSource,
      previewSpectrum: selectedSpectrum,
      micActive: micReady,
      micBass: bass,
      micMids: mids,
      micTreble: treble,
      micSpectrum: spectrum,
      micDetectorSpectrum: rawSpectrum,
    })
  }

  private mediaElementIsLive(): boolean {
    return !!this.mediaElement &&
      !this.mediaElement.paused &&
      !this.mediaElement.ended &&
      this.mediaElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  }

  private bandRaw(fromHz: number, toHz: number, sampleRate: number): number {
    if (!this.buf) return 0
    return averageFrequencyBand(this.buf, sampleRate, FFT_SIZE, fromHz, toHz)
  }

  private band(fromHz: number, toHz: number, raw: number, scale: number): number {
    const key = fromHz < 250 ? 'bass' : toHz <= 2000 ? 'mids' : 'treble'
    const gated = applyNoiseGate(raw * scale, this.gateState[key], this.micConfig)
    this.gateState[key] = gated
    return gated.level
  }

  private gateSpectrum(raw: number, index: number): number {
    const gated = applyNoiseGate(raw, this.gateState.spectrum[index], this.micConfig)
    this.gateState.spectrum[index] = gated
    return gated.level
  }

  private emit(data: AudioData) {
    this.listeners.forEach(cb => cb(data))
  }
}

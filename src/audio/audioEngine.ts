import { FastLedAudioAnalyzer } from './fastledReactive'
import {
  MIC_DEFAULTS,
  MIC_FFT_SIZE,
  MIC_MAX_GAIN,
  MIC_SAMPLE_RATE,
  MIC_SPECTRUM_BARS,
} from './micAnalysis'

const FFT_SIZE = MIC_FFT_SIZE
export const NUM_SPECTRUM_BARS = MIC_SPECTRUM_BARS

// Ask the browser for the physical microphone signal without conferencing DSP.
// In particular, Chrome's echo canceller can recognize audio played by this
// tab and remove it from the mic while leaving audio from an external player
// comparatively untouched. That makes identical speaker playback produce very
// different FFT balances. The FastLED analysis pipeline owns conditioning and
// normalization itself, and firmware receives a raw INMP441 signal, so browser
// processing belongs off.
export const MIC_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}

export interface AudioData {
  active: boolean
  nativeFastLed: boolean
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

// Mirrors FastLED Processor::setGain. Signal conditioning, adaptive band
// normalization, and beat detection are owned by the FastLED pipeline.
export interface MicConfig {
  gain: number
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
  private timeBuf: Float32Array | null = null
  private analyzer: FastLedAudioAnalyzer | null = null
  private listeners = new Set<(data: AudioData) => void>()
  private rafId = 0
  private lifecycleVersion = 0
  // Per-frame spectrum output buffers, alternating: consumers (the audio store
  // and its subscribers) dedupe on array identity, so each frame must publish
  // a *different* array object — flipping between two reused buffers gives
  // that without allocating fresh arrays per animation frame.
  private specBufs: [number[], number[]] = [[], []]
  private specFlip = 0
  private micConfig: MicConfig = {
    ...MIC_DEFAULTS,
  }

  active = false

  configureMic(config: Partial<MicConfig>): void {
    this.micConfig = {
      gain: Number.isFinite(config.gain ?? NaN) ? Math.max(0, Math.min(MIC_MAX_GAIN, Number(config.gain))) : this.micConfig.gain,
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
    // Use AnalyserNode only as a time-domain sampler. The FastLED-ported
    // analyzer owns windowing, FFT, and magnitude scaling so preview and
    // firmware share the same transform.
    this.analyser.smoothingTimeConstant = 0
    this.micSource = this.ctx.createMediaStreamSource(this.stream)
    this.micSource.connect(this.analyser)
    this.timeBuf = new Float32Array(FFT_SIZE)
    this.analyzer = new FastLedAudioAnalyzer(FFT_SIZE)
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
    this.timeBuf = null
    this.analyzer = null
    this.active = false
    this.ctx?.close()
    this.ctx = null
    this.emit({
      active: false,
      nativeFastLed: false,
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
    if (!this.analyser || !this.timeBuf || !this.analyzer) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
      return
    }
    const now = performance.now()
    const sampleRate = this.ctx?.sampleRate ?? MIC_SAMPLE_RATE

    this.analyser.getFloatTimeDomainData(this.timeBuf)
    this.specFlip = 1 - this.specFlip
    const spectrum = this.specBufs[this.specFlip]
    spectrum.length = NUM_SPECTRUM_BARS
    const result = this.analyzer.process(this.timeBuf, sampleRate, now, this.micConfig.gain, spectrum)

    this.emit({
      active: true,
      nativeFastLed: true,
      bass: result.bass,
      mids: result.mids,
      treble: result.treble,
      beat: result.beat,
      bpm: result.bpm,
      spectrum,
      detectorSpectrum: spectrum,
      previewSpectrum: spectrum,
      micActive: true,
      micBass: result.bass,
      micMids: result.mids,
      micTreble: result.treble,
      micSpectrum: spectrum,
      micDetectorSpectrum: spectrum,
    })
  }

  private emit(data: AudioData) {
    this.listeners.forEach(cb => cb(data))
  }
}

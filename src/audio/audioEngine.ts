const FFT_SIZE = 512
const SMOOTHING = 0.75
export const NUM_SPECTRUM_BARS = 32

const MIN_SPECTRUM_HZ = 30
const MAX_SPECTRUM_HZ = 12_000

const BEAT_HISTORY = 30
const BEAT_MULTIPLIER = 1.4
const BEAT_COOLDOWN_MS = 300

export interface AudioData {
  bass: number
  mids: number
  treble: number
  beat: boolean
  spectrum: number[]  // logarithmically spaced values, low → high
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
  private bassHistory: number[] = []
  private lastBeatMs = 0

  active = false

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
    this.bassHistory = []; this.lastBeatMs = 0
    this.active = false
    this.emit({ bass: 0, mids: 0, treble: 0, beat: false, spectrum: Array(NUM_SPECTRUM_BARS).fill(0) })
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
    const beat   = this.detectBeat(bass)
    const spectrum = logarithmicSpectrum(this.buf, sampleRate, FFT_SIZE)

    this.emit({ bass, mids, treble, beat, spectrum })
  }

  private band(fromHz: number, toHz: number, sampleRate: number): number {
    if (!this.buf) return 0
    return averageFrequencyBand(this.buf, sampleRate, FFT_SIZE, fromHz, toHz)
  }

  private detectBeat(bass: number): boolean {
    this.bassHistory.push(bass)
    if (this.bassHistory.length > BEAT_HISTORY) this.bassHistory.shift()
    const avg = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length
    const now = performance.now()
    if (bass > avg * BEAT_MULTIPLIER && bass > 0.15 && now - this.lastBeatMs > BEAT_COOLDOWN_MS) {
      this.lastBeatMs = now
      return true
    }
    return false
  }

  private emit(data: AudioData) {
    this.listeners.forEach(cb => cb(data))
  }
}

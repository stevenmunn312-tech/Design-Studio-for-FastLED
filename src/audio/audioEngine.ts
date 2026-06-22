const FFT_SIZE = 512
const SMOOTHING = 0.75
const NUM_BARS = 16

// Frequency bin boundaries for bass / mids / treble (at 44100 Hz, FFT_SIZE=512 → 256 bins, ~86 Hz/bin)
const BASS_END   = 4   // 0–344 Hz
const MIDS_END   = 40  // 344–3440 Hz
const TREBLE_END = 120 // 3440–10320 Hz

const BEAT_HISTORY = 30
const BEAT_MULTIPLIER = 1.4
const BEAT_COOLDOWN_MS = 300

export interface AudioData {
  bass: number
  mids: number
  treble: number
  beat: boolean
  spectrum: number[]  // NUM_BARS values 0–1
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
    this.emit({ bass: 0, mids: 0, treble: 0, beat: false, spectrum: Array(NUM_BARS).fill(0) })
  }

  subscribe(cb: (data: AudioData) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private tick = () => {
    this.rafId = requestAnimationFrame(this.tick)
    if (!this.analyser || !this.buf) return
    this.analyser.getByteFrequencyData(this.buf)

    const bass   = this.band(0, BASS_END)
    const mids   = this.band(BASS_END + 1, MIDS_END)
    const treble = this.band(MIDS_END + 1, TREBLE_END)
    const beat   = this.detectBeat(bass)
    const spectrum = this.buildSpectrum()

    this.emit({ bass, mids, treble, beat, spectrum })
  }

  private band(from: number, to: number): number {
    if (!this.buf) return 0
    let sum = 0
    for (let i = from; i <= to; i++) sum += this.buf[i]
    return sum / ((to - from + 1) * 255)
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

  private buildSpectrum(): number[] {
    if (!this.buf) return Array(NUM_BARS).fill(0)
    const binsPerBar = Math.floor(this.buf.length / NUM_BARS)
    return Array.from({ length: NUM_BARS }, (_, i) => {
      let sum = 0
      for (let j = 0; j < binsPerBar; j++) sum += this.buf![i * binsPerBar + j]
      return sum / (binsPerBar * 255)
    })
  }

  private emit(data: AudioData) {
    this.listeners.forEach(cb => cb(data))
  }
}

import type { AudioData } from './audioEngine'
import { FastLedAudioAnalyzer } from './fastledReactive'
import {
  MIC_FFT_SIZE,
  MIC_SAMPLE_RATE,
  MIC_SPECTRUM_BARS,
} from './micAnalysis'
import { levelsFromSampleChannels } from './stereoLevels'

const silentSpectrum = () => Array(MIC_SPECTRUM_BARS).fill(0)

function silentDecoderAudio(): AudioData {
  return {
    active: false,
    nativeFastLed: true,
    bass: 0,
    mids: 0,
    treble: 0,
    beat: false,
    bpm: 120,
    spectrum: silentSpectrum(),
    detectorSpectrum: silentSpectrum(),
    previewSpectrum: silentSpectrum(),
    micActive: false,
    micBass: 0,
    micMids: 0,
    micTreble: 0,
    micSpectrum: silentSpectrum(),
    micDetectorSpectrum: silentSpectrum(),
    leftLevel: 0,
    rightLevel: 0,
    channelCount: 2,
  }
}

/** Analyse the audio element used by the in-app music player. The media source
 * remains connected to the AudioContext destination when analysis is detached,
 * so changing the Audio node back to Microphone never mutes normal playback. */
export class DecoderAudioEngine {
  private static singleton: DecoderAudioEngine | null = null

  static get instance(): DecoderAudioEngine {
    if (!DecoderAudioEngine.singleton) DecoderAudioEngine.singleton = new DecoderAudioEngine()
    return DecoderAudioEngine.singleton
  }

  private context: AudioContext | null = null
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()
  private audibleSources = new WeakSet<HTMLMediaElement>()
  private element: HTMLMediaElement | null = null
  private source: MediaElementAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private splitter: ChannelSplitterNode | null = null
  private leftAnalyser: AnalyserNode | null = null
  private rightAnalyser: AnalyserNode | null = null
  private timeSamples: Float32Array | null = null
  private leftSamples: Float32Array | null = null
  private rightSamples: Float32Array | null = null
  private analyzer: FastLedAudioAnalyzer | null = null
  private listeners = new Set<(data: AudioData) => void>()
  private animationFrame = 0
  private spectrumBuffers: [number[], number[]] = [[], []]
  private spectrumFlip = 0

  subscribe(listener: (data: AudioData) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Call from the player's pointer/file gesture so browser autoplay policy
   * can resume the analysis context before the media element starts. */
  resume(): void {
    const resumed = this.context?.resume()
    if (resumed) void resumed.catch(() => {})
  }

  attach(element: HTMLMediaElement): void {
    if (this.element === element) {
      if (!element.paused && !element.ended) this.startSampling()
      return
    }
    this.detach()

    const context = this.context ?? new AudioContext({ sampleRate: MIC_SAMPLE_RATE })
    this.context = context
    let source = this.sources.get(element)
    if (!source) {
      source = context.createMediaElementSource(element)
      this.sources.set(element, source)
    }
    if (!this.audibleSources.has(element)) {
      source.connect(context.destination)
      this.audibleSources.add(element)
    }

    const analyser = context.createAnalyser()
    analyser.fftSize = MIC_FFT_SIZE
    analyser.smoothingTimeConstant = 0
    const splitter = context.createChannelSplitter(2)
    const leftAnalyser = context.createAnalyser()
    const rightAnalyser = context.createAnalyser()
    for (const channelAnalyser of [leftAnalyser, rightAnalyser]) {
      channelAnalyser.fftSize = MIC_FFT_SIZE
      channelAnalyser.smoothingTimeConstant = 0
    }

    source.connect(analyser)
    source.connect(splitter)
    splitter.connect(leftAnalyser, 0)
    splitter.connect(rightAnalyser, 1)

    this.element = element
    this.source = source
    this.analyser = analyser
    this.splitter = splitter
    this.leftAnalyser = leftAnalyser
    this.rightAnalyser = rightAnalyser
    this.timeSamples = new Float32Array(MIC_FFT_SIZE)
    this.leftSamples = new Float32Array(MIC_FFT_SIZE)
    this.rightSamples = new Float32Array(MIC_FFT_SIZE)
    this.analyzer = new FastLedAudioAnalyzer(MIC_FFT_SIZE)
    element.addEventListener('play', this.startSampling)
    element.addEventListener('pause', this.stopSampling)
    element.addEventListener('ended', this.stopSampling)
    element.addEventListener('emptied', this.stopSampling)
    if (!element.paused && !element.ended) this.startSampling()
    else this.emit(silentDecoderAudio())
  }

  detach(element?: HTMLMediaElement): void {
    if (element && this.element !== element) return
    const current = this.element
    if (current) {
      current.removeEventListener('play', this.startSampling)
      current.removeEventListener('pause', this.stopSampling)
      current.removeEventListener('ended', this.stopSampling)
      current.removeEventListener('emptied', this.stopSampling)
    }
    this.stopSampling()
    if (this.source && this.analyser) this.source.disconnect(this.analyser)
    if (this.source && this.splitter) this.source.disconnect(this.splitter)
    this.splitter?.disconnect()
    this.analyser?.disconnect()
    this.leftAnalyser?.disconnect()
    this.rightAnalyser?.disconnect()
    this.element = null
    this.source = null
    this.analyser = null
    this.splitter = null
    this.leftAnalyser = null
    this.rightAnalyser = null
    this.timeSamples = null
    this.leftSamples = null
    this.rightSamples = null
    this.analyzer = null
  }

  private startSampling = (): void => {
    if (this.animationFrame) return
    this.resume()
    this.animationFrame = requestAnimationFrame(this.sample)
  }

  private stopSampling = (): void => {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
    this.emit(silentDecoderAudio())
  }

  private sample = (): void => {
    this.animationFrame = 0
    const element = this.element
    if (!element || element.paused || element.ended) {
      this.stopSampling()
      return
    }
    if (!this.analyser || !this.leftAnalyser || !this.rightAnalyser
      || !this.timeSamples || !this.leftSamples || !this.rightSamples || !this.analyzer) return

    this.analyser.getFloatTimeDomainData(this.timeSamples)
    this.leftAnalyser.getFloatTimeDomainData(this.leftSamples)
    this.rightAnalyser.getFloatTimeDomainData(this.rightSamples)
    this.spectrumFlip = 1 - this.spectrumFlip
    const spectrum = this.spectrumBuffers[this.spectrumFlip]
    spectrum.length = MIC_SPECTRUM_BARS
    const result = this.analyzer.process(
      this.timeSamples,
      this.context?.sampleRate ?? MIC_SAMPLE_RATE,
      performance.now(),
      1,
      spectrum,
    )
    const levels = levelsFromSampleChannels(this.leftSamples, this.rightSamples, 2, 1)
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
      // These aliases remain populated because recorded/group audio envelopes
      // predate named source kinds and still use the mic-prefixed fields.
      micActive: false,
      micBass: result.bass,
      micMids: result.mids,
      micTreble: result.treble,
      micSpectrum: spectrum,
      micDetectorSpectrum: spectrum,
      leftLevel: levels.left,
      rightLevel: levels.right,
      channelCount: levels.channelCount,
    })
    this.animationFrame = requestAnimationFrame(this.sample)
  }

  private emit(data: AudioData): void {
    this.listeners.forEach((listener) => listener(data))
  }
}

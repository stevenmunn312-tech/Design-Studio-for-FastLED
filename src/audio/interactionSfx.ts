import { useAudioStore } from '../state/audioStore'
import { usePlayerTransport } from '../state/playerTransport'

type AudioContextCtor = typeof AudioContext
type FilterKind = BiquadFilterType

interface ToneSpec {
  type: OscillatorType
  fromHz: number
  toHz: number
  peak: number
  attack: number
  sustain: number
  filter: FilterKind
  filterFromHz: number
  filterToHz?: number
  q?: number
}

interface NoiseSpec {
  peak: number
  attack: number
  sustain: number
  filter: FilterKind
  filterHz: number
  q?: number
}

let ctx: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: AudioContextCtor }
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null
}

function activeMediaPlayback(): boolean {
  const audio = useAudioStore.getState()
  return (audio.active && audio.mode === 'media') || usePlayerTransport.getState().playing
}

function masterLevel(): number {
  const volume = Math.max(0, Math.min(1, usePlayerTransport.getState().volume))
  return Math.pow(volume, 0.8) * 0.12
}

export function graphInteractionSfxAllowed(): boolean {
  return !activeMediaPlayback() && masterLevel() > 0.001 && !!audioContextCtor()
}

async function ensureContext(): Promise<AudioContext | null> {
  if (!graphInteractionSfxAllowed()) return null
  const Ctor = audioContextCtor()
  if (!Ctor) return null
  if (!ctx || ctx.state === 'closed') ctx = new Ctor({ latencyHint: 'interactive' })
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return null
    }
  }
  return ctx.state === 'running' ? ctx : null
}

function getNoiseBuffer(audioCtx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === audioCtx.sampleRate) return noiseBuffer
  const length = Math.max(1, Math.round(audioCtx.sampleRate * 0.12))
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  noiseBuffer = buffer
  return buffer
}

function scheduleEnvelope(gain: GainNode['gain'], now: number, peak: number, attack: number, sustain: number) {
  gain.cancelScheduledValues(now)
  gain.setValueAtTime(0.0001, now)
  gain.linearRampToValueAtTime(Math.max(0.0001, peak), now + attack)
  gain.exponentialRampToValueAtTime(0.0001, now + attack + sustain)
}

function playTone(audioCtx: AudioContext, now: number, spec: ToneSpec) {
  const osc = audioCtx.createOscillator()
  const filter = audioCtx.createBiquadFilter()
  const gain = audioCtx.createGain()

  osc.type = spec.type
  osc.frequency.setValueAtTime(Math.max(20, spec.fromHz), now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.toHz), now + spec.attack + spec.sustain)

  filter.type = spec.filter
  filter.frequency.setValueAtTime(Math.max(60, spec.filterFromHz), now)
  filter.frequency.linearRampToValueAtTime(Math.max(60, spec.filterToHz ?? spec.filterFromHz), now + spec.attack + spec.sustain)
  filter.Q.value = spec.q ?? 1.3

  scheduleEnvelope(gain.gain, now, spec.peak, spec.attack, spec.sustain)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(now)
  osc.stop(now + spec.attack + spec.sustain + 0.05)
}

function playNoise(audioCtx: AudioContext, now: number, spec: NoiseSpec) {
  const source = audioCtx.createBufferSource()
  const filter = audioCtx.createBiquadFilter()
  const gain = audioCtx.createGain()

  source.buffer = getNoiseBuffer(audioCtx)
  filter.type = spec.filter
  filter.frequency.setValueAtTime(Math.max(60, spec.filterHz), now)
  filter.Q.value = spec.q ?? 0.8
  scheduleEnvelope(gain.gain, now, spec.peak, spec.attack, spec.sustain)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(audioCtx.destination)
  source.start(now)
  source.stop(now + spec.attack + spec.sustain + 0.05)
}

async function playGraphInteraction(kind: 'connect' | 'disconnect') {
  const audioCtx = await ensureContext()
  if (!audioCtx) return
  const now = audioCtx.currentTime + 0.005
  const level = masterLevel()

  if (kind === 'connect') {
    playTone(audioCtx, now, {
      type: 'triangle',
      fromHz: 320,
      toHz: 1220,
      peak: level,
      attack: 0.012,
      sustain: 0.11,
      filter: 'lowpass',
      filterFromHz: 2200,
      filterToHz: 3400,
      q: 1.1,
    })
    playTone(audioCtx, now + 0.018, {
      type: 'sine',
      fromHz: 780,
      toHz: 1660,
      peak: level * 0.4,
      attack: 0.01,
      sustain: 0.07,
      filter: 'bandpass',
      filterFromHz: 1800,
      filterToHz: 2600,
      q: 2.2,
    })
    playNoise(audioCtx, now + 0.006, {
      peak: level * 0.18,
      attack: 0.003,
      sustain: 0.03,
      filter: 'bandpass',
      filterHz: 2500,
      q: 1.8,
    })
    return
  }

  playTone(audioCtx, now, {
    type: 'triangle',
    fromHz: 860,
    toHz: 240,
    peak: level * 0.92,
    attack: 0.01,
    sustain: 0.12,
    filter: 'lowpass',
    filterFromHz: 1800,
    filterToHz: 780,
    q: 1.4,
  })
  playTone(audioCtx, now + 0.012, {
    type: 'sine',
    fromHz: 420,
    toHz: 170,
    peak: level * 0.24,
    attack: 0.008,
    sustain: 0.09,
    filter: 'bandpass',
    filterFromHz: 720,
    filterToHz: 360,
    q: 2,
  })
  playNoise(audioCtx, now, {
    peak: level * 0.14,
    attack: 0.002,
    sustain: 0.04,
    filter: 'lowpass',
    filterHz: 1200,
    q: 0.7,
  })
}

export function playNoodleConnectSfx(): void {
  void playGraphInteraction('connect')
}

export function playNoodleDisconnectSfx(): void {
  void playGraphInteraction('disconnect')
}

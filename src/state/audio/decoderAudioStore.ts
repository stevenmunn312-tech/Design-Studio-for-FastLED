import { create } from 'zustand'
import { DecoderAudioEngine } from '../../audio/decoderAudioEngine'
import type { AudioData } from '../../audio/audioEngine'
import { NUM_SPECTRUM_BARS } from '../../audio/audioEngine'
import { latchBeat } from './beatLatch'

interface DecoderAudioState extends AudioData {
  attachPlayer: (element: HTMLMediaElement) => void
  detachPlayer: (element?: HTMLMediaElement) => void
  resumePlayer: () => void
  /** Clear the latched beat once an evaluation pass has read it. */
  consumeBeat: () => void
}

const silentSpectrum = () => Array(NUM_SPECTRUM_BARS).fill(0)

export const useDecoderAudioStore = create<DecoderAudioState>()((set) => {
  const engine = DecoderAudioEngine.instance
  engine.subscribe((data) => set((s) => ({ ...data, beat: latchBeat(s.beat, data) })))

  return {
    active: false,
    nativeFastLed: true,
    bass: 0,
    mids: 0,
    treble: 0,
    beat: false,
    beatConfidence: 0,
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
    attachPlayer: (element) => engine.attach(element),
    detachPlayer: (element) => engine.detach(element),
    resumePlayer: () => engine.resume(),
    consumeBeat: () => set((s) => (s.beat ? { beat: false } : s)),
  }
})

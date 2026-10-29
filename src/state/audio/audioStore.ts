import { create } from 'zustand'
import { AudioEngine, NUM_SPECTRUM_BARS } from '../../audio/audioEngine'
import type { PitchSignal, SongStructureSignal, VibeSignal } from '../evaluator/types'
import { latchBeat } from './beatLatch'

interface AudioState {
  active: boolean
  nativeFastLed: boolean
  bass: number
  mids: number
  treble: number
  beat: boolean
  beatConfidence: number
  bpm: number
  spectrum: number[]
  detectorSpectrum: number[]
  previewSpectrum: number[]
  micActive: boolean
  micBass: number
  micMids: number
  micTreble: number
  micSpectrum: number[]
  micDetectorSpectrum: number[]
  leftLevel: number
  rightLevel: number
  channelCount: 1 | 2
  vibe?: VibeSignal
  structure?: SongStructureSignal
  pitch?: PitchSignal
  samples?: readonly number[]
  startAudio: () => Promise<void>
  stopAudio: () => void
  /** Clear the latched beat once an evaluation pass has read it. */
  consumeBeat: () => void
}

export const useAudioStore = create<AudioState>()((set) => {
  const engine = AudioEngine.instance

  engine.subscribe((data) => {
    set((s) => ({
      active: data.active,
      nativeFastLed: data.nativeFastLed,
      bass: data.bass,
      mids: data.mids,
      treble: data.treble,
      beat: latchBeat(s.beat, data),
      beatConfidence: data.beatConfidence,
      bpm: data.bpm,
      spectrum: data.spectrum,
      detectorSpectrum: data.detectorSpectrum,
      previewSpectrum: data.previewSpectrum,
      micActive: data.micActive,
      micBass: data.micBass,
      micMids: data.micMids,
      micTreble: data.micTreble,
      micSpectrum: data.micSpectrum,
      micDetectorSpectrum: data.micDetectorSpectrum,
      leftLevel: data.leftLevel,
      rightLevel: data.rightLevel,
      channelCount: data.channelCount,
      vibe: data.vibe,
      structure: data.structure,
      pitch: data.pitch,
      samples: data.samples,
    }))
  })

  return {
    active: false,
    nativeFastLed: false,
    bass: 0,
    mids: 0,
    treble: 0,
    beat: false,
    beatConfidence: 0,
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
    leftLevel: 0,
    rightLevel: 0,
    channelCount: 1,

    startAudio: async () => {
      await engine.start()
      // A pending permission request may have been superseded by Stop or show
      // playback while it was awaiting getUserMedia. Never resurrect the store
      // after the engine has discarded that stale start request.
      set({ active: engine.active, micActive: engine.active })
    },

    stopAudio: () => {
      engine.stop()
      set({
        active: false,
        nativeFastLed: false,
        bass: 0,
        mids: 0,
        treble: 0,
        beat: false,
        beatConfidence: 0,
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
        leftLevel: 0,
        rightLevel: 0,
        channelCount: 1,
        vibe: undefined,
        structure: undefined,
        pitch: undefined,
        samples: undefined,
      })
    },

    consumeBeat: () => set((s) => (s.beat ? { beat: false } : s)),
  }
})

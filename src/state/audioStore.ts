import { create } from 'zustand'
import { AudioEngine, NUM_SPECTRUM_BARS, type AudioInputMode } from '../audio/audioEngine'

interface AudioState {
  active: boolean
  mode: AudioInputMode
  bass: number
  mids: number
  treble: number
  beat: boolean
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
  startAudio: () => Promise<void>
  attachAudioElement: (element: HTMLMediaElement) => Promise<void>
  stopAudio: () => void
}

export const useAudioStore = create<AudioState>()((set) => {
  const engine = AudioEngine.instance

  engine.subscribe((data) => {
    set({
      active: data.active,
      mode: data.mode,
      bass: data.bass,
      mids: data.mids,
      treble: data.treble,
      beat: data.beat,
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
    })
  })

  return {
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

    startAudio: async () => {
      await engine.start()
      set({ active: true, mode: engine.mode })
    },

    attachAudioElement: async (element: HTMLMediaElement) => {
      await engine.attachMediaElement(element)
      set({ active: engine.active, mode: engine.mode })
    },

    stopAudio: () => {
      engine.stop()
      set({
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
    },
  }
})

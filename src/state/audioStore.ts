import { create } from 'zustand'
import { AudioEngine, NUM_SPECTRUM_BARS } from '../audio/audioEngine'

interface AudioState {
  active: boolean
  bass: number
  mids: number
  treble: number
  beat: boolean
  bpm: number
  spectrum: number[]
  detectorSpectrum: number[]
  startAudio: () => Promise<void>
  stopAudio: () => void
}

export const useAudioStore = create<AudioState>()((set) => {
  const engine = AudioEngine.instance

  engine.subscribe((data) => {
    set({
      bass: data.bass,
      mids: data.mids,
      treble: data.treble,
      beat: data.beat,
      bpm: data.bpm,
      spectrum: data.spectrum,
      detectorSpectrum: data.detectorSpectrum,
    })
  })

  return {
    active: false,
    bass: 0,
    mids: 0,
    treble: 0,
    beat: false,
    bpm: 120,
    spectrum: Array(NUM_SPECTRUM_BARS).fill(0),
    detectorSpectrum: Array(NUM_SPECTRUM_BARS).fill(0),

    startAudio: async () => {
      await engine.start()
      set({ active: true })
    },

    stopAudio: () => {
      engine.stop()
      set({
        active: false,
        bass: 0,
        mids: 0,
        treble: 0,
        beat: false,
        bpm: 120,
        spectrum: Array(NUM_SPECTRUM_BARS).fill(0),
        detectorSpectrum: Array(NUM_SPECTRUM_BARS).fill(0),
      })
    },
  }
})

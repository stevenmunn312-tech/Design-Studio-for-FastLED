import { create } from 'zustand'
import { AudioEngine } from '../audio/audioEngine'

interface AudioState {
  active: boolean
  bass: number
  mids: number
  treble: number
  beat: boolean
  spectrum: number[]
  startAudio: () => Promise<void>
  stopAudio: () => void
}

export const useAudioStore = create<AudioState>()((set) => {
  const engine = AudioEngine.instance

  engine.subscribe((data) => {
    set({ bass: data.bass, mids: data.mids, treble: data.treble, beat: data.beat, spectrum: data.spectrum })
  })

  return {
    active: false,
    bass: 0,
    mids: 0,
    treble: 0,
    beat: false,
    spectrum: Array(16).fill(0),

    startAudio: async () => {
      await engine.start()
      set({ active: true })
    },

    stopAudio: () => {
      engine.stop()
      set({ active: false, bass: 0, mids: 0, treble: 0, beat: false, spectrum: Array(16).fill(0) })
    },
  }
})

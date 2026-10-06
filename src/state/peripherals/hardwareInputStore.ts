import { create } from 'zustand'

// Live, transient state for the interactive hardware-input node widgets
// (ButtonInput/PotInput/EncoderInput bodies in StudioNode). This is run-state,
// not a saved node property — it isn't persisted or undo-tracked, and the
// evaluator reads it directly via getState() the same way it reads
// useAudioStore for MicInput, rather than going through graphStore.

interface EncoderValue {
  position: number
  pressed: boolean
}

interface HardwareInputState {
  button: Map<string, boolean>
  pot: Map<string, number>
  encoder: Map<string, EncoderValue>
  setButton: (id: string, pressed: boolean) => void
  setPot: (id: string, value: number) => void
  setEncoder: (id: string, patch: Partial<EncoderValue>) => void
}

export const useHardwareInputStore = create<HardwareInputState>()((set, get) => ({
  button: new Map(),
  pot: new Map(),
  encoder: new Map(),

  setButton: (id, pressed) => {
    const button = new Map(get().button)
    button.set(id, pressed)
    set({ button })
  },

  setPot: (id, value) => {
    const pot = new Map(get().pot)
    pot.set(id, value)
    set({ pot })
  },

  setEncoder: (id, patch) => {
    const encoder = new Map(get().encoder)
    const prev = encoder.get(id) ?? { position: 0, pressed: false }
    encoder.set(id, { ...prev, ...patch })
    set({ encoder })
  },
}))

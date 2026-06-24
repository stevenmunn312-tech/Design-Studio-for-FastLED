import { create } from 'zustand'

// Latest per-node output ports, published by the LEDPreview render loop from a
// single evaluation pass and consumed by each node's top-of-node preview.
// Keyed by node id → { portId: value } (frames, colors, palettes, …).
interface PreviewState {
  outputs: Map<string, Record<string, unknown>>
  setOutputs: (outputs: Map<string, Record<string, unknown>>) => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  outputs: new Map(),
  setOutputs: (outputs) => set({ outputs }),
}))

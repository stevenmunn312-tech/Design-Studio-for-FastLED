import { create } from 'zustand'
import { signalVisual, type SignalVisual } from '../utils/signalVisual'

// Latest per-node output ports, published by the LEDPreview render loop from a
// single evaluation pass and consumed by each node's top-of-node preview.
// Keyed by node id → { portId: value } (frames, colors, palettes, …).
interface PreviewState {
  outputs: Map<string, Record<string, unknown>>
  signals: Map<string, SignalVisual>
  setOutputs: (outputs: Map<string, Record<string, unknown>>) => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  outputs: new Map(),
  signals: new Map(),
  setOutputs: (outputs) => set((state) => {
    const signals = new Map<string, SignalVisual>()
    for (const [nodeId, ports] of outputs) {
      for (const [portId, value] of Object.entries(ports)) {
        const visual = signalVisual(value)
        if (!visual) continue
        const key = `${nodeId}:${portId}`
        const previous = state.signals.get(key)
        // Preserve object identity when the sampled light is unchanged. Edge
        // components can then subscribe to one signal without re-rendering for
        // every unrelated 60 fps preview-store publish.
        signals.set(
          key,
          previous && previous.color === visual.color && previous.energy === visual.energy
            ? previous
            : visual,
        )
      }
    }
    return { outputs, signals }
  }),
}))

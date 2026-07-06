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

function samePortValues(a: Record<string, unknown> | undefined, b: Record<string, unknown>): boolean {
  if (!a) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of bKeys) {
    if (!Object.is(a[key], b[key])) return false
  }
  return true
}

export const usePreviewStore = create<PreviewState>((set) => ({
  outputs: new Map(),
  signals: new Map(),
  setOutputs: (outputs) => set((state) => {
    const stableOutputs = new Map<string, Record<string, unknown>>()
    const signals = new Map<string, SignalVisual>()
    for (const [nodeId, ports] of outputs) {
      const previousPorts = state.outputs.get(nodeId)
      const nextPorts = previousPorts && samePortValues(previousPorts, ports) ? previousPorts : ports
      stableOutputs.set(nodeId, nextPorts)
      for (const [portId, value] of Object.entries(nextPorts)) {
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
    return { outputs: stableOutputs, signals }
  }),
}))

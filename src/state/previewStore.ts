import { create } from 'zustand'
import { signalVisual, type SignalVisual } from '../utils/signalVisual'

// Latest per-node output ports, published by the LEDPreview render loop from a
// single evaluation pass and consumed by each node's top-of-node preview.
// Keyed by node id → { portId: value } (frames, colors, palettes, …).
interface PreviewState {
  outputs: Map<string, Record<string, unknown>>
  signals: Map<string, SignalVisual>
  setOutputs: (outputs: Map<string, Record<string, unknown>>) => void
  clear: () => void
}

type RGB = { r: number; g: number; b: number }
type Frame = RGB[][]

function isFrame(v: unknown): v is Frame {
  return Array.isArray(v) && Array.isArray((v as unknown[])[0])
}

// The evaluator's frames come from a recycling pool and are only valid until
// two evaluation passes later, but this store's consumers (node thumbnails,
// edge lighting) read them asynchronously after publish. Copy each published
// frame into a store-owned buffer — double-buffered per port so the identity
// changes every publish (React change detection) with zero steady-state
// allocation.
const frameCopies = new Map<string, { bufs: [Frame, Frame]; idx: number }>()

function blankCopy(W: number, H: number): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
}

function copyFrameForStore(key: string, src: Frame): Frame {
  const H = src.length
  const W = src[0]?.length ?? 0
  let entry = frameCopies.get(key)
  if (!entry) {
    entry = { bufs: [blankCopy(W, H), blankCopy(W, H)], idx: 0 }
    frameCopies.set(key, entry)
  }
  entry.idx = 1 - entry.idx
  let dst = entry.bufs[entry.idx]
  if (dst.length !== H || (dst[0]?.length ?? 0) !== W) {
    dst = blankCopy(W, H)
    entry.bufs[entry.idx] = dst
  }
  for (let y = 0; y < H; y++) {
    const s = src[y], d = dst[y]
    for (let x = 0; x < W; x++) {
      const sp = s[x], dp = d[x]
      dp.r = sp.r; dp.g = sp.g; dp.b = sp.b
    }
  }
  return dst
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
  clear: () => {
    frameCopies.clear()
    set({ outputs: new Map(), signals: new Map() })
  },
  setOutputs: (outputs) => set((state) => {
    const stableOutputs = new Map<string, Record<string, unknown>>()
    const signals = new Map<string, SignalVisual>()
    for (const [nodeId, ports] of outputs) {
      // Snapshot pooled frames into store-owned buffers (see frameCopies).
      let snapshotted: Record<string, unknown> | null = null
      for (const [portId, value] of Object.entries(ports)) {
        if (!isFrame(value)) continue
        if (!snapshotted) snapshotted = { ...ports }
        snapshotted[portId] = copyFrameForStore(`${nodeId}:${portId}`, value)
      }
      const nextRaw = snapshotted ?? ports
      const previousPorts = state.outputs.get(nodeId)
      const nextPorts = previousPorts && samePortValues(previousPorts, nextRaw) ? previousPorts : nextRaw
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

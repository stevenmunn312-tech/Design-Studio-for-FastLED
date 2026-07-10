import { create } from 'zustand'
import type { Frame } from './graphEvaluator'

type BakeStatus = 'idle' | 'baking' | 'baked'

interface BakedPreview {
  status: BakeStatus
  progress: number
  entryId: string | null
  durationMs: number
  width: number
  height: number
  fps: number
  frames: Uint8Array[]
}

interface PerformanceBakeState {
  byNode: Record<string, BakedPreview | undefined>
  startBake: (nodeId: string, info: Omit<BakedPreview, 'status' | 'progress' | 'frames'>) => void
  setProgress: (nodeId: string, progress: number) => void
  finishBake: (nodeId: string, frames: Uint8Array[]) => void
  clearBake: (nodeId: string) => void
}

const MAX_BAKE_BYTES = 24 * 1024 * 1024
const MAX_BAKE_FPS = 20

function blankFrame(W: number, H: number): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
}

function frameBufferEntry(key: string, W: number, H: number) {
  let entry = frameBuffers.get(key)
  if (!entry || entry.bufs[0].length !== H || (entry.bufs[0][0]?.length ?? 0) !== W) {
    entry = { bufs: [blankFrame(W, H), blankFrame(W, H)], idx: 0 }
    frameBuffers.set(key, entry)
  }
  return entry
}

const frameBuffers = new Map<string, { bufs: [Frame, Frame]; idx: number }>()

export function chooseBakeFps(durationMs: number, width: number, height: number): number {
  const bytesPerFrame = Math.max(1, width * height * 3)
  const maxFrames = Math.max(1, Math.floor(MAX_BAKE_BYTES / bytesPerFrame))
  const wantedFrames = Math.min(maxFrames, Math.max(1, Math.ceil((durationMs / 1000) * MAX_BAKE_FPS)))
  return Math.max(1, wantedFrames / Math.max(1, durationMs / 1000))
}

export function packFrame(frame: Frame): Uint8Array {
  const H = frame.length
  const W = frame[0]?.length ?? 0
  const packed = new Uint8Array(W * H * 3)
  let off = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = frame[y][x]
      packed[off++] = px.r
      packed[off++] = px.g
      packed[off++] = px.b
    }
  }
  return packed
}

function unpackFrame(key: string, packed: Uint8Array, W: number, H: number): Frame {
  const entry = frameBufferEntry(key, W, H)
  entry.idx = 1 - entry.idx
  const dst = entry.bufs[entry.idx]
  let off = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = dst[y][x]
      px.r = packed[off++]
      px.g = packed[off++]
      px.b = packed[off++]
    }
  }
  return dst
}

export function bakedFrameAt(nodeId: string, posMs: number): Frame | null {
  const bake = usePerformanceBakeStore.getState().byNode[nodeId]
  if (!bake || bake.status !== 'baked' || bake.frames.length === 0) return null
  const idx = Math.max(0, Math.min(bake.frames.length - 1, Math.round((posMs / 1000) * bake.fps)))
  return unpackFrame(nodeId, bake.frames[idx], bake.width, bake.height)
}

export function bakeLocked(nodeId: string): boolean {
  const status = usePerformanceBakeStore.getState().byNode[nodeId]?.status ?? 'idle'
  return status !== 'idle'
}

export const usePerformanceBakeStore = create<PerformanceBakeState>()((set) => ({
  byNode: {},
  startBake: (nodeId, info) =>
    set((state) => ({
      byNode: {
        ...state.byNode,
        [nodeId]: { ...info, status: 'baking', progress: 0, frames: [] },
      },
    })),
  setProgress: (nodeId, progress) =>
    set((state) => {
      const current = state.byNode[nodeId]
      if (!current || current.status !== 'baking') return state
      return {
        byNode: {
          ...state.byNode,
          [nodeId]: { ...current, progress: Math.max(0, Math.min(1, progress)) },
        },
      }
    }),
  finishBake: (nodeId, frames) =>
    set((state) => {
      const current = state.byNode[nodeId]
      if (!current) return state
      return {
        byNode: {
          ...state.byNode,
          [nodeId]: { ...current, status: 'baked', progress: 1, frames },
        },
      }
    }),
  clearBake: (nodeId) =>
    set((state) => {
      const next = { ...state.byNode }
      delete next[nodeId]
      frameBuffers.delete(nodeId)
      return { byNode: next }
    }),
}))

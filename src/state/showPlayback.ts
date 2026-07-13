import { create } from 'zustand'
import type { ShowFile } from '../types/showFile'

// Bridges a PerformanceGenerator node's live show playback to the main LED
// preview. When the generator's `frame` output is wired into MatrixOutput, the
// node body stops drawing its own thumbnail and instead publishes the playing
// show + position here; LEDPreview reads this each frame (via getState, so the
// per-frame posMs updates don't re-render subscribers) and renders the show in
// the big preview canvas.

interface ShowPlaybackState {
  /** The PerformanceGenerator node currently driving the main preview, or null. */
  nodeId: string | null
  show: ShowFile | null
  posMs: number
  useGroupInputs: boolean
  playing: boolean
  setPlayback: (
    p: Partial<Pick<ShowPlaybackState, 'nodeId' | 'show' | 'posMs' | 'useGroupInputs' | 'playing'>>,
  ) => void
  /** Release the main preview if this node currently owns it. */
  clearPlayback: (nodeId: string) => void
}

export const useShowPlayback = create<ShowPlaybackState>()((set) => ({
  nodeId: null,
  show: null,
  posMs: 0,
  useGroupInputs: false,
  playing: false,
  setPlayback: (p) => set(p),
  clearPlayback: (nodeId) =>
    set((s) =>
      s.nodeId === nodeId || s.nodeId === null
        ? { nodeId: null, show: null, posMs: 0, playing: false }
        : s,
    ),
}))

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { useShowPlayback?: typeof useShowPlayback }).useShowPlayback = useShowPlayback
}

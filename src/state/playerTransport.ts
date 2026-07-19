import { create } from 'zustand'

// Bridges the PerformanceGenerator's show playback to the music player under
// the main LED preview. When a generator has an analysed show selected it
// registers a transport here (title, duration + control callbacks) and keeps
// posMs/playing fresh; the preview's player renders and drives that transport
// instead of its own local playlist. `volume` is shared by both modes so one
// slider governs whichever <audio> element is audible.

export interface ShowTransport {
  /** The PerformanceGenerator node that owns the show playback. */
  nodeId: string
  title: string
  durationMs: number
  hasPrev: boolean
  hasNext: boolean
  toggle: () => void
  seek: (ms: number) => void
  prev: () => void
  next: () => void
}

interface PlayerTransportState {
  transport: ShowTransport | null
  posMs: number
  playing: boolean
  volume: number
  setTransport: (t: ShowTransport) => void
  /** Release the player if this node currently owns it. */
  clearTransport: (nodeId: string) => void
  setPos: (posMs: number, playing: boolean) => void
  setVolume: (v: number) => void
}

const VOLUME_KEY = 'design-studio-for-fastled-player-volume'

function savedVolume(): number {
  try {
    const stored = localStorage.getItem(VOLUME_KEY)
    if (stored !== null) {
      const raw = Number(stored)
      if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw
    }
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return 0.9
}

export const usePlayerTransport = create<PlayerTransportState>()((set) => ({
  transport: null,
  posMs: 0,
  playing: false,
  volume: savedVolume(),
  setTransport: (transport) => set({ transport }),
  clearTransport: (nodeId) =>
    set((s) =>
      s.transport?.nodeId === nodeId ? { transport: null, posMs: 0, playing: false } : s,
    ),
  setPos: (posMs, playing) => set({ posMs, playing }),
  setVolume: (volume) => {
    const v = Math.max(0, Math.min(1, volume))
    try {
      localStorage.setItem(VOLUME_KEY, String(v))
    } catch {
      // Persisting the volume is best-effort.
    }
    set({ volume: v })
  },
}))

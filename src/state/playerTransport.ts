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
  /**
   * Which pattern the playing show is on: an index into its `patternSet`, or
   * -1 when there is no collection show to read one from.
   *
   * A live reading beside posMs rather than part of the transport's identity.
   * It is published by the generator's own body because that is where the
   * ShowFile lives; the evaluator needs it to say which pattern a panel wired
   * to the generator is naming, and deriving it there would mean the graph
   * evaluator reaching into the music library to find the file again.
   */
  patternIndex: number
  /**
   * The local playlist's current track, while no show owns the player.
   *
   * The preview's own `<audio>` element is the only thing that knows which
   * file is open, so it publishes the name and length here beside posMs. A
   * Music Player reads this when `transport` is null, which is what lets a
   * screen design show the track a person just pressed Play on instead of a
   * blank title and a zero duration.
   */
  localTrack: LocalTrackInfo | null
  volume: number
  /** Monotonic command envelope published by a graph-level Control Map
   * bundle. The preview player consumes each serial exactly once. */
  controlSerial: number
  controlCommand: PreviewPlayerCommand | null
  setTransport: (t: ShowTransport) => void
  /** Release the player if this node currently owns it. */
  clearTransport: (nodeId: string) => void
  setPos: (posMs: number, playing: boolean, patternIndex?: number) => void
  setVolume: (v: number) => void
  setLocalTrack: (track: LocalTrackInfo | null) => void
  dispatchControls: (command: PreviewPlayerCommand) => void
}

export interface LocalTrackInfo {
  /** The ID3 title, or the file name without its extension when there is none —
   *  what the device shows for the same file. */
  title: string
  durationMs: number
  /** Read from the file's ID3 tags; absent when it carries none. */
  artist?: string
  album?: string
}

/**
 * Title a file the way the SD player does when it carries no tags.
 *
 * Mirrors `songResetFromFile` in codegen/playerSongInfoCpp.ts, so a track reads
 * the same in preview and on the panel.
 */
export function localTrackTitle(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

export interface PreviewPlayerCommand {
  sourceId: string
  playPause: boolean
  previous: boolean
  next: boolean
  volume?: number
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
  patternIndex: -1,
  localTrack: null,
  volume: savedVolume(),
  controlSerial: 0,
  controlCommand: null,
  setTransport: (transport) => set({ transport }),
  clearTransport: (nodeId) =>
    set((s) =>
      s.transport?.nodeId === nodeId
        ? { transport: null, posMs: 0, playing: false, patternIndex: -1 }
        : s,
    ),
  setPos: (posMs, playing, patternIndex = -1) => set({ posMs, playing, patternIndex }),
  setVolume: (volume) => {
    const v = Math.max(0, Math.min(1, volume))
    try {
      localStorage.setItem(VOLUME_KEY, String(v))
    } catch {
      // Persisting the volume is best-effort.
    }
    set({ volume: v })
  },
  setLocalTrack: (localTrack) => set((state) => (
    state.localTrack?.title === localTrack?.title && state.localTrack?.durationMs === localTrack?.durationMs
      && state.localTrack?.artist === localTrack?.artist && state.localTrack?.album === localTrack?.album
      ? state
      : { localTrack }
  )),
  dispatchControls: (controlCommand) => set((state) => ({
    controlCommand,
    controlSerial: state.controlSerial + 1,
  })),
}))

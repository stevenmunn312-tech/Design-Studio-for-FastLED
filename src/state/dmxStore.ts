import { create } from 'zustand'
import {
  getArtnetSnapshot,
  getArtnetStatus,
  startArtnetListener,
  stopArtnetListener,
  type ArtnetSnapshotResponse,
  type ArtnetStatusResponse,
} from '../utils/backendClient'
import { blankDmxSnapshot, clampDmxUniverse, normalizeDmxChannels, type DmxSnapshot } from './dmx'

const POLL_MS = 350

interface DmxStoreState {
  helperOnline: boolean
  listening: boolean
  live: boolean
  listenPort: number
  universe: number
  packetRate: number
  error: string
  snapshot: DmxSnapshot
  configure: (input: { listenPort: number; universe: number }) => Promise<void>
  stop: () => Promise<void>
  pollNow: () => Promise<void>
}

type DmxSetState = (
  partial:
    | Partial<DmxStoreState>
    | ((state: DmxStoreState) => Partial<DmxStoreState>),
) => void

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollPromise: Promise<void> | null = null

function applyStatus(
  set: DmxSetState,
  status: ArtnetStatusResponse | null,
  universe: number,
) {
  if (!status) {
    set({
      helperOnline: false,
      listening: false,
      live: false,
      packetRate: 0,
      error: 'Helper offline',
      snapshot: blankDmxSnapshot(universe),
    })
    return
  }

  set((state) => ({
    helperOnline: true,
    listening: !!status.listening,
    live: !!status.live,
    packetRate: Math.max(0, Number(status.packetRate ?? 0)),
    error: status.error ?? '',
    snapshot: {
      ...state.snapshot,
      universe,
      live: !!status.live,
      valid: !!status.live || state.snapshot.valid,
      packetRate: Math.max(0, Number(status.packetRate ?? 0)),
      lastPacketAt: typeof status.lastPacketAt === 'number' ? status.lastPacketAt : state.snapshot.lastPacketAt,
    },
  }))
}

function applySnapshot(
  set: DmxSetState,
  snapshot: ArtnetSnapshotResponse | null,
  universe: number,
) {
  if (!snapshot) return
  set({
    live: !!snapshot.live,
    packetRate: Math.max(0, Number(snapshot.packetRate ?? 0)),
    snapshot: {
      universe,
      channels: normalizeDmxChannels(snapshot.channels),
      valid: !!snapshot.valid,
      live: !!snapshot.live,
      packetRate: Math.max(0, Number(snapshot.packetRate ?? 0)),
      lastPacketAt: typeof snapshot.lastPacketAt === 'number' ? snapshot.lastPacketAt : null,
      source: snapshot.valid ? 'helper' : 'idle',
    },
  })
}

export const useDmxStore = create<DmxStoreState>()((set, get) => {
  const poll = async () => {
    if (pollPromise) return pollPromise
    pollPromise = (async () => {
      const universe = clampDmxUniverse(get().universe)
      const [status, snapshot] = await Promise.all([
        getArtnetStatus(universe),
        getArtnetSnapshot(universe),
      ])
      applyStatus(set, status, universe)
      applySnapshot(set, snapshot, universe)
    })().finally(() => {
      pollPromise = null
    })
    return pollPromise
  }

  const ensurePolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(() => {
      void poll()
    }, POLL_MS)
  }

  const clearPolling = () => {
    if (!pollTimer) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  return {
    helperOnline: false,
    listening: false,
    live: false,
    listenPort: 6454,
    universe: 0,
    packetRate: 0,
    error: '',
    snapshot: blankDmxSnapshot(),
    configure: async ({ listenPort, universe }) => {
      const port = Math.max(1, Math.min(65535, Math.round(Number(listenPort) || 6454)))
      const targetUniverse = clampDmxUniverse(universe)
      set({
        listenPort: port,
        universe: targetUniverse,
        snapshot: blankDmxSnapshot(targetUniverse),
      })
      const result = await startArtnetListener(port)
      if (!result.ok) {
        set({
          helperOnline: false,
          listening: false,
          live: false,
          packetRate: 0,
          error: result.error ?? 'Unable to start Art-Net listener',
        })
        clearPolling()
        return
      }
      set({ helperOnline: true, listening: true, error: '' })
      ensurePolling()
      await poll()
    },
    stop: async () => {
      clearPolling()
      await stopArtnetListener()
      set((state) => ({
        listening: false,
        live: false,
        packetRate: 0,
        snapshot: blankDmxSnapshot(state.universe),
      }))
    },
    pollNow: poll,
  }
})

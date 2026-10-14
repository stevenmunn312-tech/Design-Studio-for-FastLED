/**
 * The DDP Input node's preview source: the local helper's DDP listener,
 * polled for the latest pixel bytes. One listener, like the Art-Net one, so
 * the store is a singleton keyed by nothing; a second DDP Input node shares
 * the same frame.
 */
import { create } from 'zustand'
import { getDdpFrame, startDdpListener, stopDdpListener } from '../../utils/backendClient'

/** Polls faster than the DMX store: a frame feed is watched for motion. */
const POLL_MS = 50
export const DDP_DEFAULT_PORT = 4048

interface DdpStoreState {
  helperOnline: boolean
  listening: boolean
  live: boolean
  listenPort: number
  packetRate: number
  error: string
  /** RGB bytes, 3 per pixel, for the pixel count last configured. */
  pixels: Uint8Array
  configure: (input: { listenPort: number; pixelCount: number }) => Promise<void>
  stop: () => Promise<void>
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollPromise: Promise<void> | null = null
let pixelCount = 256

function decodePixels(base64: string): Uint8Array {
  try {
    const bin = atob(base64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return new Uint8Array(0)
  }
}

export const useDdpStore = create<DdpStoreState>()((set, get) => {
  const poll = async () => {
    if (pollPromise) return pollPromise
    pollPromise = (async () => {
      const frame = await getDdpFrame(pixelCount)
      if (!frame) {
        set({ helperOnline: false, listening: false, live: false, packetRate: 0, error: 'Helper offline' })
        return
      }
      set({
        helperOnline: true,
        listening: !!frame.listening,
        live: !!frame.live,
        packetRate: Math.max(0, Number(frame.packetRate ?? 0)),
        error: frame.error ?? '',
        pixels: decodePixels(frame.pixels),
      })
    })().finally(() => {
      pollPromise = null
    })
    return pollPromise
  }

  const ensurePolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(() => { void poll() }, POLL_MS)
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
    listenPort: DDP_DEFAULT_PORT,
    packetRate: 0,
    error: '',
    pixels: new Uint8Array(0),
    configure: async ({ listenPort, pixelCount: count }) => {
      const port = Math.max(1, Math.min(65535, Math.round(Number(listenPort) || DDP_DEFAULT_PORT)))
      pixelCount = Math.max(1, Math.min(16384, Math.round(count) || 1))
      set({ listenPort: port })
      const result = await startDdpListener(port)
      if (!result.ok) {
        set({ helperOnline: false, listening: false, live: false, packetRate: 0, error: result.error ?? 'Unable to start DDP listener' })
        clearPolling()
        return
      }
      set({ helperOnline: true, listening: true, error: '' })
      ensurePolling()
      await poll()
    },
    stop: async () => {
      clearPolling()
      await stopDdpListener()
      if (get().listening) set({ listening: false, live: false, packetRate: 0, pixels: new Uint8Array(0) })
    },
  }
})

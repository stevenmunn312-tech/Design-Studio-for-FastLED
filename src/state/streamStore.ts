import { create } from 'zustand'
import type { Frame } from './graphEvaluator'
import { startStream, sendStreamFrame, stopStream } from '../utils/backendClient'
import { buildAdalightPacket } from '../utils/adalight'
import type { StreamLayout } from '../codegen/streamReceiverGenerator'

// Latest computed matrix frame, written every render-loop tick (~60fps, see
// LEDPreview.tsx) and read by the send-loop below at its own throttled rate.
// A plain module holder rather than Zustand state — publishing here must not
// trigger a React re-render 60 times a second.
let latestFrame: Frame | null = null
let latestW = 0
let latestH = 0

export function publishStreamFrame(frame: Frame, width: number, height: number) {
  latestFrame = frame
  latestW = width
  latestH = height
}

// Cap the wire rate independent of the 60fps preview loop — a serial link
// (even at 921600 baud) has no headroom to also carry every preview tick, and
// a receiving board only needs to look continuous, not literally match the
// canvas's refresh rate.
const SEND_INTERVAL_MS = 1000 / 30

interface StreamState {
  streaming: boolean
  fps: number
  error: string | null
  layout: StreamLayout | null
  start: (port: string, layout: StreamLayout) => Promise<void>
  stop: () => void
}

let sendTimer: ReturnType<typeof setInterval> | null = null
let inFlight = false
let sentCount = 0
let lastFpsTick = 0

export const useStreamStore = create<StreamState>((set, get) => ({
  streaming: false,
  fps: 0,
  error: null,
  layout: null,

  start: async (port, layout) => {
    if (get().streaming) return
    const res = await startStream(port, layout.baud)
    if (!res.ok) {
      set({ error: res.error ?? 'Failed to open the stream port' })
      return
    }
    set({ streaming: true, error: null, layout, fps: 0 })
    sentCount = 0
    lastFpsTick = performance.now()
    sendTimer = setInterval(() => {
      if (inFlight || !latestFrame) return
      // The matrix was resized/reconfigured since the receiver was flashed —
      // skip until the sizes line up again rather than sending a mismatched
      // packet (the receiver has NUM_LEDS baked in at flash time).
      if (latestW !== layout.width || latestH !== layout.height) return
      inFlight = true
      const packet = buildAdalightPacket(latestFrame, layout)
      void sendStreamFrame(packet).then((ok) => {
        inFlight = false
        if (!ok) {
          get().stop()
          set({ error: 'Lost connection to the board — stream stopped' })
          return
        }
        sentCount++
        const now = performance.now()
        if (now - lastFpsTick >= 1000) {
          set({ fps: sentCount })
          sentCount = 0
          lastFpsTick = now
        }
      })
    }, SEND_INTERVAL_MS)
  },

  stop: () => {
    if (sendTimer) { clearInterval(sendTimer); sendTimer = null }
    inFlight = false
    const wasStreaming = get().streaming
    set({ streaming: false, fps: 0 })
    if (wasStreaming) void stopStream()
  },
}))

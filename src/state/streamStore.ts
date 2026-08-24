import { create } from 'zustand'
import type { Frame } from './graphEvaluator'
import { startStream, sendStreamFrame, stopStream } from '../utils/backendClient'
import { buildAdalightPacketFromRgb } from '../utils/adalight'
import type { StreamLayout } from '../codegen/streamReceiverGenerator'

// Latest computed matrix frame, written every render-loop tick (~60fps, see
// LEDPreview.tsx) and read by the send-loop below at its own throttled rate.
// A plain module holder rather than Zustand state — publishing here must not
// trigger a React re-render 60 times a second.
//
// Held as packed row-major RGB, not as the evaluator's `Frame`. Evaluator
// frames are pooled and recycled a pass or two later, so keeping one by
// reference means both readers here — the send interval and the snapshot
// button — are reading a buffer whose owner may since have handed it to a
// different node. That is safe only while the render loop's body stays fully
// synchronous, so neither reader can interleave with a pass: an invariant
// nothing enforced and nothing tested, guarding a path whose bytes go out over
// serial to real hardware. Packing once here costs 0.04–0.5% of a core from
// 16x16 to 64x64 (measured), which is not worth trading for a hazard that
// returns the moment that loop gains an `await` or chunked rendering.
let latestRgb: Uint8ClampedArray | null = null
let latestW = 0
let latestH = 0

interface PackedOutputFrame {
  bytes: Uint8ClampedArray
  width: number
  height: number
}

// A stream receiver is flashed for one concrete LED output. Keep the latest
// packed frame per route so changing the output shown in the preview header
// cannot silently send a different pattern/palette to that receiver.
const latestOutputFrames = new Map<string, PackedOutputFrame>()

function packFrame(
  frame: Frame,
  width: number,
  height: number,
  reuse: Uint8ClampedArray | null,
): Uint8ClampedArray | null {
  if (width <= 0 || height <= 0) return null
  const needed = width * height * 3
  const packed = reuse?.length === needed ? reuse : new Uint8ClampedArray(needed)
  let at = 0
  for (let y = 0; y < height; y++) {
    const row = frame[y]
    for (let x = 0; x < width; x++) {
      const px = row?.[x]
      packed[at++] = px?.r ?? 0
      packed[at++] = px?.g ?? 0
      packed[at++] = px?.b ?? 0
    }
  }
  return packed
}

/** Publish the route drawn in the main preview. It remains the recorder's
 * snapshot source and is also registered when it is the active stream route. */
export function publishStreamFrame(frame: Frame, width: number, height: number, outputId?: string) {
  latestRgb = packFrame(frame, width, height, latestRgb)
  if (!latestRgb) {
    latestRgb = null
    latestW = 0
    latestH = 0
    if (outputId) latestOutputFrames.delete(outputId)
    return
  }
  latestW = width
  latestH = height
  const streamState = useStreamStore.getState()
  if (outputId && streamState.streaming && streamState.layout?.outputId === outputId) {
    const existing = latestOutputFrames.get(outputId)
    const bytes = packFrame(frame, width, height, existing?.bytes ?? null)!
    latestOutputFrames.set(outputId, { bytes, width, height })
  }
}

/** Publish a non-selected route solely for its flashed stream receiver. */
export function publishOutputStreamFrame(frame: Frame, width: number, height: number, outputId: string) {
  if (width <= 0 || height <= 0) {
    latestOutputFrames.delete(outputId)
    return
  }
  const existing = latestOutputFrames.get(outputId)
  const bytes = packFrame(frame, width, height, existing?.bytes ?? null)!
  latestOutputFrames.set(outputId, { bytes, width, height })
}

/** The most recently rendered preview frame (post-brightness, post-show-
 *  overlay) as packed RGB — the recorder's PNG snapshot source. Returns a
 *  fresh copy because the buffer above is reused every tick, so a caller
 *  holding this across frames would otherwise watch its pixels change. */
export function latestStreamFrameCopy(): { bytes: Uint8ClampedArray; width: number; height: number } | null {
  if (!latestRgb || latestW <= 0 || latestH <= 0) return null
  return { bytes: latestRgb.slice(), width: latestW, height: latestH }
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
  stop: () => Promise<void>
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
      if (inFlight) return
      const published = layout.outputId
        ? latestOutputFrames.get(layout.outputId)
        : latestRgb
          ? { bytes: latestRgb, width: latestW, height: latestH }
          : undefined
      if (!published) return
      // The matrix was resized/reconfigured since the receiver was flashed —
      // skip until the sizes line up again rather than sending a mismatched
      // packet (the receiver has NUM_LEDS baked in at flash time). Say so:
      // silently dropping every frame reads as "streaming, 0 fps" with no
      // explanation, which is exactly how an earlier 1-row-strip bug hid.
      if (published.width !== layout.width || published.height !== layout.height) {
        const message = `Matrix is now ${published.width}×${published.height} but the receiver was flashed for ${layout.width}×${layout.height} — re-flash the stream receiver, or restore the previous size.`
        if (get().error !== message) set({ error: message })
        return
      }
      if (get().error) set({ error: null })
      inFlight = true
      const packet = buildAdalightPacketFromRgb(published.bytes, layout)
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

  stop: async () => {
    if (sendTimer) { clearInterval(sendTimer); sendTimer = null }
    inFlight = false
    const wasStreaming = get().streaming
    set({ streaming: false, fps: 0 })
    if (wasStreaming) await stopStream()
  },
}))

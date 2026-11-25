// Output-latency compensation for the decoder analysis path.
//
// The in-app player's analysis taps the media element *before* the samples
// reach the output device, so a beat is detected while the speaker has not yet
// played it. The ear hears it `baseLatency + outputLatency` later (tens of ms
// on a wired device, 150–250 ms over Bluetooth), which is exactly how early
// the LEDs ran. Holding each analysis frame for that long before publishing
// it lines the preview up with what the listener hears. Microphone capture
// needs no such hold: the mic hears the same sound the listener hears.
//
// The picture is late too, so the hold is the difference between the two
// delays, not the whole speaker delay. A released frame waits for the next
// preview step (the LED loop's animation frame runs before this engine's, so
// at least one display frame, plus half a step on average), and the drawn
// canvas reaches the screen one or two display frames after that. Holding
// for the full speaker delay put the LEDs that much behind the sound: on a
// wired Windows laptop the device reports about 59 ms, nearly all of which
// the picture spends on its own.
import type { AudioData } from './audioEngine'

/** Longest hold honoured; a device reporting more is treated as broken. */
export const MAX_OUTPUT_LATENCY_MS = 1000

/** Time, ms, from a frame's release to its light on screen: one display frame
 *  for the loop order, half a 30 fps preview step, and about one and a half
 *  display frames to composite and scan out, at 60 Hz. Set a little under
 *  the sum so the picture never runs ahead of the sound. */
export const PICTURE_LATENCY_MS = 50

/** Delay between a sample entering the graph and leaving the speakers, ms.
 *  Browsers that report neither value get 0 (no compensation), never NaN. */
export function outputLatencyMs(context: { baseLatency?: number; outputLatency?: number } | null): number {
  if (!context) return 0
  const base = Number.isFinite(context.baseLatency) ? Number(context.baseLatency) : 0
  const output = Number.isFinite(context.outputLatency) ? Number(context.outputLatency) : 0
  return Math.max(0, Math.min(MAX_OUTPUT_LATENCY_MS, (base + output) * 1000))
}

/** Extra time, ms, the preview takes before a frame is drawn: one step while
 *  the preview worker evaluates, since its frame is shown a step after the
 *  audio it read (see docs/design/preview-worker.md), else 0. */
let previewPipelineMs = 0

/** Set by the preview loop each frame. */
export function setPreviewPipelineMs(ms: number): void {
  previewPipelineMs = Math.max(0, ms)
}

/** How long to hold an analysis frame so its light and its sound arrive
 *  together: the speaker's delay less the picture's own. */
export function analysisHoldMs(
  context: { baseLatency?: number; outputLatency?: number } | null,
  pipelineMs = previewPipelineMs,
): number {
  return Math.max(0, outputLatencyMs(context) - PICTURE_LATENCY_MS - pipelineMs)
}

interface HeldFrame {
  at: number
  frame: AudioData
}

/** Queue of analysis frames released once their sound has been heard. */
export class AnalysisDelay {
  private held: HeldFrame[] = []

  get size(): number {
    return this.held.length
  }

  /** Enqueue a frame analysed at `at` (ms, same clock as `takeDue`). */
  push(at: number, frame: AudioData): void {
    this.held.push({ at, frame })
  }

  /** The newest frame whose sound has played by `now`, or null while all are
   *  still in flight. Older due frames are dropped, but a beat any of them
   *  carried is folded into the returned frame so no beat is lost to a long
   *  animation frame. */
  takeDue(now: number, latencyMs: number): AudioData | null {
    const release = now - latencyMs
    let dueCount = 0
    while (dueCount < this.held.length && this.held[dueCount].at <= release) dueCount++
    if (dueCount === 0) return null
    const due = this.held.splice(0, dueCount)
    const latest = due[due.length - 1].frame
    let beat = false
    let beatConfidence = 0
    for (const { frame } of due) {
      if (frame.beat) {
        beat = true
        beatConfidence = Math.max(beatConfidence, frame.beatConfidence)
      }
    }
    return beat && !latest.beat ? { ...latest, beat, beatConfidence } : latest
  }

  clear(): void {
    this.held.length = 0
  }
}

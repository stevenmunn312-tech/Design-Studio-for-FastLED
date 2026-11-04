// Output-latency compensation for the decoder analysis path.
//
// The in-app player's analysis taps the media element *before* the samples
// reach the output device, so a beat is detected while the speaker has not yet
// played it. The ear hears it `baseLatency + outputLatency` later (tens of ms
// on a wired device, 150–250 ms over Bluetooth), which is exactly how early
// the LEDs ran. Holding each analysis frame for that long before publishing
// it lines the preview up with what the listener hears. Microphone capture
// needs no such hold: the mic hears the same sound the listener hears.
import type { AudioData } from './audioEngine'

/** Longest hold honoured; a device reporting more is treated as broken. */
export const MAX_OUTPUT_LATENCY_MS = 1000

/** Delay between a sample entering the graph and leaving the speakers, ms.
 *  Browsers that report neither value get 0 (no compensation), never NaN. */
export function outputLatencyMs(context: { baseLatency?: number; outputLatency?: number } | null): number {
  if (!context) return 0
  const base = Number.isFinite(context.baseLatency) ? Number(context.baseLatency) : 0
  const output = Number.isFinite(context.outputLatency) ? Number(context.outputLatency) : 0
  return Math.max(0, Math.min(MAX_OUTPUT_LATENCY_MS, (base + output) * 1000))
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

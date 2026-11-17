// When the LED preview loop takes its next step.
//
// The loop runs on animation frames and steps at the Board's frame rate.
// Callbacks run a few milliseconds into their display frame, and how far
// varies with the other work in that frame. Comparing the gap since the last
// step against the step length therefore skipped a whole display frame each
// time a callback ran early: a 32 fps Board on a 60 Hz display needs a gap of
// 31.25 ms from frames 33.3 ms apart, and with a couple of milliseconds of
// jitter it previewed at about 21 fps (a 30 fps Board on a 30 Hz pane at 20).
// Steps instead follow a fixed schedule, run up to `FRAME_GATE_SLACK_MS`
// early, and make up a late step on the next frame, so the average rate is
// the Board's, capped by the display.

/** How early a step may run, ms: more than callback jitter, well under a
 *  display frame at any common refresh rate. */
export const FRAME_GATE_SLACK_MS = 4

/**
 * The schedule time of the step to take now, or null to wait. `lastStep` is
 * the schedule time of the previous step. A loop more than a whole step
 * behind (a stalled tab, a paused preview) restarts its schedule at `now`
 * instead of rushing through the missed steps.
 */
export function frameGate(now: number, lastStep: number, stepMs: number): number | null {
  if (now - lastStep < stepMs - FRAME_GATE_SLACK_MS) return null
  const next = lastStep + stepMs
  return now - next >= stepMs ? now : next
}

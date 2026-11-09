import { instanceState } from '../../state/evaluator/memory'

/*
 * Frames' worth of time since a node's previous pass, for simulations whose
 * motion was written as a step per frame. Multiplying each per-frame step by
 * `passFrames` keeps the motion on the clock: at 60 fps nothing changes, and a
 * board that drops to 30 fps moves twice as far a pass instead of half as fast.
 * The first pass counts as one frame, so a 60 fps run steps exactly as it did,
 * and a stall counts as at most `MAX_PASS_SEC`, so resuming does not leap. The
 * firmware twin is `passClockCpp.ts`.
 */
export const PASS_FPS = 60
export const MAX_PASS_SEC = 0.25

const clocks = instanceState('passClock', new Map<string, number>())

/** Frames of 1/60 s since the node's previous pass: 1 on its first, 0 while paused. */
export function passFrames(key: string, t: number): number {
  const last = clocks.get(key)
  clocks.set(key, t)
  if (last === undefined) return 1
  return Math.max(0, Math.min(MAX_PASS_SEC, t - last)) * PASS_FPS
}

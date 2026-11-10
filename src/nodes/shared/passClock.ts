import { instanceState } from '../../state/evaluator/memory'

/*
 * Frames' worth of time since a node's previous pass, for simulations whose
 * motion was written as a step per frame. Multiplying each per-frame step by
 * `passFrames` keeps the motion on the clock: at 60 fps nothing changes, and a
 * board that drops to 30 fps moves twice as far a pass instead of half as fast.
 * The first pass counts as one frame, so a 60 fps run steps exactly as it did,
 * and a stall counts as at most `MAX_PASS_SEC`, so resuming does not leap. The
 * firmware twin is `passClockCpp.ts`.
 *
 * A step written as a per-frame factor follows the same clock by its kind:
 * a velocity or a count is multiplied by the frames, a share kept (drag, a
 * life's decay) is raised to them (`keepOver`), a chance becomes the chance
 * of coming up at least once in them (`passChance`), and a whole number of
 * iterations carries its fraction to the next pass (`passSteps`). Each gives
 * back the per-frame value unchanged at one frame.
 */
export const PASS_FPS = 60
export const MAX_PASS_SEC = 0.25

/** A pass this close to a whole number of 60ths is that number: 1/60 s in floating point reads 0.9999999999999964. */
const WHOLE_FRAME_SNAP = 1e-9

const clocks = instanceState('passClock', new Map<string, number>())

/** Frames of 1/60 s since the node's previous pass: 1 on its first, 0 while paused. */
export function passFrames(key: string, t: number): number {
  const last = clocks.get(key)
  clocks.set(key, t)
  if (last === undefined) return 1
  const frames = Math.max(0, Math.min(MAX_PASS_SEC, t - last)) * PASS_FPS
  const whole = Math.round(frames)
  return Math.abs(frames - whole) < WHOLE_FRAME_SNAP ? whole : frames
}

/** A share kept each frame, kept over `frames` of them: `keep` itself at one frame. */
export function keepOver(keep: number, frames: number): number {
  return Math.pow(keep, frames)
}

/** The chance a per-frame chance `p` comes up at least once in `frames`: `p` itself at one frame. */
export function passChance(p: number, frames: number): number {
  return frames === 1 ? p : 1 - Math.pow(1 - p, frames)
}

/** Slack that keeps a run of passes a hair under a 60th each from dropping a step. */
const STEP_SLACK = 1e-3

const stepCarry = instanceState('passStepCarry', new Map<string, number>())

/**
 * Whole iterations owed this pass for `perFrame` a frame, the fraction carried
 * to the next pass in the node's own slot (`key`): exactly `perFrame` a pass
 * at 60 fps for a whole `perFrame`, twice that at 30 fps.
 */
export function passSteps(key: string, perFrame: number, frames: number): number {
  const owed = (stepCarry.get(key) ?? 0) + Math.max(0, perFrame) * frames
  const steps = Math.floor(owed + STEP_SLACK)
  stepCarry.set(key, owed - steps)
  return steps
}

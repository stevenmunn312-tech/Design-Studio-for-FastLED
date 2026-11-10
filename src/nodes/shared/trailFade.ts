import { instanceState } from '../../state/evaluator/memory'
import type { Frame } from '../../state/palettes/ledColor'
import { MAX_STEP_FRAMES, PASS_FPS, STEP_SLACK } from './passClock'

/*
 * Trail length on a time scale people can hear in a slider.
 *
 * Every node that leaves a trail reads one `trail` knob: 0 leaves none and 1
 * the longest. A fade that takes a share off the buffer every frame is spent
 * almost entirely at one end of its slider (at 60 fps, keeping 0.9 a frame
 * already halves a trail in a tenth of a second), and the length also moved
 * with the frame rate. Here the slider picks a half-life on a log scale
 * instead, each tenth of travel lengthening the trail by the same ratio, from
 * `shortest` seconds at 0 to `longest` at 1, and every pass fades by the time
 * that has actually passed.
 *
 * The firmware fades with FastLED's `fadeToBlackBy`, which takes whole bytes,
 * so a long trail's per-frame amount (well under 1) would round to nothing.
 * Both sides therefore carry the unspent fade from pass to pass and apply
 * FastLED's own byte arithmetic, `v * (256 - by) >> 8`, so the preview dims a
 * pixel exactly as `fadeToBlackBy` does. That arithmetic floors, taking about
 * half a level extra on every application, which over the 120 frames of a
 * 2 s trail ate a quarter of its length and killed dim tails in a few frames.
 * A slow fade is therefore saved up and applied `TRAIL_MIN_STEP` bytes at a
 * time, a step too small to see.
 *
 * The floor is also why the fade is stepped a 60th of a second at a time and
 * never once per pass: a pass that spans two 60ths fades twice, by the bytes
 * two 60 fps passes would have spent. Fading once for the whole pass floored
 * half as often at 30 fps, which drew a short trail up to 8% brighter, with
 * up to a quarter more lit pixels, than the same trail at 60 fps. Stepped,
 * the bytes depend only on how many 60ths have gone by, so every frame rate
 * spends the same ones. A pass more than `MAX_STEP_FRAMES` 60ths long (under
 * 15 fps, or resuming) fades once for all of it instead of catching up.
 *
 * A trail held as floats has no bytes to floor, so it multiplies by
 * `trailKeep` directly. The firmware twin is `trailFadeCpp.ts`.
 */
export const TRAIL_HALF_LIFE = { longest: 2, shortest: 1 / 240 } as const
export const TRAIL_MIN_STEP = 8

/** Seconds for a trail to halve at `trail`, 0 shortest to 1 longest, log-spaced. */
export function trailHalfLife(trail: number): number {
  const v = Math.max(0, Math.min(1, trail))
  return TRAIL_HALF_LIFE.longest * Math.pow(TRAIL_HALF_LIFE.shortest / TRAIL_HALF_LIFE.longest, 1 - v)
}

/**
 * The share of light a trail keeps over `dt` seconds. A trail of 0 keeps
 * none, so nothing lingers even for a frame; above it the half-life applies.
 */
export function trailSurvives(trail: number, dt: number): number {
  return trail <= 0 ? 0 : Math.pow(2, -dt / trailHalfLife(trail))
}

/**
 * The `trail` value whose half-life matches a fade that keeps `retain` of the
 * light every frame at `fps`: how a per-frame share converts onto this scale.
 */
export function trailFromRetention(retain: number, fps = 60): number {
  const r = Math.max(1e-6, Math.min(1 - 1e-9, retain))
  const halfLife = Math.LN2 / (fps * -Math.log(r))
  const v = 1 - Math.log(halfLife / TRAIL_HALF_LIFE.longest) / Math.log(TRAIL_HALF_LIFE.shortest / TRAIL_HALF_LIFE.longest)
  return Math.max(0, Math.min(1, v))
}

interface TrailClock { lastT: number; owed: number; frames: number }
const trailClocks = instanceState('trailFade', new Map<string, TrailClock>())
const keepClocks = instanceState('trailKeep', new Map<string, number>())

/**
 * The `fadeToBlackBy` bytes for this pass, in order: a 60th of a second's
 * fade for each whole 60th since the node's previous pass (none on its
 * first), each spent once what is saved up reaches `TRAIL_MIN_STEP`. Empty
 * when the pass owes no fade.
 */
export function trailFadeSteps(key: string, t: number, trail: number): number[] {
  return timedFadeSteps(key, t, (dt) => trailSurvives(trail, dt))
}

/**
 * The share of a float trail that survives this pass at `trail`: 1 on the
 * node's first pass and while paused. The firmware twin is `trailKeepCpp`.
 */
export function trailKeep(key: string, t: number, trail: number): number {
  const last = keepClocks.get(key)
  keepClocks.set(key, t)
  if (last === undefined) return 1
  const keep = trailSurvives(trail, Math.max(0, t - last))
  return keep >= 0 ? keep : 1
}

/**
 * The same saved-up `fadeToBlackBy` bytes for a node whose own slider sets
 * `keepOver(dt)`, the share of light that survives `dt` seconds. The
 * firmware twin is `timedFadeCpp`.
 */
export function timedFadeSteps(key: string, t: number, keepOver: (dt: number) => number): number[] {
  const clock = trailClocks.get(key)
  if (!clock) {
    trailClocks.set(key, { lastT: t, owed: 0, frames: 0 })
    return []
  }
  clock.frames += Math.max(0, t - clock.lastT) * PASS_FPS
  clock.lastT = t
  let steps = Math.floor(clock.frames + STEP_SLACK)
  clock.frames -= steps
  // Too far behind to catch up a 60th at a time: one fade for the whole gap.
  let dt = 1 / PASS_FPS
  if (steps > MAX_STEP_FRAMES) { dt = steps / PASS_FPS; steps = 1 }
  let keep = keepOver(dt)
  if (!(keep >= 0)) keep = 1
  const spent: number[] = []
  for (; steps > 0; steps--) {
    clock.owed += (1 - keep) * 256
    if (clock.owed < TRAIL_MIN_STEP) continue
    const by = Math.min(255, Math.floor(clock.owed))
    clock.owed = by === 255 ? 0 : clock.owed - by
    spent.push(by)
  }
  return spent
}

/** FastLED's `fadeToBlackBy(leds, n, by)` on a preview frame, in place, once for each byte in `steps`. */
export function fadeFrameToBlackBy(frame: Frame, steps: number | readonly number[]): void {
  for (const by of typeof steps === 'number' ? [steps] : steps) {
    if (by <= 0) continue
    const keep = 256 - by
    for (const row of frame) {
      for (const px of row) {
        px.r = (px.r * keep) >> 8
        px.g = (px.g * keep) >> 8
        px.b = (px.b * keep) >> 8
      }
    }
  }
}

/** The same arithmetic on a flat run of colour bytes, such as an RGB trail. */
export function fadeBytesToBlackBy(bytes: Uint8Array, steps: number | readonly number[]): void {
  for (const by of typeof steps === 'number' ? [steps] : steps) {
    if (by <= 0) continue
    const keep = 256 - by
    for (let i = 0; i < bytes.length; i++) bytes[i] = (bytes[i] * keep) >> 8
  }
}

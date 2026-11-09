import { instanceState } from '../../state/evaluator/memory'
import type { Frame } from '../../state/palettes/ledColor'

/*
 * Trail fade on a time scale people can hear in a slider.
 *
 * A fade that takes `1 - fade` off the buffer every frame is spent almost
 * entirely below 0.1: at 60 fps a fade of 0.1 already halves a trail in a
 * tenth of a second, so 0.1 to 1 all read as "short", and the length also
 * moved with the frame rate. Here the slider picks a half-life on a log scale
 * instead, each tenth of travel shortening the trail by the same ratio, from
 * `longest` seconds at 0 to `shortest` at 1, and every pass fades by the time
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
 * time, a step too small to see. The firmware twin is `trailFadeCpp.ts`.
 */
export const TRAIL_HALF_LIFE = { longest: 2, shortest: 1 / 240 } as const
export const TRAIL_MIN_STEP = 8

/** Seconds for a trail to halve at `fade`, 0 longest to 1 shortest, log-spaced. */
export function trailHalfLife(fade: number): number {
  const f = Math.max(0, Math.min(1, fade))
  return TRAIL_HALF_LIFE.longest * Math.pow(TRAIL_HALF_LIFE.shortest / TRAIL_HALF_LIFE.longest, f)
}

interface TrailClock { lastT: number; owed: number }
const trailClocks = instanceState('trailFade', new Map<string, TrailClock>())

/**
 * The `fadeToBlackBy` byte for this pass: the fade owed for the time since
 * the node's previous pass (none on its first), plus what earlier passes
 * saved up, once that reaches `TRAIL_MIN_STEP`; 0 until then.
 */
export function trailFadeAmount(key: string, t: number, fade: number): number {
  const halfLife = trailHalfLife(fade)
  return timedFadeAmount(key, t, (dt) => Math.pow(2, -dt / halfLife))
}

/**
 * The same saved-up `fadeToBlackBy` byte for a node whose own slider sets
 * `keepOver(dt)`, the share of light that survives `dt` seconds. The
 * firmware twin is `timedFadeCpp`.
 */
export function timedFadeAmount(key: string, t: number, keepOver: (dt: number) => number): number {
  const clock = trailClocks.get(key)
  if (!clock) {
    trailClocks.set(key, { lastT: t, owed: 0 })
    return 0
  }
  const dt = Math.max(0, t - clock.lastT)
  clock.lastT = t
  let keep = keepOver(dt)
  if (!(keep >= 0)) keep = 1
  clock.owed += (1 - keep) * 256
  if (clock.owed < TRAIL_MIN_STEP) return 0
  const by = Math.min(255, Math.floor(clock.owed))
  clock.owed = by === 255 ? 0 : clock.owed - by
  return by
}

/** FastLED's `fadeToBlackBy(leds, n, by)` on a preview frame, in place. */
export function fadeFrameToBlackBy(frame: Frame, by: number): void {
  if (by <= 0) return
  const keep = 256 - by
  for (const row of frame) {
    for (const px of row) {
      px.r = (px.r * keep) >> 8
      px.g = (px.g * keep) >> 8
      px.b = (px.b * keep) >> 8
    }
  }
}

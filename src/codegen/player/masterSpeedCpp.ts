// The firmware half of `src/state/player/masterSpeed.ts`.
//
// The sketch's one shared time value is `float t`, and without a Master Speed
// node it stays what it always was: `millis() / 1000.0f`, one line, no state.
// A graph that has one swaps that for an accumulator, because a knob has to
// change how fast time runs from now on rather than where time is. Multiplying
// `millis()` would make every animation in the build jump the instant the knob
// moved.
//
// The browser does the same arithmetic by sliding its clock's origin. Different
// mechanics, same rule — and both read the speed the *previous* pass resolved,
// which here is not an optimisation but the only order that works: the clock is
// emitted at the top of the loop and a wired speed comes from nodes emitted
// below it, which may themselves read `t`.

import { SYNC_NOW_MS } from '../peripherals/boardSyncCpp'

/** What the loop needs to know about a graph's Master Speed knob. */
export interface MasterSpeedEmit {
  /**
   * C++ float expression for a wired speed, or null when nothing is wired.
   *
   * Null with a knob present still means a knob: `initial` carries the node's
   * own slider, which is a constant and needs no feedback at all.
   */
  speedExpr: string | null
  /** The node's property value, and the accumulator's starting speed. */
  initial: number
  /** False when the graph has no Master Speed node, which is most graphs. */
  present: boolean
  min: number
  max: number
}

/**
 * The `float t` line, or the accumulator that replaces it. With clock sync on
 * the wall clock is `_syncNowMs()` (peripherals/boardSyncCpp.ts), the one
 * animation clock every synced board reads; otherwise `millis()`.
 */
export function masterClockLoopCpp(emit: MasterSpeedEmit, synced = false): string[] {
  const clock = synced ? SYNC_NOW_MS : 'millis()'
  if (!emit.present) return [`  float t = ${clock} / 1000.0f;`]

  const lines = [
    '  // Master Speed: accumulate, never multiply — scaling millis() directly',
    '  // would jump every animation the instant the knob moved.',
    ...scaledClockStaticsCpp('_tAnim'),
    '  static uint32_t _tLastMs = 0;',
  ]
  // A slider with nothing wired to it is a constant, so it needs no static and
  // no feedback: the whole one-pass-behind arrangement below exists only for a
  // speed that some other node computes.
  if (emit.speedExpr) lines.push(`  static float _tSpeed = ${emit.initial.toFixed(4)}f;`)
  else lines.push(`  const float _tSpeed = ${emit.initial.toFixed(4)}f;`)
  lines.push(
    `  uint32_t _tNowMs = ${clock};`,
    // Zero on the first pass: there is no previous frame to have taken time.
    `  if (_tLastMs) ${scaledClockStepCpp('_tAnim', '_tNowMs - _tLastMs', '_tSpeed')}`,
    '  _tLastMs = _tNowMs;',
    '  float t = _tAnimMs / 1000.0f;',
  )
  return lines
}

/**
 * The scaled clock's state: whole milliseconds as an exact integer, plus the
 * fraction of a millisecond the last step left over.
 *
 * Accumulating `float` seconds looks simpler and fails on an installed
 * fixture: a float has 24 bits, so once the clock passes about three days
 * (2^18 seconds) a 16 ms frame is below half its resolution and rounds to
 * nothing — at speed 0.5 the animation freezes outright, at 1 it alternates
 * between skipping and double-stepping. Integer milliseconds are exact for
 * the whole 49.7-day `millis()` range, and the remainder keeps a fractional
 * speed exact over any number of frames.
 */
function scaledClockStaticsCpp(name: string): string[] {
  return [
    `  static uint32_t ${name}Ms = 0;      // scaled milliseconds, exact`,
    `  static float ${name}Frac = 0.0f;    // sub-millisecond remainder of the last step`,
  ]
}

/** One step of the scaled clock: `dtMsExpr` real milliseconds at `speedExpr`. Speed is never negative. */
function scaledClockStepCpp(name: string, dtMsExpr: string, speedExpr: string): string {
  return `{ float _step = (${dtMsExpr}) * ${speedExpr} + ${name}Frac; uint32_t _whole = (uint32_t)_step; ${name}Ms += _whole; ${name}Frac = _step - _whole; }`
}

/**
 * The wired speed, resolved at the foot of the loop for the next pass.
 *
 * Emitted after every node, because that is where its source's variables
 * exist. Nothing at all for an unwired slider, whose value is already a `const`
 * in the block above.
 */
export function masterSpeedUpdateCpp(emit: MasterSpeedEmit): string[] {
  if (!emit.present || !emit.speedExpr) return []
  return [
    `  _tSpeed = constrain(${emit.speedExpr}, ${emit.min.toFixed(1)}f, ${emit.max.toFixed(1)}f);  // for the next pass`,
  ]
}

/**
 * A show controller's animation clock, kept separate from its wall clock.
 *
 * `now` continues to own slideshow dwell and transition progress. Only the
 * animation time read by Time/Wave controls and collected pattern renderers
 * comes from this accumulator, so freezing Master Speed cannot freeze the
 * slideshow's dwell or transitions. A wired speed is resolved after the clock
 * snapshot and applies on the next pass, as in a normal sketch.
 */
export function masterShowClockLoopCpp(emit: MasterSpeedEmit, wallMsExpr = 'now'): string[] {
  if (!emit.present) return []

  const lines = [
    '  // Master Speed scales animation and Time/Wave controls. Slideshow timing keeps',
    '  // using the real millis() clock in now.',
    ...scaledClockStaticsCpp('_showAnim'),
    '  static uint32_t _showAnimLastMs = 0;',
  ]
  if (emit.speedExpr) lines.push(`  static float _showAnimSpeed = ${emit.initial.toFixed(4)}f;`)
  else lines.push(`  const float _showAnimSpeed = ${emit.initial.toFixed(4)}f;`)
  lines.push(
    `  if (_showAnimLastMs) ${scaledClockStepCpp('_showAnim', `${wallMsExpr} - _showAnimLastMs`, '_showAnimSpeed')}`,
    `  _showAnimLastMs = ${wallMsExpr};`,
    '  uint32_t animNow = _showAnimMs;',
  )
  return lines
}

/** Resolve a show controller's wired speed after this pass has used the prior value. */
export function masterShowSpeedUpdateCpp(emit: MasterSpeedEmit): string[] {
  if (!emit.present || !emit.speedExpr) return []
  return [
    `  _showAnimSpeed = constrain(${emit.speedExpr}, ${emit.min.toFixed(1)}f, ${emit.max.toFixed(1)}f);  // for the next pass`,
  ]
}

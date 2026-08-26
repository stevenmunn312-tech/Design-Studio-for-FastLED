// The firmware half of `src/state/masterSpeed.ts`.
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

/** The `float t` line, or the accumulator that replaces it. */
export function masterClockLoopCpp(emit: MasterSpeedEmit): string[] {
  if (!emit.present) return ['  float t = millis() / 1000.0f;']

  const lines = [
    '  // Master Speed: accumulate, never multiply — scaling millis() directly',
    '  // would jump every animation the instant the knob moved.',
    '  static float _tAnim = 0.0f;',
    '  static uint32_t _tLastMs = 0;',
  ]
  // A slider with nothing wired to it is a constant, so it needs no static and
  // no feedback: the whole one-pass-behind arrangement below exists only for a
  // speed that some other node computes.
  if (emit.speedExpr) lines.push(`  static float _tSpeed = ${emit.initial.toFixed(4)}f;`)
  else lines.push(`  const float _tSpeed = ${emit.initial.toFixed(4)}f;`)
  lines.push(
    '  uint32_t _tNowMs = millis();',
    // Zero on the first pass: there is no previous frame to have taken time.
    '  if (_tLastMs) _tAnim += ((_tNowMs - _tLastMs) / 1000.0f) * _tSpeed;',
    '  _tLastMs = _tNowMs;',
    '  float t = _tAnim;',
  )
  return lines
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

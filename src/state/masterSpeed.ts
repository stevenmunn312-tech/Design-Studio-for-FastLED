// One knob on the one shared time value.
//
// Every animated node reads the same `t` — seconds since the sketch started,
// `millis() / 1000.0f` on the device and the preview's wall clock in the
// browser. Master Speed scales *that*, rather than reaching into each node and
// rewriting its own rate: a graph with a dozen speeds keeps their relationships
// exactly, and a node added tomorrow is covered without being taught anything.
//
// It is accumulated, never multiplied into the elapsed time. `t * speed` looks
// equivalent and is not: turning the knob from 1 to 2 would double `t` on the
// spot and every animation in the build would jump. Advancing by
// `dt * speed` each frame means the knob changes how fast time runs from now
// on, which is what a speed control is.
//
// The speed used for a frame is the one resolved on the frame before. That is
// deliberate rather than incidental — the control's own value has to be
// computed from somewhere, and computing it from scaled time would let a speed
// of zero freeze the thing that turns it back up. One frame of lag on a knob
// is imperceptible; a control that cannot undo itself is not.

/** Slowest and fastest the knob goes. Zero is a freeze, not a reverse. */
export const MASTER_SPEED_MIN = 0
export const MASTER_SPEED_MAX = 4
export const MASTER_SPEED_DEFAULT = 1

export function clampMasterSpeed(value: unknown): number {
  const speed = Number(value)
  if (!Number.isFinite(speed)) return MASTER_SPEED_DEFAULT
  return Math.max(MASTER_SPEED_MIN, Math.min(MASTER_SPEED_MAX, speed))
}

/**
 * The speed this graph resolved on its last pass, or 1 when it has no knob.
 *
 * Read from the evaluator's own outputs rather than from a module global, so a
 * second evaluation context — an offline recording running beside the live
 * preview — reads its own answer instead of the other one's.
 */
export function masterSpeedFromOutputs(
  nodes: readonly { id: string; data: { nodeType: string } }[],
  outputs: ReadonlyMap<string, Record<string, unknown>>,
): number {
  // More than one is a graph the user should not have built, and validation
  // says so. Taking the first keeps this total rather than throwing at 60 fps.
  const knob = nodes.find((node) => node.data.nodeType === 'MasterSpeed')
  if (!knob) return MASTER_SPEED_DEFAULT
  return clampMasterSpeed(outputs.get(knob.id)?.speed)
}

/**
 * How far the animation clock's origin has to slide this frame.
 *
 * The preview derives `tick` from `now - startTime`, so rather than keeping a
 * second clock, speed moves the origin: advancing it by `gap * (1 - speed)`
 * makes the elapsed time grow by `gap * speed`. At speed 0 the origin keeps
 * pace with the wall clock and time stands still; above 1 it slides backwards
 * and time runs long. It is the same mechanism the pause already uses, which
 * slides the origin by exactly the interval spent paused.
 */
export function masterSpeedOriginShift(gapMs: number, speed: number): number {
  return gapMs * (1 - clampMasterSpeed(speed))
}

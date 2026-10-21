/*
 * Live, transient state for Web Remote controls in the browser: what the
 * node's own mini remote and the phone preview have set each control to.
 *
 * Like the hardware input and display runtime stores it is neither persisted
 * nor undo-tracked: a board boots with every control at its start value, and
 * so does a reload. It is written by pointer gestures and read by the
 * evaluator on every frame, so it mutates its maps in place and never goes
 * through a store `set`; React readers subscribe to a per-node revision that
 * moves only when a value changes. See displayRuntimeStore.ts for the same
 * shape.
 */

interface ControlRuntime {
  value: number | boolean
  /**
   * A press not yet seen by an evaluator pass. A tap that goes down and up
   * between two passes would otherwise never reach the graph; this keeps it
   * true for exactly one sample, the screen widget's `touchPending` rule.
   */
  pending: boolean
}

const remotes = new Map<string, Map<string, ControlRuntime>>()
const revisions = new Map<string, number>()
const listeners = new Map<string, Set<() => void>>()

function bump(nodeId: string) {
  revisions.set(nodeId, (revisions.get(nodeId) ?? 0) + 1)
  listeners.get(nodeId)?.forEach((listener) => listener())
}

function runtimeFor(nodeId: string, controlId: string, fallback: number | boolean): ControlRuntime {
  let controls = remotes.get(nodeId)
  if (!controls) {
    controls = new Map()
    remotes.set(nodeId, controls)
  }
  let runtime = controls.get(controlId)
  if (!runtime) {
    runtime = { value: fallback, pending: false }
    controls.set(controlId, runtime)
  }
  return runtime
}

/**
 * Set a control. A boolean `true` is a press that stays pending until a pass
 * samples it, so releasing it before the next frame still reaches the graph.
 */
export function writeWebRemoteControl(nodeId: string, controlId: string, value: number | boolean): void {
  const fresh = remotes.get(nodeId)?.get(controlId) === undefined
  const runtime = runtimeFor(nodeId, controlId, value)
  if (value === true) runtime.pending = true
  if (!fresh && runtime.value === value) return
  runtime.value = value
  bump(nodeId)
}

/** The value a control shows, or `fallback` when nobody has touched it. */
export function readWebRemoteControl(nodeId: string, controlId: string, fallback: number | boolean): number | boolean {
  return remotes.get(nodeId)?.get(controlId)?.value ?? fallback
}

/**
 * The value one evaluator pass reads. A pending press reads true once, even
 * if the finger has already left; every other read is the current value.
 */
export function sampleWebRemoteControl(nodeId: string, controlId: string, fallback: number | boolean): number | boolean {
  const runtime = remotes.get(nodeId)?.get(controlId)
  if (!runtime) return fallback
  if (runtime.pending) {
    runtime.pending = false
    return true
  }
  return typeof runtime.value === typeof fallback ? runtime.value : fallback
}

export function webRemoteRevision(nodeId: string): number {
  return revisions.get(nodeId) ?? 0
}

export function subscribeWebRemote(nodeId: string, listener: () => void): () => void {
  let set = listeners.get(nodeId)
  if (!set) {
    set = new Set()
    listeners.set(nodeId, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
    if (set?.size === 0) listeners.delete(nodeId)
  }
}

/** Forget one control (removed from the remote) so a later one with its id starts fresh. */
export function forgetWebRemoteControl(nodeId: string, controlId: string): void {
  if (remotes.get(nodeId)?.delete(controlId)) bump(nodeId)
}

/** Clear one remote, or every remote. */
export function resetWebRemoteRuntime(nodeId?: string): void {
  if (nodeId === undefined) {
    const ids = [...remotes.keys()]
    remotes.clear()
    ids.forEach(bump)
    return
  }
  if (remotes.delete(nodeId)) bump(nodeId)
}

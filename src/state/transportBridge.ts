// The one definition of what a transport control *means*.
//
// A press has to mean one thing wherever it is read. `Player Controls` turns
// buttons into transport actions for the Music Player, and the player sketch
// has to agree with what the preview just did — a debounce written twice is a
// debounce that eventually disagrees with itself.
//
// Everything here is pure: state is passed in and mutated in place, never read
// from a store. The evaluator owns the store wiring, so these rules can be
// tested without a running player, and the firmware generators can reuse the
// same numbers.

/** Per-button debounce and auto-repeat state. Owned by the caller. */
export interface ButtonEdgeState {
  raw: boolean
  stable: boolean
  changedAt: number
  nextRepeatAt: number
}

export interface ButtonEdgeSettings {
  debounceMs: number
  repeatDelayMs: number
  repeatIntervalMs: number
}

export const DEFAULT_BUTTON_EDGE_SETTINGS: ButtonEdgeSettings = {
  debounceMs: 30,
  repeatDelayMs: 400,
  repeatIntervalMs: 120,
}

export function blankButtonEdgeState(nowMs: number): ButtonEdgeState {
  return { raw: false, stable: false, changedAt: nowMs, nextRepeatAt: Infinity }
}

/**
 * Bound the timing settings, falling back rather than passing NaN through.
 *
 * `Math.max(0, Number('soon'))` is NaN, and a NaN debounce window makes
 * `now - changedAt >= debounce` false forever — the button silently stops
 * working rather than misbehaving visibly. An imported workspace can carry any
 * value at all, so the guard is the difference between a bounded setting and a
 * dead control.
 */
export function normalizeButtonEdgeSettings(props: Record<string, unknown>): ButtonEdgeSettings {
  const bounded = (value: unknown, fallback: number, min: number): number => {
    const n = Number(value ?? fallback)
    return Number.isFinite(n) ? Math.max(min, n) : fallback
  }
  return {
    debounceMs: bounded(props.debounceMs, DEFAULT_BUTTON_EDGE_SETTINGS.debounceMs, 0),
    repeatDelayMs: bounded(props.repeatDelayMs, DEFAULT_BUTTON_EDGE_SETTINGS.repeatDelayMs, 0),
    repeatIntervalMs: bounded(props.repeatIntervalMs, DEFAULT_BUTTON_EDGE_SETTINGS.repeatIntervalMs, 1),
  }
}

/**
 * One debounced press, as a single-frame pulse.
 *
 * The contract the plan fixes once: a button reads `true` for as long as it is
 * held, and a sink that performs a one-shot action takes the rising edge. Next
 * advancing a track for every frame a finger rests on the button is the bug
 * this prevents, and it is the kind of bug that only shows up on hardware.
 *
 * With `repeat`, a held button pulses again after `repeatDelayMs` and then
 * every `repeatIntervalMs` — right for volume and brightness, wrong for
 * play/pause, which is why the caller chooses per action.
 *
 * Mutates `state` and returns whether this frame is a pulse.
 */
export function buttonEdge(
  state: ButtonEdgeState,
  raw: boolean,
  nowMs: number,
  repeat: boolean,
  settings: ButtonEdgeSettings,
): boolean {
  if (raw !== state.raw) {
    state.raw = raw
    state.changedAt = nowMs
  }
  if (state.stable !== state.raw && nowMs - state.changedAt >= settings.debounceMs) {
    state.stable = state.raw
    if (state.stable) {
      state.nextRepeatAt = nowMs + settings.repeatDelayMs
      return true
    }
    state.nextRepeatAt = Infinity
    return false
  }
  if (repeat && state.stable && nowMs >= state.nextRepeatAt) {
    const missed = Math.floor((nowMs - state.nextRepeatAt) / settings.repeatIntervalMs) + 1
    state.nextRepeatAt += missed * settings.repeatIntervalMs
    return true
  }
  return false
}

/**
 * `elapsed / duration` as `M:SS` pairs for a display row.
 *
 * Minutes are not zero-padded and seconds always are, which is how every player
 * anyone has used prints a time. Anything past an hour keeps counting in
 * minutes rather than growing an hours field a fixed layout has no room for.
 */
export function formatTransportTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

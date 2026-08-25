// The one definition of what a transport control *means*.
//
// Two things live here, and both are here because they were about to exist
// twice. `Player Controls` already turns buttons into transport actions for the
// Music Player; `Transport Control` needs the identical rules so a display's
// Next button and a panel-mounted Next button cannot disagree about what a
// press is. And a display needs to *read* the transport, which nothing in the
// graph could do before.
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

/** Last observed position of a scrub control. */
export interface ScrubState {
  last: number
  seen: boolean
}

/**
 * How far a scrub must move before it counts as a seek.
 *
 * A slider parked at 0.5 publishes 0.5 every frame. Treating that as a seek
 * would drag playback back to the same spot forever, so a seek is a *change*,
 * not a value. The threshold is a little under half a second in a
 * three-minute track — coarse enough that pot jitter cannot scrub, fine
 * enough that a deliberate nudge lands.
 */
export const SCRUB_EPSILON = 0.002

/**
 * The position a scrub is commanding, or null while it is not moving.
 *
 * The first reading is never a seek: a graph that loads with its slider at 0.5
 * has not asked for anything, and seeking on load would jump every track to the
 * middle the moment the page opened.
 */
export function scrubCommit(state: ScrubState, value: number, epsilon = SCRUB_EPSILON): number | null {
  if (!Number.isFinite(value)) return null
  const clamped = Math.max(0, Math.min(1, value))
  if (!state.seen) {
    state.seen = true
    state.last = clamped
    return null
  }
  if (Math.abs(clamped - state.last) < epsilon) return null
  state.last = clamped
  return clamped
}

/** What a display shows about the running transport. */
export interface TransportStatus {
  title: string
  elapsedSec: number
  durationSec: number
  /** Elapsed as a fraction of duration, 0 when the duration is unknown. */
  progress: number
  playing: boolean
  volume: number
  patternName: string
  /** 1-based for display. 0 when no collection is running. */
  patternIndex: number
  patternCount: number
}

export function blankTransportStatus(): TransportStatus {
  return {
    title: '',
    elapsedSec: 0,
    durationSec: 0,
    progress: 0,
    playing: false,
    volume: 0,
    patternName: '',
    patternIndex: 0,
    patternCount: 0,
  }
}

/** The live readings the evaluator collects from the runtime stores. */
export interface TransportSources {
  title?: string | null
  posMs?: number | null
  durationMs?: number | null
  playing?: boolean | null
  volume?: number | null
  /** 0-based index from the running Pattern Master, or null when none runs. */
  patternIndex?: number | null
  patternNames?: readonly string[] | null
}

function finite(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Fold the runtime readings into what a display shows.
 *
 * Pure so the same fold runs in preview and in a test without a player. The
 * clamping matters more than it looks: a transport that reports a position past
 * its duration would drive a progress bar off the end of its own track, and a
 * bar that overflows its widget is a rendering bug on a device with no room to
 * absorb it.
 */
export function resolveTransportStatus(sources: TransportSources): TransportStatus {
  const durationSec = Math.max(0, finite(sources.durationMs) / 1000)
  const rawElapsed = Math.max(0, finite(sources.posMs) / 1000)
  const elapsedSec = durationSec > 0 ? Math.min(rawElapsed, durationSec) : rawElapsed

  const names = sources.patternNames ?? []
  const rawIndex = sources.patternIndex
  const hasPattern = typeof rawIndex === 'number' && Number.isFinite(rawIndex) && names.length > 0
  const zeroBased = hasPattern ? Math.min(Math.max(0, Math.round(rawIndex)), names.length - 1) : -1

  return {
    title: String(sources.title ?? ''),
    elapsedSec,
    durationSec,
    progress: durationSec > 0 ? elapsedSec / durationSec : 0,
    playing: sources.playing === true,
    volume: Math.max(0, Math.min(1, finite(sources.volume))),
    patternName: zeroBased >= 0 ? String(names[zeroBased] ?? '') : '',
    patternIndex: zeroBased >= 0 ? zeroBased + 1 : 0,
    patternCount: names.length,
  }
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

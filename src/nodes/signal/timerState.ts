// Timer node state: the Stopwatch/Timer transport the preview steps each pass.
// The firmware (codegen/signalControlCpp.ts timerCpp) mirrors the same rules in
// millis(): both clamp dt to a quarter second, re-arm on a Duration change,
// and reset on the rising edge of Reset only.
import { CLOCK_TIMER_MAX_SEC } from '../shapes/clockTimer'

export const TIMER_MODES = ['Stopwatch', 'Timer'] as const
export type TimerMode = (typeof TIMER_MODES)[number]

export function timerMode(value: unknown): TimerMode {
  return value === 'Stopwatch' ? 'Stopwatch' : 'Timer'
}

export function clampTimerDuration(seconds: number): number {
  return Number.isFinite(seconds) ? Math.min(CLOCK_TIMER_MAX_SEC, Math.max(0, seconds)) : 0
}

export interface TimerState {
  lastT: number
  elapsed: number
  remaining: number
  prevReset: boolean
  mode: TimerMode
  duration: number
}

/** Advance one pass at wall-clock time `t` (seconds). `prev` is undefined on the first pass. */
export function stepTimer(
  prev: TimerState | undefined,
  t: number,
  mode: TimerMode,
  run: boolean,
  reset: boolean,
  duration: number,
): TimerState {
  // First pass, a clock that jumped backwards, or a mode switch starts clean.
  const st: TimerState = !prev || t < prev.lastT || prev.mode !== mode
    ? { lastT: t, elapsed: 0, remaining: duration, prevReset: false, mode, duration }
    : { ...prev }
  let dt = Math.min(0.25, Math.max(0, t - st.lastT))
  if (Math.abs(st.duration - duration) > 1e-6) {
    st.duration = duration
    st.remaining = duration
    dt = 0
  }
  if (reset && !st.prevReset) {
    st.elapsed = 0
    st.remaining = duration
    dt = 0
  }
  if (run) {
    if (mode === 'Timer') st.remaining = Math.max(0, st.remaining - dt)
    else st.elapsed += dt
  }
  st.lastT = t
  st.prevReset = reset
  return st
}

/** Seconds is elapsed for a Stopwatch and remaining for a Timer; only a Timer ever finishes. */
export function timerReadout(st: TimerState): { seconds: number; done: boolean } {
  return st.mode === 'Timer'
    ? { seconds: st.remaining, done: st.remaining <= 0 }
    : { seconds: st.elapsed, done: false }
}

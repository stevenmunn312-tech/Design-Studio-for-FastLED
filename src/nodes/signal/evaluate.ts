import { blankDmxSnapshot, type DmxSnapshot, clampDmxChannel, clampDmxByte } from '../../state/dmx'
import { waveSample, combineWaves } from '../../state/wave'
import type { NodeEvaluators } from '../../state/evaluator/types'
import { normalizedSeed, seededRandom } from '../../state/evaluator/random'
import { instanceState } from '../../state/evaluator/memory'

const counterVals = instanceState('counterVals', new Map<string, number>())
// Interval (metronome) node — last fire time in seconds, keyed by state id.
const intervalLast = instanceState('intervalLast', new Map<string, number>())

// Envelope node — trigger fire time (seconds) + previous trigger level.
const envState = instanceState('envState', new Map<string, { fire: number; prev: boolean }>())
const dmxChannelState = instanceState('dmxChannelState', new Map<string, { last: number; seen: boolean }>())

interface ScheduleState {
  prevActive: boolean
  lastPulseDay: number
  /** Previous in-range seconds-of-day sample, or null when the clock was not
   *  usable last frame. Trigger mode fires on the *crossing* of its scheduled
   *  instant rather than while inside a one-second window, so a coarse RTC, a
   *  slow frame, or a clock correction can't silently skip the day's pulse —
   *  and a board that boots after the instant does not back-fire. */
  prevSeconds: number | null
  prevDayKey: number
}
const scheduleState = instanceState('scheduleState', new Map<string, ScheduleState>())

// Clock/Transport node — free-runs from `resetOffset`; a `tap`/`sync` rising
// edge re-zeros the offset and (from the second pulse on) derives a live BPM
// from the pulse interval via an EMA, mirroring the millis()-based codegen.
interface ClockState {
  t: number
  resetOffset: number
  lastPulseT: number | null
  tappedBpm: number | null
  prevTap: boolean
  prevSync: boolean
  prevReset: boolean
  lastBeatCount: number
  lastSubCount: number
}
const clockState = instanceState('clockState', new Map<string, ClockState>())

function scheduleDayEnabled(
  mode: string,
  weekday: number,
  props: Record<string, unknown>,
): boolean {
  if (mode === 'Every day') return true
  if (mode === 'Weekdays') return weekday >= 1 && weekday <= 5
  if (mode === 'Weekends') return weekday === 0 || weekday === 6
  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
  return props[dayKeys[Math.max(0, Math.min(6, Math.round(weekday)))] ?? 'sunday'] !== false
}

/** A ScheduleTrigger hour/minute/second triple as seconds-of-day. Each field is
 *  clamped to its own range first (matching the C++ generator's `intProp`), so
 *  an out-of-range saved value resolves to the same instant in both. */
export function scheduleTimeOfDay(hour: unknown, minute: unknown, second: unknown): number {
  const part = (value: unknown, max: number) => {
    const n = Math.round(Number(value ?? 0))
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0
  }
  return part(hour, 23) * 3600 + part(minute, 59) * 60 + part(second, 59)
}

/** How far through an active window `seconds` sits, 0→1. Windows that wrap past
 *  midnight (start > end) measure across the wrap. Shared shape with the C++
 *  generator, which bakes the constants at generation time. */
export function scheduleWindowProgress(seconds: number, startSec: number, endSec: number): number {
  const span = endSec >= startSec ? endSec - startSec : 86400 - startSec + endSec
  if (span <= 0) return 0
  const elapsed = seconds >= startSec ? seconds - startSec : 86400 - startSec + seconds
  return Math.max(0, Math.min(1, elapsed / span))
}

export const SIGNAL_EVALUATORS: NodeEvaluators = {
  TimeNode({ t }) {
    return { time: t, dt: 1 / 60 }
  },
  Sin({ num }, id, props) {
    return { result: Math.sin(num(id, 'x', props, 'x', 0) * Math.PI * 2) }
  },
  Cos({ num }, id, props) {
    return { result: Math.cos(num(id, 'x', props, 'x', 0) * Math.PI * 2) }
  },
  Wave({ num, t }, id, props) {
    const amplitude = num(id, 'amplitude', props, 'amplitude', 1)
    const frequency = num(id, 'frequency', props, 'frequency', 1)
    const phase     = num(id, 'phase', props, 'phase', 0)
    const waveform  = String(props.waveform ?? 'sine')
    return { result: waveSample(waveform, amplitude, frequency, phase, t) }
  },
  ComplexWave({ num }, id, props) {
    const a = num(id, 'a', props, 'a', 0)
    const b = num(id, 'b', props, 'b', 0)
    const operation = String(props.operation ?? 'add')
    return { result: combineWaves(operation, a, b) }
  },
  Random({ stateKey }, id, props) {
    const lo = Number(props.min ?? 0), hi = Number(props.max ?? 1)
    const seed = normalizedSeed(props.seed)
    return { value: lo + seededRandom(stateKey(id), seed) * (hi - lo) }
  },
  Counter({ num, stateKey }, id, props) {
    const rate = num(id, 'rate', props, 'rate', 0.5)
    const prev = counterVals.get(stateKey(id)) ?? 0
    const next = (prev + rate / 60) % 1
    counterVals.set(stateKey(id), next)
    return { value: next }
  },
  // Trigger envelope — optional linear attack to 1 on a rising edge, then
  // linear decay to 0 (wire through Ease for a shaped curve).
  Envelope({ input, num, t, stateKey }, id, props) {
    const trig = Boolean(input(id, 'trigger', false))
    const attackProp = num(id, 'attack', props, 'attack', 0)
    const decayProp = num(id, 'decay', props, 'decay', 0.5)
    const attack = Number.isFinite(attackProp) ? Math.max(0, attackProp) : 0
    const decay = Number.isFinite(decayProp) ? Math.max(0.05, decayProp) : 0.5
    const key = stateKey(id)
    const prev = envState.get(key)
    // Forget the fire time on a clock reset (t jumped backwards).
    let fire = prev && prev.fire <= t ? prev.fire : -Infinity
    if (trig && !prev?.prev) fire = t
    envState.set(key, { fire, prev: trig })
    const age = t - fire
    const value = age < attack && attack > 0
      ? age / attack
      : 1 - (age - attack) / decay
    return { result: Math.max(0, Math.min(1, value)) }
  },
  ScheduleTrigger({ input, stateKey }, id, props) {
    const key = stateKey(id)
    const mode = String(props.scheduleMode ?? 'Window')
    const dayMode = String(props.dayMode ?? 'Every day')
    const valid = Boolean(input(id, 'valid', false))
    const synced = Boolean(input(id, 'synced', false))
    const enabled = Boolean(input(id, 'enable', props.enable !== false))
    const weekday = Math.max(0, Math.min(6, Math.round(Number(input(id, 'weekday', 0)))))
    const secondsOfDay = Math.max(0, Math.min(86399.999, Number(input(id, 'secondsOfDay', 0))))
    const day = Math.max(1, Math.min(31, Math.round(Number(input(id, 'day', 1)))))
    const month = Math.max(1, Math.min(12, Math.round(Number(input(id, 'month', 1)))))
    const year = Math.max(1970, Math.round(Number(input(id, 'year', 1970))))
    const requireSync = props.requireSync === true
    // Clamp each field to its own slider range before summing, exactly like
    // the C++ generator's intProp — summing first and clamping the total
    // maps an out-of-range saved value to a different time than firmware.
    const startSec = scheduleTimeOfDay(props.startHour, props.startMinute, props.startSecond)
    const endSec = scheduleTimeOfDay(props.endHour, props.endMinute, props.endSecond)
    const dayKey = year * 10_000 + month * 100 + day
    const prev = scheduleState.get(key)
      ?? { prevActive: false, lastPulseDay: -1, prevSeconds: null, prevDayKey: -1 }
    const dayAllowed = scheduleDayEnabled(dayMode, weekday, props)
    const timeReady = valid && (!requireSync || synced)

    let active = false
    let start = false
    let end = false
    let progress = 0

    if (enabled && timeReady && dayAllowed) {
      if (mode === 'Trigger') {
        active = false
        // A new calendar day means the whole day lies ahead of us, so treat
        // the previous sample as "before midnight"; no previous sample at
        // all (first frame, or the clock was unusable) never fires.
        const since = prev.prevDayKey < 0 ? null : (prev.prevDayKey === dayKey ? prev.prevSeconds : -1)
        if (since !== null && since < startSec && secondsOfDay >= startSec && prev.lastPulseDay !== dayKey) {
          start = true
          prev.lastPulseDay = dayKey
        }
      } else if (startSec <= endSec) {
        active = secondsOfDay >= startSec && secondsOfDay <= endSec
      } else {
        active = secondsOfDay >= startSec || secondsOfDay <= endSec
      }
      if (active) progress = scheduleWindowProgress(secondsOfDay, startSec, endSec)
    }

    if (active && !prev.prevActive) start = true
    if (!active && prev.prevActive) end = true
    scheduleState.set(key, {
      prevActive: active,
      lastPulseDay: prev.lastPulseDay,
      // Only remember a sample the clock actually vouched for, so the first
      // frame after a sync is a fresh start rather than a giant jump.
      prevSeconds: timeReady ? secondsOfDay : null,
      prevDayKey: timeReady ? dayKey : -1,
    })
    return { active, start, end, progress }
  },
  BeatSin({ num, t }, id, props) {
    const bpmProp = num(id, 'bpm', props, 'bpm', 60)
    const bpm = Math.max(1, Number.isFinite(bpmProp) ? bpmProp : 60)
    const lo  = Number(props.low  ?? 0)
    const hi  = Number(props.high ?? 1)
    const phase = (t * bpm / 60) % 1
    return { value: lo + ((Math.sin(phase * Math.PI * 2) + 1) / 2) * (hi - lo) }
  },
  // Free-running BPM clock/transport — see ClockState above and the
  // matching `Clock` case in cppGenerator.ts (millis()-based, same edge
  // semantics so preview and firmware timing match).
  Clock({ input, num, t, stateKey }, id, props) {
    const key = stateKey(id)
    const prevSt = clockState.get(key)
    // Clock reset (t jumped backward) — start clean, same convention as
    // Interval/Trigger above.
    const didReset = prevSt !== undefined && t < prevSt.t
    const st: ClockState = (!prevSt || didReset)
      ? { t, resetOffset: t, lastPulseT: null, tappedBpm: null, prevTap: false, prevSync: false, prevReset: false, lastBeatCount: 0, lastSubCount: 0 }
      : { ...prevSt, t }

    const tapIn = Boolean(input(id, 'tap', false))
    const syncIn = Boolean(input(id, 'sync', false))
    const resetIn = Boolean(input(id, 'reset', false))
    const beatsPerBar = Math.max(1, Math.round(num(id, 'beatsPerBar', props, 'beatsPerBar', 4)))
    const subdivision = Math.max(1, Math.round(num(id, 'subdivision', props, 'subdivision', 2)))
    const baseBpm = Math.max(1, num(id, 'bpm', props, 'bpm', 120))

    // A tap/sync rising edge re-zeros phase and, from the second pulse on,
    // blends a live BPM estimate from the pulse interval (an out-of-range
    // gap — too fast/slow to be a real tempo — drops the running estimate
    // instead of corrupting it with a bogus sample).
    const registerPulse = () => {
      if (st.lastPulseT !== null) {
        const interval = t - st.lastPulseT
        if (interval > 0.2 && interval < 3) {
          const sample = 60 / interval
          st.tappedBpm = st.tappedBpm !== null ? st.tappedBpm * 0.5 + sample * 0.5 : sample
        } else {
          st.tappedBpm = null
        }
      }
      st.lastPulseT = t
      st.resetOffset = t
    }
    if (tapIn && !st.prevTap) registerPulse()
    if (syncIn && !st.prevSync) registerPulse()
    if (resetIn && !st.prevReset) {
      st.resetOffset = t
      st.lastPulseT = null
      st.tappedBpm = null
      st.lastBeatCount = 0
      st.lastSubCount = 0
    }
    st.prevTap = tapIn
    st.prevSync = syncIn
    st.prevReset = resetIn

    const bpm = st.tappedBpm ?? baseBpm
    const elapsedBeats = Math.max(0, (t - st.resetOffset) * bpm / 60)
    const phase = elapsedBeats - Math.floor(elapsedBeats)
    const beatCount = Math.floor(elapsedBeats)
    const beat = beatCount > st.lastBeatCount
    const bar = beat && beatCount % beatsPerBar === 0
    const subCount = Math.floor(elapsedBeats * subdivision)
    const sub = subCount > st.lastSubCount
    st.lastBeatCount = beatCount
    st.lastSubCount = subCount
    clockState.set(key, st)

    return { bpm, phase, beat, bar, sub }
  },
  // Metronome — fires a boolean pulse once every `interval` seconds. Stateful
  // (module-level intervalLast), keyed per group instance like other stateful
  // nodes. Mirrors the millis()-based timer the C++ generator emits.
  Interval({ num, t, stateKey }, id, props) {
    const interval = Math.max(0.05, num(id, 'interval', props, 'interval', 0.5))
    const key = stateKey(id)
    const last = intervalLast.get(key)
    let pulse = false
    if (last === undefined || t < last) {
      intervalLast.set(key, t)          // first tick, or clock reset
    } else if (t - last >= interval) {
      intervalLast.set(key, last + interval)
      pulse = true
    }
    return { pulse }
  },
  DMXChannel({ input, num, stateKey }, id, props) {
    const snapshot = input(id, 'dmx', blankDmxSnapshot()) as DmxSnapshot
    const channel = clampDmxChannel(props.channel ?? 1, 1)
    const byte = clampDmxByte(snapshot.channels[channel - 1] ?? 0, 0)
    const threshold = clampDmxByte(num(id, 'activeThreshold', props, 'activeThreshold', 1), 1)
    const key = stateKey(id)
    const prev = dmxChannelState.get(key)
    const changed = prev?.seen === true && prev.last !== byte
    dmxChannelState.set(key, { last: byte, seen: true })
    return {
      value: byte / 255,
      byte,
      active: byte >= threshold,
      changed,
    }
  },
}

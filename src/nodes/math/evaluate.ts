import {
  displayString,
  formatNumberText,
  normalizeNumberFormat,
  type DateTimeTextFields,
  formatDateTimeText,
  asDateTimeTextMode,
} from '../../state/displayText'
import { applyEase } from '../../state/easing'
import { type StepValueState, reduceStepValue } from '../../state/stepValue'
import type { NodeEvaluators } from '../../state/evaluator/types'
import { instanceState } from '../../state/evaluator/memory'

// Smooth node — smoothed value + the time it was last advanced.
const smoothState = instanceState('smoothState', new Map<string, { v: number; t: number }>())
// SampleHold node — the latched value + previous trigger level (edge detect).
const holdState = instanceState('holdState', new Map<string, { v: number; prev: boolean }>())
// Step Value — a bounded numeric latch with independent rising-edge inputs.
const stepValueState = instanceState('stepValueState', new Map<string, StepValueState>())

// Trigger node (bundled Debounce/Toggle/One Shot/Pulse Divider/Trigger Delay) —
// one combined state bag; only the fields the active variant needs are touched.
interface TriggerState {
  t: number
  prevTrig: boolean
  candidate: boolean
  candidateSince: number
  committed: boolean
  toggleOut: boolean
  firedAt: number
  count: number
  scheduled: number | null
}
const triggerState = instanceState('triggerState', new Map<string, TriggerState>())

export const MATH_EVALUATORS: NodeEvaluators = {
  // Bundled binary math (Add / Subtract / Multiply / Divide / Min / Max),
  // selected by `mathOp`. Missing inputs default to the operation's identity
  // (1 for multiply/divide, else 0). Keep in sync with cppGenerator's `Math`.
  Math({ num }, id, props) {
    const op = String(props.mathOp ?? 'add')
    const idn = op === 'multiply' || op === 'divide' ? 1 : 0
    const a = num(id, 'a', props, 'a', idn)
    const b = num(id, 'b', props, 'b', idn)
    let r: number
    switch (op) {
      case 'subtract': r = a - b; break
      case 'multiply': r = a * b; break
      case 'divide':   r = b === 0 ? 0 : a / b; break
      case 'min':      r = Math.min(a, b); break
      case 'max':      r = Math.max(a, b); break
      case 'add':
      default:         r = a + b; break
    }
    return { result: r }
  },
  Lerp({ num }, id, props) {
    const a  = num(id, 'a', props, 'a', 0)
    const b  = num(id, 'b', props, 'b', 1)
    const tt = num(id, 't', props, 't', 0.5)
    return { result: a + (b - a) * tt }
  },
  Clamp({ num }, id, props) {
    const val = num(id, 'value', props, 'value', 0)
    const lo  = num(id, 'min',   props, 'min',   0)
    const hi  = num(id, 'max',   props, 'max',   1)
    return { result: Math.max(lo, Math.min(hi, val)) }
  },
  MapRange({ num }, id, props) {
    const val   = num(id, 'value', props, 'value', 0)
    const inLo  = num(id, 'inMin', props, 'inMin', 0)
    const inHi  = num(id, 'inMax', props, 'inMax', 1)
    const outLo = num(id, 'outMin', props, 'outMin', 0)
    const outHi = num(id, 'outMax', props, 'outMax', 1)
    const t2 = inHi === inLo ? 0 : (val - inLo) / (inHi - inLo)
    return { result: outLo + t2 * (outHi - outLo) }
  },
  StepValue({ input, stateKey }, id, props) {
    const key = stateKey(id)
    const next = reduceStepValue(stepValueState.get(key), {
      increase: Boolean(input(id, 'increase', false)),
      decrease: Boolean(input(id, 'decrease', false)),
      reset: Boolean(input(id, 'reset', false)),
    }, props)
    stepValueState.set(key, next)
    return { value: next.value }
  },
  Abs({ num }, id, props) {
    return { result: Math.abs(num(id, 'x', props, 'x', 0)) }
  },
  Mod({ num }, id, props) {
    const x = num(id, 'x', props, 'x', 0)
    const m = num(id, 'm', props, 'm', 1)
    return { result: m !== 0 ? ((x % m) + m) % m : 0 }
  },
  Gate({ input, num }, id, props) {
    const val = num(id, 'value', props, 'value', 0)
    const gate = input(id, 'gate', false) as boolean
    return { result: gate ? val : Number(props.fallback ?? 0) }
  },
  // Low-pass smoothing — EMA toward the input with time constant `response`
  // (seconds to ~63% of a step; ≤0.01 = passthrough). dt comes from the
  // wall-clock t so smoothing speed is framerate-independent, mirroring the
  // millis()-based version the C++ generator emits.
  Smooth({ num, t, stateKey }, id, props) {
    const value = num(id, 'value', props, 'value', 0)
    const response = Math.max(0, num(id, 'response', props, 'response', 0.25))
    const key = stateKey(id)
    const prev = smoothState.get(key)
    let v = value
    if (prev && t >= prev.t && response > 0.01) {
      const alpha = 1 - Math.exp(-(t - prev.t) / response)
      v = prev.v + (value - prev.v) * alpha
    }
    smoothState.set(key, { v, t })
    return { result: v }
  },
  // Sample & hold — latches `value` on each rising edge of `trigger`,
  // initialised to the first value seen so it never emits a stale 0.
  SampleHold({ input, num, stateKey }, id, props) {
    const value = num(id, 'value', props, 'value', 0)
    const trig = Boolean(input(id, 'trigger', false))
    const key = stateKey(id)
    const prev = holdState.get(key)
    const held = !prev || (trig && !prev.prev) ? value : prev.v
    holdState.set(key, { v: held, prev: trig })
    return { result: held }
  },
  // A/B selector — unlike Gate (value vs. constant fallback), both sides
  // are live inputs.
  Switch({ input, num }, id, props) {
    const a = num(id, 'a', props, 'a', 0)
    const b = num(id, 'b', props, 'b', 1)
    const sel = Boolean(input(id, 'sel', false))
    return { result: sel ? b : a }
  },
  // Bundled trigger/edge utilities — `triggerOp` selects the variant. All
  // share the same bool-in/bool-out signature. See PROPERTY_META.triggerOp
  // and the matching `Trigger` case in cppGenerator.
  Trigger({ input, num, t, stateKey }, id, props) {
    const opType = String(props.triggerOp ?? 'debounce')
    const trig = Boolean(input(id, 'trigger', false))
    const key = stateKey(id)
    const prevSt = triggerState.get(key)
    // Clock reset (t jumped backward) — start clean, same convention as
    // Interval/Envelope above.
    const reset = prevSt !== undefined && t < prevSt.t
    const st: TriggerState = (!prevSt || reset)
      ? {
          t,
          prevTrig: trig,
          candidate: trig,
          candidateSince: t,
          committed: trig,
          toggleOut: Boolean(props.initialState),
          firedAt: -Infinity,
          count: 0,
          scheduled: null,
        }
      : { ...prevSt, t }

    let result = false
    switch (opType) {
      case 'debounce': {
        const stableTime = Math.max(0.005, num(id, 'stableTime', props, 'stableTime', 0.05))
        if (trig !== st.candidate) { st.candidate = trig; st.candidateSince = t }
        if (trig === st.candidate && t - st.candidateSince >= stableTime) st.committed = trig
        result = st.committed
        break
      }
      case 'toggle': {
        if (trig && !st.prevTrig) st.toggleOut = !st.toggleOut
        result = st.toggleOut
        break
      }
      case 'changed': {
        result = trig !== st.prevTrig
        break
      }
      case 'oneShot': {
        const holdTime = Math.max(0.01, num(id, 'holdTime', props, 'holdTime', 0.1))
        if (trig && !st.prevTrig) st.firedAt = t
        result = t - st.firedAt < holdTime
        break
      }
      case 'pulseDivider': {
        const divideBy = Math.max(2, Math.round(num(id, 'divideBy', props, 'divideBy', 2)))
        if (trig && !st.prevTrig) {
          st.count += 1
          if (st.count >= divideBy) { st.count = 0; result = true }
        }
        break
      }
      case 'delay': {
        const delayTime = Math.max(0.01, num(id, 'delayTime', props, 'delayTime', 0.5))
        if (trig && !st.prevTrig) st.scheduled = t + delayTime
        if (st.scheduled != null && t >= st.scheduled) { result = true; st.scheduled = null }
        break
      }
    }
    st.prevTrig = trig
    triggerState.set(key, st)
    return { out: result }
  },
  Not({ input }, id) {
    const x = input(id, 'x', false) as boolean
    return { result: !x }
  },
  Compare({ num }, id, props) {
    const a = num(id, 'a', props, 'a', 0)
    const b = num(id, 'b', props, 'b', 0.5)
    return { result: a > b }
  },
  // Every string these produce goes through state/displayText.ts, which
  // the C++ generator imports too. Formatting decided in two places is
  // formatting that disagrees, and a display disagreeing with its preview
  // is the one defect this feature cannot ship with.
  TextValue(_c, _id, props) {
    return { text: displayString(props.text ?? '') }
  },
  FormatNumber({ num }, id, props) {
    const value = num(id, 'value', props, 'value', 0)
    return { text: displayString(formatNumberText(value, normalizeNumberFormat(props))) }
  },
  FormatDateTime({ input }, id, props) {
    // Reads the same DateTime bundle RTCInput publishes. With nothing
    // wired there is no clock, so the mode's dashed mask is the honest
    // reading rather than a fallback to the browser's own time.
    const upstream = input(id, 'dateTime', null) as Partial<DateTimeTextFields> | null
    const fields: DateTimeTextFields | null = upstream && typeof upstream === 'object'
      ? {
        hour: Number(upstream.hour ?? 0),
        minute: Number(upstream.minute ?? 0),
        second: Number(upstream.second ?? 0),
        weekday: Number(upstream.weekday ?? 0),
        day: Number(upstream.day ?? 1),
        month: Number(upstream.month ?? 1),
        year: Number(upstream.year ?? 1970),
        valid: upstream.valid === true,
      }
      : null
    return { text: displayString(formatDateTimeText(fields, asDateTimeTextMode(props.dateTimeFormat))) }
  },
  Ease({ num }, id, props) {
    const type = String(props.easeType ?? 'inOutCubic')
    const tin = num(id, 't', props, 't', 0)
    return { result: applyEase(type, tin) }
  },
  XYMapper({ num, W }, id, props) {
    const x = num(id, 'x', props, 'x', 0)
    const y = num(id, 'y', props, 'y', 0)
    return { index: Math.floor(x) + Math.floor(y) * W }
  },
}

export interface StepValueSettings {
  initial: number
  minimum: number
  maximum: number
  step: number
  wrap: boolean
}

export interface StepValueInputs {
  increase: boolean
  decrease: boolean
  reset: boolean
}

export interface StepValueState {
  value: number
  previousIncrease: boolean
  previousDecrease: boolean
  previousReset: boolean
}

export const STEP_VALUE_DEFAULTS: StepValueSettings = {
  initial: 0.5,
  minimum: 0,
  maximum: 1,
  step: 0.1,
  wrap: false,
}

export const STEP_VALUE_ABS_LIMIT = 1_000_000
export const STEP_VALUE_DECIMALS = 6
export const STEP_VALUE_SCALE = 10 ** STEP_VALUE_DECIMALS

function finiteBounded(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? Math.max(-STEP_VALUE_ABS_LIMIT, Math.min(STEP_VALUE_ABS_LIMIT, numeric))
    : fallback
}

/** Fixed precision is part of the cross-runtime contract, preventing 0.3 drift. */
export function roundStepValue(value: number): number {
  return Math.round(value * STEP_VALUE_SCALE) / STEP_VALUE_SCALE
}

/** Make imported data safe to execute; deploy validation still reports bad authored domains. */
export function normalizeStepValueSettings(value: unknown): StepValueSettings {
  const props = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  let minimum = finiteBounded(props.minimum, STEP_VALUE_DEFAULTS.minimum)
  let maximum = finiteBounded(props.maximum, STEP_VALUE_DEFAULTS.maximum)
  if (maximum <= minimum) {
    minimum = STEP_VALUE_DEFAULTS.minimum
    maximum = STEP_VALUE_DEFAULTS.maximum
  }
  minimum = roundStepValue(minimum)
  maximum = roundStepValue(maximum)
  const rawStep = Number(props.step)
  const step = roundStepValue(Number.isFinite(rawStep) && rawStep > 0
    ? Math.min(STEP_VALUE_ABS_LIMIT * 2, Math.max(1 / STEP_VALUE_SCALE, rawStep))
    : STEP_VALUE_DEFAULTS.step)
  const initial = roundStepValue(Math.max(minimum, Math.min(maximum,
    finiteBounded(props.initial, STEP_VALUE_DEFAULTS.initial))))
  return { initial, minimum, maximum, step, wrap: props.wrap === true }
}

export function blankStepValueState(settingsValue: unknown): StepValueState {
  const settings = normalizeStepValueSettings(settingsValue)
  return {
    value: settings.initial,
    previousIncrease: false,
    previousDecrease: false,
    previousReset: false,
  }
}

/**
 * Apply one evaluator/control pass. Inputs are event pulses, so only rising
 * edges act. Reset wins a simultaneous pass; opposing step edges cancel.
 */
export function reduceStepValue(
  previous: StepValueState | undefined,
  inputs: StepValueInputs,
  settingsValue: unknown,
): StepValueState {
  const settings = normalizeStepValueSettings(settingsValue)
  const state = previous ?? blankStepValueState(settings)
  const increase = Boolean(inputs.increase)
  const decrease = Boolean(inputs.decrease)
  const reset = Boolean(inputs.reset)
  const increaseEdge = increase && !state.previousIncrease
  const decreaseEdge = decrease && !state.previousDecrease
  const resetEdge = reset && !state.previousReset
  let next = Math.max(settings.minimum, Math.min(settings.maximum, state.value))

  if (resetEdge) {
    next = settings.initial
  } else if (increaseEdge !== decreaseEdge) {
    const candidate = roundStepValue(next + (increaseEdge ? settings.step : -settings.step))
    if (candidate > settings.maximum) next = settings.wrap ? settings.minimum : settings.maximum
    else if (candidate < settings.minimum) next = settings.wrap ? settings.maximum : settings.minimum
    else next = candidate
  }

  return {
    value: roundStepValue(Math.max(settings.minimum, Math.min(settings.maximum, next))),
    previousIncrease: increase,
    previousDecrease: decrease,
    previousReset: reset,
  }
}

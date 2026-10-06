import { describe, expect, it } from 'vitest'
import {
  blankStepValueState,
  normalizeStepValueSettings,
  reduceStepValue,
  STEP_VALUE_ABS_LIMIT,
} from '../stepValue'

const idle = { increase: false, decrease: false, reset: false }

describe('StepValue rules', () => {
  it('bounds malformed imported settings and sanitizes the reset value', () => {
    expect(normalizeStepValueSettings({
      minimum: Number.NEGATIVE_INFINITY,
      maximum: Number.NaN,
      initial: 9,
      step: -1,
      wrap: 'yes',
    })).toEqual({ minimum: 0, maximum: 1, initial: 1, step: 0.1, wrap: false })
    expect(normalizeStepValueSettings({ minimum: -1e20, maximum: 1e20, initial: 0, step: 1e20 }))
      .toEqual({ minimum: -STEP_VALUE_ABS_LIMIT, maximum: STEP_VALUE_ABS_LIMIT, initial: 0, step: STEP_VALUE_ABS_LIMIT * 2, wrap: false })
    expect(normalizeStepValueSettings({ minimum: 5, maximum: 2, initial: 4 }))
      .toMatchObject({ minimum: 0, maximum: 1, initial: 1 })
  })

  it('clamps, rounds decimal steps and requires a fresh rising pulse', () => {
    const settings = { minimum: 0, maximum: 0.3, initial: 0, step: 0.1, wrap: false }
    let state = blankStepValueState(settings)
    state = reduceStepValue(state, { ...idle, increase: true }, settings)
    expect(state.value).toBe(0.1)
    state = reduceStepValue(state, { ...idle, increase: true }, settings)
    expect(state.value).toBe(0.1)
    state = reduceStepValue(state, idle, settings)
    state = reduceStepValue(state, { ...idle, increase: true }, settings)
    state = reduceStepValue(reduceStepValue(state, idle, settings), { ...idle, increase: true }, settings)
    expect(state.value).toBe(0.3)
    state = reduceStepValue(reduceStepValue(state, idle, settings), { ...idle, increase: true }, settings)
    expect(state.value).toBe(0.3)
  })

  it('wraps at either bound and makes reset win simultaneous events', () => {
    const settings = { minimum: -1, maximum: 1, initial: 0.25, step: 0.75, wrap: true }
    let state = { ...blankStepValueState(settings), value: 1 }
    state = reduceStepValue(state, { ...idle, increase: true }, settings)
    expect(state.value).toBe(-1)
    state = reduceStepValue(reduceStepValue(state, idle, settings), { ...idle, decrease: true }, settings)
    expect(state.value).toBe(1)
    state = reduceStepValue(reduceStepValue(state, idle, settings), { increase: true, decrease: false, reset: true }, settings)
    expect(state.value).toBe(0.25)
  })

  it('cancels simultaneous increase/decrease edges', () => {
    const settings = { minimum: 0, maximum: 10, initial: 4, step: 2, wrap: false }
    expect(reduceStepValue(undefined, { increase: true, decrease: true, reset: false }, settings).value).toBe(4)
  })
})

/*
 * The stateful signal nodes carry memory from one frame to the next, so a
 * single generated line can look right while the sequence it produces drifts
 * from the preview's. Each case here drives the preview handler and the
 * emitted firmware snippet (run by `compileCppSnippet`) through the same
 * inputs at the same, deliberately uneven, frame times and compares every
 * frame's output.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { SIGNAL_EVALUATORS } from '../evaluate'
import { MATH_EVALUATORS } from '../../math/evaluate'
import { timedControlCpp } from '../../../codegen/signalControlCpp'
import { scalarControlCpp } from '../../../codegen/scalarControlCpp'
import { timeNodeCpp } from '../../../codegen/signalTimeCpp'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { libraryDefaults } from '../../../state/nodeLibrary'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import type { NodeEvaluator } from '../../../state/evaluator/types'

type Value = number | boolean
type Frame = { ms: number; inputs?: Record<string, Value> }

/**
 * Frame times with the jitter a real loop has: 11–29 ms apart. The fraction
 * keeps an elapsed time from landing exactly on a threshold, where seconds in
 * a double and whole milliseconds may round either way and the comparison
 * would test float representation rather than the node.
 */
function frames(count: number, inputsAt: (ms: number, i: number) => Record<string, Value> = () => ({}), startMs = 1000.13): Frame[] {
  const out: Frame[] = []
  let ms = startMs
  for (let i = 0; i < count; i++) {
    out.push({ ms, inputs: inputsAt(ms, i) })
    ms += 11.37 + ((i * 7919) % 19)
  }
  return out
}

/** The preview handler's output port, frame by frame. */
function preview(handler: NodeEvaluator, props: Record<string, unknown>, port: string, run: Frame[]): Value[] {
  return run.map(({ ms, inputs = {} }) => {
    const ctx = {
      t: ms / 1000,
      stateKey: (id: string) => `parity:${id}`,
      input: (_id: string, key: string, fallback: unknown) => (key in inputs ? inputs[key] : fallback),
      num: (_id: string, key: string, p: Record<string, unknown>, prop: string, fallback: number) =>
        key in inputs ? Number(inputs[key]) : Number(p[prop] ?? fallback),
    }
    return handler(ctx as never, 'n', props, {} as never, '')[port] as Value
  })
}

/** The firmware snippet's output variable, frame by frame. */
function firmware(lines: string[], inputs: string[], output: string, run: Frame[]): Value[] {
  const step = compileCppSnippet(lines, inputs.map((port) => `in_${port}`), [output])
  return run.map(({ ms, inputs: values = {} }) => step(ms, Object.fromEntries(inputs.map((port) => [`in_${port}`, values[port] ?? false])))[output])
}

function expectSame(previewed: Value[], flashed: Value[], tolerance = 1e-4): void {
  expect(flashed).toHaveLength(previewed.length)
  previewed.forEach((value, i) => {
    if (typeof value === 'boolean') expect(Boolean(flashed[i]), `frame ${i}`).toBe(value)
    else expect(Number(flashed[i]), `frame ${i}`).toBeCloseTo(value, -Math.log10(tolerance))
  })
}

/** A bool held high for `width` frames every `period` frames from `start`. */
const pulses = (start: number, period: number, width = 1) => (_ms: number, i: number) =>
  ({ trigger: i >= start && (i - start) % period < width })

beforeEach(() => resetEvaluatorState())

describe('stateful signal nodes: preview and firmware agree frame by frame', () => {
  it('Interval fires on the same frames without drifting', () => {
    const props = { ...libraryDefaults('Interval'), interval: 0.25 }
    const run = frames(400)
    // Unwired, the caller resolves the port to the property's value.
    const lines = scalarControlCpp('Interval', 'n', props, (port, fallback) => String(props[port as 'interval'] ?? fallback))!.loop
    const previewed = preview(SIGNAL_EVALUATORS.Interval, props, 'pulse', run)
    expect(previewed.filter(Boolean).length).toBeGreaterThan(20)
    expectSame(previewed, firmware(lines, [], 'n_n_pulse', run))
  })

  it('Envelope rises and falls on the same curve, attack and no attack', () => {
    for (const attack of [0, 0.15]) {
      resetEvaluatorState()
      const props = { ...libraryDefaults('Envelope'), attack, decay: 0.4 }
      const run = frames(300, pulses(10, 60, 3))
      const lines = timedControlCpp('Envelope', 'n', props, { trigger: 'in_trigger', attack: String(attack), decay: '0.4' })!
      expectSame(preview(SIGNAL_EVALUATORS.Envelope, props, 'result', run), firmware(lines, ['trigger'], 'n_n_result', run), 1e-2)
    }
  })

  // The two oscillators Wave absorbed: Counter's 0–1 ramp and BeatSin.
  it.each([
    ['a unipolar sawtooth ramp', { waveform: 'sawtooth', unipolar: true, frequency: 0.7 }],
    ['a unipolar sine at a BPM with an offset', { waveform: 'sine', unipolar: true, rateUnit: 'BPM', bpm: 75, amplitude: 0.6, offset: 0.2 }],
    ['a bipolar triangle', { waveform: 'triangle', frequency: 1.3, amplitude: 2, offset: -0.5 }],
  ])('Wave runs %s on the shared clock', (_name, overrides) => {
    const props: Record<string, unknown> = { ...libraryDefaults('Wave'), ...overrides }
    const run = frames(200)
    const lines = scalarControlCpp('Wave', 'n', props, (port, fallback) => String(props[port] ?? fallback))!.loop
    expectSame(preview(SIGNAL_EVALUATORS.Wave, props, 'result', run), firmware([`  float t = millis() / 1000.0f;`, ...lines], [], 'n_n_result', run))
  })

  it('Time measures dt between passes', () => {
    const run = frames(50)
    const previewed = preview(SIGNAL_EVALUATORS.TimeNode, {}, 'dt', run)
    expect(previewed[0]).toBe(0)
    expect(previewed[5]).toBeCloseTo((run[5].ms - run[4].ms) / 1000)
    expectSame(previewed, firmware(timeNodeCpp('n', 'millis() / 1000.0f'), [], 'n_n_dt', run))
  })

  it('Clock counts beats, bars and subdivisions and learns a tapped tempo', () => {
    const props = { ...libraryDefaults('Clock'), bpm: 100, beatsPerBar: 3, subdivision: 2 }
    // Taps 0.5 s apart from frame 40, then left alone.
    let lastTap = -Infinity
    const run = frames(500, (ms, i) => {
      const tap = i >= 40 && i < 200 && ms - lastTap >= 500
      if (tap) lastTap = ms
      return { tap }
    })
    const lines = timedControlCpp('Clock', 'n', props, {
      tap: 'in_tap', sync: 'false', reset: 'false', bpm: '100', beatsPerBar: '3', subdivision: '2',
    })!
    for (const port of ['beat', 'bar', 'sub', 'phase', 'bpm']) {
      resetEvaluatorState()
      expectSame(preview(SIGNAL_EVALUATORS.Clock, props, port, run), firmware(lines, ['tap'], `n_n_${port}`, run), 1e-2)
    }
  })

  it.each(['debounce', 'toggle', 'changed', 'oneShot', 'pulseDivider', 'delay'])('Trigger %s', (triggerOp) => {
    const props = { ...libraryDefaults('Trigger'), triggerOp, stableTime: 0.05, holdTime: 0.1, divideBy: 3, delayTime: 0.2 }
    const run = frames(300, pulses(5, 23, 4))
    const ports = triggerOp === 'toggle' ? ['trigger', 'on', 'off'] : ['trigger']
    const lines = scalarControlCpp('Trigger', 'n', props, (port) => `in_${port}`)!.loop
    expectSame(preview(MATH_EVALUATORS.Trigger, props, 'out', run), firmware(lines, ports, 'n_n_out', run))
  })

  // From boot, with the trigger already high on the first frame: neither side
  // counts that as a rising edge, and One Shot is low until a real edge.
  it.each(['toggle', 'changed', 'oneShot', 'pulseDivider', 'delay'])('Trigger %s from a high first frame at boot', (triggerOp) => {
    const props = { ...libraryDefaults('Trigger'), triggerOp, holdTime: 0.1, divideBy: 2, delayTime: 0.2 }
    const run = frames(200, pulses(0, 30, 6), 3.13)
    const ports = triggerOp === 'toggle' ? ['trigger', 'on', 'off'] : ['trigger']
    const lines = scalarControlCpp('Trigger', 'n', props, (port) => `in_${port}`)!.loop
    const previewed = preview(MATH_EVALUATORS.Trigger, props, 'out', run)
    expectSame(previewed, firmware(lines, ports, 'n_n_out', run))
    if (triggerOp === 'oneShot') expect(previewed.slice(0, 6).some(Boolean)).toBe(false)
  })

  it('Trigger oneShot is low at boot with no trigger', () => {
    const props = { ...libraryDefaults('Trigger'), triggerOp: 'oneShot', holdTime: 0.1 }
    const run = frames(20, () => ({ trigger: false }), 0.13)
    const lines = scalarControlCpp('Trigger', 'n', props, (port) => `in_${port}`)!.loop
    expect(lines.join(' ')).not.toContain('0xFFFFFFFF')
    expectSame(preview(MATH_EVALUATORS.Trigger, props, 'out', run), firmware(lines, ['trigger'], 'n_n_out', run))
  })
})

/*
 * The audio smoothers keep their share per 60th of a second on the wall
 * clock, so a level settles as fast on a 30 fps Board as at 60 fps, and the
 * sketch settles it the same way frame by frame. Frequency Band stands in for
 * the four (FFT Analyzer, Percussion Detect and Audio Features share
 * envelopeClock.ts).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { AUDIO_EVALUATORS } from '../evaluate'
import { AUDIO_EMITTERS } from '../codegen'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import type { EmitContext } from '../../../codegen/emitContext'
import { keepOver } from '../../shared/envelopeClock'

const props = { lowHz: 60, highHz: 250, gain: 1, smoothing: 0.8 }

function preview(frames: { ms: number; level: number }[]): number[] {
  return frames.map(({ ms, level }) => {
    const audio = { active: true, micActive: true, spectrum: Array(32).fill(level), detectorSpectrum: Array(32).fill(level) }
    const ctx = {
      t: ms / 1000, elapsedT: ms / 1000,
      stateKey: (id: string) => `clock:${id}`,
      input: () => audio,
      num: (_id: string, _key: string, p: Record<string, unknown>, prop: string, fallback: number) => Number(p[prop] ?? fallback),
    }
    return AUDIO_EVALUATORS.FrequencyBand(ctx as never, 'n', props, {} as never, '').level as number
  })
}

function firmware(frames: { ms: number; level: number }[]): number[] {
  const lines: string[] = []
  const ctx = {
    node: { id: 'n' }, id: 'n', p: props, ln: (line: string) => lines.push(line),
    v: (port: string) => `n_${port}`,
    f: (_port: string, key: string, fallback: number) => String((props as Record<string, unknown>)[key] ?? fallback),
    hasExplicitAudioInput: () => true,
  } as unknown as EmitContext
  AUDIO_EMITTERS.FrequencyBand(ctx)
  // The snippet runner reads plain literals; `1e9f` is the one exponent here.
  const step = compileCppSnippet(lines.map((line) => line.replace(/1e9f/g, '1e9')), ['_audioSpectrum'], ['n_level'])
  return frames.map(({ ms, level }) => Number(step(ms, { _audioSpectrum: Array(32).fill(level) as never }).n_level))
}

/** A step from silence to 0.5 at 1 s, sampled every `stepMs`. */
const steps = (stepMs: number, untilMs = 2000) =>
  Array.from({ length: Math.floor(untilMs / stepMs) }, (_, i) => ({ ms: 500 + i * stepMs, level: 500 + i * stepMs >= 1000 ? 0.5 : 0 }))

beforeEach(() => resetEvaluatorState())

describe('audio smoothing on the clock', () => {
  it('settles as fast at 30 fps as at 60 fps', () => {
    const at60 = preview(steps(1000 / 60))
    resetEvaluatorState()
    const at30 = preview(steps(1000 / 30))
    // A tenth of a second after the step, a frame both rates land on, both
    // have closed about the same share of it: they differ only by the one
    // frame each holds the step for. Counted per frame, as before, 30 fps
    // took four steps of 0.8 to 60 fps's seven and closed far less.
    const at = (levels: number[], stepMs: number) => levels[steps(stepMs).findIndex((frame) => frame.ms >= 1099.9)]
    const a60 = at(at60, 1000 / 60), a30 = at(at30, 1000 / 30)
    expect(a60).toBeCloseTo(0.5 * (1 - 0.8 ** 7), 6)
    expect(Math.abs(a30 - a60)).toBeLessThan(0.025)
    expect(a60 - 0.5 * (1 - 0.8 ** 4)).toBeGreaterThan(0.09)
    expect(keepOver(0.8, 1 / 60)).toBeCloseTo(0.8, 12)
  })

  it('matches the sketch frame by frame', () => {
    const jittered: { ms: number; level: number }[] = []
    let ms = 1000.13
    for (let i = 0; i < 200; i++) {
      jittered.push({ ms, level: i > 40 && i < 120 ? 0.6 : 0.05 })
      ms += 11.37 + ((i * 7919) % 19)
    }
    const previewed = preview(jittered)
    firmware(jittered).forEach((value, i) => expect(value, `frame ${i}`).toBeCloseTo(previewed[i], 4))
  })
})

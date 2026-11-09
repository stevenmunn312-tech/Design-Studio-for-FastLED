import { beforeEach, describe, expect, it } from 'vitest'
import { AUDIO_EVALUATORS, AUDIO_HUE } from '../evaluate'
import { AUDIO_EMITTERS } from '../codegen'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import type { EmitContext } from '../../../codegen/emitContext'
import { NODE_LIBRARY, isPropertyEnabled } from '../../../state/nodeLibrary'

type Bands = { bass: number; mids: number; treble: number }

function preview(props: Record<string, unknown>, frames: Bands[]): number[] {
  return frames.map((bands) => {
    const ctx = {
      stateKey: (id: string) => `hue:${id}`,
      num: (_id: string, key: string, p: Record<string, unknown>, prop: string, fallback: number) =>
        key in bands ? bands[key as keyof Bands] : Number(p[prop] ?? fallback),
    }
    return AUDIO_EVALUATORS.AudioHue(ctx as never, 'n', props, {} as never, '').hue as number
  })
}

function firmware(props: Record<string, unknown>, frames: Bands[]): number[] {
  const lines: string[] = []
  const ctx = {
    node: { id: 'n' }, id: 'n', p: props, ln: (line: string) => lines.push(line),
    v: (port: string) => `n_${port}`,
    f: (port: string) => `in_${port}`,
    incoming: new Map(),
  } as unknown as EmitContext
  AUDIO_EMITTERS.AudioHue(ctx)
  const step = compileCppSnippet(lines, ['in_bass', 'in_mids', 'in_treble'], ['n_hue'])
  return frames.map((bands, i) => Number(step(i * 16, { in_bass: bands.bass, in_mids: bands.mids, in_treble: bands.treble }).n_hue))
}

const balance = { mode: 'balance', hueStart: 20, hueSpan: 200 }

beforeEach(() => resetEvaluatorState())

describe('Audio → Hue', () => {
  it('starts new nodes on Balance', () => {
    expect(NODE_LIBRARY.find((def) => def.type === 'AudioHue')?.defaultProperties?.mode).toBe('balance')
  })

  it('reads where the sound sits between bass and treble, not how loud it is', () => {
    const [allBass, allTreble, quietMix, loudMix] = preview(balance, [
      { bass: 0.8, mids: 0, treble: 0 },
      { bass: 0, mids: 0, treble: 0.8 },
      { bass: 0.1, mids: 0.1, treble: 0.1 },
      { bass: 0.9, mids: 0.9, treble: 0.9 },
    ])
    expect(allBass).toBeCloseTo(20, 9)
    expect(allTreble).toBeCloseTo(220, 9)
    expect(quietMix).toBeCloseTo(120, 9)
    expect(loudMix).toBeCloseTo(quietMix, 9)
  })

  it('holds the last hue in silence instead of snapping back', () => {
    const hues = preview(balance, [{ bass: 0, mids: 0, treble: 0.6 }, { bass: 0, mids: 0, treble: 0 }, { bass: 0.005, mids: 0, treble: 0 }])
    expect(hues[1]).toBe(hues[0])
    expect(hues[2]).toBe(hues[0])
    resetEvaluatorState()
    expect(preview(balance, [{ bass: 0, mids: 0, treble: 0 }])[0]).toBeCloseTo(20 + 200 * AUDIO_HUE.restBalance, 9)
  })

  it('keeps Weighted Sum for a node saved without a mode', () => {
    expect(preview({}, [{ bass: 1, mids: 0.5, treble: 0.25 }])[0]).toBeCloseTo((0.5 + 0.15 + 0.05) * 360, 9)
    expect(isPropertyEnabled('AudioHue', 'bassWeight', {})).toBe(true)
    expect(isPropertyEnabled('AudioHue', 'hueStart', {})).toBe(false)
    expect(isPropertyEnabled('AudioHue', 'bassWeight', { mode: 'balance' })).toBe(false)
  })

  it('matches the sketch frame by frame on Balance', () => {
    const frames: Bands[] = Array.from({ length: 80 }, (_, i) => i % 13 === 0
      ? { bass: 0, mids: 0, treble: 0 }
      : { bass: (Math.sin(i * 0.3) + 1) / 2, mids: (Math.sin(i * 0.7 + 1) + 1) / 3, treble: (Math.cos(i * 0.5) + 1) / 2 })
    const previewed = preview(balance, frames)
    firmware(balance, frames).forEach((value, i) => expect(value, `frame ${i}`).toBeCloseTo(previewed[i], 3))
  })
})

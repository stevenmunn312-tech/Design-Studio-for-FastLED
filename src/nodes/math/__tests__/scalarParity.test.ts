import { describe, it, expect } from 'vitest'
import { MATH_EVALUATORS } from '../evaluate'
import { MATH_EMITTERS } from '../codegen'
import { COMPARE_OPS, applyCompare } from '../compare'
import { scalarControlCpp } from '../../../codegen/scalarControlCpp'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { libraryDefaults } from '../../../state/nodeLibrary'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import type { EmitContext } from '../../../codegen/emitContext'
import type { EvalContext } from '../../../state/evaluator/types'
import type { StudioNode } from '../../../state/graphStore'

/** One stateless scalar node, preview and firmware, at the same inputs. */
function both(type: string, props: Record<string, unknown>, inputs: Record<string, number>, port = 'result') {
  const ports = Object.keys(inputs)
  const lines = scalarControlCpp(type, 'n', props, (p) => (ports.includes(p) ? `in_${p}` : '0'))!.loop
  const step = compileCppSnippet(lines, ports.map((p) => `in_${p}`), [`n_n_${port}`])
  const firmware = step(0, Object.fromEntries(ports.map((p) => [`in_${p}`, inputs[p]])))[`n_n_${port}`]
  const ctx = { num: (_id: string, key: string, p: Record<string, unknown>, prop: string, fallback: number) => inputs[key] ?? Number(p[prop] ?? fallback) }
  const preview = MATH_EVALUATORS[type]!(ctx as unknown as EvalContext, 'n', props, {} as StudioNode, type)[port]
  return { preview, firmware }
}

describe('stateless math nodes, preview against firmware', () => {
  it.each([
    [0.5, 0, 1], [3, 0, 1], [-2, 0, 1],
    // min above max: the preview answers min whatever the value.
    [0.2, 0.8, 0.3], [0.5, 0.8, 0.3], [0.9, 0.8, 0.3],
  ])('Clamp %f into [%f, %f]', (value, min, max) => {
    const { preview, firmware } = both('Clamp', {}, { value, min, max })
    expect(firmware).toBe(preview)
  })

  it.each([
    // value, inMin, inMax, outMin, outMax
    [0.5, 0, 1, 2, 14], [1.5, 0, 1, 2, 14], [-0.5, 0, 1, 2, 14],
    // A reversed output range clamps between its ends too.
    [1.5, 0, 1, 0.85, 0.15], [-3, 0, 1, 0.85, 0.15], [0.25, 0, 1, 0.85, 0.15],
    // A zero-width input range answers Out Min.
    [7, 1, 1, 3, 9],
  ])('Map Range %f from [%f, %f] to [%f, %f], clamped and not', (value, inMin, inMax, outMin, outMax) => {
    const inputs = { value, inMin, inMax, outMin, outMax }
    const free = both('MapRange', {}, inputs)
    expect(free.firmware).toBeCloseTo(free.preview as number, 6)
    const held = both('MapRange', { clampOutput: true }, inputs)
    expect(held.firmware).toBeCloseTo(held.preview as number, 6)
    expect(held.preview).toBeGreaterThanOrEqual(Math.min(outMin, outMax))
    expect(held.preview).toBeLessThanOrEqual(Math.max(outMin, outMax))
  })

  it('Map Range extrapolates unless Clamp output is on', () => {
    expect(both('MapRange', {}, { value: 2, inMin: 0, inMax: 1, outMin: 0, outMax: 10 }).preview).toBe(20)
    expect(both('MapRange', { clampOutput: true }, { value: 2, inMin: 0, inMax: 1, outMin: 0, outMax: 10 }).preview).toBe(10)
  })

  it.each([
    ['one time constant both ways', { response: 0.3, fall: 0 }],
    ['a fast rise and a slow fall', { response: 0.05, fall: 0.6 }],
    ['an instant rise and a slow fall', { response: 0, fall: 0.6 }],
    ['a slow rise and an instant fall', { response: 0.4, fall: 0.005 }],
  ])('Smooth follows the same curve frame by frame: %s', (_name, overrides) => {
    resetEvaluatorState()
    const props: Record<string, unknown> = { ...libraryDefaults('Smooth'), ...overrides }
    // A square wave with jittered frame times, so both directions are taken.
    const run: { ms: number; value: number }[] = []
    for (let i = 0, ms = 1000.13; i < 240; i++, ms += 11.37 + ((i * 7919) % 19)) run.push({ ms, value: Math.floor(i / 40) % 2 ? 0.1 : 0.9 })
    const lines: string[] = []
    const ctx = {
      node: { id: 'n' }, id: 'n', p: props, ln: (line: string) => lines.push(line), v: (port: string) => `n_n_${port}`,
      f: (port: string, key: string, fallback: number) => (port === 'value' ? 'in_value' : String(props[key] ?? fallback)),
      incoming: new Map([['n:value', { srcId: 'src', srcPort: 'result' }]]),
    }
    MATH_EMITTERS.Smooth!(ctx as unknown as EmitContext)
    const step = compileCppSnippet(lines, ['in_value'], ['n_n_result'])
    const handler = MATH_EVALUATORS.Smooth!
    let falling = 0
    for (const [i, { ms, value }] of run.entries()) {
      const evalCtx = {
        elapsedT: ms / 1000, stateKey: (id: string) => `smooth:${id}`,
        num: (_id: string, key: string, p: Record<string, unknown>, prop: string, fallback: number) => (key === 'value' ? value : Number(p[prop] ?? fallback)),
      }
      const previewed = handler(evalCtx as unknown as EvalContext, 'n', props, {} as StudioNode, 'Smooth').result as number
      const flashed = step(ms, { in_value: value }).n_n_result as number
      expect(flashed, `frame ${i}`).toBeCloseTo(previewed, 3)
      if (i > 0 && value < 0.5 && previewed > 0.11) falling++
    }
    // A slow fall is visible as frames still on their way down.
    if (Number(props.fall) > 0.1) expect(falling).toBeGreaterThan(10)
  })

  it.each(COMPARE_OPS.flatMap((op) => [[op, 0.4, 0.5], [op, 0.5, 0.5], [op, 0.6, 0.5]] as const))(
    'Compare %s with A %f and B %f', (compareOp, a, b) => {
      const { preview, firmware } = both('Compare', { compareOp }, { a, b })
      expect(Boolean(firmware)).toBe(preview)
    })

  it.each(COMPARE_OPS)('Compare %s with hysteresis holds its answer across the band, frame by frame', (compareOp) => {
    resetEvaluatorState()
    const props = { ...libraryDefaults('Compare'), compareOp, b: 0.5, hysteresis: 0.1 }
    // A slow triangle through the band, with a little jitter riding on it.
    const levels = Array.from({ length: 200 }, (_, i) => {
      const phase = (i % 100) / 100
      return (phase < 0.5 ? phase * 2 : (1 - phase) * 2) * 0.6 + 0.2 + 0.03 * Math.sin(i * 1.7)
    })
    const lines = scalarControlCpp('Compare', 'n', props, (port) => (port === 'a' ? 'in_a' : String(props[port as 'b'])))!.loop
    expect(lines.join(' ')).toContain('static bool n_n_result')
    const step = compileCppSnippet(lines, ['in_a'], ['n_n_result'])
    const handler = MATH_EVALUATORS.Compare!
    const answers: boolean[] = []
    for (const [i, a] of levels.entries()) {
      const ctx = { stateKey: (id: string) => `compare:${id}`, num: (_id: string, key: string, p: Record<string, unknown>, prop: string, fallback: number) => (key === 'a' ? a : Number(p[prop] ?? fallback)) }
      const previewed = handler(ctx as unknown as EvalContext, 'n', props, {} as StudioNode, 'Compare').result as boolean
      expect(Boolean(step(i * 16, { in_a: a }).n_n_result), `frame ${i}`).toBe(previewed)
      answers.push(previewed)
    }
    // The jitter crosses 0.5 many times on each pass; the answer changes
    // only once per crossing of the whole band.
    const changes = answers.slice(1).filter((answer, i) => answer !== answers[i]).length
    expect(changes).toBeLessThanOrEqual(4)
    expect(changes).toBeGreaterThanOrEqual(3)
  })

  it('Compare with hysteresis turns on only past B plus the band, and off only past B minus it', () => {
    expect(applyCompare('greater', 0.55, 0.5, 0.1, false)).toBe(false)
    expect(applyCompare('greater', 0.61, 0.5, 0.1, false)).toBe(true)
    expect(applyCompare('greater', 0.45, 0.5, 0.1, true)).toBe(true)
    expect(applyCompare('greater', 0.39, 0.5, 0.1, true)).toBe(false)
    expect(applyCompare('less', 0.45, 0.5, 0.1, false)).toBe(false)
    expect(applyCompare('less', 0.39, 0.5, 0.1, false)).toBe(true)
    expect(applyCompare('less', 0.55, 0.5, 0.1, true)).toBe(true)
    expect(applyCompare('less', 0.61, 0.5, 0.1, true)).toBe(false)
  })

  it.each([-2.5, -1.5, -0.5, 0.5, 2.5, -2.4, 2.6])('Function round(%f)', (x) => {
    const { preview, firmware } = both('Function', { fn: 'round' }, { x })
    // Math.round(-0.5) is -0; a float on the board has no use for the sign.
    expect(firmware === preview).toBe(true)
  })
})

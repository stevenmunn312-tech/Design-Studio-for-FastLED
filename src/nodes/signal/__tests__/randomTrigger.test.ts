import { beforeEach, describe, expect, it } from 'vitest'
import { SIGNAL_EVALUATORS } from '../evaluate'
import { generateCpp } from '../../../codegen/cppGenerator'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { FIRST_BUTTON_HANDLE, singleButtonRow } from '../../../state/player/buttonBank'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string) =>
  ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge

// Random's value dims a solid frame on its way to the output, so the graph is live.
const sink = () => [node('sc', 'SolidColor', 'pattern'), node('bm', 'BrightnessMod', 'composite'),
  node('out', 'MatrixOutput', 'output', { width: 4, height: 4 })]
const sinkEdges = () => [edge('s1', 'sc', 'bm', 'frame', 'frame'), edge('s2', 'r', 'bm', 'value', 'brightness'),
  edge('s3', 'bm', 'out', 'frame', 'frame')]

// Trigger levels frame by frame: rising edges on frames 2, 5 and 8.
const LEVELS = [false, false, true, true, false, true, false, false, true, true]

function previewRun(props: Record<string, unknown>, wired: { trigger?: boolean; min?: number }): number[] {
  return LEVELS.map((level) => SIGNAL_EVALUATORS.Random!({
    incoming: new Map(wired.trigger ? [['r:trigger', { srcId: 'b', srcPort: FIRST_BUTTON_HANDLE }]] : []),
    input: (_id: string, port: string, fallback: unknown) => (port === 'trigger' && wired.trigger ? level : fallback),
    num: (_id: string, port: string, p: Record<string, unknown>, key: string, def: number) =>
      port === 'min' && wired.min !== undefined ? wired.min : Number(p[key] ?? def),
    stateKey: () => 'random-trigger-test',
  } as never, 'r', props, {} as never, 'Random').value as number)
}

describe('Random with a trigger', () => {
  beforeEach(() => resetEvaluatorState())

  it('draws every frame while Trigger is unwired', () => {
    const values = previewRun({ min: 0, max: 1, seed: 9 }, {})
    expect(new Set(values).size).toBe(LEVELS.length)
  })

  it('holds a draw from one rising edge to the next', () => {
    const values = previewRun({ min: 2, max: 4, seed: 9 }, { trigger: true })
    // A draw on the first frame, then one on each of the three rising edges.
    const changes = values.map((v, i) => i === 0 || v !== values[i - 1])
    expect(changes).toEqual([true, false, true, false, false, true, false, false, true, false])
    for (const v of values) { expect(v).toBeGreaterThanOrEqual(2); expect(v).toBeLessThanOrEqual(4) }
  })

  it('draws on the same frames on the board', () => {
    const cpp = generateCpp([node('b', 'ButtonBank', 'input', { buttons: singleButtonRow(4) }), node('r', 'Random', 'signal', { min: 2, max: 4 }),
      ...sink()], [
      edge('e1', 'b', 'r', FIRST_BUTTON_HANDLE, 'trigger'), ...sinkEdges()
    ])
    const lines = cpp.split('\n').filter((line) => /_rnd\w*_r\b/.test(line) || /^\s*float n_r_value =/.test(line))
    expect(lines.join('\n')).toContain('static float _rnd_r = 0.0f;')
    let draws = 0
    const step = compileCppSnippet(lines, ['n_b_button_1', 'random16'], ['n_r_value'])
    const flashed = LEVELS.map((level, i) => step(i * 16, {
      n_b_button_1: level, random16: (() => { draws++; return (draws * 9973) % 65536 }) as never,
    }).n_r_value as number)
    expect(draws).toBe(4)
    const changes = flashed.map((v, i) => i === 0 || v !== flashed[i - 1])
    expect(changes).toEqual([true, false, true, false, false, true, false, false, true, false])
  })

  it('reads a wired Min and Max between draws', () => {
    const cpp = generateCpp([node('w', 'Wave', 'signal'), node('r', 'Random', 'signal', { min: 0, max: 1 }),
      ...sink()], [
      edge('e1', 'w', 'r', 'result', 'min'), ...sinkEdges()
    ])
    expect(cpp).toContain('float _rndLo_r = n_w_result;')
    expect(cpp).toContain('float n_r_value = _rndLo_r + (random16() / 65535.0f) * (1 - _rndLo_r);')
    const held = previewRun({ min: 0, max: 1, seed: 3 }, { trigger: true, min: 0.5 })
    for (const v of held) expect(v).toBeGreaterThanOrEqual(0.5)
  })
})

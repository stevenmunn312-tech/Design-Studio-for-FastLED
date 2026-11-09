import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { fourierOutlineSamples } from '../fourierOutline'
import { pathTable } from '../customPath'
import type { Frame } from '../../../state/palettes/ledColor'
import type { StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
const render = (id: string, props: Record<string, unknown>, tick = 0) =>
  evaluateGraphFull([node(id, 'Path', props)], [], tick, 9, 9, {}, true, true).outputs.get(id)!.frame as Frame
const sketch = (props: Record<string, unknown>, wireT = false) => generateCpp(
  [node('p', 'Path', props), node('k', 'Constant', { value: 0.5 }), node('out', 'MatrixOutput')],
  [
    { id: 'e', source: 'p', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ...(wireT ? [{ id: 't', source: 'k', sourceHandle: 'value', target: 'p', targetHandle: 't' }] : []),
  ] as never,
  {}, { deferPruning: true },
)

describe('Path', () => {
  it('wraps T, so a rising signal keeps going round', () => {
    expect(render('a', { t: 1.25, speed: 0 })).toEqual(render('b', { t: 0.25, speed: 0 }))
    expect(render('c', { t: -0.75, speed: 0 })).toEqual(render('d', { t: 0.25, speed: 0 }))
  })

  it('moves on its own at Speed turns a second while T is unwired', () => {
    // One second at a quarter turn a second is a quarter of the way round.
    expect(render('moving', { speed: 0.25 }, 60)).toEqual(render('still', { t: 0.25, speed: 0 }))
    expect(render('moving2', { speed: 0.25 }, 60)).not.toEqual(render('still2', { t: 0, speed: 0 }))
  })

  it('ships the clock only while it can move the point', () => {
    const moving = sketch({})
    expect(moving).toContain('float _spd = 0.25;')
    expect(moving).toContain('float _tt = 0 + _phase_')
    expect(moving).toContain('_tt -= floorf(_tt);')
    expect(sketch({ speed: 0 })).not.toContain('_phase_')
    const wired = sketch({}, true)
    expect(wired).not.toContain('_spd')
    expect(wired).toContain('float _tt = n_k_value; _tt -= floorf(_tt);')
  })

  it('draws Fourier Epicycles\' star, square and infinity outlines', () => {
    for (const shape of ['star', 'square', 'infinity']) {
      expect(pathTable(shape, '')).toEqual(fourierOutlineSamples(shape))
      const cpp = sketch({ pathShape: shape, speed: 0 })
      expect(cpp, shape).toContain('static const float _pp_p[128][2] PROGMEM = {{')
      expect(cpp, shape).not.toContain('cosf(_ang)')
    }
    expect(pathTable('heart', '')).toBeNull()
    // The star's top point is where the outline starts.
    const star = render('star', { pathShape: 'star', t: 0, speed: 0, scale: 1 })
    const lit = star.flatMap((row, y) => row.map((p, x) => ({ x, y, w: p.r + p.g + p.b }))).filter((p) => p.w > 0)
    expect(Math.min(...lit.map((p) => p.y))).toBe(0)
  })
})

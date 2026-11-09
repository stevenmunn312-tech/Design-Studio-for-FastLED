import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
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
const BLACK_TO_RED = { rA: 0, gA: 0, bA: 0, rB: 255, gB: 0, bB: 0 }
const frame = (props: Record<string, unknown>, W: number, H: number) =>
  evaluateGraphFull([node('g', 'GradientFrame', { ...BLACK_TO_RED, ...props })], [], 0, W, H, {}, true, true).outputs.get('g')!.frame as Frame

describe('Gradient Frame angle', () => {
  it('runs left to right at 0 and top to bottom at 90', () => {
    const across = frame({}, 4, 4)
    expect(across[0].map((p) => p.r)).toEqual([0, 85, 170, 255])
    const down = frame({ angle: 90 }, 4, 4)
    expect(down.map((row) => row[0].r)).toEqual([0, 85, 170, 255])
  })

  it('reaches corner to corner on a diagonal', () => {
    const f = frame({ angle: 45 }, 5, 5)
    expect(f[0][0].r).toBe(0)
    expect(f[4][4].r).toBe(255)
    expect(f[1][3].r).toBe(f[3][1].r)
  })

  it('stays finite down a one-row strip', () => {
    const f = frame({ angle: 90 }, 8, 1)
    expect(f[0].every((p) => Number.isFinite(p.r) && p.r === 0)).toBe(true)
  })

  it('emits the same ramp with a guarded range', () => {
    const cpp = generateCpp([node('g', 'GradientFrame', { angle: 30 }), node('out', 'MatrixOutput')],
      [{ id: 'e', source: 'g', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' }] as never)
    expect(cpp).toContain('float _a=30*0.01745329f,_co=cosf(_a),_si=sinf(_a);')
    expect(cpp).toContain('_rng=fmaxf(1e-6f,_pmax-_pmin);')
    expect(cpp).toContain('float _t=(_x*_co+_y*_si-_pmin)/_rng;')
    expect(cpp).not.toContain('HEIGHT-1.0f')
  })
})

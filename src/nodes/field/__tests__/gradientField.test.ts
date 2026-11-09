import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, isPropertyEnabled, libraryDefaults } from '../../../state/nodeLibrary'
import type { StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
const gradient = (props: Record<string, unknown>, W: number, H: number) =>
  evaluateGraphFull([node('g', 'GradientField', props)], [], 0, W, H, {}, true, true).outputs.get('g')!.field as Float32Array

describe('Gradient Field measures in pixels', () => {
  it('draws round rings on a wide panel', () => {
    const W = 17, H = 9
    const f = gradient({ gradientType: 'radial' }, W, H)
    // Four pixels right of centre and four below are the same distance away.
    expect(f[4 * W + 12]).toBeCloseTo(f[8 * W + 8], 6)
    expect(f[4 * W + 8]).toBeCloseTo(0, 6)
    // Half a diagonal out, the corner, reaches 1.
    expect(f[0]).toBeCloseTo(1, 6)
  })

  it('reaches 0 at the centre of a strip and 1 at its ends', () => {
    const f = gradient({ gradientType: 'radial' }, 21, 1)
    expect(f[10]).toBeCloseTo(0, 6)
    expect(f[0]).toBeCloseTo(1, 6)
    expect(f[20]).toBeCloseTo(1, 6)
  })

  it('keeps a linear ramp edge to edge at 0 and 90 degrees', () => {
    const W = 16, H = 4
    const across = gradient({}, W, H)
    expect(across[0]).toBeCloseTo(0, 6)
    expect(across[W - 1]).toBeCloseTo(1, 6)
    const down = gradient({ angle: 90 }, W, H)
    expect(down[0]).toBeCloseTo(0, 6)
    expect(down[(H - 1) * W]).toBeCloseTo(1, 6)
  })

  it('turns a linear ramp by a true angle', () => {
    const W = 16, H = 4
    const f = gradient({ angle: 45 }, W, H)
    // Along a 45-degree line the ramp moves; across it, it holds.
    expect(f[1 * W + 5]).toBeCloseTo(f[2 * W + 4], 6)
    expect(f[2 * W + 6]).toBeGreaterThan(f[1 * W + 5])
    // Corner to corner on the diagonal.
    expect(f[0]).toBeCloseTo(0, 6)
    expect(f[(H - 1) * W + W - 1]).toBeCloseTo(1, 6)
  })

  it('turns the angular seam with Angle, and gates Angle off for radial', () => {
    const plain = gradient({ gradientType: 'angular' }, 9, 9)
    const turned = gradient({ gradientType: 'angular', angle: 90 }, 9, 9)
    // Directly right of centre reads 0.5; a quarter turn moves that to below.
    expect(plain[4 * 9 + 8]).toBeCloseTo(0.5, 6)
    expect(turned[8 * 9 + 4]).toBeCloseTo(0.5, 6)
    expect(isPropertyEnabled('GradientField', 'angle', { gradientType: 'radial' })).toBe(false)
    expect(isPropertyEnabled('GradientField', 'angle', { gradientType: 'angular' })).toBe(true)
  })

  it('emits the same pixel measures in the sketch', () => {
    const cpp = (props: Record<string, unknown>) => generateCpp([node('g', 'GradientField', props), node('p', 'FieldToFrame'), node('out', 'MatrixOutput')], [
      { id: 'a', source: 'g', sourceHandle: 'field', target: 'p', targetHandle: 'field' },
      { id: 'b', source: 'p', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ] as never, {}, { deferPruning: true })
    const linear = cpp({})
    expect(linear).toContain('_gsp=fmaxf(1e-6f,fabsf(_gca)*(WIDTH-1)+fabsf(_gsa)*(HEIGHT-1));')
    expect(linear).toContain('float _d=(_dx*_gca+_dy*_gsa)/_gsp+0.5f;')
    expect(linear).toContain('float _gcx=0.5*(WIDTH-1),_gcy=0.5*(HEIGHT-1)')
    expect(cpp({ gradientType: 'radial' })).toContain('float _d=sqrtf(_dx*_dx+_dy*_dy)/_gsp;')
    const angular = cpp({ gradientType: 'angular' })
    expect(angular).toContain('float _d=(atan2f(_dy,_dx)-_ga)/6.283185307f+0.5f;')
    expect(angular).not.toContain('_gsp')
  })
})

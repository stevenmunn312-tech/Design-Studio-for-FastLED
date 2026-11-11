import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults, propertyMeta } from '../../../state/nodeLibrary'
import { SHAPE_KINDS } from '../../../state/evaluator/sdf'
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
const shape = (props: Record<string, unknown>, W: number, H: number) =>
  evaluateGraphFull([node('s', 'Shape', props)], [], 0, W, H, {}, true, true).outputs.get('s')!.frame as Frame
const litColumns = (frame: Frame) => new Set(frame.flatMap((row) => row.flatMap((p, x) => (p.r + p.g + p.b > 0 ? [x] : []))))

describe('Shape size', () => {
  it('keeps the default shape inside a small panel by scaling with the matrix', () => {
    // At 6 px on an 8x8 panel the polygon used to cover every column.
    const scaled = litColumns(shape({ shape: 'ellipse', filled: true, thickness: 0 }, 8, 8))
    expect(scaled.has(0)).toBe(false)
    expect(scaled.has(7)).toBe(false)
    const exact = litColumns(shape({ shape: 'ellipse', filled: true, thickness: 0, scaleWithMatrix: false }, 8, 8))
    expect(exact.size).toBe(8)
  })

  it('draws the same at the 16-pixel reference either way, and twice as big at 32', () => {
    const props = { shape: 'ellipse', size: 4, filled: true, thickness: 0 }
    expect(shape(props, 16, 16)).toEqual(shape({ ...props, scaleWithMatrix: false }, 16, 16))
    expect(litColumns(shape(props, 32, 32)).size).toBe(16)
  })

  it('scales Size in the sketch only while the switch is on', () => {
    const cpp = (props: Record<string, unknown>) => generateCpp([node('s', 'Shape', props), node('out', 'MatrixOutput')],
      [{ id: 'e', source: 's', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' }] as never)
    expect(cpp({})).toContain('float _size=fl::max(0.5f,6)*((fl::min(WIDTH,HEIGHT)==1?fl::max(WIDTH,HEIGHT):min(WIDTH,HEIGHT))/16.0f),')
    expect(cpp({ scaleWithMatrix: false })).toContain('float _size=fl::max(0.5f,6),')
  })

  it('shares its shape names with Shape Field, which adds the rose and superformula', () => {
    expect((propertyMeta('Shape', 'shape') as { options?: string[] }).options).toEqual([...SHAPE_KINDS])
    expect((propertyMeta('ShapeField', 'shape') as { options?: string[] }).options).toEqual([...SHAPE_KINDS, 'rose', 'superformula'])
    expect(libraryDefaults('ShapeField').shape).toBe('ellipse')
  })
})

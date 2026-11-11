/*
 * The two ends of a field chain: Frame → Field's conversion and Field →
 * Frame's Low/High range, each held on both sides through the shared rule in
 * `state/evaluator/frames.ts`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { fieldRange, pixelToField } from '../../../state/evaluator/frames'
import type { Frame } from '../../../state/palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
let edgeCount = 0
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `e${++edgeCount}`, source, sourceHandle, target, targetHandle }) as StudioEdge
const outputsOf = (nodes: StudioNode[], edges: StudioEdge[]) => evaluateGraphFull(nodes, edges, 0, 8, 8, {}, true, true).outputs
const output = () => node('out', 'MatrixOutput', { width: 8, height: 8 })

beforeEach(() => resetEvaluatorState())

describe('Frame → Field conversion', () => {
  it('reads a saturated red as a third, all of it, or its luma', () => {
    const red = { r: 255, g: 0, b: 0 }
    expect(pixelToField(red, 'average')).toBeCloseTo(1 / 3, 6)
    expect(pixelToField(red, 'max')).toBe(1)
    expect(pixelToField(red, 'luma')).toBeCloseTo(0.299, 6)
    expect(pixelToField({ r: 0, g: 255, b: 0 }, 'luma')).toBeGreaterThan(pixelToField({ r: 0, g: 0, b: 255 }, 'luma'))
  })

  it('follows the conversion on both sides', () => {
    const solid = node('c', 'SolidColor', { r: 255, g: 0, b: 0 })
    const field = (conversion: string) => outputsOf([solid, node('f', 'FrameToField', { conversion })], [edge('c', 'frame', 'f', 'frame')])
      .get('f')!.field as Float32Array
    expect(field('average')[0]).toBeCloseTo(1 / 3, 6)
    expect(field('max')[0]).toBe(1)
    const cpp = (conversion: string) => generateCpp(
      [solid, node('f', 'FrameToField', { conversion }), node('p', 'FieldToFrame'), output()],
      [edge('c', 'frame', 'f', 'frame'), edge('f', 'field', 'p', 'field'), edge('p', 'frame', 'out', 'frame')],
    )
    expect(cpp('average')).toContain('.r+buf_c[_i].g+buf_c[_i].b)/3.0f/255.0f;')
    expect(cpp('max')).toContain('fl::max(buf_c[_i].r,fl::max(buf_c[_i].g,buf_c[_i].b))/255.0f;')
    expect(cpp('luma')).toContain('(0.299f*buf_c[_i].r+0.587f*buf_c[_i].g+0.114f*buf_c[_i].b)/255.0f;')
  })
})

describe('Field → Frame range', () => {
  it('remaps as Field Levels does', () => {
    expect(fieldRange(0.3, 0.3, 0.7)).toBe(0)
    expect(fieldRange(0.5, 0.3, 0.7)).toBeCloseTo(0.5, 6)
    expect(fieldRange(0.9, 0.3, 0.7)).toBe(1)
    expect(fieldRange(0.5, 0.5, 0.5)).toBe(1)
    expect(fieldRange(0.49, 0.5, 0.5)).toBe(0)
  })

  it('stretches a mid-range field across the whole palette', () => {
    const flat = node('m', 'FieldMath', { fieldOp: 'add', value: 0.7 })
    const paint = (props: Record<string, unknown>) => (outputsOf([flat, node('p', 'FieldToFrame', { palette: 'noir', ...props })],
      [edge('m', 'field', 'p', 'field')]).get('p')!.frame as Frame)[0][0]
    const plain = paint({}), top = paint({ low: 0.3, high: 0.7 })
    const brightness = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b
    expect(brightness(top)).toBeGreaterThan(brightness(plain))
  })

  it('reads the field straight until Low or High moves, then remaps it in the sketch', () => {
    const graph = (props: Record<string, unknown>) => generateCpp(
      [node('n', 'FieldNoise'), node('p', 'FieldToFrame', props), output()],
      [edge('n', 'field', 'p', 'field'), edge('p', 'frame', 'out', 'frame')],
    )
    const plain = graph({})
    expect(plain).toContain('ColorFromPalette(')
    expect(plain).toContain('(uint8_t)(field_n[_i]*255)')
    expect(plain).not.toContain('_lo=')
    const ranged = graph({ low: 0.25, high: 0.75 })
    expect(ranged).toContain('float _lo=0.25,_hi=0.75;')
    expect(ranged).toContain('(_hi<=_lo?(field_n[_i]>=_lo?1.0f:0.0f):constrain((field_n[_i]-_lo)/fmaxf(1e-4f,_hi-_lo),0.0f,1.0f))')
  })
})

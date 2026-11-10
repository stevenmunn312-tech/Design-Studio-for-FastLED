import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { centeredCpp, centeredX, centeredY } from '../../../state/evaluator/formula'
import { SIZING_SIDE_CPP, sizingSide } from '../../shared/stringCanvas'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
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

let run = 0
function output(nodeType: string, props: Record<string, unknown>, W: number, H: number, tick = 0): Record<string, unknown> {
  const id = `${nodeType}-${run++}`
  return evaluateGraphFull([node(id, nodeType, props)], [], tick, W, H, {}, true, true).outputs.get(id)!
}
const field = (nodeType: string, props: Record<string, unknown>, W: number, H: number, tick = 0) =>
  output(nodeType, props, W, H, tick).field as Float32Array

/** FNV-1a over the bytes of a field or the channels of a frame. */
function hash(value: Float32Array | Frame): string {
  const bytes = value instanceof Float32Array
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : Uint8Array.from(value.flatMap((row) => row.flatMap((px) => [px.r, px.g, px.b])))
  let h = 0x811c9dc5
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

describe('centred coordinates on a one-pixel axis', () => {
  it('read the middle of a one-row or one-column canvas, and the matrix formula elsewhere', () => {
    expect(centeredY(0, 1)).toBe(0)
    expect(centeredX(0, 1)).toBe(0)
    for (const n of [2, 3, 7, 16, 60]) {
      for (let i = 0; i < n; i++) {
        expect(centeredX(i, n)).toBe((i - n / 2) / (n / 2))
        expect(centeredY(i, n)).toBe((i - n / 2) / (n / 2))
      }
    }
  })

  it('declares the same cx and cy in the sketch', () => {
    const step = compileCppSnippet([centeredCpp('cx', 'cy')], ['_x', '_y', 'WIDTH', 'HEIGHT'], ['cx', 'cy'])
    for (const [W, H] of [[60, 1], [1, 24], [16, 16], [12, 7], [2, 9], [1, 1]]) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const got = step(0, { _x: x, _y: y, WIDTH: W, HEIGHT: H })
        expect(got.cx, `${W}x${H} ${x},${y}`).toBe(centeredX(x, W))
        expect(got.cy, `${W}x${H} ${x},${y}`).toBe(centeredY(y, H))
      }
    }
  })

  it('sizes by a strip\'s length, and by a matrix\'s shorter side', () => {
    const step = compileCppSnippet([`int side=${SIZING_SIDE_CPP};`], ['WIDTH', 'HEIGHT'], ['side'])
    for (const [W, H, side] of [[60, 1, 60], [1, 24, 24], [16, 16, 16], [12, 7, 7], [2, 9, 2], [9, 2, 2], [1, 1, 1]]) {
      expect(sizingSide(W, H)).toBe(side)
      expect(step(0, { WIDTH: W, HEIGHT: H }).side).toBe(side)
    }
  })

  it('emits the one-pixel test in every centred pixel loop', () => {
    const sketch = (nodeType: string, props: Record<string, unknown>) => generateCpp(
      [node('f', nodeType, props), node('p', 'FieldToFrame'), node('out', 'MatrixOutput')],
      [
        { id: 'a', source: 'f', sourceHandle: 'field', target: 'p', targetHandle: 'field' },
        { id: 'b', source: 'p', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
      ] as StudioEdge[],
      {}, { deferPruning: true },
    )
    expect(sketch('FieldFormula', {})).toContain(`      ${centeredCpp('cx', 'cy')}`)
    for (const formulaType of ['fibonacciSpiral', 'goldenTiling', 'lissajousField']) {
      expect(sketch('GeometryField', { formulaType }), formulaType).toContain(`      ${centeredCpp('_cx', '_cy')}`)
    }
    expect(sketch('ShapeField', {})).toContain(`float _short=(float)${SIZING_SIDE_CPP},`)
    const formula = generateCpp([node('c', 'CustomFormula', { formula: 'r' }), node('out', 'MatrixOutput')],
      [{ id: 'e', source: 'c', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' }] as StudioEdge[],
      {}, { deferPruning: true })
    expect(formula).toContain(`      ${centeredCpp('cx', 'cy')}`)
  })
})

describe('centred fields on a 60-LED strip', () => {
  const W = 60, H = 1

  it('shows Geometry Field\'s Lissajous, which sampled only its bottom edge', () => {
    for (const tick of [0, 37, 90]) {
      const values = [...field('GeometryField', { formulaType: 'lissajousField' }, W, H, tick)]
      // The curve crosses the middle row several times a frame.
      expect(Math.max(...values)).toBeGreaterThan(0.8)
      expect(values.filter((v) => v > 0.5).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('draws Shape Field\'s default circle across the strip, not a speck', () => {
    const values = [...field('ShapeField', {}, W, H)]
    // A radius of 0.3 of the length: 36 LEDs lit about the middle.
    const lit = values.flatMap((v, x) => (v > 0.5 ? [x] : []))
    expect(lit.length).toBeGreaterThanOrEqual(34)
    expect(lit.length).toBeLessThanOrEqual(38)
    expect(Math.abs((lit[0] + lit[lit.length - 1]) / 2 - (W - 1) / 2)).toBeLessThanOrEqual(0.5)
  })

  it('centres a formula\'s cy on the row, so r is the distance along the strip', () => {
    const values = [...field('FieldFormula', { formula: '1 - r' }, W, H)]
    expect(values[30]).toBe(1)
    expect(values[0]).toBe(0)
    expect(values[15]).toBeCloseTo(0.5, 5)
    // Formula Pattern: the middle LED is r = 0, the palette's first colour.
    const frame = output('CustomFormula', { formula: 'r*0.5', palette: 'rainbow' }, W, H).frame as Frame
    const zero = output('CustomFormula', { formula: '0', palette: 'rainbow' }, W, H).frame as Frame
    expect(frame[0][30]).toEqual(zero[0][30])
    expect(frame[0][0]).not.toEqual(zero[0][0])
  })
})

describe('centred fields on a matrix', () => {
  // Captured before the one-pixel rule: every matrix renders byte for byte
  // as it did.
  const cases: [string, Record<string, unknown>][] = [
    ['CustomFormula', { formula: 'sin(r*8 - t*2)*0.5+0.5' }],
    ['CustomFormula', { formula: 'angle/6.283 + cy*0.25 + 0.5' }],
    ['FieldFormula', {}],
    ['FieldFormula', { formula: 'cx*cy*0.5+0.5' }],
    ['GeometryField', { formulaType: 'fibonacciSpiral' }],
    ['GeometryField', { formulaType: 'goldenTiling' }],
    ['GeometryField', { formulaType: 'lissajousField' }],
    ['ShapeField', {}],
    ['ShapeField', { shape: 'polygon', fieldMode: 'distance', size: 0.4 }],
    ['ShapeField', { shape: 'rose', fieldMode: 'falloff', softness: 0.2 }],
  ]
  const sizes = [[16, 16], [12, 7], [7, 12], [2, 9], [9, 2]]

  it('renders every centred field as before', () => {
    const hashes = cases.flatMap(([nodeType, props]) => sizes.map(([W, H]) => {
      const out = output(nodeType, props, W, H, 45)
      return hash((out.field ?? out.frame) as Float32Array | Frame)
    }))
    expect(hashes.join(' ')).toBe(MATRIX_HASHES)
  })
})

const MATRIX_HASHES = [
  '9ac2a506 5f7ea52f 3b7441ad f0985f65 db732d8d d6f2e176 0585b216 dddfe111 2af64108 6293cab7',
  '6b773029 b64b3e78 833da318 41164378 7e3c1c38 f3739345 9f522a19 dcaf41a9 9d2a4a37 51a94a13',
  'dc4cf06c a0c6acbd 3c634cf0 dbab585d eedc07db 422dbe05 9e6f5c52 7ede6922 8eace34e 8eb868ca',
  'f28e816d 1723af8e 18f1c5ab cb4e3b82 0be2b7eb d4b841fd 11ca38a9 002f8d99 7a31dea5 3383e825',
  '24ff6cf9 b4779c9e 449118d9 a0bc00f1 67c341a9 80c44319 5e5d768c 8029daf9 75504820 5444cd49',
].join(' ')

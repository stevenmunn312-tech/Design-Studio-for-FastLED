import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { SDF_HELPER_CPP } from '../../../codegen/helpers/sdfHelperCpp'
import { NODE_LIBRARY, isPropertyEnabled, libraryDefaults } from '../../../state/nodeLibrary'
import { wiredPropertyIsInert } from '../../../state/propertyInputs'
import { roseSd, superformulaKnobs, superformulaSd } from '../../../state/evaluator/sdf'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

let run = 0
const preview = (props: Record<string, unknown>, W: number, H: number, t = 0, key = `sf-${run++}`) =>
  evaluateGraphFull([node(key, 'ShapeField', props)], [], t * 60, W, H, {}, true, true).outputs.get(key)!.field as Float32Array

/** One of SDF_HELPER_CPP's functions as JavaScript: its one-return body run as a snippet. */
function cppHelper(name: string): (...args: number[]) => number {
  const match = SDF_HELPER_CPP.match(new RegExp(`static inline float ${name}\\(([^)]*)\\) \\{\\n([\\s\\S]*?)\\n\\}`))!
  const params = match[1].split(',').map((param) => param.trim().split(/\s+/)[1])
  const body = match[2].split('\n').map((line) => line.replace(/^\s*return (.*);$/, '__r = $1;'))
  const step = compileCppSnippet(['float __r = 0.0f;', ...body], params, ['__r'])
  return (...args) => step(0, Object.fromEntries(params.map((param, i) => [param, args[i]]))).__r as number
}

/** The sketch's ShapeField block, run in JavaScript into a field the size of the matrix. */
function sketch(props: Record<string, unknown>, edges: StudioEdge[] = [], extra: StudioNode[] = []) {
  const cpp = generateCpp([node('s', 'ShapeField', props), node('p', 'FieldToFrame'), node('out', 'MatrixOutput'), ...extra], [
    edge('a', 's', 'field', 'p', 'field'), edge('b', 'p', 'frame', 'out', 'frame'), ...edges,
  ], {}, { deferPruning: true })
  const lines = cpp.split('\n')
  const start = lines.findIndex((line) => line.includes('/* ShapeField:'))
  let depth = 0, end = start
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
    if (depth === 0) { end = i; break }
  }
  const block = lines.slice(start, end + 1).map((line) => line.replace(/\b\w+(\[_y\*WIDTH\+_x\]=)/, '__out$1'))
  const helpers = ['_sdfRect', '_sdfEllipse', '_sdfRose', '_sdfSuperformula'] as const
  const step = compileCppSnippet(block, ['WIDTH', 'HEIGHT', 't', '__out', ...helpers], [])
  const fns = Object.fromEntries(helpers.map((name) => [name, cppHelper(name)]))
  return { cpp, block: block.join('\n'), render: (W: number, H: number, t = 0) => {
    const out = new Float32Array(W * H)
    step(t * 1000, { WIDTH: W, HEIGHT: H, t, __out: out as never, ...(fns as Record<string, never>) })
    return out
  } }
}

describe('Shape Field rose and superformula', () => {
  it('draws a rose with one petal per Petals, gaps between them', () => {
    const W = 33, H = 33
    const f = preview({ shape: 'rose', petals: 4, size: 0.45, softness: 0 }, W, H)
    const at = (dx: number, dy: number) => f[(16 + dy) * W + 16 + dx]
    // Petals point along +x, +y, -x and -y; the diagonals are gaps.
    for (const [dx, dy] of [[8, 0], [0, 8], [-8, 0], [0, -8]]) expect(at(dx, dy)).toBe(1)
    for (const [dx, dy] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) expect(at(dx, dy)).toBe(0)
  })

  it('draws the superformula outline at Size along a lobe', () => {
    const sf = superformulaKnobs(6, 0.3, 0.3, 0.3, 1, 1)
    // Along +x a lobe reaches exactly Size; between lobes it is pulled in.
    expect(superformulaSd(10, 0, sf, 10)).toBeCloseTo(0, 9)
    expect(superformulaSd(10 * Math.cos(Math.PI / 6), 10 * Math.sin(Math.PI / 6), sf, 10)).toBeGreaterThan(0)
    expect(roseSd(10, 0, 5, 10)).toBeCloseTo(0, 9)
  })

  it('places, sizes and fills the new kinds as it does the others', () => {
    const W = 24, H = 16
    const left = preview({ shape: 'superformula', cx: 0.2, size: 0.3, fieldMode: 'fill' }, W, H)
    const right = preview({ shape: 'superformula', cx: 0.8, size: 0.3, fieldMode: 'fill' }, W, H)
    const sum = (f: Float32Array, x0: number, x1: number) => {
      let s = 0
      for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) s += f[y * W + x]
      return s
    }
    expect(sum(left, 0, 12)).toBeGreaterThan(sum(left, 12, 24))
    expect(sum(right, 12, 24)).toBeGreaterThan(sum(right, 0, 12))
    const distance = preview({ shape: 'rose', fieldMode: 'distance', range: 0.2 }, W, H)
    expect(Math.max(...distance)).toBeLessThan(1.0001)
    expect(Math.min(...distance)).toBeGreaterThanOrEqual(0)
  })

  it.each([
    ['rose fill', { shape: 'rose', petals: 3, size: 0.4, rotation: 20 }],
    ['rose falloff', { shape: 'rose', petals: 7, fieldMode: 'falloff', range: 0.3, cx: 0.3 }],
    ['superformula fill', { shape: 'superformula', symmetry: 5, n1: 0.35, n2: 0.9, n3: 0.9, size: 0.45 }],
    ['superformula distance', { shape: 'superformula', symmetry: 8, n1: 0.55, n2: 1.35, n3: 1.35, a: 0.82, b: 0.82, fieldMode: 'distance', range: 0.15 }],
    ['ellipse, unchanged', { shape: 'ellipse', aspect: 1.6, softness: 0.2 }],
  ])('matches the sketch: %s', (_, props) => {
    const { render } = sketch(props)
    for (const [W, H] of [[16, 16], [24, 9]]) {
      const board = render(W, H)
      const shown = preview(props, W, H)
      for (let i = 0; i < W * H; i++) expect(board[i]).toBeCloseTo(shown[i], 5)
    }
  })

  it('spins on the clock in both, and emits no clock while Spin is 0', () => {
    expect(sketch({ shape: 'rose' }).block).not.toContain('_phase_')
    const props = { shape: 'rose', petals: 5, spin: 90, size: 0.4 }
    const { block, render } = sketch(props)
    expect(block).toContain('_phase_s')
    const key = 'spin-parity'
    for (const t of [0, 0.5, 1.25]) {
      const board = render(16, 16, t)
      const shown = preview(props, 16, 16, t, key)
      for (let i = 0; i < 256; i++) expect(board[i]).toBeCloseTo(shown[i], 5)
    }
    // A quarter turn later the petal along +x has moved.
    expect(preview(props, 16, 16, 0, 'spin-a')).not.toEqual(preview(props, 16, 16, 1, 'spin-b'))
  })

  it('emits only the chosen kind\'s knobs, and follows a wire into them', () => {
    const rose = sketch({ shape: 'rose' }).block
    expect(rose).toContain('_sdfRose(_lx,_ly,_petals,_size)')
    expect(rose).not.toMatch(/_aspect|_sides|_n1|_sfA/)
    const sf = sketch({ shape: 'superformula' }).block
    expect(sf).toContain('_sdfSuperformula(_lx,_ly,_m,_n1,_n2,_n3,_sfA,_sfB,_size)')
    expect(sf).not.toMatch(/_aspect|_petals/)
    const wired = sketch({ shape: 'rose' }, [edge('w', 'lfo', 'result', 's', 'petals')], [node('lfo', 'Wave')]).block
    expect(wired).not.toMatch(/_petals=fmaxf\(1\.0f,5\)/)
  })

  it('gates each kind\'s knobs to that kind', () => {
    expect(isPropertyEnabled('ShapeField', 'petals', { shape: 'rose' })).toBe(true)
    expect(isPropertyEnabled('ShapeField', 'petals', { shape: 'superformula' })).toBe(false)
    expect(isPropertyEnabled('ShapeField', 'n1', { shape: 'superformula' })).toBe(true)
    expect(isPropertyEnabled('ShapeField', 'symmetry', { shape: 'ellipse' })).toBe(false)
    // Aspect stretches the ellipse and the rectangle; it used to be gated on a
    // 'circle' kind that does not exist, which hid it from the default ellipse.
    expect(isPropertyEnabled('ShapeField', 'aspect', { shape: 'ellipse' })).toBe(true)
    expect(isPropertyEnabled('ShapeField', 'aspect', { shape: 'rose' })).toBe(false)
    expect(wiredPropertyIsInert('ShapeField', 'petals', { shape: 'polygon' })).toBe(true)
    expect(wiredPropertyIsInert('ShapeField', 'spin', { shape: 'polygon' })).toBe(false)
  })
})

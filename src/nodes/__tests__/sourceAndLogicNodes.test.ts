/*
 * The D-08.10 primitives: Constant, Color, Logic and Expression. Each is held
 * on both sides — the preview's output and the sketch's line — and Expression
 * to the same trust and validation gates as the other formula nodes.
 */
import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../state/graphEvaluator'
import { generateCpp } from '../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../codegen/controlGraph'
import { NODE_LIBRARY, libraryDefaults, propertyDescription } from '../../state/nodeLibrary'
import { findFormulaErrors } from '../../utils/validateGraph'
import { patternNeedsTrust } from '../../state/patterns/patternTrust'
import { isScalarFormulaValid, scalarFormulaError } from '../shared/formulaLang'
import { LOGIC_OPS, applyLogic, logicCpp } from '../math/logic'
import { compileCppSnippet } from '../../test-utils/cppSnippet'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

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

const trusted = true
const outputsOf = (nodes: StudioNode[], edges: StudioEdge[], tick = 0, isTrusted = trusted) =>
  evaluateGraphFull(nodes, edges, tick, 8, 8, {}, true, isTrusted).outputs

describe('Constant', () => {
  it('outputs its value on both sides, including a matrix-relative expression', () => {
    const literal = node('k', 'Constant', { value: 2.5 })
    expect(outputsOf([literal], []).get('k')!.value).toBe(2.5)
    expect(generateCpp([literal], [])).toContain('float n_k_value = 2.5;')
    const relative = node('w', 'Constant', { value: 'w/2' })
    expect(outputsOf([relative], []).get('w')!.value).toBe(4)
    expect(generateCpp([relative], [])).toContain('float n_w_value = 8;')
  })

  it('is a control-graph source', () => {
    const graph = createControlGraph([node('k', 'Constant', { value: 0.75 }), node('m', 'Math', { mathOp: 'multiply', b: 2 })],
      [edge('k', 'value', 'm', 'a')])
    expect(graph.resolve('m', 'result', 'float')).not.toBeNull()
    expect(controlGraphCpp(graph).loop.join('\n')).toContain('float n_k_value = 0.75;')
  })
})

describe('Color', () => {
  it('outputs the picked hex as RGB on both sides and falls back from a bad value', () => {
    const picked = node('c', 'Color', { color: '#1a2b3c' })
    expect(outputsOf([picked], []).get('c')!.color).toEqual({ r: 26, g: 43, b: 60 })
    expect(generateCpp([picked], [])).toContain('CRGB n_c_color = CRGB(26, 43, 60);')
    const broken = node('b', 'Color', { color: 'teal' })
    expect(generateCpp([broken], [])).toContain('CRGB n_b_color = CRGB(255, 48, 128);')
  })

  it('is a control-graph colour source', () => {
    const graph = createControlGraph([node('c', 'Color', { color: '#ff0000' }), node('hsv', 'RGBToHSV')], [edge('c', 'color', 'hsv', 'rgb')])
    expect(graph.resolve('hsv', 'h', 'float')).not.toBeNull()
    expect(controlGraphCpp(graph).loop.join('\n')).toContain('CRGB n_c_color = CRGB(255, 0, 0);')
  })
})

describe('Logic', () => {
  const truth = [[false, false], [false, true], [true, false], [true, true]] as const

  it('agrees between the preview table and the emitted C++ for every operation', () => {
    for (const op of LOGIC_OPS) {
      const run = compileCppSnippet([`bool out = ${logicCpp(op, 'a', 'b')};`], ['a', 'b'], ['out'])
      for (const [a, b] of truth) {
        expect(run(0, { a, b }).out, `${op}(${a}, ${b})`).toBe(applyLogic(op, a, b))
      }
    }
  })

  it('reads an unwired side as false and a float wire as true from 0.5', () => {
    const lone = node('l', 'Logic', { logicOp: 'or' })
    const high = node('k', 'Constant', { value: 0.5 })
    expect(outputsOf([lone, high], [edge('k', 'value', 'l', 'a')]).get('l')!.result).toBe(true)
    const both = node('n', 'Logic', { logicOp: 'and' })
    expect(outputsOf([both, high], [edge('k', 'value', 'n', 'a')]).get('n')!.result).toBe(false)
    const cpp = generateCpp([lone, high], [edge('k', 'value', 'l', 'a')])
    expect(cpp).toContain('bool n_l_result = ((((n_k_value >= 0.5f) ? 1.0f : 0.0f)) || (0));')
  })

  it('is a boolean control-graph node', () => {
    const nodes = [node('a', 'Compare', { a: 1, b: 0.5 }), node('b', 'Compare', { a: 0, b: 0.5 }), node('l', 'Logic', { logicOp: 'xor' })]
    const graph = createControlGraph(nodes, [edge('a', 'result', 'l', 'a'), edge('b', 'result', 'l', 'b')])
    expect(graph.resolve('l', 'result', 'bool')).toEqual({ nodeId: 'l', port: 'result', type: 'bool' })
    expect(controlGraphCpp(graph).loop.join('\n')).toContain('bool n_l_result = ((n_a_result) != (n_b_result));')
  })
})

describe('Expression', () => {
  it('evaluates a, b, t, W and H identically in the preview and the sketch', () => {
    const expr = node('x', 'Expression', { formula: 'a*2 + b + W/H + floor(t)', a: 1.5, b: 0.25 })
    expect(outputsOf([expr], [], 90).get('x')!.result).toBeCloseTo(1.5 * 2 + 0.25 + 1 + 1, 6)
    const cpp = generateCpp([expr], [])
    expect(cpp).toContain('/* Expression: a*2 + b + W/H + floor(t) */')
    expect(cpp).toContain('n_x_result = a*2 + b + W/H + floor(t); }')
  })

  it('rewrites FastLED shims and keeps a formula the parser rejects out of the sketch', () => {
    const shim = node('s', 'Expression', { formula: 'sin8(t*40)/255' })
    expect(generateCpp([shim], [])).toContain('n_s_result = _fsin8(t*40)/255; }')
    const injected = node('bad', 'Expression', { formula: 'a; system("rm")' })
    const cpp = generateCpp([injected], [])
    expect(cpp).not.toContain('system(')
    expect(cpp).toContain('n_bad_result = 0.0f; }')
    expect(outputsOf([injected], []).get('bad')!.result).toBe(0)
  })

  it('rejects the pixel vocabulary, explains why, and is validated like the other formula nodes', () => {
    expect(isScalarFormulaValid('x + y')).toBe(false)
    expect(scalarFormulaError('x + y')).toMatch(/x/)
    expect(scalarFormulaError('')).toBe('Empty formula')
    expect(findFormulaErrors([node('e', 'Expression', { formula: 'cx * 2' })])).toEqual(['Expression has an invalid formula: cx * 2'])
    expect(findFormulaErrors([node('e', 'Expression', { formula: 'a * 2' })])).toEqual([])
  })

  it('outputs 0 until the workspace is trusted and asks for trust like Custom Formula', () => {
    const expr = node('x', 'Expression', { formula: '1 + 1' })
    expect(outputsOf([expr], [], 0, false).get('x')!.result).toBe(0)
    expect(outputsOf([expr], [], 0, true).get('x')!.result).toBe(2)
    expect(patternNeedsTrust({ nodes: [expr], edges: [] })).toBe(true)
    expect(patternNeedsTrust({ nodes: [node('k', 'Constant')], edges: [] })).toBe(false)
  })

  it('documents its own vocabulary, not the per-pixel one', () => {
    const help = propertyDescription('Expression', 'formula') ?? ''
    expect(help).toMatch(/Variables: a, b, t, W, H\./)
    expect(help).not.toMatch(/angle/)
  })
})

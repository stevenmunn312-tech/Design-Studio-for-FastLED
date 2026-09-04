import { describe, expect, it } from 'vitest'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { createControlGraph, controlGraphCpp, controlReferenceCpp, MAX_CONTROL_GRAPH_NODES } from '../controlGraph'
import { SCALAR_CONTROL_NODES, scalarControlInputDefaults } from '../scalarControlCpp'
import { generateCpp } from '../cppGenerator'
import { evaluateGraphFull } from '../../state/graphEvaluator'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'math',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

describe('typed control graph', () => {
  it.each([true, false])('respects button polarity for pullup=%s in every shared emitter', (pullup) => {
    const graph = createControlGraph([node('button', 'ButtonInput', { pin: 12, pullup }),
      node('encoder', 'EncoderInput', { pinSW: 13, pullup })], [])
    graph.resolve('button', 'pressed', 'bool')
    graph.resolve('encoder', 'pressed', 'bool')
    const cpp = controlGraphCpp(graph)
    expect(cpp.setup).toContain(`  pinMode(12, ${pullup ? 'INPUT_PULLUP' : 'INPUT'});`)
    for (const pin of [12, 13]) expect(cpp.loop.join('\n')).toContain(`digitalRead(${pin}) == ${pullup ? 'LOW' : 'HIGH'}`)
  })
  it('keeps operation ports and numeric dependencies aligned with the node registry', () => {
    for (const [type, output] of Object.entries(SCALAR_CONTROL_NODES)) {
      const definition = NODE_LIBRARY.find((entry) => entry.type === type)!
      expect(definition.outputs).toContainEqual(expect.objectContaining({ id: output.port, dataType: output.type }))
      expect(Object.keys(scalarControlInputDefaults(type, libraryDefaults(type))).sort())
        .toEqual(definition.inputs.filter((port) => port.dataType === 'float').map((port) => port.id).sort())
    }
  })

  it('orders a shared producer once ahead of both numeric and boolean consumers', () => {
    const nodes = [node('compare', 'Compare'), node('math', 'Math', { mathOp: 'multiply', b: 2 }), node('knob', 'PotInput', { pin: 33 })]
    const graph = createControlGraph(nodes, [edge('knob', 'value', 'math', 'a'), edge('math', 'result', 'compare', 'a')])
    expect(graph.resolve('compare', 'result', 'bool')).toEqual({ nodeId: 'compare', port: 'result', type: 'bool' })
    expect(graph.resolve('math', 'result', 'float')).not.toBeNull()
    expect(graph.instructions.map((instruction) => instruction.nodeId)).toEqual(['knob', 'math', 'compare'])
    const cpp = controlGraphCpp(graph).loop.join('\n')
    expect(cpp.match(/analogRead\(33\)/g)).toHaveLength(1)
    expect(cpp).toContain('float n_math_result = (n_knob_value) * (2);')
    expect(cpp).toContain('bool n_compare_result = (n_math_result) > (0.5);')
  })

  it('uses the normal-sketch emitters for a numeric chain and formatted text', () => {
    const nodes = [node('knob', 'PotInput'), node('map', 'MapRange', { outMin: -1, outMax: 1 }),
      node('clamp', 'Clamp'), node('format', 'FormatNumber', { decimals: 2, suffix: ' V' }), node('tft', 'TransportDisplay')]
    const edges = [edge('knob', 'value', 'map', 'value'), edge('map', 'result', 'clamp', 'value'),
      edge('clamp', 'result', 'format', 'value'), edge('format', 'text', 'tft', 'title')]
    const graph = createControlGraph(nodes, edges)
    graph.input('tft', 'title', 'string')
    const emitted = controlGraphCpp(graph)
    const normal = generateCpp([...nodes, node('out', 'MatrixOutput')], edges)
    for (const line of emitted.loop) expect(normal).toContain(line)
    for (const helper of emitted.helpers) expect(normal).toContain(helper)
    expect(emitted.loop.join('\n')).not.toContain('String(')
  })

  it('retains operation identities, zero-span mapping and interpolation defaults', () => {
    const nodes = [node('multiply', 'Math', { mathOp: 'multiply' }), node('divide', 'Math', { mathOp: 'divide', b: 0 }),
      node('map', 'MapRange', { value: 6, inMin: 3, inMax: 3, outMin: 7 }),
      node('lerp', 'Lerp'), node('out', 'MatrixOutput', { width: 16, height: 16 })]
    const graph = createControlGraph(nodes, [])
    for (const id of ['multiply', 'divide', 'map', 'lerp']) graph.resolve(id, 'result', 'float')
    const cpp = controlGraphCpp(graph)
    expect(cpp.loop.join('\n')).toContain('float n_multiply_result = (1) * (1);')
    expect(cpp.loop.join('\n')).toContain('((0) == 0.0f ? 0.0f : (1) / (0))')
    expect(cpp.helpers.join('\n')).toContain('if (inMax == inMin) return outMin;')
    const lerp = graph.instructions.find((instruction) => instruction.nodeId === 'lerp')!
    expect(lerp.kind === 'scalar' && lerp.inputs.t).toEqual({ kind: 'literal', value: 0.5 })
    // Browser values are the same edge cases the shared C++ operations encode.
    const { outputs } = evaluateGraphFull(nodes, [], 0, 16, 16)
    expect(outputs.get('multiply')?.result).toBe(1)
    expect(outputs.get('divide')?.result).toBe(0)
    expect(outputs.get('map')?.result).toBe(7)
    expect(outputs.get('lerp')?.result).toBe(0.5)
  })

  it('rejects wrong types, missing sources, unknown handles and unsupported nodes', () => {
    for (const [nodes, id, port, type] of [
      [[node('button', 'ButtonInput')], 'button', 'pressed', 'float'],
      [[node('math', 'Math')], 'math', 'value', 'float'],
      [[node('wave', 'Wave')], 'wave', 'result', 'float'],
      [[], 'missing', 'value', 'float'],
    ] as const) {
      const graph = createControlGraph([...nodes], [])
      expect(graph.resolve(id, port, type)).toBeNull()
      expect(() => controlGraphCpp(graph)).toThrow()
    }
  })

  it('applies the existing wired-input clamp without clamping property fallbacks', () => {
    const graph = createControlGraph([node('source', 'Math', { a: 2 }), node('lerp', 'Lerp', { clampInputs: true })],
      [edge('source', 'result', 'lerp', 't')])
    graph.resolve('lerp', 'result', 'float')
    expect(controlGraphCpp(graph).loop.join('\n')).toContain('constrain(n_source_result, 0, 1)')
  })

  it('rejects feedback rather than breaking a cycle with a default value', () => {
    const graph = createControlGraph([node('a', 'Math'), node('b', 'Math')],
      [edge('a', 'result', 'b', 'a'), edge('b', 'result', 'a', 'a')])
    expect(graph.resolve('a', 'result', 'float')).toBeNull()
    expect(() => controlGraphCpp(graph)).toThrow('instantaneous cycle')
  })

  it('bounds dependency depth and refuses identifiers that would collide in C++', () => {
    const nodes = Array.from({ length: MAX_CONTROL_GRAPH_NODES + 1 }, (_, i) => node(`n${i}`, 'Math'))
    const edges = nodes.slice(1).map((n, i) => edge(n.id, 'result', nodes[i].id, 'a'))
    const graph = createControlGraph(nodes, edges)
    expect(graph.resolve('n0', 'result', 'float')).toBeNull()
    expect(() => controlGraphCpp(graph)).toThrow('exceeds')
    const collision = createControlGraph([node('a-b', 'Math'), node('a_b', 'Math')], [])
    collision.resolve('a-b', 'result', 'float')
    expect(collision.resolve('a_b', 'result', 'float')).toBeNull()
    expect(() => controlGraphCpp(collision)).toThrow('identifiers collide')
  })

  it('sanitizes handle punctuation and bounds authored text without interpolating code', () => {
    expect(controlReferenceCpp({ nodeId: 'screen-id', port: 'widget:slider:out', type: 'float' }))
      .toBe('n_screen_id_widget_slider_out')
    const graph = createControlGraph([node('title', 'TextValue', { text: '"; evil(); //\n' + 'x'.repeat(1000) })], [])
    graph.resolve('title', 'text', 'string')
    const cpp = controlGraphCpp(graph).loop.join('\n')
    expect(cpp).toContain('\\"; evil();')
    expect(cpp).not.toContain('x'.repeat(100))
  })
})

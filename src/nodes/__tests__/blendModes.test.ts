import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../state/graphEvaluator'
import { generateCpp } from '../../codegen/cppGenerator'
import { NODE_LIBRARY, propertyOptions } from '../../state/nodeLibrary'
import { BLEND_MODES } from '../shared/integerPatterns'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { Frame } from '../../state/palettes/ledColor'

function node(id: string, nodeType: string, properties: Record<string, unknown>): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...definition.defaultProperties, ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}

describe('Blend mode options', () => {
  it('offers every supported channel blend without changing Array modes', () => {
    expect(propertyOptions('Blend', 'blendMode', {})).toEqual(['normal', ...BLEND_MODES])
    // Array's own three, its default first.
    expect(propertyOptions('Array', 'blendMode', {})).toEqual(['lighten', 'add', 'over'])
  })

  it('keeps the brighter channel for Lighten in preview and generated firmware', () => {
    const nodes = [
      node('a', 'SolidColor', { r: 20, g: 200, b: 40 }),
      node('b', 'SolidColor', { r: 100, g: 30, b: 220 }),
      node('mix', 'Blend', { blendMode: 'lighten', amount: 1 }),
    ]
    const edges = ['a', 'b'].map((source) => ({ id: source, source, sourceHandle: 'frame',
      target: 'mix', targetHandle: source })) as StudioEdge[]
    const frame = evaluateGraphFull(nodes, edges, 0, 1, 1, {}, true, true).outputs.get('mix')!.frame as Frame
    expect(frame[0][0]).toEqual({ r: 100, g: 200, b: 220 })
    const cpp = generateCpp(nodes, edges)
    for (const channel of ['r', 'g', 'b']) expect(cpp).toContain(`max(_a.${channel},_b.${channel})`)
  })
})

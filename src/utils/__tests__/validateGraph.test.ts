import { describe, it, expect } from 'vitest'
import { validateGraph } from '../validateGraph'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties: {}, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: 'frame', targetHandle: th } as unknown as StudioEdge
}

describe('validateGraph', () => {
  it('errors on empty graph', () => {
    const { errors } = validateGraph([], [])
    expect(errors).toContain('No nodes in graph')
  })

  it('errors when MatrixOutput is missing', () => {
    const { errors } = validateGraph([node('sc', 'SolidColor')], [])
    expect(errors).toContain('Missing MatrixOutput node')
  })

  it('errors when MatrixOutput frame input is not connected', () => {
    const { errors } = validateGraph([node('out', 'MatrixOutput')], [])
    expect(errors).toContain('MatrixOutput has no Frame input connected')
  })

  it('passes a valid minimal graph', () => {
    const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'sc', 'out', 'frame')]
    const { errors, warnings } = validateGraph(nodes, edges)
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('warns about isolated nodes', () => {
    const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput'), node('iso', 'Plasma')]
    const edges = [edge('e1', 'sc', 'out', 'frame')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('not connected'))).toBe(true)
  })

  it('warns when PatternMaster has no pattern inputs', () => {
    const nodes = [node('pm', 'PatternMaster'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'pm', 'out', 'frame')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('Pattern Master'))).toBe(true)
  })

  it('does not warn about PatternMaster when a pattern is wired', () => {
    const nodes = [node('sc', 'SolidColor'), node('pm', 'PatternMaster'), node('out', 'MatrixOutput')]
    const edges = [
      edge('e1', 'sc', 'pm', 'p0'),
      edge('e2', 'pm', 'out', 'frame'),
    ]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('Pattern Master'))).toBe(false)
  })

  it('counts multiple isolated nodes correctly', () => {
    const nodes = [node('out', 'MatrixOutput'), node('a', 'Plasma'), node('b', 'Fire')]
    const edges: StudioEdge[] = []
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('2 nodes'))).toBe(true)
  })
})

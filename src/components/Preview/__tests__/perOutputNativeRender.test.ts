import { describe, expect, it } from 'vitest'
import { evaluateGraphFull, type Frame } from '../../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { outputRenderPasses, routeFrame } from '../../../state/outputRouting'

function node(id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, category, properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string): StudioEdge {
  return { id, source, target, sourceHandle: 'frame', targetHandle: 'frame' } as StudioEdge
}

describe('per-output native preview rendering', () => {
  it('evaluates a 60x1 strip and 16x16 matrix at their own dimensions', () => {
    const pattern = node('pattern', 'CustomFormula', 'pattern', { formula: 'x/(W-1)' })
    const strip = node('strip', 'MatrixOutput', 'output', { form: 'strip', ledCount: 60, dataPin: 5 })
    const matrix = node('matrix', 'MatrixOutput', 'output', { form: 'matrix', width: 16, height: 16, dataPin: 6 })
    const nodes = [pattern, strip, matrix]
    const edges = [edge('strip-feed', 'pattern', 'strip'), edge('matrix-feed', 'pattern', 'matrix')]
    const passes = outputRenderPasses(nodes, edges)
    const physical = new Map<string, ReturnType<typeof routeFrame>>()

    for (const pass of passes) {
      const result = evaluateGraphFull(
        nodes, edges, 0, pass.width, pass.height, {}, false, true, `test-output/${pass.key}/`,
      )
      for (const route of pass.routes) {
        const source = result.outputs.get(route.id)?.frame
        physical.set(route.id, routeFrame(source as Frame | null, route, pass.width, pass.height))
      }
    }

    expect(passes.map((pass) => pass.key)).toEqual(['60x1', '16x16'])
    expect(physical.get('strip')).toHaveLength(1)
    expect(physical.get('strip')?.[0]).toHaveLength(60)
    expect(physical.get('matrix')).toHaveLength(16)
    expect(physical.get('matrix')?.[0]).toHaveLength(16)
  })
})

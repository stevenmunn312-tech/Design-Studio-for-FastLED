import { describe, expect, it } from 'vitest'
import { compositionDims, outputRoutes, routeFrame } from '../outputRouting'
import type { StudioNode } from '../graphStore'

function output(id: string, properties: Record<string, unknown>): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: `Output ${id}`, nodeType: 'MatrixOutput', category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

describe('multi-output routing', () => {
  it('uses the largest supersampled route as the composition canvas', () => {
    const nodes = [output('a', { width: 8, height: 16 }), output('b', { width: 16, height: 8, supersample: true })]
    expect(compositionDims(nodes)).toEqual({ w: 32, h: 16 })
  })

  it('fits a composition into a smaller route with a box average', () => {
    const route = outputRoutes([output('a', { width: 1, height: 1, routeMode: 'fit' })])[0]
    const frame = [[{ r: 0, g: 10, b: 20 }, { r: 100, g: 30, b: 40 }]]
    expect(routeFrame(frame, route, 2, 1)).toEqual([[{ r: 50, g: 20, b: 30 }]])
  })

  it('crops from the configured wrapped origin', () => {
    const route = outputRoutes([output('a', { width: 1, height: 1, routeMode: 'crop', routeX: 1, routeY: 0 })])[0]
    const frame = [[{ r: 1, g: 2, b: 3 }, { r: 4, g: 5, b: 6 }]]
    expect(routeFrame(frame, route, 2, 1)).toEqual([[{ r: 4, g: 5, b: 6 }]])
  })
})

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

  it('ignores outputs with nothing wired into their Frame input', () => {
    // Reported from the bench: a 60-LED strip sitting on the canvas unconnected
    // stretched the shared canvas to 60 wide, and the 16x16 matrix beside it
    // then fit that whole width into 16 columns and showed a squashed sliver.
    const nodes = [
      output('matrix', { width: 16, height: 16 }),
      output('strip', { width: 60, height: 1 }),
    ]
    const edges = [{ target: 'matrix', targetHandle: 'frame' }]
    expect(compositionDims(nodes, edges)).toEqual({ w: 16, h: 16 })
  })

  it('still sizes from every route when none are wired yet', () => {
    const nodes = [output('a', { width: 8, height: 4 }), output('b', { width: 4, height: 12 })]
    expect(compositionDims(nodes, [])).toEqual({ w: 8, h: 12 })
  })

  it('sizes from all connected routes, not just the first', () => {
    const nodes = [
      output('matrix', { width: 16, height: 16 }),
      output('strip', { width: 60, height: 1 }),
    ]
    const edges = [
      { target: 'matrix', targetHandle: 'frame' },
      { target: 'strip', targetHandle: 'frame' },
    ]
    expect(compositionDims(nodes, edges)).toEqual({ w: 60, h: 16 })
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

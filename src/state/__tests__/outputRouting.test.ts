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

describe('routing per LED output form', () => {
  it('routes a string as one row of its own length', () => {
    const route = outputRoutes([output('s', { form: 'strip', ledCount: 90 })])[0]
    expect(route.form).toBe('strip')
    expect([route.width, route.height]).toEqual([90, 1])
    expect(route.ringMap).toBeNull()
  })

  it('claims a square canvas for a ring but stays a chain of LEDs', () => {
    // A ring's route is 1 x N like a strip's — that is the order it is wired in
    // — while the canvas it reads is the square its circle is inscribed in.
    const route = outputRoutes([output('r', { form: 'ring', ledCount: 24 })])[0]
    expect([route.width, route.height]).toEqual([24, 1])
    expect([route.canvasW, route.canvasH]).toEqual([8, 8])
    expect(compositionDims([output('r', { form: 'ring', ledCount: 24 })])).toEqual({ w: 8, h: 8 })
  })

  it('reads a circle out of the composition rather than a rectangle', () => {
    const route = outputRoutes([output('r', { form: 'ring', ledCount: 4, ringStartAngle: 0, ringDirection: 'cw' })])[0]
    // A 3x3 canvas with a distinct colour at each compass point.
    const black = { r: 0, g: 0, b: 0 }
    const frame = [
      [black, { r: 1, g: 0, b: 0 }, black],
      [{ r: 0, g: 0, b: 4 }, black, { r: 0, g: 2, b: 0 }],
      [black, { r: 0, g: 0, b: 3 }, black],
    ]
    // Top, right, bottom, left — clockwise from 12 o'clock.
    expect(routeFrame(frame, route, 3, 3)).toEqual([[
      { r: 1, g: 0, b: 0 }, { r: 0, g: 2, b: 0 }, { r: 0, g: 0, b: 3 }, { r: 0, g: 0, b: 4 },
    ]])
  })

  it('ignores supersample and crop settings a chain inherited from another form', () => {
    const route = outputRoutes([output('s', {
      form: 'strip', ledCount: 30, supersample: true, routeMode: 'crop', routeX: 5,
    })])[0]
    expect(route.supersample).toBe(1)
    expect(route.routeMode).toBe('fit')
  })
})

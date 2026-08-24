import { describe, expect, it } from 'vitest'
import { compositionDims, leadingOutputRoutes, outputMirrorLeaders, outputRoutes, routeFrame } from '../outputRouting'
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

describe('runs wired in parallel off one pin', () => {
  const feed = (target: string) => ({ source: 'pattern', sourceHandle: 'frame', target, targetHandle: 'frame' })

  it('makes the second run a mirror of the first when both share a frame and a pin', () => {
    const nodes = [
      output('a', { form: 'matrix', width: 16, height: 16, dataPin: 18 }),
      output('b', { form: 'matrix', width: 16, height: 16, dataPin: 18 }),
    ]
    const edges = [feed('a'), feed('b')]
    const leaders = outputMirrorLeaders(outputRoutes(nodes), edges)
    expect(leaders.get('a')).toBe('a')
    expect(leaders.get('b')).toBe('a')
    // One controller, so one array in the sketch.
    expect(leadingOutputRoutes(nodes, edges).map((route) => route.id)).toEqual(['a'])
  })

  it('keeps same-frame runs on different pins independent', () => {
    // Two GPIOs is a real setup — cable length, signal integrity — and reading
    // it as a mirror would silently drop one of the user's runs.
    const nodes = [
      output('a', { form: 'matrix', width: 16, height: 16, dataPin: 18 }),
      output('b', { form: 'matrix', width: 16, height: 16, dataPin: 19 }),
    ]
    const edges = [feed('a'), feed('b')]
    expect(leadingOutputRoutes(nodes, edges).map((route) => route.id)).toEqual(['a', 'b'])
  })

  it('does not group runs on one pin that show different frames', () => {
    const nodes = [
      output('a', { form: 'matrix', width: 16, height: 16, dataPin: 18 }),
      output('b', { form: 'matrix', width: 16, height: 16, dataPin: 18 }),
    ]
    const edges = [feed('a'), { source: 'other', sourceHandle: 'frame', target: 'b', targetHandle: 'frame' }]
    expect(leadingOutputRoutes(nodes, edges).map((route) => route.id)).toEqual(['a', 'b'])
  })

  it('never groups a HUB75 panel, which has a ribbon rather than a data pin', () => {
    const nodes = [
      output('a', { form: 'hub75', width: 64, height: 32, dataPin: 18 }),
      output('b', { form: 'hub75', width: 64, height: 32, dataPin: 18 }),
    ]
    const edges = [feed('a'), feed('b')]
    expect(leadingOutputRoutes(nodes, edges).map((route) => route.id)).toEqual(['a', 'b'])
  })

  it('leaves an unwired output alone, however its pin is set', () => {
    const nodes = [
      output('a', { form: 'matrix', width: 16, height: 16, dataPin: 18 }),
      output('b', { form: 'matrix', width: 16, height: 16, dataPin: 18 }),
    ]
    expect(leadingOutputRoutes(nodes, [feed('a')]).map((route) => route.id)).toEqual(['a', 'b'])
  })

  it('does not let a mirror stretch the shared canvas', () => {
    // The mirror shows the leader's array, so nothing ever renders at its size.
    const nodes = [
      output('a', { form: 'matrix', width: 8, height: 8, dataPin: 18 }),
      output('b', { form: 'matrix', width: 32, height: 32, dataPin: 18 }),
    ]
    expect(compositionDims(nodes, [feed('a'), feed('b')])).toEqual({ w: 8, h: 8 })
  })
})

describe('routing per LED output form', () => {
  it('routes a string as one row of its own length', () => {
    const route = outputRoutes([output('s', { form: 'strip', ledCount: 90 })])[0]
    expect(route.form).toBe('strip')
    expect([route.width, route.height]).toEqual([90, 1])
    expect(route.ring).toBeNull()
    expect(route.corkscrew).toBeNull()
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

  it('routes a corkscrew through its unwrapped cylindrical helix', () => {
    const props = {
      form: 'corkscrew', ledCount: 9, corkscrewTurns: 1,
      corkscrewStartAngle: 0, corkscrewDirection: 'cw',
      corkscrewDiameterMm: 100, corkscrewHeightMm: 100,
    }
    const route = outputRoutes([output('c', props)])[0]
    expect(route.form).toBe('corkscrew')
    expect([route.width, route.height]).toEqual([9, 1])
    expect(route.canvasW * route.canvasH).toBeGreaterThan(1)
    expect(route.corkscrew).toMatchObject({ ledCount: 9, turns: 1, startAngle: 0, direction: 'cw' })

    const frame = Array.from({ length: route.canvasH }, (_, y) =>
      Array.from({ length: route.canvasW }, (_, x) => ({ r: x, g: y, b: (y * route.canvasW) + x })))
    const routed = routeFrame(frame, route, route.canvasW, route.canvasH)!
    expect(routed).toHaveLength(1)
    expect(routed[0]).toHaveLength(9)
    // The helix begins at front-centre/top and ends at front-centre/bottom.
    expect(routed[0][0].r).toBe(Math.round((route.canvasW - 1) / 2))
    expect(routed[0][0].g).toBe(0)
    expect(routed[0][8].g).toBe(route.canvasH - 1)
  })

  it('samples a ring against the canvas that exists, not the one it asked for', () => {
    // A ring beside a bigger matrix reads the shared 5x5 canvas, not the 3x3 its
    // own circumference asked for. Indexing a 3x3 map into a 5x5 frame lights
    // every LED from the wrong pixel — and silently, since both are in range.
    const nodes = [
      output('r', { form: 'ring', ledCount: 4, ringStartAngle: 0, ringDirection: 'cw' }),
      output('m', { form: 'matrix', width: 5, height: 5 }),
    ]
    expect(compositionDims(nodes)).toEqual({ w: 5, h: 5 })
    const route = outputRoutes(nodes)[0]
    const black = { r: 0, g: 0, b: 0 }
    const row = (...cells: Array<{ r: number; g: number; b: number }>) => cells
    // Colour only the compass points of the 5x5 canvas the ring will read.
    const frame = [
      row(black, black, { r: 1, g: 0, b: 0 }, black, black),
      row(black, black, black, black, black),
      row({ r: 0, g: 0, b: 4 }, black, black, black, { r: 0, g: 2, b: 0 }),
      row(black, black, black, black, black),
      row(black, black, { r: 0, g: 0, b: 3 }, black, black),
    ]
    expect(routeFrame(frame, route, 5, 5)).toEqual([[
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

import { describe, expect, it } from 'vitest'
import {
  fitNetworkToCanvas, networkLedsPerEdge, networkPositions, parseSegmentNetwork, presetNetwork,
} from '../segmentNetwork'
import { stringLedCount, stringNetwork, stringPositions, usesNetwork, usesPositions } from '../stringPositions'
import { outputGridDims, outputLedTotal } from '../ledOutputForm'

const base = { form: 'strip', stripLayout: 'network', positionsWidth: 16, positionsHeight: 8 }

describe('segment network presets', () => {
  it('builds the hexagons as four pointy-top cells sharing their walls', () => {
    const { nodes, edges } = presetNetwork('hexagons')
    expect(nodes).toHaveLength(16)
    expect(edges).toHaveLength(19)
    // Every edge joins two distinct nodes, once.
    const keys = edges.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`))
    expect(new Set(keys).size).toBe(19)
    expect(edges.every(([a, b]) => a !== b)).toBe(true)
  })

  it('builds the triangle of side three with ten nodes and eighteen edges', () => {
    const { nodes, edges } = presetNetwork('triangles')
    expect(nodes).toHaveLength(10)
    expect(edges).toHaveLength(18)
  })

  it('fits a network into the canvas with half a pixel of margin, aspect kept', () => {
    const fitted = fitNetworkToCanvas({ nodes: [[0, 0], [2, 0], [2, 1]], edges: [[0, 1], [1, 2]] }, 9, 9)
    expect(fitted.nodes[0]).toEqual([0.5, 2.5])
    expect(fitted.nodes[1]).toEqual([8.5, 2.5])
    expect(fitted.nodes[2]).toEqual([8.5, 6.5])
    expect(fitted.edges).toEqual([[0, 1], [1, 2]])
  })
})

describe('custom network JSON', () => {
  it('parses nodes and edges, drops a repeated edge, and refuses bad shapes', () => {
    const ok = parseSegmentNetwork('{"nodes":[[0,0],[1,0],[1,1]],"edges":[[0,1],[1,2],[1,0]]}')
    expect(ok).toEqual({ nodes: [[0, 0], [1, 0], [1, 1]], edges: [[0, 1], [1, 2]] })
    expect(parseSegmentNetwork('not json')).toBeNull()
    expect(parseSegmentNetwork('{"nodes":[[0,0],[1,0]],"edges":[[0,2]]}')).toBeNull()
    expect(parseSegmentNetwork('{"nodes":[[0,0],[1,0]],"edges":[[0,0]]}')).toBeNull()
    expect(parseSegmentNetwork('{"nodes":[[0,0]],"edges":[]}')).toBeNull()
    expect(parseSegmentNetwork(`{"nodes":${JSON.stringify(Array.from({ length: 65 }, (_, i) => [i, 0]))},"edges":[[0,1]]}`)).toBeNull()
  })

  it('clamps LEDs per edge to its range and to the 300-LED string ceiling', () => {
    expect(networkLedsPerEdge(14, 19)).toBe(14)
    expect(networkLedsPerEdge(1, 19)).toBe(2)
    expect(networkLedsPerEdge(100, 19)).toBe(15)
    expect(networkLedsPerEdge(100, 2)).toBe(100)
    expect(networkLedsPerEdge('x', 4)).toBe(14)
  })
})

describe('a network as a positioned string', () => {
  it('places LEDs along each edge in wiring order, each edge in its own direction', () => {
    const points = networkPositions({ nodes: [[0, 0], [4, 0], [4, 4]], edges: [[0, 1], [2, 1]] }, 2)
    expect(points).toEqual([[1, 0], [3, 0], [4, 3], [4, 1]])
  })

  it('counts as a positioned layout and derives the LED count from the network', () => {
    expect(usesPositions(base)).toBe(true)
    expect(usesNetwork(base)).toBe(true)
    expect(usesNetwork({ ...base, stripLayout: 'positions' })).toBe(false)
    expect(stringLedCount({ ...base, ledsPerEdge: 10, ledCount: 7 })).toBe(190)
    expect(outputLedTotal({ ...base, ledsPerEdge: 10 })).toBe(190)
    expect(outputGridDims({ ...base, ledsPerEdge: 10 })).toEqual({ width: 190, height: 1 })
  })

  it('generates the positions from the fitted preset, one point per LED', () => {
    const positions = stringPositions({ ...base, ledsPerEdge: 3 })!
    expect(positions.source).toBe('network')
    expect(positions.points).toHaveLength(19 * 3)
    expect(positions.network?.nodes).toHaveLength(16)
    expect(positions.points.every(([x, y]) => x >= 0 && x <= 16 && y >= 0 && y <= 8)).toBe(true)
    expect(positions.fixed).toHaveLength(19 * 3 * 2)
  })

  it('falls back to the hexagons when a custom network cannot be read, never to nothing', () => {
    const broken = stringNetwork({ ...base, networkPreset: 'custom', network: '{"nodes": 3}' })!
    expect(broken.source).toBe('fallback')
    expect(broken.network.edges).toHaveLength(19)
    const custom = stringNetwork({ ...base, networkPreset: 'custom', network: '{"nodes":[[0,0],[1,0]],"edges":[[0,1]]}', ledsPerEdge: 5 })!
    expect(custom.source).toBe('network')
    expect(stringPositions({ ...base, networkPreset: 'custom', network: '{"nodes":[[0,0],[1,0]],"edges":[[0,1]]}', ledsPerEdge: 5 })!.points).toHaveLength(5)
  })
})

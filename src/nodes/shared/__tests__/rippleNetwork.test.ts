import { describe, expect, it } from 'vitest'
import { presetNetwork } from '../../../state/output/segmentNetwork'
import { advanceRipple, arrivalEnd, buildRippleTables, rippleBehaviour, ripplePoint, rippleShape, type Ripple } from '../rippleNetwork'

// A square with a diagonal: node 0 (0,0), 1 (4,0), 2 (4,4), 3 (0,4).
const square = {
  nodes: [[0, 0], [4, 0], [4, 4], [0, 4]] as Array<[number, number]>,
  edges: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 3]] as Array<[number, number]>,
}

describe('ripple turning tables', () => {
  const tables = buildRippleTables(square, 4, 5, 5)

  it('lists the edges leaving a node, never the one arrived on', () => {
    // Arrive at node 1 along edge 0 (from 0 to 1): leave by edge 1 or the diagonal.
    const end = tables.ends[arrivalEnd(0, 1)]
    expect(end.outgoing.map((o) => o.edge).sort()).toEqual([1, 4])
    expect(end.outgoing.find((o) => o.edge === 1)?.dir).toBe(1)
    expect(end.outgoing.find((o) => o.edge === 4)?.dir).toBe(1)
  })

  it('bounces back at a dead end', () => {
    const spur = buildRippleTables({ nodes: [[0, 0], [4, 0]], edges: [[0, 1]] }, 4, 5, 1)
    const end = spur.ends[arrivalEnd(0, 1)]
    expect(end.outgoing).toEqual([{ edge: 0, dir: -1 }])
  })

  it('picks straight, left, right and angry by the signed turn', () => {
    // Heading east along the top edge into node 1: edge 1 turns a right angle
    // down, the diagonal turns back and down-left, the sharper of the two.
    const end = tables.ends[arrivalEnd(0, 1)]
    expect(end.outgoing[end.straight].edge).toBe(1)
    expect(end.outgoing[end.angry].edge).toBe(4)
    expect(end.left).not.toBe(end.right)
  })

  it('advances through a node and carries the leftover distance', () => {
    const r: Ripple = { edge: 0, dir: 1, offset: 3, hue: 0, ageSec: 0 }
    const [moved] = advanceRipple(tables, r, 2.5, 'straight', () => 0)
    expect(moved.edge).toBe(1)
    expect(moved.dir).toBe(1)
    expect(moved.offset).toBeCloseTo(1.5)
  })

  it('explode continues down every edge from the node', () => {
    const r: Ripple = { edge: 0, dir: 1, offset: 3.5, hue: 0, ageSec: 0 }
    const out = advanceRipple(tables, r, 1, 'explode', () => 0)
    expect(out.map((o) => o.edge).sort()).toEqual([1, 4])
    expect(out.every((o) => Math.abs(o.offset - 0.5) < 1e-9)).toBe(true)
  })

  it('places an LED along an edge in the travel direction', () => {
    const forward = ripplePoint(tables, 0, 1, 0)
    const backward = ripplePoint(tables, 0, -1, 0)
    expect(forward[0]).toBeLessThan(backward[0])
    expect(forward[1]).toBeCloseTo(backward[1])
  })
})

describe('ripple properties', () => {
  it('names a behaviour or falls back to straight', () => {
    expect(rippleBehaviour('angry')).toBe('angry')
    expect(rippleBehaviour('weaving')).toBe('straight')
  })

  it('repeats the LED output network from the same properties', () => {
    const hex = rippleShape({ networkPreset: 'hexagons', ledsPerEdge: 14 })
    expect(hex.shape.edges).toHaveLength(presetNetwork('hexagons').edges.length)
    expect(hex.ledsPerEdge).toBe(14)
    const broken = rippleShape({ networkPreset: 'custom', network: 'nope', ledsPerEdge: 100 })
    expect(broken.shape.edges).toHaveLength(19)
    expect(broken.ledsPerEdge).toBe(15)
  })
})

import { describe, expect, it } from 'vitest'
import { evaluateGraph, evaluateGraphFull } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { automatonInterval, sandJammed, seedElementary, stepBrain, stepCyclic, stepElementary, stepSand } from '../evaluator/automaton'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [] },
  } as unknown as StudioNode
}
const edge = (id: string, source: string, sh: string, target: string, th: string) =>
  ({ id, source, target, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

let run = 0
/** An Automaton graph stepped one tick at a time; returns the field each tick. */
function rig(props: Record<string, unknown>, W: number, H: number) {
  const id = `au-${run++}`
  const nodes = [node(id, 'Automaton', 'field', { speed: 60, ...props }), node('f', 'FieldToFrame', 'field', {}), node('out', 'MatrixOutput', 'output', {})]
  const edges = [edge('a', id, 'field', 'f', 'field'), edge('b', 'f', 'frame', 'out', 'frame')]
  let tick = 0
  return () => {
    const { outputs } = evaluateGraphFull(nodes, edges, tick++, W, H)
    return outputs.get(id)!.field as Float32Array
  }
}
const row = (cells: Uint8Array, y: number, W: number) => Array.from(cells.slice(y * W, (y + 1) * W))

describe('elementary automaton', () => {
  it('rule 90 grows Sierpinski from one cell', () => {
    const W = 15, H = 8
    const cells = new Uint8Array(W * H)
    seedElementary(cells, W, H, null)
    expect(row(cells, 0, W).filter(Boolean).length).toBe(1)
    for (let i = 0; i < 7; i++) stepElementary(cells, W, H, 90)
    // Row 0 is the newest. From one cell rule 90 holds Pascal's triangle mod 2: rows of 1, 2, 2, 4, 2, 4, 4, 8 cells, oldest first.
    const counts = Array.from({ length: H }, (_, y) => row(cells, y, W).filter(Boolean).length)
    expect(counts).toEqual([8, 4, 4, 2, 4, 2, 2, 1])
  })
  it('rule 0 clears and rule 255 fills', () => {
    const W = 9, H = 4
    const a = new Uint8Array(W * H); seedElementary(a, W, H, null); stepElementary(a, W, H, 0)
    expect(row(a, 0, W).some(Boolean)).toBe(false)
    const b = new Uint8Array(W * H); seedElementary(b, W, H, null); stepElementary(b, W, H, 255)
    expect(row(b, 0, W).every(Boolean)).toBe(true)
  })
})

describe('other automata', () => {
  it('cyclic cells only ever advance by one state', () => {
    const W = 12, H = 12, S = 6
    const a = new Uint8Array(W * H).map((_, i) => (i * 7 + (i >> 3)) % S), b = new Uint8Array(W * H)
    stepCyclic(a, b, W, H, S, 2)
    for (let i = 0; i < a.length; i++) expect([a[i], (a[i] + 1) % S]).toContain(b[i])
  })
  it('Brian Brain cycles on to dying to off, and needs exactly two on neighbours to light', () => {
    const W = 5, H = 5
    const a = new Uint8Array(W * H), b = new Uint8Array(W * H)
    a[2 * W + 1] = 2; a[2 * W + 3] = 2; a[1 * W + 2] = 2
    stepBrain(a, b, W, H)
    expect(b[2 * W + 1]).toBe(1)
    expect(b[2 * W + 2]).toBe(0) // three on neighbours: stays off
    expect(b[1 * W + 1]).toBe(2)
  })
  it('sand falls, piles diagonally, and never invents or loses grains', () => {
    const W = 5, H = 5
    const cells = new Uint8Array(W * H)
    cells[2] = 1
    for (let i = 0; i < H; i++) stepSand(cells, W, H, i)
    expect(cells[4 * W + 2]).toBe(1)
    cells[2] = 1
    const before = cells.reduce((a, c) => a + c, 0)
    for (let i = 0; i < 12; i++) stepSand(cells, W, H, i)
    expect(cells.reduce((a, c) => a + c, 0)).toBe(before)
    expect(cells[4 * W + 2] + cells[4 * W + 1] + cells[4 * W + 3]).toBe(2)
  })
  it('sand reports a jam once half the top row is full', () => {
    const c = new Uint8Array(10)
    for (let i = 0; i < 4; i++) c[i] = 1
    expect(sandJammed(c, 10)).toBe(false)
    c[4] = 1
    expect(sandJammed(c, 10)).toBe(true)
  })
  it('steps at the requested rate', () => {
    expect(automatonInterval(60)).toBe(1)
    expect(automatonInterval(6)).toBe(10)
    expect(automatonInterval(0)).toBe(60)
    expect(automatonInterval(1000)).toBe(1)
  })
})

describe('Automaton node', () => {
  it('outputs a 0–1 field and scrolls rule 90 down the canvas', () => {
    const W = 15, H = 8
    const next = rig({ automatonType: 'elementary', rule: 90 }, W, H)
    let f = next()
    for (let i = 0; i < 6; i++) f = next()
    const counts = Array.from({ length: H }, (_, y) => Array.from(f.slice(y * W, (y + 1) * W)).filter((v) => v === 1).length)
    expect(counts.reduce((a, c) => a + c, 0)).toBeGreaterThan(8)
    expect(Math.min(...f)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...f)).toBeLessThanOrEqual(1)
    expect(counts[H - 1]).toBeGreaterThanOrEqual(1)
  })
  it('scales cyclic states to 0–1 and is deterministic under a seed', () => {
    const a = rig({ automatonType: 'cyclic', states: 5, seed: 3 }, 10, 10), b = rig({ automatonType: 'cyclic', states: 5, seed: 3 }, 10, 10)
    const fa = a(), fb = b()
    expect(Array.from(fa)).toEqual(Array.from(fb))
    expect(new Set(Array.from(fa)).size).toBeGreaterThan(2)
    expect(Array.from(fa).every((v) => [0, 0.25, 0.5, 0.75, 1].includes(v))).toBe(true)
  })
  it('Brian output uses only off, dying and on', () => {
    const next = rig({ automatonType: 'brianBrain', seed: 9 }, 12, 12)
    for (let i = 0; i < 5; i++) expect(Array.from(next()).every((v) => v === 0 || v === 0.5 || v === 1)).toBe(true)
  })
  it('sand accumulates at the bottom', () => {
    const next = rig({ automatonType: 'sand', spawn: 1, seed: 4 }, 8, 10)
    let f = next()
    for (let i = 0; i < 25; i++) f = next()
    const bottom = Array.from(f.slice(9 * 8, 10 * 8)).reduce((a, c) => a + c, 0)
    expect(bottom).toBeGreaterThan(0)
  })
  it('restarts on a rising reset and when the canvas changes size', () => {
    const id = 'ar'
    const build = (high: boolean) => [node(id, 'Automaton', 'field', { automatonType: 'elementary', rule: 30, speed: 60 }), node('c', 'Compare', 'math', { a: high ? 1 : 0, b: 0.5 }), node('f', 'FieldToFrame', 'field', {}), node('out', 'MatrixOutput', 'output', {})]
    const edges = [edge('a', id, 'field', 'f', 'field'), edge('b', 'f', 'frame', 'out', 'frame'), edge('r', 'c', 'result', id, 'reset')]
    const at = (high: boolean, tick: number, W = 9, H = 6) => evaluateGraphFull(build(high), edges, tick, W, H).outputs.get(id)!.field as Float32Array
    for (let i = 0; i < 6; i++) at(false, i)
    const before = Array.from(at(false, 6))
    const after = Array.from(at(true, 7))
    expect(after).not.toEqual(before)
    expect(after.slice(0, 9).filter(Boolean).length).toBeGreaterThan(0)
    expect(at(false, 8, 5, 4).length).toBe(20)
  })
  it('renders through a full graph', () => {
    const frame = evaluateGraph([node('a', 'Automaton', 'field', {}), node('f', 'FieldToFrame', 'field', {}), node('out', 'MatrixOutput', 'output', {})], [edge('a', 'a', 'field', 'f', 'field'), edge('b', 'f', 'frame', 'out', 'frame')], 0, 8, 8)
    expect(frame).not.toBeNull()
  })
})

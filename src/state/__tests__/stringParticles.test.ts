import { describe, expect, it } from 'vitest'
import { evaluateGraph } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { ringSampleMap } from '../ledOutputForm'
import { trackIndices, trackSplat, wrapTrack, MAX_STRING_PARTICLES } from '../evaluator/stringTrack'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

let run = 0
const W = 16
const H = 16

/** A String Particles graph that can be stepped frame by frame, optionally with a trigger. */
function rig(props: Record<string, unknown>) {
  const id = `sp-${run++}`
  const nodes = (high: boolean) => [
    node(id, 'StringParticles', 'pattern', props),
    node('cmp', 'Compare', 'math', { a: high ? 1 : 0, b: 0.5 }),
    node('out', 'MatrixOutput', 'output', {}),
  ]
  const edges = [edge('e', id, 'frame', 'out', 'frame'), edge('t', 'cmp', 'result', id, 'trigger')]
  let tick = 0
  return (high = false) => evaluateGraph(nodes(high), edges, tick++, W, H)!
}

/** Row-major canvas indices with any light in them. */
function lit(frame: { r: number; g: number; b: number }[][]): number[] {
  const out: number[] = []
  frame.forEach((row, y) => row.forEach((p, x) => { if (p.r || p.g || p.b) out.push(y * W + x) }))
  return out
}

describe('string track helper', () => {
  it('puts the ring track on the pixels ringSampleMap reads', () => {
    for (const leds of [12, 60, 144]) {
      expect(trackIndices('ring', W, H, leds)).toEqual(ringSampleMap(leds, 0, 'cw', W, H))
    }
  })

  it('runs a row along the middle row and a column down the middle column', () => {
    expect(trackIndices('row', 8, 6, 60)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((x) => 3 * 8 + x))
    expect(trackIndices('column', 8, 6, 60)).toEqual([0, 1, 2, 3, 4, 5].map((y) => y * 8 + 4))
    expect(trackIndices('row', 8, 1, 60)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('splits a particle across two cells that always add up to one', () => {
    for (let p = -3; p < 40; p += 0.137) {
      const s = trackSplat(p, 10)
      expect(s.covA + s.covB).toBeCloseTo(1, 9)
      expect(s.a).toBeGreaterThanOrEqual(0)
      expect(s.a).toBeLessThan(10)
      expect(s.b).toBe((s.a + 1) % 10)
    }
  })

  it('wraps without a jump: a particle crossing the seam keeps its light', () => {
    const len = 10
    expect(trackSplat(3.4, len)).toEqual(trackSplat(3.4 + len, len))
    expect(trackSplat(-0.25, len)).toEqual(trackSplat(len - 0.25, len))
    const cover = (p: number) => {
      const s = trackSplat(p, len)
      const cells = new Array<number>(len).fill(0)
      cells[s.a] += s.covA; cells[s.b] += s.covB
      return cells
    }
    // Either side of the seam, no cell changes by more than the step.
    const delta = 0.01
    const before = cover(len - delta), after = cover(len + delta)
    before.forEach((v, i) => expect(Math.abs(v - after[i])).toBeLessThanOrEqual(2 * delta + 1e-9))
    expect(wrapTrack(-1, len)).toBe(9)
  })
})

describe('String Particles node', () => {
  it('lights only the middle row on the row track', () => {
    const step = rig({ track: 'row', count: 8, spawn: 1, speed: 0.5, fade: 0.9 })
    const row = new Set(trackIndices('row', W, H, 60))
    let any = false
    for (let i = 0; i < 60; i++) {
      const cells = lit(step())
      if (cells.length) any = true
      for (const c of cells) expect(row.has(c)).toBe(true)
    }
    expect(any).toBe(true)
  })

  it('lands particles on ringSampleMap indices on the ring track', () => {
    for (const mode of ['drift', 'meteors'] as const) {
      const step = rig({ track: 'ring', ringLeds: 40, mode, count: 10, spawn: 1, speed: 0.6, fade: 0.9 })
      const ring = new Set(ringSampleMap(40, 0, 'cw', W, H))
      let any = false
      for (let i = 0; i < 80; i++) {
        const cells = lit(step(i % 9 > 4))
        if (cells.length) any = true
        for (const c of cells) expect(ring.has(c)).toBe(true)
      }
      expect(any).toBe(true)
    }
  })

  it('never holds more particles than count', () => {
    // No trail and no bed, so what is lit is what is alive: two cells a particle.
    for (const mode of ['drift', 'meteors'] as const) {
      for (const count of [1, 5, MAX_STRING_PARTICLES]) {
        const step = rig({ track: 'ring', ringLeds: 300, mode, count, spawn: 1, speed: 0.5, fade: 0, bed: 0 })
        let peak = 0
        for (let i = 0; i < 200; i++) peak = Math.max(peak, lit(step(i % 6 < 3)).length)
        expect(peak).toBeLessThanOrEqual(2 * count)
      }
    }
  })

  it('draws no meteor until the trigger rises, then one with debris', () => {
    const step = rig({ track: 'row', mode: 'meteors', count: 12, spawn: 0, fade: 0, bed: 0 })
    for (let i = 0; i < 5; i++) expect(lit(step(false))).toHaveLength(0)
    expect(lit(step(true)).length).toBeGreaterThan(0)
    // Held high, it does not fire again: the pool empties as the meteor dies.
    let last = 0
    for (let i = 0; i < 120; i++) last = lit(step(true)).length
    expect(last).toBe(0)
  })

  it('keeps the seeded run repeatable and lets the seed change it', () => {
    const frames = (seed: number) => {
      const step = rig({ track: 'ring', ringLeds: 30, count: 6, spawn: 1, seed })
      let last: unknown
      for (let i = 0; i < 30; i++) last = step()
      return JSON.stringify(last)
    }
    expect(frames(7)).toEqual(frames(7))
    expect(frames(7)).not.toEqual(frames(8))
  })

  it('lets drift particles cross the seam: a long run still lights both ends of the track', () => {
    const step = rig({ track: 'row', mode: 'drift', count: 12, spawn: 1, speed: 1, fade: 0 })
    const row = trackIndices('row', W, H, 60)
    const seen = new Set<number>()
    for (let i = 0; i < 400; i++) lit(step()).forEach((c) => seen.add(c))
    expect(seen.has(row[0])).toBe(true)
    expect(seen.has(row[W - 1])).toBe(true)
  })
})

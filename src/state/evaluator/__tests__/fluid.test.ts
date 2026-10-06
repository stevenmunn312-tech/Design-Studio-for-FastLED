import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../graphEvaluator'
import { NODE_LIBRARY } from '../../nodeLibrary'
import {
  FLUID_DYE_MAX, FLUID_VMAX, fluidDye, fluidForces, fluidInject, fluidIterations, fluidPuff, fluidStep, makeFluid,
} from '../fluid'
import type { StudioNode, StudioEdge } from '../../graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [] },
  } as unknown as StudioNode
}
const edge = (id: string, source: string, sh: string, target: string, th: string) =>
  ({ id, source, target, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

const finite = (a: Float32Array) => a.every((x) => Number.isFinite(x))
const max = (a: Float32Array) => a.reduce((m, x) => Math.max(m, x), -Infinity)

describe('fluid solver', () => {
  it('a puff with no other forces spreads symmetrically about its centre', () => {
    const W = 15, H = 15
    const s = makeFluid(W, H)
    fluidPuff(s, 0.5, 0.5)
    for (let i = 0; i < 6; i++) fluidStep(s, 8, 0, 0, 0)
    const at = (x: number, y: number) => s.d[y * W + x]
    for (const [dx, dy] of [[1, 0], [2, 3], [4, 1], [0, 5]]) {
      const ref = at(7 + dx, 7 + dy)
      // Gauss-Seidel sweeps in one direction, so the mirror is close rather than exact.
      for (const mirror of [at(7 - dx, 7 + dy), at(7 + dx, 7 - dy), at(7 - dx, 7 - dy)]) expect(Math.abs(mirror - ref)).toBeLessThan(0.02 * Math.max(1, ref))
    }
  })

  it('dissipation drains the dye by its share each frame, and no more', () => {
    const s = makeFluid(12, 12)
    fluidInject(s, 0.5, 0.5, 0.5)
    s.v.fill(0)
    const before = fluidDye(s)
    fluidStep(s, 8, 0, 0, 0)
    expect(fluidDye(s)).toBeCloseTo(before, 1)
    const mid = fluidDye(s)
    fluidStep(s, 8, 0, 0, 0.1)
    expect(fluidDye(s)).toBeCloseTo(mid * 0.9, 1)
  })

  it('stays finite and bounded under a long, hard drive', () => {
    const s = makeFluid(12, 10)
    for (let i = 0; i < 200; i++) {
      fluidInject(s, (i % 7) / 7, 0.9, 1)
      if (i % 25 === 0) fluidPuff(s, 0.3, 0.3)
      fluidForces(s, null, null, 1)
      fluidStep(s, 20, 0.5, 0.5, 0.01)
    }
    expect(finite(s.u) && finite(s.v) && finite(s.d)).toBe(true)
    expect(max(s.u)).toBeLessThanOrEqual(FLUID_VMAX)
    expect(max(s.d)).toBeLessThanOrEqual(FLUID_DYE_MAX)
    expect(Math.min(...s.d)).toBeGreaterThanOrEqual(-1e-3)
  })

  it('buoyancy lifts dye: its centre of mass moves toward the top', () => {
    const W = 11, H = 21
    const s = makeFluid(W, H)
    fluidInject(s, 0.5, 0.7, 1)
    s.v.fill(0)
    const centre = () => { let m = 0, t = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { m += y * s.d[y * W + x]; t += s.d[y * W + x] } return m / t }
    const start = centre()
    for (let i = 0; i < 30; i++) { fluidForces(s, null, null, 1); fluidStep(s, 10, 0, 0, 0) }
    expect(centre()).toBeLessThan(start - 1)
  })

  it('a force field drives the flow the way it points', () => {
    const W = 8, H = 8
    const s = makeFluid(W, H)
    const right = new Float32Array(W * H).fill(1)
    for (let i = 0; i < 4; i++) { fluidForces(s, right, null, 0); fluidStep(s, 8, 0, 0, 0) }
    expect(s.u.every((x) => x > 0)).toBe(true)
    expect(Math.abs(s.v[10])).toBeLessThan(1e-3)
  })

  it('projection keeps the flow nearly divergence-free', () => {
    const W = 16, H = 16
    const s = makeFluid(W, H)
    fluidPuff(s, 0.4, 0.5)
    fluidStep(s, 20, 0, 0, 0)
    let worst = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const l = y * W + (x - 1 + W) % W, r = y * W + (x + 1) % W, up = ((y - 1 + H) % H) * W + x, dn = ((y + 1) % H) * W + x
      worst = Math.max(worst, Math.abs(s.u[r] - s.u[l] + s.v[dn] - s.v[up]) * 0.5)
    }
    expect(worst).toBeLessThan(0.1)
  })

  it('clamps the solver iterations', () => {
    expect(fluidIterations(1)).toBe(4)
    expect(fluidIterations(99)).toBe(20)
    expect(fluidIterations(NaN)).toBe(4)
  })
})

// Solver state lives in a map keyed by node id, so every test gets its own id.
let run = 0
describe('Fluid node', () => {
  const build = (props: Record<string, unknown>) => {
    const id = `fl-${run++}`
    const nodes = [node(id, 'FluidSim', 'field', props), node('f', 'FieldToFrame', 'field', {}), node('out', 'MatrixOutput', 'output', {})]
    const edges = [edge('a', id, 'field', 'f', 'field'), edge('b', 'f', 'frame', 'out', 'frame')]
    return (tick: number, W = 12, H = 12) => evaluateGraphFull(nodes, edges, tick, W, H).outputs.get(id) as Record<string, Float32Array>
  }

  it('outputs dye and two velocity fields in 0–1, still air at 0.5', () => {
    const at = build({ inject: 0 })
    const o = at(0)
    expect(o.field.length).toBe(144)
    expect(Array.from(o.field).every((x) => x === 0)).toBe(true)
    expect(Array.from(o.velocityX).every((x) => x === 0.5)).toBe(true)
    expect(Array.from(o.velocityY).every((x) => x === 0.5)).toBe(true)
  })

  it('an injection puts dye where it was asked and moves the air', () => {
    const at = build({ inject: 0.8, injectX: 0.25, injectY: 0.5 })
    let o = at(0)
    for (let t = 1; t < 5; t++) o = at(t)
    const col = (x: number) => Array.from({ length: 12 }, (_, y) => o.field[y * 12 + x]).reduce((a, b) => a + b, 0)
    expect(col(3)).toBeGreaterThan(col(9))
    expect(Array.from(o.velocityY).some((x) => x < 0.499)).toBe(true)
    expect(Math.max(...o.field)).toBeLessThanOrEqual(1)
  })

  it('a rising trigger puffs once, then leaves the dye to fade', () => {
    const id = `fl-${run++}`
    const cmp = (high: boolean) => node('c', 'Compare', 'math', { a: high ? 1 : 0, b: 0.5 })
    const nodes = (high: boolean) => [node(id, 'FluidSim', 'field', { inject: 0, dissipation: 0.2 }), cmp(high), node('f', 'FieldToFrame', 'field', {}), node('out', 'MatrixOutput', 'output', {})]
    const edges = [edge('a', id, 'field', 'f', 'field'), edge('b', 'f', 'frame', 'out', 'frame'), edge('t', 'c', 'result', id, 'trigger')]
    const sum = (tick: number, high: boolean) => Array.from((evaluateGraphFull(nodes(high), edges, tick, 12, 12).outputs.get(id) as Record<string, Float32Array>).field).reduce((a, b) => a + b, 0)
    expect(sum(0, false)).toBe(0)
    const puff = sum(1, true)
    expect(puff).toBeGreaterThan(0)
    const held = sum(2, true)
    expect(held).toBeLessThan(puff)
  })

  it('restarts clean when the canvas changes size', () => {
    const at = build({ inject: 0.8 })
    at(0); at(1)
    expect(at(2, 8, 6).field.length).toBe(48)
  })
})

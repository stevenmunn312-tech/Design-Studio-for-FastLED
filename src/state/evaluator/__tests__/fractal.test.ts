import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../graphEvaluator'
import { NODE_LIBRARY } from '../../nodeLibrary'
import { FRACTAL_TYPES, fractalIterations, fractalSampler, fractalZoom, type FractalParams } from '../fractal'
import { generateCpp } from '../../../codegen/cppGenerator'
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

let run = 0
function field(props: Record<string, unknown>, W = 16, H = 16): Float32Array {
  const id = `fr-${run++}`
  const nodes = [node(id, 'FractalField', 'field', props), node('f', 'FieldToFrame', 'field', {}), node('out', 'MatrixOutput', 'output', {})]
  const edges = [edge('a', id, 'field', 'f', 'field'), edge('b', 'f', 'frame', 'out', 'frame')]
  return evaluateGraphFull(nodes, edges, 0, W, H).outputs.get(id)!.field as Float32Array
}
const base: FractalParams = { type: 'julia', cRe: -0.8, cIm: 0.156, depth: 0, centerX: 0, centerY: 0, rotation: 0, iterations: 32, smooth: true }
const grid = (p: FractalParams, W = 24, H = 24) => {
  const s = fractalSampler(p, W, H)
  return Array.from({ length: W * H }, (_, i) => s(i % W, Math.floor(i / W)))
}
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9)

describe('fractal sampler', () => {
  it('stays in 0–1 for every type', () => {
    for (const type of FRACTAL_TYPES) {
      for (const v of grid({ ...base, type })) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
  it('has an inside and an outside for the escape-time types', () => {
    for (const type of ['julia', 'mandelbrot', 'burningShip'] as const) {
      const g = grid({ ...base, type, depth: type === 'julia' ? 0 : Math.log2(0.8) })
      expect(g.some((v) => v === 0)).toBe(true)
      expect(g.some((v) => v > 0)).toBe(true)
    }
  })
  it('Newton settles on all three roots, one third of the range each', () => {
    const g = grid({ ...base, type: 'newton', iterations: 40 }, 48, 48)
    const thirds = new Set(g.filter((v) => v > 0).map((v) => Math.min(2, Math.floor(v * 3))))
    expect(thirds.size).toBe(3)
  })
  it('a Mandelbrot centre pixel is inside the set', () => {
    const g = fractalSampler({ ...base, type: 'mandelbrot', centerX: 0.5, centerY: 0 }, 1, 1)
    expect(g(0, 0)).toBe(0)
  })
  it('rotation by 180 degrees mirrors the Julia set through its centre', () => {
    const W = 15, H = 15
    const a = fractalSampler(base, W, H), b = fractalSampler({ ...base, rotation: 180 }, W, H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) expect(b(x, y)).toBeCloseTo(a(W - 1 - x, H - 1 - y), 6)
  })
  it('depth, centre and c each change the picture', () => {
    const ref = grid(base)
    expect(same(ref, grid({ ...base, depth: 2 }))).toBe(false)
    expect(same(ref, grid({ ...base, centerX: 0.3 }))).toBe(false)
    expect(same(ref, grid({ ...base, cRe: 0.3, cIm: 0.5 }))).toBe(false)
    expect(same(ref, grid({ ...base, rotation: 33 }))).toBe(false)
  })
  it('smooth removes the banding: more distinct values than the plain escape count', () => {
    const smooth = new Set(grid({ ...base, smooth: true }, 40, 40)).size
    const plain = new Set(grid({ ...base, smooth: false }, 40, 40)).size
    expect(smooth).toBeGreaterThan(plain)
  })
  it('caps iterations to the documented range', () => {
    expect(fractalIterations(1)).toBe(8)
    expect(fractalIterations(1000)).toBe(64)
    expect(fractalIterations(NaN)).toBe(8)
    expect(same(grid({ ...base, iterations: 500 }), grid({ ...base, iterations: 64 }))).toBe(true)
  })
})

describe('Fractal node', () => {
  it('outputs a canvas-sized field that follows its ports', () => {
    const f = field({ fractalType: 'julia' }, 12, 10)
    expect(f.length).toBe(120)
    expect(Array.from(field({ fractalType: 'julia', cRe: 0.3 }, 12, 10))).not.toEqual(Array.from(f))
  })
  it('matches the sampler for each type', () => {
    for (const type of FRACTAL_TYPES) {
      const f = field({ fractalType: type }, 9, 7)
      const s = fractalSampler({ ...base, type }, 9, 7)
      for (let i = 0; i < f.length; i++) expect(f[i]).toBeCloseTo(s(i % 9, Math.floor(i / 9)), 5)
    }
  })
})

describe('Fractal Field depth', () => {
  it('magnifies by doublings, clamped to a quarter and 64 times', () => {
    expect(fractalZoom(0)).toBe(1)
    expect(fractalZoom(1)).toBe(2)
    expect(fractalZoom(6)).toBe(64)
    expect(fractalZoom(9)).toBe(64)
    expect(fractalZoom(-5)).toBe(0.25)
    // Each step of depth is the same ratio, so a steady ramp flies in evenly.
    expect(fractalZoom(3.5) / fractalZoom(2.5)).toBeCloseTo(fractalZoom(1) / fractalZoom(0), 10)
  })

  it('emits the same doubling in the sketch', () => {
    const def = NODE_LIBRARY.find((d) => d.type === 'FractalField')!
    const node = { id: 'fr', type: 'studioNode', position: { x: 0, y: 0 }, data: {
      label: 'Fractal', nodeType: 'FractalField', category: 'field', properties: { ...def.defaultProperties, depth: 2.5 },
      inputs: def.inputs, outputs: def.outputs,
    } } as unknown as StudioNode
    const cpp = generateCpp([node], [], {}, { deferPruning: true })
    expect(cpp).toContain('float _zm=exp2f(constrain(2.5,-2.0f,6.0f))')
  })
})

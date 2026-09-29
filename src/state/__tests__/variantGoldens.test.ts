import { describe, expect, it } from 'vitest'
import { evaluateGraph } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { fireSmokeDim } from '../evaluator/fireSmoke'
import { luminovaEmitters, LUMINOVA_MAX } from '../evaluator/luminova'
import type { StudioNode, StudioEdge } from '../graphStore'

// Pride 2015 gains a palette port, Fire a smoke style and Particles a luminova
// mode. Each new choice defaults to the old behaviour, and the golden hashes
// below were taken from the frames before the variants existed, so a saved
// graph that does not use them cannot change.

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [] },
  } as unknown as StudioNode
}
const edge = (id: string, source: string, sh: string, target: string, th: string) =>
  ({ id, source, target, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

type Frame = { r: number; g: number; b: number }[][]

/** FNV-1a over every channel of a frame. */
function hash(frame: Frame): string {
  let h = 2166136261
  for (const row of frame) for (const p of row) for (const c of [p.r, p.g, p.b]) { h ^= c; h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(16)
}

/** The frame after `ticks` evaluations of one pattern node on a 12×10 canvas. */
function after(id: string, type: string, props: Record<string, unknown>, ticks: number, extra: StudioNode[] = [], extraEdges: StudioEdge[] = []): Frame {
  const nodes = [node(id, type, 'pattern', props), node('out', 'MatrixOutput', 'output', {}), ...extra]
  const edges = [edge('e', id, 'frame', 'out', 'frame'), ...extraEdges]
  let f: Frame | null = null
  for (let i = 0; i <= ticks; i++) f = evaluateGraph(nodes, edges, i * 3, 12, 10)
  return f!
}
const total = (f: Frame) => f.flat().reduce((a, p) => a + p.r + p.g + p.b, 0)
const lit = (f: Frame) => f.flat().filter((p) => p.r || p.g || p.b).length

describe('variant defaults are unchanged', () => {
  it('Pride 2015 without a palette wire', () => {
    expect(hash(after('gold-pride', 'Pride2015', {}, 20))).toBe('79c6302e')
  })
  it('Fire in its default style, and with the style named', () => {
    expect(hash(after('gold-fire', 'Fire', { seed: 7 }, 25))).toBe('e8f544')
    expect(hash(after('gold-fire-named', 'Fire', { seed: 7, fireStyle: 'classic' }, 25))).toBe('e8f544')
  })
  it('Particles fountain', () => {
    expect(hash(after('gold-part', 'Particles', { seed: 7, particleType: 'fountain' }, 25))).toBe('a08a69ca')
  })
})

describe('Pride 2015 with a palette', () => {
  const wired = (id: string, palette: string) => after(id, 'Pride2015', {}, 20,
    [node('sel', 'PaletteSelector', 'color', { palette })], [edge('p', 'sel', 'palette', id, 'paletteIn')])
  it('reads its colours from the wired palette instead of the colour wheel', () => {
    const ocean = wired('pride-ocean', 'ocean'), lava = wired('pride-lava', 'lava')
    const plain = after('pride-plain', 'Pride2015', {}, 20)
    expect(hash(ocean)).not.toBe(hash(plain))
    expect(hash(ocean)).not.toBe(hash(lava))
    const blueish = ocean.flat().reduce((a, p) => a + p.b - p.r, 0)
    const redish = lava.flat().reduce((a, p) => a + p.r - p.b, 0)
    expect(blueish).toBeGreaterThan(0)
    expect(redish).toBeGreaterThan(0)
  })
  it('keeps the breathing brightness wave', () => {
    const f = wired('pride-wave', 'rainbow').flat()
    const peak = Math.max(...f.map((p) => p.r + p.g + p.b)), trough = Math.min(...f.map((p) => p.r + p.g + p.b))
    expect(peak).toBeGreaterThan(trough * 1.3)
  })
})

describe('Fire smoke', () => {
  it('dims the flame but never lights anything the classic style leaves dark', () => {
    const classic = after('fire-c', 'Fire', { seed: 3, fireStyle: 'classic' }, 30)
    const smoke = after('fire-s', 'Fire', { seed: 3, fireStyle: 'smoke' }, 30)
    expect(total(smoke)).toBeLessThan(total(classic))
    expect(total(smoke)).toBeGreaterThan(0)
    expect(lit(smoke)).toBeLessThanOrEqual(lit(classic))
  })
  it('drifts with time: the same heat looks different a moment later', () => {
    const a = after('fire-t1', 'Fire', { seed: 3, fireStyle: 'smoke', cooling: 0, sparking: 255 }, 4)
    const b = after('fire-t2', 'Fire', { seed: 3, fireStyle: 'smoke', cooling: 0, sparking: 255 }, 9)
    expect(hash(a)).not.toBe(hash(b))
  })
  it('dims by up to its depth and no more', () => {
    expect(fireSmokeDim(0)).toBe(1)
    expect(fireSmokeDim(1)).toBeCloseTo(0.35, 9)
    expect(fireSmokeDim(2)).toBeCloseTo(0.35, 9)
    expect(fireSmokeDim(-1)).toBe(1)
  })
})

describe('Particles luminova', () => {
  const particles = (id: string, props: Record<string, unknown>, ticks: number) =>
    after(id, 'Particles', { seed: 4, particleType: 'luminova', ...props }, ticks)
  it('draws steered trails that build up and then hold a steady amount of light', () => {
    const early = lit(particles('lum-a', {}, 2)), later = lit(particles('lum-b', {}, 40))
    expect(early).toBeGreaterThan(0)
    expect(later).toBeGreaterThan(early)
  })
  it('more emitters light more, and the count is capped', () => {
    const few = total(particles('lum-few', { count: 2 }, 40)), many = total(particles('lum-many', { count: 8 }, 40))
    expect(many).toBeGreaterThan(few)
    expect(luminovaEmitters(500)).toBe(LUMINOVA_MAX)
    expect(luminovaEmitters(0)).toBe(2)
    expect(hash(particles('lum-cap1', { count: 200 }, 30))).toBe(hash(particles('lum-cap2', { count: 8 }, 30)))
  })
  it('is deterministic under a seed', () => {
    expect(hash(particles('lum-d1', {}, 25))).toBe(hash(particles('lum-d2', {}, 25)))
  })
})

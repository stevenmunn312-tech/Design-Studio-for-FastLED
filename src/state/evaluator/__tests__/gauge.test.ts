import { describe, expect, it } from 'vitest'
import { evaluateGraph } from '../../graphEvaluator'
import { NODE_LIBRARY } from '../../nodeLibrary'
import { ringSampleMap } from '../../output/ledOutputForm'
import { gaugeCells, gaugeCoverage, gaugeMarks, gaugeQ, stepGaugePeak, type GaugeLayout, type GaugePeak } from '../gauge'
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
function gauge(props: Record<string, unknown>, W = 10, H = 4, t = 0) {
  const id = `g-${run++}`
  return evaluateGraph([node(id, 'Gauge', 'pattern', { palette: 'rainbow', ...props }), node('out', 'MatrixOutput', 'output', {})], [edge('e', id, 'frame', 'out', 'frame')], t * 60, W, H)!
}
type Frame = { r: number; g: number; b: number }[][]
const lit = (f: Frame) => f.flatMap((row, y) => row.map((p, x) => (p.r || p.g || p.b ? [x, y] : null)).filter(Boolean) as number[][])
const layout = (o: Partial<GaugeLayout> = {}): GaugeLayout => ({ style: 'bar', direction: 'right', thickness: 1, ringLeds: 60, arcStart: 0, arcSweep: 270, ...o })

describe('gauge cells', () => {
  it('a bar has one cell per canvas pixel, and a thin bar keeps the middle rows', () => {
    expect(gaugeCells(layout(), 10, 4).length).toBe(40)
    const thin = gaugeCells(layout({ thickness: 0.01 }), 10, 4)
    expect(new Set(thin.map((c) => Math.floor(c.idx / 10))).size).toBe(2)
    expect(gaugeCells(layout({ thickness: 0 }), 10, 1).length).toBe(10)
  })
  it('a ring covers exactly the pixels ringSampleMap reads', () => {
    for (const leds of [12, 40]) {
      const cells = gaugeCells(layout({ style: 'ring', ringLeds: leds }), 16, 16)
      expect(cells.map((c) => c.idx)).toEqual(ringSampleMap(leds, 0, 'cw', 16, 16))
    }
  })
  it('an arc keeps only the cells inside its sweep, starting where asked', () => {
    const arc = gaugeCells(layout({ style: 'arc', ringLeds: 36, arcStart: 90, arcSweep: 180 }), 16, 16)
    expect(arc.length).toBe(18)
    expect(arc[0].start).toBe(0)
    expect(Math.max(...arc.map((c) => c.start + c.span))).toBeCloseTo(1, 9)
  })
})

describe('gauge coverage', () => {
  const cells = gaugeCells(layout(), 10, 1)
  it('fills left to right in proportion to the value, with a partial edge cell', () => {
    const cov = (v: number) => cells.map((c) => gaugeCoverage('bar', c, v, 0))
    expect(cov(0).every((c) => c === 0)).toBe(true)
    expect(cov(1).every((c) => Math.abs(c - 1) < 1e-9)).toBe(true)
    expect(cells.every((c) => gaugeQ(gaugeCoverage('bar', c, 1, 0)) === 255)).toBe(true)
    expect(cov(0.35).map((c) => Math.round(c * 100) / 100)).toEqual([1, 1, 1, 0.5, 0, 0, 0, 0, 0, 0])
  })
  it('segments light whole blocks', () => {
    const cov = (v: number) => cells.map((c) => gaugeCoverage('bar', c, v, 5))
    expect(cov(0.5).filter((c) => c === 1).length).toBe(6)
    expect(cov(0.2).filter((c) => c === 1).length).toBe(2)
    expect(cov(0.5).every((c) => c === 0 || c === 1)).toBe(true)
  })
  it('a dot lights the two cells around its position by share', () => {
    const cov = cells.map((c) => gaugeCoverage('dot', c, 0.5, 0))
    expect(cov.reduce((a, c) => a + c, 0)).toBeCloseTo(1, 9)
    expect(cov.filter((c) => c > 0).length).toBe(2)
  })
})

describe('peak marker', () => {
  const fresh = (): GaugePeak => ({ peak: 0, stamp: 0, last: 0 })
  it('holds the highest value for the hold time, then falls to the value', () => {
    const s = fresh()
    expect(stepGaugePeak(s, 0.2, 1, 0)).toBe(0.2)
    expect(stepGaugePeak(s, 0.9, 1, 0.1)).toBe(0.9)
    expect(stepGaugePeak(s, 0.3, 1, 0.5)).toBe(0.9)
    expect(stepGaugePeak(s, 0.3, 1, 1.05)).toBe(0.9)
    const later = stepGaugePeak(s, 0.3, 1, 1.35)
    expect(later).toBeLessThan(0.9)
    expect(later).toBeGreaterThan(0.3)
    expect(stepGaugePeak(s, 0.3, 1, 5)).toBe(0.3)
  })
  it('is off when the hold is 0', () => {
    expect(stepGaugePeak(fresh(), 0.7, 0, 3)).toBe(-1)
  })
  it('marks exactly one cell of a bar, including at full scale', () => {
    const cells = gaugeCells(layout(), 10, 1)
    expect(cells.filter((c) => gaugeMarks(c, 0.45)).length).toBe(1)
    expect(cells.filter((c) => gaugeMarks(c, 1)).length).toBe(1)
  })
})

describe('Gauge node', () => {
  it('fills a bar in proportion to the value', () => {
    expect(new Set(lit(gauge({ value: 0.5 }, 10, 1)).map((c) => c[0]))).toEqual(new Set([0, 1, 2, 3, 4]))
    expect(lit(gauge({ value: 0 })).length).toBe(0)
    expect(lit(gauge({ value: 1 }, 10, 4)).length).toBe(40)
  })
  it('runs in each direction from its own edge', () => {
    const at = (direction: string) => lit(gauge({ value: 0.3, direction }, 10, 10))
    expect(Math.max(...at('right').map((c) => c[0]))).toBeLessThan(5)
    expect(Math.min(...at('left').map((c) => c[0]))).toBeGreaterThan(4)
    expect(Math.max(...at('down').map((c) => c[1]))).toBeLessThan(5)
    expect(Math.min(...at('up').map((c) => c[1]))).toBeGreaterThan(4)
  })
  it('a ring at full value lights only pixels on the ring', () => {
    const f = gauge({ gaugeStyle: 'ring', ringLeds: 24, value: 1 }, 16, 16)
    const ring = new Set(ringSampleMap(24, 0, 'cw', 16, 16))
    for (const [x, y] of lit(f)) expect(ring.has(y * 16 + x)).toBe(true)
    expect(lit(f).length).toBe(ring.size)
  })
  it('draws over a base frame and leaves the rest of it alone', () => {
    const id = 'gb', sc = 'sc'
    const nodes = [node(id, 'Gauge', 'pattern', { value: 0.5, palette: 'rainbow' }), node(sc, 'SolidColor', 'pattern', { r: 0, g: 0, b: 200 }), node('out', 'MatrixOutput', 'output', {})]
    const f = evaluateGraph(nodes, [edge('e', id, 'frame', 'out', 'frame'), edge('b', sc, 'frame', id, 'base')], 0, 10, 1)!
    expect(f[0][9]).toEqual({ r: 0, g: 0, b: 200 })
    expect(f[0][0]).not.toEqual({ r: 0, g: 0, b: 200 })
  })
  it('holds a peak marker above a lower value', () => {
    const id = `gp-${run++}`
    const build = (v: number) => [node(id, 'Gauge', 'pattern', { value: v, peakHold: 5, palette: 'rainbow' }), node('out', 'MatrixOutput', 'output', {})]
    const edges = [edge('e', id, 'frame', 'out', 'frame')]
    evaluateGraph(build(0.9), edges, 0, 10, 1)
    const f = evaluateGraph(build(0.2), edges, 60, 10, 1)!
    expect(lit(f).map((c) => c[0])).toContain(9)
  })
})

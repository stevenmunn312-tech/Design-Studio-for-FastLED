import { describe, expect, it } from 'vitest'
import {
  catenaryPoints,
  parsePositionNumbers,
  positionsFixedFor,
  positionTap,
  stringPositions,
  usesPositions,
} from '../stringPositions'
import { outputCanvasDims } from '../ledOutputForm'
import { outputRoutes, routeFrame } from '../outputRouting'
import type { StudioNode } from '../../graphStore'

const base = { form: 'strip', stripLayout: 'positions', ledCount: 5, positionsWidth: 8, positionsHeight: 4 }

function output(props: Record<string, unknown>): StudioNode {
  return {
    id: 'o', type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: 'String', nodeType: 'MatrixOutput', category: 'output', properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

describe('positioned string layout', () => {
  it('applies to a string that chose positions, and to nothing else', () => {
    expect(usesPositions(base)).toBe(true)
    expect(usesPositions({ ...base, stripLayout: 'line' })).toBe(false)
    expect(usesPositions({ ...base, form: 'ring' })).toBe(false)
    expect(stringPositions({ ...base, form: 'matrix' })).toBeNull()
  })

  it('reads its own canvas, not the string as a row', () => {
    expect(outputCanvasDims(base)).toEqual({ width: 8, height: 4 })
    expect(outputCanvasDims({ form: 'strip', ledCount: 30 })).toEqual({ width: 30, height: 1 })
  })

  it('parses numbers with any separators and ignores the rest', () => {
    expect(parsePositionNumbers('1,2; 3.5 -4\n.5, x 6e1')).toEqual([1, 2, 3.5, -4, 0.5, 60])
    expect(parsePositionNumbers(undefined)).toEqual([])
  })

  it('takes a custom list, clamps it to the canvas and bakes 1/256 fixed point', () => {
    const p = stringPositions({ ...base, positionsPreset: 'custom', positions: '1,1 2.5,1.5 3,2 4,3 99,-5 7,7' })!
    expect(p.source).toBe('custom')
    expect(p.points).toHaveLength(5)
    expect(p.points[4]).toEqual([8, 0])
    expect(p.fixed.slice(2, 4)).toEqual([640, 384])
    expect(p.fixed).toHaveLength(10)
  })

  it('falls back to a centred row when the custom list is short, never to nothing', () => {
    const p = stringPositions({ ...base, positionsPreset: 'custom', positions: '1,1 2,2' })!
    expect(p.source).toBe('fallback')
    expect(p.points).toHaveLength(5)
    expect(p.points.every(([, y]) => y === 2)).toBe(true)
    const xs = p.points.map(([x]) => x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })

  it('hangs the catenary from both ends and lowest in the middle', () => {
    const pts = catenaryPoints(9, 32, 16)
    expect(pts[0][1]).toBeCloseTo(0.5, 9)
    expect(pts[8][1]).toBeCloseTo(0.5, 9)
    expect(pts[4][1]).toBeCloseTo(15.5, 9)
    expect(pts[0][0]).toBeCloseTo(0.5, 9)
    expect(pts[8][0]).toBeCloseTo(31.5, 9)
    for (let i = 1; i <= 4; i++) expect(pts[i][1]).toBeGreaterThan(pts[i - 1][1])
  })

  it('reads a pixel centre exactly and blends between two', () => {
    expect(positionTap(128, 4)).toEqual({ i0: 0, i1: 1, f: 0 })
    expect(positionTap(128 + 256, 4)).toEqual({ i0: 1, i1: 2, f: 0 })
    expect(positionTap(128 + 64, 4)).toEqual({ i0: 0, i1: 1, f: 0.25 })
    expect(positionTap(0, 4)).toEqual({ i0: 0, i1: 1, f: 0 })
    expect(positionTap(99999, 4)).toEqual({ i0: 3, i1: 3, f: 0 })
  })

  it('scales the table when the route reads a shared canvas of another size', () => {
    const p = stringPositions({ ...base, positionsPreset: 'catenary' })!
    expect(positionsFixedFor(p, 8, 4)).toBe(p.fixed)
    const doubled = positionsFixedFor(p, 16, 8)
    expect(doubled[0]).toBe(Math.round(p.fixed[0] * 2))
    expect(doubled[1]).toBe(Math.round(p.fixed[1] * 2))
  })

  it('lights each LED from the pixels under it in the preview', () => {
    const [route] = outputRoutes([output({
      ...base, ledCount: 3, positionsPreset: 'custom', positions: '0.5,0.5 2.5,1.5 3.5,3.5',
    })])
    const px = (v: number) => ({ r: v, g: v, b: v })
    // A 4 x 4 frame whose value is its column * 10 + row.
    const frame = Array.from({ length: 4 }, (_, y) => Array.from({ length: 8 }, (_, x) => px(x * 10 + y)))
    const out = routeFrame(frame, route, 8, 4)!
    expect(out).toHaveLength(1)
    expect(out[0]).toHaveLength(3)
    // Pixel centres: exact source pixels.
    expect(out[0][0].r).toBeCloseTo(0, 6)
    expect(out[0][1].r).toBeCloseTo(21, 6)
    expect(out[0][2].r).toBeCloseTo(33, 6)
  })
})

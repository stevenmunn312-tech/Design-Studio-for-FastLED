import { describe, expect, it } from 'vitest'
import { shapeLayoutFor } from '../../Hardware/ledPreviewGeometry'
import { outputRoutes } from '../../../state/output/outputRouting'
import type { StudioNode } from '../../../state/graphStore'

function output(properties: Record<string, unknown>): StudioNode {
  return {
    id: 'out', type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: 'out', nodeType: 'MatrixOutput', category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}
const route = (properties: Record<string, unknown>) => outputRoutes([output(properties)])[0]

describe('shapeLayoutFor', () => {
  it('leaves a matrix and a straight string to the row-major canvas', () => {
    expect(shapeLayoutFor(route({ form: 'matrix', width: 16, height: 16 }))).toBeNull()
    expect(shapeLayoutFor(route({ form: 'strip', ledCount: 60 }))).toBeNull()
  })

  it('lays a ring out on a square about N / pi cells across, one emitter per LED in wire order', () => {
    const layout = shapeLayoutFor(route({ form: 'ring', ledCount: 24 }))!
    expect(layout.kind).toBe('ring')
    expect(layout.width).toBeCloseTo(24 / Math.PI + 1, 6)
    expect(layout.height).toBe(layout.width)
    expect(layout.emitters).toHaveLength(24)
    // 0 degrees is 12 o'clock, clockwise positive — the same angles the ring's
    // sample map uses, so the LED drawn is the LED the frame was sampled for.
    const [first, second] = layout.emitters
    expect(first.x).toBeCloseTo(layout.width / 2, 6)
    expect(first.y).toBeCloseTo(0.5, 6)
    expect(second.x).toBeGreaterThan(first.x)
    expect(layout.wire).toBe(false)
  })

  it('turns a counter-clockwise ring the other way', () => {
    const cw = shapeLayoutFor(route({ form: 'ring', ledCount: 12 }))!
    const ccw = shapeLayoutFor(route({ form: 'ring', ledCount: 12, ringDirection: 'ccw' }))!
    expect(ccw.emitters[1].x).toBeCloseTo(cw.width - cw.emitters[1].x, 6)
  })

  it('shapes a corkscrew by its turns and its millimetre proportions, dimming the far side', () => {
    const layout = shapeLayoutFor(route({
      form: 'corkscrew', ledCount: 120, corkscrewTurns: 6, corkscrewDiameterMm: 100, corkscrewHeightMm: 300,
    }))!
    expect(layout.kind).toBe('corkscrew')
    expect(layout.width).toBeCloseTo(120 / (6 * Math.PI) + 1, 6)
    expect(layout.height).toBeCloseTo(layout.width * 3, 6)
    expect(layout.emitters).toHaveLength(120)
    expect(layout.wire).toBe(true)
    const opacities = layout.emitters.map((emitter) => emitter.opacity)
    expect(Math.min(...opacities)).toBeLessThan(0.5)
    expect(Math.max(...opacities)).toBeCloseTo(1, 6)
    expect(layout.emitters.every((emitter) => emitter.x >= 0 && emitter.x <= layout.width && emitter.y >= 0 && emitter.y <= layout.height)).toBe(true)
  })

  it('puts a single-LED corkscrew at the top, where the firmware sample map reads it', () => {
    const layout = shapeLayoutFor(route({
      form: 'corkscrew', ledCount: 1, corkscrewTurns: 6, corkscrewDiameterMm: 100, corkscrewHeightMm: 300,
    }))!
    expect(layout.emitters).toHaveLength(1)
    expect(layout.emitters[0].y).toBeLessThan(layout.height * 0.1)
  })

  it('draws a positioned string at its own canvas coordinates, joined by its wire', () => {
    const layout = shapeLayoutFor(route({
      form: 'strip', stripLayout: 'positions', ledCount: 3, positionsWidth: 8, positionsHeight: 4,
      positionsPreset: 'custom', positions: '0.5,0.5 2.5,1.5 3.5,3.5',
    }))!
    expect(layout.kind).toBe('positions')
    expect([layout.width, layout.height]).toEqual([8, 4])
    expect(layout.emitters.map((emitter) => [emitter.x, emitter.y])).toEqual([[0.5, 0.5], [2.5, 1.5], [3.5, 3.5]])
    expect(layout.wire).toBe(true)
  })
})

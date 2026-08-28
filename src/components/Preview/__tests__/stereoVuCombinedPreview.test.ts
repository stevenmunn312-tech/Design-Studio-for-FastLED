import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../../../state/graphStore'
import { combinedStereoVuFixture, stereoVuRailSegments } from '../stereoVuCombinedPreview'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

describe('combined Stereo VU preview', () => {
  it('flanks only the output selected by the fixture target', () => {
    const nodes = [
      node('out-a', 'MatrixOutput'),
      node('out-b', 'MatrixOutput'),
      node('vu', 'StereoVuMeter', { targetOutputId: 'out-b', swapChannels: true }),
    ]
    expect(combinedStereoVuFixture(nodes, 'out-a')).toBeNull()
    expect(combinedStereoVuFixture(nodes, 'out-b')).toEqual({ id: 'vu', swapChannels: true, ledCount: 16, standalone: false })
  })

  it('shows the meter by itself when the project has no LED output', () => {
    const nodes = [node('vu', 'StereoVuMeter', { ledCount: 24 })]
    expect(combinedStereoVuFixture(nodes, '')).toEqual({ id: 'vu', swapChannels: false, ledCount: 24, standalone: true })
  })

  it('stays standalone when an unrelated LED String exists', () => {
    const nodes = [
      node('strip', 'MatrixOutput', { form: 'strip', ledCount: 60 }),
      node('vu', 'StereoVuMeter', { targetOutputId: '', ledCount: 16 }),
    ]
    expect(combinedStereoVuFixture(nodes, 'strip')?.standalone).toBe(true)
  })

  it('keeps logical pixel zero at the visual bottom for any string length', () => {
    const pixels = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
    ]
    const segments = stereoVuRailSegments(pixels, 90)
    expect(segments[0].y).toBeGreaterThan(segments[1].y)
    expect(segments[1].y).toBeGreaterThan(segments[2].y)
    expect(segments.map((segment) => segment.color)).toEqual(pixels)
  })

  it('collapses long strings into the available height without dropping pixels', () => {
    const pixels = Array.from({ length: 240 }, () => ({ r: 1, g: 2, b: 3 }))
    const segments = stereoVuRailSegments(pixels, 120)
    expect(segments).toHaveLength(240)
    expect(segments.every((segment) => segment.height > 0)).toBe(true)
    expect(Math.min(...segments.map((segment) => segment.y))).toBeGreaterThanOrEqual(0)
  })
})

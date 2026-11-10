import { describe, expect, it } from 'vitest'
import {
  RAM_HEAVY_BYTES_PER_LED,
  RAM_MEDIUM_BYTES_PER_LED,
  RENDER_WEIGHT_HEAVY,
  RENDER_WEIGHT_MEDIUM,
  renderWeightEdges,
  formatRamBytes,
  formatRenderWeight,
  meanFrameMs,
  patternCostBand,
  patternRamEstimate,
  ramBand,
  renderCostFromTiming,
  renderWeightBand,
  usPerLed,
  type PatternRamEstimate,
  type PatternRenderCost,
} from '../patternCost'
import type { SavedPattern } from '../patternLibrary'
import type { StudioEdge, StudioNode } from '../../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

/** A chain of frame nodes ending in the pattern's Group Output. */
function chain(id: string, nodes: StudioNode[]): SavedPattern {
  const all = [...nodes, node('go', 'GroupOutput')]
  return {
    id, name: id, createdAt: 0, inputs: [], outputs: [],
    subgraph: {
      nodes: all,
      edges: nodes.map((n, i) => ({
        id: `e${i}`, source: n.id, sourceHandle: 'frame', target: all[i + 1].id, targetHandle: 'frame',
      }) as StudioEdge),
    },
  }
}

const ram = (bytesPerLed: number): PatternRamEstimate =>
  ({ keptBytes: 0, scratchBytes: bytesPerLed * 256, totalBytes: bytesPerLed * 256, w: 16, h: 16, bytesPerLed })
const render = (relative: number, gridW = 32, gridH = 32): PatternRenderCost =>
  ({ usPerLed: relative, relative, gridW, gridH, frames: 42 })

describe('render timing', () => {
  it('averages coarse timer ticks instead of calling a light pattern free', () => {
    // A browser that rounds performance.now() to 0.1 ms reports a 0.02 ms
    // frame as zero four times in five. A median of that is zero.
    const coarse = Array.from({ length: 50 }, (_, i) => (i % 5 === 0 ? 0.1 : 0))
    expect(meanFrameMs(coarse)).toBeCloseTo(0.02, 6)
  })

  it('sets a stall aside without touching ordinary variation', () => {
    const steady = [1, 1.2, 0.9, 1.1, 1, 1.3, 0.8, 1]
    expect(meanFrameMs([...steady, 60])).toBeCloseTo(meanFrameMs(steady), 6)
    // Twice the usual is the pattern having a busier frame, not a stall.
    expect(meanFrameMs([...steady, 2])).toBeGreaterThan(meanFrameMs(steady))
  })

  it('normalises per LED so two grids can be compared', () => {
    expect(usPerLed([1.024], 32, 32)).toBeCloseTo(1, 6)
    expect(usPerLed([0.256], 16, 16)).toBeCloseTo(1, 6)
  })

  it('weighs a run against the reference, and declines when there is none', () => {
    const cost = renderCostFromTiming({ frameMs: [0.512, 0.512] }, 16, 16, 1)!
    expect(cost.usPerLed).toBeCloseTo(2, 6)
    expect(cost.relative).toBeCloseTo(2, 6)
    expect(cost).toMatchObject({ gridW: 16, gridH: 16, frames: 2 })
    expect(renderCostFromTiming({ frameMs: [] }, 16, 16, 1)).toBeUndefined()
    expect(renderCostFromTiming({ frameMs: [1] }, 16, 16, 0)).toBeUndefined()
  })
})

describe('cost bands', () => {
  it('bands render weight at its two edges', () => {
    const { medium, heavy } = renderWeightEdges(32, 32)
    expect(renderWeightBand(render(medium - 0.01))).toBe('light')
    expect(renderWeightBand(render(medium))).toBe('medium')
    expect(renderWeightBand(render(heavy - 0.01))).toBe('medium')
    expect(renderWeightBand(render(heavy))).toBe('heavy')
  })

  it('allows for fixed per-frame work on a small grid, and settles on a large one', () => {
    // The same multiple that is heavy on a 32x32 matrix is ordinary on a
    // 64-LED string, where every pattern's fixed work looms larger.
    expect(renderWeightBand(render(4.5, 32, 32))).toBe('heavy')
    expect(renderWeightBand(render(4.5, 32, 2))).toBe('medium')
    expect(renderWeightBand(render(9, 32, 2))).toBe('heavy')
    const large = renderWeightEdges(256, 256)
    expect(large.medium).toBeCloseTo(RENDER_WEIGHT_MEDIUM, 1)
    expect(large.heavy).toBeCloseTo(RENDER_WEIGHT_HEAVY, 1)
  })

  it('bands RAM per LED, so the band survives a change of canvas', () => {
    expect(ramBand(ram(RAM_MEDIUM_BYTES_PER_LED))).toBe('light')
    expect(ramBand(ram(RAM_MEDIUM_BYTES_PER_LED + 1))).toBe('medium')
    expect(ramBand(ram(RAM_HEAVY_BYTES_PER_LED + 1))).toBe('heavy')
    const fluid = chain('fluid', [node('fs', 'FluidSim')])
    expect(ramBand(patternRamEstimate(fluid, { w: 8, h: 8 }))).toBe(ramBand(patternRamEstimate(fluid, { w: 32, h: 32 })))
  })

  it('takes the heavier of the two, and RAM alone before a pattern is judged', () => {
    expect(patternCostBand(render(1), ram(40))).toBe('heavy')
    expect(patternCostBand(render(5), ram(3))).toBe('heavy')
    expect(patternCostBand(render(2), ram(3))).toBe('medium')
    expect(patternCostBand(undefined, ram(3))).toBe('light')
    expect(patternCostBand(undefined, ram(40))).toBe('heavy')
  })
})

describe('patternRamEstimate', () => {
  it('states the canvas it was made for and scales with it', () => {
    const trails = chain('trails', [node('sc', 'SolidColor'), node('tr', 'Trails')])
    const small = patternRamEstimate(trails, { w: 4, h: 4 })
    // Trails keeps its own frame; SolidColor's is scratch.
    expect(small).toMatchObject({ w: 4, h: 4, keptBytes: 48, scratchBytes: 48, totalBytes: 96, bytesPerLed: 6 })
    expect(patternRamEstimate(trails, { w: 8, h: 8 }).totalBytes).toBe(4 * small.totalBytes)
  })

  it('ranks a simulation above a plain fill', () => {
    const fill = patternRamEstimate(chain('fill', [node('sc', 'SolidColor')]), { w: 16, h: 16 })
    const sim = patternRamEstimate(chain('sim', [node('rd', 'ReactionDiffusion')]), { w: 16, h: 16 })
    expect(sim.totalBytes).toBeGreaterThan(fill.totalBytes)
    expect(sim.keptBytes).toBeGreaterThan(0)
  })

  it('counts nothing that does not feed the output', () => {
    const stray: SavedPattern = chain('stray', [node('sc', 'SolidColor')])
    const withStray = { ...stray, subgraph: { ...stray.subgraph, nodes: [...stray.subgraph.nodes, node('unused', 'FluidSim')] } }
    expect(patternRamEstimate(withStray, { w: 8, h: 8 }).totalBytes)
      .toBe(patternRamEstimate(stray, { w: 8, h: 8 }).totalBytes)
  })
})

describe('formatting', () => {
  it('prints RAM in the unit it reads best in', () => {
    expect(formatRamBytes(640)).toBe('640 B')
    expect(formatRamBytes(3072)).toBe('3.0 KB')
    expect(formatRamBytes(59 * 1024)).toBe('59 KB')
  })

  it('prints render weight as a multiple', () => {
    expect(formatRenderWeight(2.44)).toBe('2.4×')
    expect(formatRenderWeight(12.4)).toBe('12×')
  })
})

import { describe, expect, it } from 'vitest'
import {
  RAM_HEAVY_BYTES_PER_LED,
  RAM_MEDIUM_BYTES_PER_LED,
  RENDER_WEIGHT_HEAVY,
  RENDER_WEIGHT_MEDIUM,
  formatRamBytes,
  formatRenderWeight,
  patternCostBand,
  patternRamEstimate,
  RAM_HEAVY_BUDGET_SHARE,
  RAM_MEDIUM_BUDGET_SHARE,
  ramBand,
  ramBudgetText,
  renderCostFromBlocks,
  renderWeightBand,
  steadyFrameMs,
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
  ({ keptBytes: 0, scratchBytes: bytesPerLed * 256, totalBytes: bytesPerLed * 256, internalWithPsramBytes: 0, w: 16, h: 16, bytesPerLed })
const render = (relative: number): PatternRenderCost => ({ usPerFrame: relative * 100, relative })

describe('render timing', () => {
  it('takes the fastest block, since anything else the machine did only added time', () => {
    expect(steadyFrameMs([1.2, 1.0, 3.5, 1.1])).toBe(1.0)
  })

  it('ignores a block that could not be timed', () => {
    expect(steadyFrameMs([0, NaN, 0.4])).toBe(0.4)
    expect(steadyFrameMs([])).toBe(0)
    expect(steadyFrameMs([0, 0])).toBe(0)
  })

  it('gives the same weight whichever blocks were disturbed', () => {
    const quiet = renderCostFromBlocks([2, 2, 2, 2], 1)!
    const busy = renderCostFromBlocks([2, 9, 2.6, 4], 1)!
    expect(busy.relative).toBe(quiet.relative)
  })

  it('weighs a pattern against the reference, and declines when there is none', () => {
    const cost = renderCostFromBlocks([0.5, 0.4], 0.2)!
    expect(cost.usPerFrame).toBeCloseTo(400, 6)
    expect(cost.relative).toBeCloseTo(2, 6)
    expect(renderCostFromBlocks([], 1)).toBeUndefined()
    expect(renderCostFromBlocks([1], 0)).toBeUndefined()
  })
})

describe('cost bands', () => {
  it('bands render weight at its two edges', () => {
    expect(renderWeightBand(render(RENDER_WEIGHT_MEDIUM - 0.01))).toBe('light')
    expect(renderWeightBand(render(RENDER_WEIGHT_MEDIUM))).toBe('medium')
    expect(renderWeightBand(render(RENDER_WEIGHT_HEAVY - 0.01))).toBe('medium')
    expect(renderWeightBand(render(RENDER_WEIGHT_HEAVY))).toBe('heavy')
  })

  it('bands RAM per LED, so the band survives a change of canvas', () => {
    expect(ramBand(ram(RAM_MEDIUM_BYTES_PER_LED))).toBe('light')
    expect(ramBand(ram(RAM_MEDIUM_BYTES_PER_LED + 1))).toBe('medium')
    expect(ramBand(ram(RAM_HEAVY_BYTES_PER_LED + 1))).toBe('heavy')
    const fluid = chain('fluid', [node('fs', 'FluidSim')])
    expect(ramBand(patternRamEstimate(fluid, { w: 8, h: 8 }))).toBe(ramBand(patternRamEstimate(fluid, { w: 32, h: 32 })))
  })

  describe('against the chosen board', () => {
    const board = (budgetBytes: number, usesPsram = false) => ({ budgetBytes, boardLabel: 'ESP32 DevKit', usesPsram })
    const fluid = chain('fluid', [node('fs', 'FluidSim')])

    it('states the share of the board budget the pattern takes', () => {
      const dims = { w: 16, h: 16 }
      const plain = patternRamEstimate(fluid, dims)
      expect(plain.budget).toBeUndefined()
      const weighed = patternRamEstimate(fluid, dims, board(plain.totalBytes * 4))
      expect(weighed.budget).toMatchObject({ bytes: plain.totalBytes, share: 0.25, boardLabel: 'ESP32 DevKit' })
    })

    it('bands on that share, so the same pattern is heavier on a smaller board', () => {
      const dims = { w: 16, h: 16 }
      const bytes = patternRamEstimate(fluid, dims).totalBytes
      const share = (s: number) => patternRamEstimate(fluid, dims, board(bytes / s))
      expect(ramBand(share(RAM_MEDIUM_BUDGET_SHARE / 2))).toBe('light')
      expect(ramBand(share(RAM_MEDIUM_BUDGET_SHARE * 1.01))).toBe('medium')
      expect(ramBand(share(RAM_HEAVY_BUDGET_SHARE * 1.01))).toBe('heavy')
    })

    it('follows the canvas, unlike the per-LED band', () => {
      const budget = board(96 * 1024)
      const small = patternRamEstimate(fluid, { w: 8, h: 8 }, budget)
      const large = patternRamEstimate(fluid, { w: 32, h: 32 }, budget)
      expect(large.budget!.share).toBeGreaterThan(small.budget!.share)
    })

    it('counts only what stays internal when render buffers go to PSRAM', () => {
      const dims = { w: 16, h: 16 }
      const internal = patternRamEstimate(fluid, dims, board(96 * 1024))
      const psram = patternRamEstimate(fluid, dims, board(96 * 1024, true))
      expect(psram.budget!.bytes).toBe(psram.internalWithPsramBytes)
      expect(psram.budget!.bytes).toBeLessThanOrEqual(internal.budget!.bytes)
    })

    it('says the share in words, and nothing without a budget', () => {
      const at = (share: number) => ramBudgetText({ budget: { bytes: 1, share, boardLabel: 'ESP32 DevKit', usesPsram: false } })
      expect(at(0.253)).toBe('25% of the ESP32 DevKit budget')
      expect(at(0.0312)).toBe('3.1% of the ESP32 DevKit budget')
      expect(at(0.004)).toBe('<1% of the ESP32 DevKit budget')
      expect(ramBudgetText({})).toBe('')
    })
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

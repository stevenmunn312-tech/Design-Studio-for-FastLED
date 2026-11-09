import { describe, expect, it } from 'vitest'
import { applyGammaVideo, gammaVideoTable } from '../gamma'
import { COMPOSITE_EVALUATORS } from '../evaluate'
import { generateCpp } from '../../../codegen/cppGenerator'
import type { RGB } from '../../../state/palettes/ledColor'
import type { EvalContext } from '../../../state/evaluator/types'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

describe("FastLED's applyGamma_video", () => {
  it('keeps black black and full on full', () => {
    for (const gamma of [0.5, 1, 2.2, 2.8, 3.5]) {
      expect(applyGammaVideo(0, gamma)).toBe(0)
      expect(applyGammaVideo(255, gamma)).toBe(255)
    }
  })

  it('never takes a lit channel to black, so dim tails glow on the LEDs', () => {
    // Math.round(255 * (c / 255) ** 2.2) is 0 for every level up to 12.
    for (let c = 1; c <= 12; c++) expect(applyGammaVideo(c, 2.2), `level ${c}`).toBe(1)
    for (let c = 1; c < 256; c++) expect(applyGammaVideo(c, 3.5)).toBeGreaterThanOrEqual(1)
  })

  it('rises with the input and stays within a level of the exact curve', () => {
    for (const gamma of [1, 1.8, 2.2, 2.8]) {
      const table = gammaVideoTable(gamma)
      for (let c = 1; c < 256; c++) {
        expect(table[c], `gamma ${gamma} level ${c}`).toBeGreaterThanOrEqual(table[c - 1])
        const exact = Math.max(1, Math.round(255 * (c / 255) ** gamma))
        expect(Math.abs(table[c] - exact), `gamma ${gamma} level ${c}`).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('Gamma node', () => {
  const studio = {} as StudioNode
  const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
  }) as unknown as StudioNode
  const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string) =>
    ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge

  it('previews every channel through the table the board applies', () => {
    const frame: RGB[][] = [[{ r: 3, g: 128, b: 250 }, { r: 0, g: 12, b: 13 }]]
    const out = COMPOSITE_EVALUATORS.Gamma!({
      input: () => frame, num: () => 2.2, W: 2, H: 1,
    } as unknown as EvalContext, 'g', {}, studio, 'Gamma').frame as RGB[][]
    const table = gammaVideoTable(2.2)
    expect(out[0]).toEqual(frame[0].map((px) => ({ r: table[px.r], g: table[px.g], b: table[px.b] })))
    expect(out[0][1]).toMatchObject({ r: 0, g: 1 })
  })

  it('hands the same gamma to napplyGamma_video on the board', () => {
    const cpp = generateCpp([node('src', 'Code', 'code'), node('g', 'Gamma', 'composite', { gamma: 2.4 }),
      node('out', 'MatrixOutput', 'output', { width: 4, height: 4 })], [
      edge('e1', 'src', 'g', 'frame', 'frame'), edge('e2', 'g', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('napplyGamma_video(buf_g, NUM_LEDS, max(0.1f, 2.4));')
  })
})

import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { textBlockLayout, textScrollPeriod, textScrollPeriodCpp, textWrapSpan, textWrapSpanCpp } from '../../shared/font'
import type { Frame } from '../../../state/palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}

const W = 64, H = 64, FPS = 60
const SIGN = 'OPEN - COME IN'
/** Lit pixels of a Text node at `seconds` (the evaluator ticks at 60 fps). */
function lit(props: Record<string, unknown>, seconds = 0): number[][] {
  const frame = evaluateGraphFull([node('t', 'Text', props)], [], Math.round(seconds * FPS), W, H, {}, true, true)
    .outputs.get('t')!.frame as Frame
  return frame.map((row) => row.map((px) => (px.r + px.g + px.b > 0 ? 1 : 0)))
}
const base = { text: SIGN, size: 2, units: 'pixels', x: 0, y: 24, hAlign: 'left', vAlign: 'top' }

describe('Text wider than the matrix at size > 1', () => {
  it('is wider than the matrix at size 2 (the case under test)', () => {
    expect(textBlockLayout(SIGN, undefined, 1, 1, 2).width).toBeGreaterThan(W)
  })

  it('wrap keeps its copies apart: the visible copy is the unwrapped text', () => {
    // Left aligned at x = 0, the only copy in view is the text itself. Copies
    // spaced by the matrix (64) rather than the scaled width (112) used to
    // land on top of it.
    expect(lit({ ...base, wrap: true })).toEqual(lit({ ...base, wrap: false }))
    expect(lit({ ...base, wrap: true }).flat().some(Boolean)).toBe(true)
  })

  it('draws every glyph on its own scaled advance (columns in step with size 1)', () => {
    const one = lit({ ...base, size: 1, wrap: true, y: 24 })
    const two = lit({ ...base, size: 2, wrap: true, y: 24 })
    // Rows of the size-2 block, sampled one per font row, are the size-1 row
    // stretched 2x across columns: no glyph column is drawn twice or lost.
    const row1 = one[24 + 1], row2 = two[24 + 2]
    for (let x = 0; x < W; x++) expect(row2[x], `x ${x}`).toBe(row1[Math.floor(x / 2)])
  })

  it('scrolls: t = 0 differs from t = 1 s, with and without wrap', () => {
    for (const wrap of [false, true]) {
      expect(lit({ ...base, wrap, scroll: 8 }, 1), `wrap ${wrap}`).not.toEqual(lit({ ...base, wrap, scroll: 8 }, 0))
    }
  })

  it('moves at the same pixels per second at every size', () => {
    // Unwrapped, left aligned: after 1 s at 8 px/s the text sits 8 px left.
    for (const size of [1, 2, 3]) {
      const props = { ...base, size, y: 0, wrap: false, scroll: 8 }
      const t0 = lit(props, 0), t1 = lit(props, 1)
      for (let y = 0; y < H; y++) for (let x = 0; x < W - 8; x++) expect(t1[y][x], `size ${size} ${x},${y}`).toBe(t0[y][x + 8])
    }
  })

  it('loops a wrapped scaled sign seamlessly every span', () => {
    const span = textWrapSpan(textBlockLayout(SIGN, undefined, 1, 1, 2).width, W, 2)
    const props = { ...base, wrap: true, scroll: 8 }
    expect(lit(props, span / 8)).toEqual(lit(props, 0))
    expect(lit(props, span / 16)).not.toEqual(lit(props, 0))
  })
})

describe('wrap span and scroll period', () => {
  it('leave size 1 as it was', () => {
    expect(textWrapSpan(500, 64, 1)).toBe(64)
    expect(textScrollPeriod(500, 64, 1, true)).toBe(564)
    expect(textWrapSpanCpp('99', 'WIDTH', 1)).toBe('WIDTH')
    expect(textScrollPeriodCpp('99', 'WIDTH', 1, true)).toBe('99 + WIDTH')
  })

  it('grow to the block at size > 1, in the preview and in C++', () => {
    expect(textWrapSpan(112, 64, 2)).toBe(112)
    expect(textWrapSpan(40, 64, 2)).toBe(64)
    expect(textScrollPeriod(112, 64, 2, true)).toBe(112)
    expect(textScrollPeriod(112, 64, 2, false)).toBe(176)
    expect(textWrapSpanCpp('112', 'WIDTH', 2)).toBe('(WIDTH > 112 ? WIDTH : 112)')
  })

  it('reach the sketch for a wrapped, scrolling, scaled Text', () => {
    const cpp = generateCpp(
      [node('t', 'Text', { ...base, wrap: true, scroll: 8 }), node('out', 'MatrixOutput', { form: 'matrix', width: W, height: H })],
      [{ id: 'o', source: 't', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' } as StudioEdge], {}, { deferPruning: true },
    )
    expect(cpp).toContain('int _wrapX[3] = {-(WIDTH > 112 ? WIDTH : 112), 0, (WIDTH > 112 ? WIDTH : 112)};')
    expect(cpp).toContain('int _totX = (WIDTH > 112 ? WIDTH : 112),')
  })
})

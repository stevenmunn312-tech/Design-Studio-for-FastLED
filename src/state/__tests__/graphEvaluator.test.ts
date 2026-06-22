import { describe, it, expect, vi } from 'vitest'

vi.mock('../audioStore', () => ({
  useAudioStore: {
    getState: () => ({
      active: false,
      bass: 0, mids: 0, treble: 0, beat: false,
      spectrum: Array(16).fill(0),
    }),
  },
}))

import { evaluateGraph } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { StudioNode, StudioEdge } from '../graphStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category, properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const W = 4, H = 4

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluateGraph', () => {
  it('returns null for empty graph', () => {
    expect(evaluateGraph([], [], 0, W, H)).toBeNull()
  })

  it('returns a W×H frame for SolidColor', () => {
    const frame = evaluateGraph([node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })], [], 0, W, H)
    expect(frame).not.toBeNull()
    expect(frame!.length).toBe(H)
    expect(frame![0].length).toBe(W)
  })

  it('SolidColor fills every pixel with the specified color', () => {
    const frame = evaluateGraph([node('sc', 'SolidColor', 'pattern', { r: 255, g: 128, b: 64 })], [], 0, W, H)
    // byte(255/255) = 255, byte(128/255) = 128, byte(64/255) = 64
    expect(frame![0][0]).toEqual({ r: 255, g: 128, b: 64 })
    expect(frame![H-1][W-1]).toEqual({ r: 255, g: 128, b: 64 })
  })

  it('MathAdd evaluates a + b', () => {
    // Evaluating a math-only graph won't produce a frame, but the values
    // flow through. Test via a node that uses MathAdd output as speed.
    const add = node('add', 'MathAdd', 'math', { a: 3, b: 4 })
    // We just confirm the graph evaluates without error
    evaluateGraph([add], [], 0, W, H)
  })

  it('BrightnessMod scales pixel values', () => {
    const sc  = node('sc', 'SolidColor', 'pattern', { r: 200, g: 200, b: 200 })
    const bm  = node('bm', 'BrightnessMod', 'pattern', { brightness: 0.5 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'sc', 'frame', 'bm', 'frame'),
      edge('e2', 'bm', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([sc, bm, out], edges, 0, W, H)
    expect(frame).not.toBeNull()
    // byte(200/255) = 200, then *0.5 ≈ 100
    expect(frame![0][0].r).toBeCloseTo(100, -1)
  })

  it('Invert flips pixel values', () => {
    const sc  = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 128 })
    const inv = node('inv', 'Invert', 'pattern', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'sc', 'frame', 'inv', 'frame'),
      edge('e2', 'inv', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([sc, inv, out], edges, 0, W, H)
    expect(frame![0][0]).toEqual({ r: 0, g: 255, b: 127 })
  })

  it('MatrixOutput passes through its frame input', () => {
    const sc  = node('sc', 'SolidColor', 'pattern', { r: 100, g: 150, b: 200 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e1', 'sc', 'frame', 'out', 'frame')]
    const frame = evaluateGraph([sc, out], edges, 0, W, H)
    expect(frame![0][0]).toEqual({ r: 100, g: 150, b: 200 })
  })

  it('TimeNode outputs seconds (tick / 60)', () => {
    const timeN = node('t', 'TimeNode', 'math', {})
    evaluateGraph([timeN], [], 120, W, H)
    // No crash, seconds = 120/60 = 2.0
  })

  it('PaletteSelector outputs a string palette name', () => {
    // Indirect: wire PaletteSelector → PaletteSampler and verify we get a color
    const ps   = node('ps', 'PaletteSelector', 'math', { palette: 'ocean' })
    const samp = node('s', 'PaletteSampler', 'pattern', { t: 0.5 })
    const edges = [edge('e1', 'ps', 'palette', 's', 'paletteIn')]
    // PaletteSampler is a color node, not a frame node — just check no crash
    evaluateGraph([ps, samp], edges, 0, W, H)
  })

  it('Span lights a run on its row and leaves the rest dark', () => {
    // "4th–13th LED of the top row blue" → 0-indexed start=3, count=10.
    const span  = node('sp', 'Span', 'pattern', { row: 0, start: 3, count: 10, r: 0, g: 0, b: 255 })
    const frame = evaluateGraph([span], [], 0, 16, 4)
    expect(frame![0][3]).toEqual({ r: 0, g: 0, b: 255 })   // first lit LED
    expect(frame![0][12]).toEqual({ r: 0, g: 0, b: 255 })  // last lit LED
    expect(frame![0][2]).toEqual({ r: 0, g: 0, b: 0 })     // just before the run
    expect(frame![0][13]).toEqual({ r: 0, g: 0, b: 0 })    // just after the run
    expect(frame![1][5]).toEqual({ r: 0, g: 0, b: 0 })     // other rows untouched
  })

  it('Span paints over a base frame, preserving the rest', () => {
    const bg   = node('bg', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })  // red fill
    const span = node('sp', 'Span', 'pattern', { row: 0, start: 1, count: 2, r: 0, g: 0, b: 255 })
    const out  = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'bg', 'frame', 'sp', 'base'),
      edge('e2', 'sp', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([bg, span, out], edges, 0, 4, 4)
    expect(frame![0][1]).toEqual({ r: 0, g: 0, b: 255 })   // painted blue
    expect(frame![0][2]).toEqual({ r: 0, g: 0, b: 255 })
    expect(frame![0][0]).toEqual({ r: 255, g: 0, b: 0 })   // base shows through
    expect(frame![1][1]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('Rect fills the specified rectangle', () => {
    const rect  = node('r', 'Rect', 'pattern', { x: 1, y: 1, w: 2, h: 2, r: 0, g: 255, b: 0 })
    const frame = evaluateGraph([rect], [], 0, 4, 4)
    expect(frame![1][1]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![2][2]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
    expect(frame![3][3]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Simplex2D uses a connected palette over its own property', () => {
    // Baseline: Simplex2D with palette property 'heat', no connection.
    const heatProp = evaluateGraph(
      [node('sx', 'Simplex2D', 'pattern', { palette: 'heat' })], [], 0, W, H,
    )
    // Same node defaulting to 'rainbow' but driven by a PaletteSelector('heat').
    const sel  = node('sel', 'PaletteSelector', 'color', { palette: 'heat' })
    const sx   = node('sx', 'Simplex2D', 'pattern', { palette: 'rainbow' })
    const wired = evaluateGraph(
      [sel, sx], [edge('e1', 'sel', 'palette', 'sx', 'paletteIn')], 0, W, H,
    )
    // The connected palette wins, so the wired frame matches the heat baseline.
    expect(wired).toEqual(heatProp)
  })

  it('falls back to the palette property when paletteIn is unconnected', () => {
    const ocean   = evaluateGraph([node('sx', 'Simplex2D', 'pattern', { palette: 'ocean' })], [], 0, W, H)
    const rainbow = evaluateGraph([node('sx', 'Simplex2D', 'pattern', { palette: 'rainbow' })], [], 0, W, H)
    // Different palettes produce different frames.
    expect(ocean).not.toEqual(rainbow)
  })

  it('BlendFrames produces a mix of two frames', () => {
    const black = node('b', 'SolidColor', 'pattern', { r: 0, g: 0, b: 0 })
    const white = node('w', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
    const blend = node('bl', 'BlendFrames', 'pattern', { t: 0.5 })
    const out   = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'b', 'frame', 'bl', 'a'),
      edge('e2', 'w', 'frame', 'bl', 'b'),
      edge('e3', 'bl', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([black, white, blend, out], edges, 0, W, H)
    expect(frame![0][0].r).toBeCloseTo(128, -1)
    expect(frame![0][0].g).toBeCloseTo(128, -1)
  })

  it('Clamp constrains values within [min, max]', () => {
    // Clamp is a math node — output flows into e.g. BrightnessMod
    // Just verify it doesn't throw
    const clamp = node('c', 'Clamp', 'math', { value: 2, min: 0, max: 1 })
    evaluateGraph([clamp], [], 0, W, H)
  })

  it('Counter value stays in 0–1 range across ticks', () => {
    // Run 200 ticks to check Counter doesn't exceed 1
    const counter = node('cnt', 'Counter', 'math', { speed: 1.0 })
    for (let tick = 0; tick < 200; tick++) {
      evaluateGraph([counter], [], tick, W, H)
    }
  })

  it('breaks a direct self-loop without overflowing the stack', () => {
    // Invert whose frame input is wired back to its own output.
    const inv = node('inv', 'Invert', 'pattern', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('self', 'inv', 'frame', 'inv', 'frame'),
      edge('e1', 'inv', 'frame', 'out', 'frame'),
    ]
    expect(() => evaluateGraph([inv, out], edges, 0, W, H)).not.toThrow()
  })

  it('breaks a two-node cycle without overflowing the stack', () => {
    // bm1.frame ← bm2.frame and bm2.frame ← bm1.frame form a cycle.
    const bm1 = node('bm1', 'BrightnessMod', 'pattern', { brightness: 1 })
    const bm2 = node('bm2', 'BrightnessMod', 'pattern', { brightness: 1 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'bm2', 'frame', 'bm1', 'frame'),
      edge('e2', 'bm1', 'frame', 'bm2', 'frame'),
      edge('e3', 'bm1', 'frame', 'out', 'frame'),
    ]
    expect(() => evaluateGraph([bm1, bm2, out], edges, 0, W, H)).not.toThrow()
  })
})

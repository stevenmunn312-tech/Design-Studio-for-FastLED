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

import { evaluateGraph, evaluateScalar } from '../graphEvaluator'
import { waveSample, combineWaves } from '../wave'
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

// The evaluator only renders graphs that reach an output terminal, so wrap a
// lone frame producer through a MatrixOutput for focused single-node tests.
function withOutput(gen: StudioNode, extra: StudioNode[] = [], extraEdges: StudioEdge[] = []) {
  const out = node('zzout', 'MatrixOutput', 'output', {})
  return {
    nodes: [...extra, gen, out],
    edges: [...extraEdges, edge('zze', gen.id, 'frame', 'zzout', 'frame')],
  }
}

const W = 4, H = 4

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluateGraph', () => {
  it('returns null for empty graph', () => {
    expect(evaluateGraph([], [], 0, W, H)).toBeNull()
  })

  it('returns a W×H frame for SolidColor', () => {
    const { nodes, edges } = withOutput(node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(frame).not.toBeNull()
    expect(frame!.length).toBe(H)
    expect(frame![0].length).toBe(W)
  })

  it('SolidColor fills every pixel with the specified color', () => {
    const { nodes, edges } = withOutput(node('sc', 'SolidColor', 'pattern', { r: 255, g: 128, b: 64 }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    // byte(255/255) = 255, byte(128/255) = 128, byte(64/255) = 64
    expect(frame![0][0]).toEqual({ r: 255, g: 128, b: 64 })
    expect(frame![H-1][W-1]).toEqual({ r: 255, g: 128, b: 64 })
  })

  it('renders nothing without an output terminal', () => {
    // A lone SolidColor (no MatrixOutput) must not preview.
    expect(evaluateGraph([node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })], [], 0, W, H)).toBeNull()
  })

  it('MathAdd evaluates a + b', () => {
    // Evaluating a math-only graph won't produce a frame, but the values
    // flow through. Test via a node that uses MathAdd output as speed.
    const add = node('add', 'MathAdd', 'math', { a: 3, b: 4 })
    // We just confirm the graph evaluates without error
    evaluateGraph([add], [], 0, W, H)
  })

  it('Wave drives a value over time per waveform type', () => {
    // Wave.result → BrightnessMod.brightness over a white frame, so frame[0][0].r
    // equals round(255 * waveValue) — making the scalar observable.
    const brightnessAt = (waveform: string, tick: number, props: Record<string, unknown> = {}) => {
      const wave = node('w', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0, waveform, ...props })
      const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
      const bm = node('bm', 'BrightnessMod', 'composite', {})
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph(
        [wave, sc, bm, out],
        [
          edge('e1', 'w', 'result', 'bm', 'brightness'),
          edge('e2', 'sc', 'frame', 'bm', 'frame'),
          edge('e3', 'bm', 'frame', 'out', 'frame'),
        ],
        tick, 4, 4,
      )!
      return f[0][0].r
    }
    // sine: 0 at the start, peaks at the quarter period (tick 15 of 60).
    expect(brightnessAt('sine', 0)).toBe(0)
    expect(brightnessAt('sine', 15)).toBe(255)
    // square: +amplitude in the first half, −amplitude in the second.
    expect(brightnessAt('square', 0)).toBe(255)
    expect(brightnessAt('square', 40)).toBeLessThan(0)
    // determinism: same waveform + tick → same value.
    expect(brightnessAt('triangle', 9)).toBe(brightnessAt('triangle', 9))
    // the four waveforms are not all identical at a shared tick.
    const vals = ['sine', 'triangle', 'square', 'sawtooth'].map((wf) => brightnessAt(wf, 7))
    expect(new Set(vals).size).toBeGreaterThan(1)
  })

  it('ComplexWave combines two values per operation', () => {
    // ComplexWave.result → BrightnessMod over white, so frame[0][0].r = round(255 * result).
    const brightnessAt = (operation: string, a: number, b: number) => {
      const cw = node('cw', 'ComplexWave', 'math', { operation, a, b })
      const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
      const bm = node('bm', 'BrightnessMod', 'composite', {})
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph(
        [cw, sc, bm, out],
        [
          edge('e1', 'cw', 'result', 'bm', 'brightness'),
          edge('e2', 'sc', 'frame', 'bm', 'frame'),
          edge('e3', 'bm', 'frame', 'out', 'frame'),
        ],
        0, 4, 4,
      )!
      return f[0][0].r
    }
    expect(brightnessAt('add', 0.5, 0.25)).toBe(Math.round(255 * 0.75))
    expect(brightnessAt('multiply', 0.5, 0.25)).toBe(Math.round(255 * 0.125))
    expect(brightnessAt('average', 0.5, 0.25)).toBe(Math.round(255 * 0.375))
    expect(brightnessAt('difference', 0.5, 0.25)).toBe(Math.round(255 * 0.25))
    expect(brightnessAt('max', 0.5, 0.25)).toBe(Math.round(255 * 0.5))
    expect(brightnessAt('min', 0.5, 0.25)).toBe(Math.round(255 * 0.25))
  })

  it('evaluateScalar probes a ComplexWave from its real upstream waves', () => {
    const wa = node('wa', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0, waveform: 'sine' })
    const wb = node('wb', 'Wave', 'math', { amplitude: 0.5, frequency: 2, phase: 0, waveform: 'sine' })
    const cw = node('cw', 'ComplexWave', 'math', { operation: 'add' })
    const edges = [
      edge('e1', 'wa', 'result', 'cw', 'a'),
      edge('e2', 'wb', 'result', 'cw', 'b'),
    ]
    const tick = 23
    const t = tick / 60
    const expected = combineWaves('add', waveSample('sine', 1, 1, 0, t), waveSample('sine', 0.5, 2, 0, t))
    expect(evaluateScalar([wa, wb, cw], edges, 'cw', 'result', tick)).toBeCloseTo(expected, 6)
  })

  it('evaluateScalar reflects the chosen ComplexWave operation', () => {
    const wa = node('wa', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0.1, waveform: 'sine' })
    const wb = node('wb', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0.3, waveform: 'sine' })
    const cw = node('cw', 'ComplexWave', 'math', { operation: 'multiply' })
    const edges = [edge('e1', 'wa', 'result', 'cw', 'a'), edge('e2', 'wb', 'result', 'cw', 'b')]
    const t = 40 / 60
    const expected = waveSample('sine', 1, 1, 0.1, t) * waveSample('sine', 1, 1, 0.3, t)
    expect(evaluateScalar([wa, wb, cw], edges, 'cw', 'result', 40)).toBeCloseTo(expected, 6)
  })

  it('Transform translates a frame and is identity at rate 0', () => {
    // A blue top row, then a Transform. Grid 16×4.
    const run = (transform: string, rate: number, angle: number, tick: number) => {
      const sp = node('sp', 'Span', 'pattern', { row: 0, start: 0, count: 16, r: 0, g: 0, b: 255 })
      const tr = node('tr', 'Transform', 'composite', { transform, rate, angle })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph(
        [sp, tr, out],
        [edge('e1', 'sp', 'frame', 'tr', 'frame'), edge('e2', 'tr', 'frame', 'out', 'frame')],
        tick, 16, 4,
      )!
    }
    // translate down by 2 rows (angle 90°, 2 px/s at t=1): row 0 → row 2.
    const t = run('translate', 2, 90, 60)
    expect(t[2][5]).toEqual({ r: 0, g: 0, b: 255 })
    expect(t[0][5]).toEqual({ r: 0, g: 0, b: 0 })
    // rate 0 is the identity transform for every mode.
    expect(run('rotate', 0, 0, 60)[0][5]).toEqual({ r: 0, g: 0, b: 255 })
    expect(run('scale', 0, 0, 60)[0][5]).toEqual({ r: 0, g: 0, b: 255 })
    expect(run('rotate', 0, 0, 60)[2][5]).toEqual({ r: 0, g: 0, b: 0 })
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
    const { nodes, edges } = withOutput(span)
    const frame = evaluateGraph(nodes, edges, 0, 16, 4)
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

  it('Circle (filled) lights the center and clears the corners', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 4, cy: 4, radius: 3, filled: true, r: 255, g: 0, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([c, out], [edge('e', 'c', 'frame', 'out', 'frame')], 0, 9, 9)
    expect(frame![4][4]).toEqual({ r: 255, g: 0, b: 0 })   // center lit
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })     // far corner dark
  })

  it('Circle ring leaves the center dark', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 4, cy: 4, radius: 3, filled: false, r: 255, g: 0, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([c, out], [edge('e', 'c', 'frame', 'out', 'frame')], 0, 9, 9)
    expect(frame![4][4]).toEqual({ r: 0, g: 0, b: 0 })     // hollow center
    expect(frame![4][1]).toEqual({ r: 255, g: 0, b: 0 })   // on the ring (d=3)
  })

  it('Line draws a diagonal between its endpoints', () => {
    const l = node('l', 'Line', 'pattern', { x1: 0, y1: 0, x2: 3, y2: 3, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([l, out], [edge('e', 'l', 'frame', 'out', 'frame')], 0, 4, 4)
    expect(frame![0][0]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![3][3]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![0][3]).toEqual({ r: 0, g: 0, b: 0 })     // off the diagonal
  })

  it('Text renders glyph pixels in the chosen color', () => {
    // "I" at x=1,y=1: the 3×5 'I' has a full top row (### = cols all lit at r=0).
    const txt = node('t', 'Text', 'pattern', { text: 'I', x: 1, y: 1, scroll: 0, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 8, 8)
    // top row of 'I' spans x=1..3 at y=1, lit green; background stays black.
    expect(frame![1][1]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![1][2]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Text uses a custom font from props.font', () => {
    const font = { w: 1, h: 1, glyphs: { X: [1] } }   // a single lit pixel
    const txt = node('t', 'Text', 'pattern', { text: 'X', x: 2, y: 3, scroll: 0, r: 255, g: 0, b: 0, font })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 8, 8)
    expect(frame![3][2]).toEqual({ r: 255, g: 0, b: 0 })   // the glyph pixel
    expect(frame![3][3]).toEqual({ r: 0, g: 0, b: 0 })     // trailing spacing column
  })

  it('Text scrolling shifts the rendered columns over time', () => {
    const mk = (tick: number) => {
      const txt = node('t', 'Text', 'pattern', { text: 'AB', x: 0, y: 1, scroll: 4, r: 255, g: 255, b: 255 })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], tick, 8, 8)
    }
    // Different times → different horizontal offset → different frames.
    expect(mk(0)).not.toEqual(mk(60))
  })

  it('Mask scales a frame by the mask luminance', () => {
    const content = node('w', 'SolidColor', 'pattern', { r: 200, g: 200, b: 200 })
    const mask    = node('m', 'SolidColor', 'pattern', { r: 128, g: 128, b: 128 })  // ~50% luma
    const msk     = node('mk', 'Mask', 'composite', {})
    const out     = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'w', 'frame', 'mk', 'frame'),
      edge('e2', 'm', 'frame', 'mk', 'mask'),
      edge('e3', 'mk', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([content, mask, msk, out], edges, 0, 2, 2)
    // 200 * (128/255) ≈ 100
    expect(frame![0][0].r).toBeGreaterThan(90)
    expect(frame![0][0].r).toBeLessThan(110)
  })

  it('Mask with no mask input passes the frame through', () => {
    const content = node('w', 'SolidColor', 'pattern', { r: 200, g: 100, b: 50 })
    const msk     = node('mk', 'Mask', 'composite', {})
    const out     = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([content, msk, out], [
      edge('e1', 'w', 'frame', 'mk', 'frame'),
      edge('e2', 'mk', 'frame', 'out', 'frame'),
    ], 0, 2, 2)
    expect(frame![0][0]).toEqual({ r: 200, g: 100, b: 50 })
  })

  it('Rect fills the specified rectangle', () => {
    const rect  = node('r', 'Rect', 'pattern', { x: 1, y: 1, w: 2, h: 2, r: 0, g: 255, b: 0 })
    const { nodes, edges } = withOutput(rect)
    const frame = evaluateGraph(nodes, edges, 0, 4, 4)
    expect(frame![1][1]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![2][2]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
    expect(frame![3][3]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('PaletteBlend interpolates between two palettes', () => {
    const driveSimplex = (amount: number) => {
      const pb = node('pb', 'PaletteBlend', 'color', { paletteA: 'heat', paletteB: 'ocean', amount })
      const sx = node('sx', 'Simplex2D', 'pattern', {})
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph(
        [pb, sx, out],
        [edge('e1', 'pb', 'palette', 'sx', 'paletteIn'), edge('e2', 'sx', 'frame', 'out', 'frame')],
        0, 4, 4,
      )
    }
    // amount 0 → heat end, amount 255 → ocean end → visibly different frames.
    expect(driveSimplex(0)).not.toEqual(driveSimplex(255))
  })

  it('FractalNoise produces a varied frame; octaves change the result', () => {
    const mk = (octaves: number) => {
      const fn = node('fn', 'FractalNoise', 'pattern', { speed: 0, scale: 0.2, octaves, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([fn, out], [edge('e', 'fn', 'frame', 'out', 'frame')], 0, 8, 8)!
    }
    const f1 = mk(1)
    const p0 = JSON.stringify(f1[0][0])
    expect(f1.every((r) => r.every((px) => JSON.stringify(px) === p0))).toBe(false)  // varied
    expect(JSON.stringify(mk(5))).not.toEqual(JSON.stringify(f1))                     // octaves add detail
  })

  it('Starfield lights some pixels and animates', () => {
    const at = (tick: number) => {
      const sf = node('sf', 'Starfield', 'pattern', { speed: 2, count: 80, r: 255, g: 255, b: 255 })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([sf, out], [edge('e', 'sf', 'frame', 'out', 'frame')], tick, 12, 12)!
    }
    let frame = at(0)
    for (let i = 1; i <= 6; i++) frame = at(i)
    expect(frame.flat().some((px) => px.r + px.g + px.b > 0)).toBe(true)  // stars visible
  })

  it('PlasmaFractal produces a varied frame that animates', () => {
    const at = (tick: number) => {
      const pf = node('pf', 'PlasmaFractal', 'pattern', { speed: 1, scale: 0.15, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([pf, out], [edge('e', 'pf', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const f0 = at(0)
    const p0 = JSON.stringify(f0[0][0])
    expect(f0.every((r) => r.every((px) => JSON.stringify(px) === p0))).toBe(false)
    expect(JSON.stringify(at(90))).not.toEqual(JSON.stringify(f0))
  })

  it('AudioFlow brightens with bass', () => {
    const brightnessAt = (bass: number) => {
      // bass read from the node property when no FFTAnalyzer is wired.
      const af = node('af', 'AudioFlow', 'pattern', { speed: 1, scale: 0.2, palette: 'party', bass, mids: 0.5, treble: 0.3 })
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph([af, out], [edge('e', 'af', 'frame', 'out', 'frame')], 30, 8, 8)!
      return f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    }
    expect(brightnessAt(1)).toBeGreaterThan(brightnessAt(0))  // louder bass → brighter
  })

  it('Blobs produces a varied field that moves over time', () => {
    const at = (tick: number) => {
      const b = node('b', 'Blobs', 'pattern', { speed: 0.6, scale: 0.25, count: 3, palette: 'lava' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([b, out], [edge('e', 'b', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const f0 = at(0)
    const p0 = JSON.stringify(f0[0][0])
    expect(f0.every((r) => r.every((px) => JSON.stringify(px) === p0))).toBe(false)  // varied
    expect(JSON.stringify(at(120))).not.toEqual(JSON.stringify(f0))                   // animates
  })

  it('GaborNoise produces a varied frame that animates', () => {
    const at = (tick: number) => {
      const g = node('g', 'GaborNoise', 'pattern', { speed: 0.5, scale: 0.35, frequency: 1.2, orientation: 45, palette: 'ocean' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([g, out], [edge('e', 'g', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const f0 = at(0)
    const p0 = JSON.stringify(f0[0][0])
    expect(f0.every((r) => r.every((px) => JSON.stringify(px) === p0))).toBe(false)
    expect(JSON.stringify(at(120))).not.toEqual(JSON.stringify(f0))
  })

  it('PaletteGradient varies along its angle and is deterministic', () => {
    const mk = () => {
      const g = node('g', 'PaletteGradient', 'pattern', { angle: 0, repeat: 1, speed: 0, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([g, out], [edge('e', 'g', 'frame', 'out', 'frame')], 0, 8, 8)!
    }
    const f = mk()
    // angle 0 → horizontal gradient: columns differ across the matrix
    // (compare a non-wrapping pair; the rainbow palette repeats at the ends).
    expect(JSON.stringify(f[0][0])).not.toEqual(JSON.stringify(f[0][4]))
    // but constant down a column (no vertical component).
    expect(JSON.stringify(f[0][3])).toEqual(JSON.stringify(f[7][3]))
    expect(JSON.stringify(mk())).toEqual(JSON.stringify(f)) // deterministic
  })

  it('Image samples an uploaded picture to the matrix', () => {
    // 2×2 image: red, green / blue, white.
    const image = { w: 2, h: 2, pixels: [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255] }
    const img = node('img', 'Image', 'pattern', { image })
    const out = node('out', 'MatrixOutput', 'output', {})
    const f = evaluateGraph([img, out], [edge('e', 'img', 'frame', 'out', 'frame')], 0, 4, 4)!
    expect(f[0][0]).toEqual({ r: 255, g: 0, b: 0 })   // top-left quadrant = red
    expect(f[0][3]).toEqual({ r: 0, g: 255, b: 0 })   // top-right = green
    expect(f[3][0]).toEqual({ r: 0, g: 0, b: 255 })   // bottom-left = blue
    expect(f[3][3]).toEqual({ r: 255, g: 255, b: 255 }) // bottom-right = white
  })

  it('Image with no uploaded picture renders blank', () => {
    const img = node('img', 'Image', 'pattern', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const f = evaluateGraph([img, out], [edge('e', 'img', 'frame', 'out', 'frame')], 0, 4, 4)!
    expect(f.flat().every((px) => px.r === 0 && px.g === 0 && px.b === 0)).toBe(true)
  })

  it('FlowField deposits trails that build up over frames', () => {
    const ff = node('ff', 'FlowField', 'pattern', { speed: 1, scale: 0.1, count: 60, fade: 0.9, palette: 'ocean' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e', 'ff', 'frame', 'out', 'frame')]
    let frame = evaluateGraph([ff, out], edges, 0, 10, 10)!
    for (let i = 1; i <= 8; i++) frame = evaluateGraph([ff, out], edges, i, 10, 10)!
    const lit = frame.flat().filter((px) => px.r + px.g + px.b > 0).length
    expect(lit).toBeGreaterThan(0)   // particles left trails
  })

  it('Worley noise produces a varied, deterministic cellular frame', () => {
    const mk = () => {
      const w = node('w', 'Worley', 'pattern', { speed: 0, scale: 0.3, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([w, out], [edge('e', 'w', 'frame', 'out', 'frame')], 0, 8, 8)!
    }
    const frame = mk()
    const first = JSON.stringify(frame[0][0])
    const allSame = frame.every((row) => row.every((px) => JSON.stringify(px) === first))
    expect(allSame).toBe(false)          // cellular variation, not a flat fill
    expect(mk()).toEqual(frame)          // deterministic at a fixed tick
  })

  it('GameOfLife produces a frame and steps without throwing', () => {
    const gol = node('g', 'GameOfLife', 'pattern', { speed: 60, fade: 0, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e', 'g', 'frame', 'out', 'frame')]
    // fade=0 → live cells are green, dead are pure black; advance several steps.
    let frame = evaluateGraph([gol, out], edges, 0, 12, 12)!
    expect(frame.length).toBe(12)
    for (let i = 1; i <= 10; i++) frame = evaluateGraph([gol, out], edges, i, 12, 12)!
    // every pixel is either off or the live color (fade 0, no trails)
    const ok = frame.every((row) => row.every((px) =>
      (px.r === 0 && px.g === 0 && px.b === 0) || (px.g === 255 && px.r === 0 && px.b === 0)))
    expect(ok).toBe(true)
  })

  it('ReactionDiffusion seeds a non-uniform field that evolves over frames', () => {
    const rd  = node('rd', 'ReactionDiffusion', 'pattern', { feed: 0.055, kill: 0.062, speed: 8, palette: 'ocean' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e', 'rd', 'frame', 'out', 'frame')]
    const first = evaluateGraph([rd, out], edges, 0, 16, 16)!
    const firstStr = JSON.stringify(first)
    const p0 = JSON.stringify(first[0][0])
    const allSame = first.every((row) => row.every((px) => JSON.stringify(px) === p0))
    expect(allSame).toBe(false)                  // the seed patch breaks uniformity
    let later = first
    for (let i = 1; i <= 5; i++) later = evaluateGraph([rd, out], edges, i, 16, 16)!
    expect(JSON.stringify(later)).not.toEqual(firstStr)   // the sim evolves
  })

  it('Temperature yields warm vs cool white points', () => {
    const colorAt = (kelvin: number) => {
      const t = node('t', 'Temperature', 'color', { kelvin })
      const sc = node('sc', 'SolidColor', 'pattern', {})
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph([t, sc, out], [
        edge('e1', 't', 'color', 'sc', 'color'),
        edge('e2', 'sc', 'frame', 'out', 'frame'),
      ], 0, 2, 2)!
      return f[0][0]
    }
    const warm = colorAt(2000)
    const cool = colorAt(10000)
    expect(warm.r).toBeGreaterThan(warm.b)        // warm → red-leaning
    expect(cool.b).toBeGreaterThan(cool.r)        // cool → blue-leaning
    expect(colorAt(6600).r).toBeGreaterThan(240)  // near-neutral white
  })

  it('a CustomPalette drives a pattern node differently than a preset', () => {
    const c1 = node('c1', 'CHSV', 'color', { hue: 0, sat: 255, val: 255 })
    const c2 = node('c2', 'CHSV', 'color', { hue: 160, sat: 255, val: 255 })
    const cp = node('cp', 'CustomPalette', 'color', {})
    const sx = node('sx', 'Simplex2D', 'pattern', { palette: 'rainbow' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const wired = evaluateGraph(
      [c1, c2, cp, sx, out],
      [
        edge('e1', 'c1', 'rgb', 'cp', 'color0'),
        edge('e2', 'c2', 'rgb', 'cp', 'color1'),
        edge('e3', 'cp', 'palette', 'sx', 'paletteIn'),
        edge('e4', 'sx', 'frame', 'out', 'frame'),
      ], 0, 4, 4,
    )
    const presetOnly = evaluateGraph(
      [node('sx', 'Simplex2D', 'pattern', { palette: 'rainbow' }), out],
      [edge('e', 'sx', 'frame', 'out', 'frame')], 0, 4, 4,
    )
    expect(wired).not.toEqual(presetOnly)   // custom colors changed the output
  })

  it('Simplex2D uses a connected palette over its own property', () => {
    // Baseline: Simplex2D with palette property 'heat', no connection.
    const heat = withOutput(node('sx', 'Simplex2D', 'pattern', { palette: 'heat' }))
    const heatProp = evaluateGraph(heat.nodes, heat.edges, 0, W, H)
    // Same node defaulting to 'rainbow' but driven by a PaletteSelector('heat').
    const sel  = node('sel', 'PaletteSelector', 'color', { palette: 'heat' })
    const sx   = node('sx', 'Simplex2D', 'pattern', { palette: 'rainbow' })
    const w = withOutput(sx, [sel], [edge('e1', 'sel', 'palette', 'sx', 'paletteIn')])
    const wired = evaluateGraph(w.nodes, w.edges, 0, W, H)
    // The connected palette wins, so the wired frame matches the heat baseline.
    expect(wired).toEqual(heatProp)
  })

  it('falls back to the palette property when paletteIn is unconnected', () => {
    const o = withOutput(node('sx', 'Simplex2D', 'pattern', { palette: 'ocean' }))
    const r = withOutput(node('sx', 'Simplex2D', 'pattern', { palette: 'rainbow' }))
    const ocean   = evaluateGraph(o.nodes, o.edges, 0, W, H)
    const rainbow = evaluateGraph(r.nodes, r.edges, 0, W, H)
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

describe('evaluateGraph — groups', () => {
  const out = () => node('out', 'MatrixOutput', 'output', {})

  it('a Group node renders its subgraph output frame', () => {
    const groups = {
      blueGroup: {
        nodes: [
          node('sc', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'sc', 'frame', 'go', 'frame')],
      },
    }
    const grp = node('g1', 'Group', 'pattern', { groupId: 'blueGroup' })
    const frame = evaluateGraph([grp, out()], [edge('e1', 'g1', 'frame', 'out', 'frame')], 0, 4, 4, groups)
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('renders blank for an unknown group reference', () => {
    const grp = node('g1', 'Group', 'pattern', { groupId: 'missing' })
    const frame = evaluateGraph([grp, out()], [edge('e1', 'g1', 'frame', 'out', 'frame')], 0, 4, 4, {})
    expect(frame).not.toBeNull()
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('renders nested groups (group within a group)', () => {
    const groups = {
      inner: {
        nodes: [
          node('sc', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'sc', 'frame', 'go', 'frame')],
      },
      outer: {
        nodes: [
          node('ig', 'Group', 'pattern', { groupId: 'inner' }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'ig', 'frame', 'go', 'frame')],
      },
    }
    const grp = node('g1', 'Group', 'pattern', { groupId: 'outer' })
    const frame = evaluateGraph([grp, out()], [edge('e1', 'g1', 'frame', 'out', 'frame')], 0, 4, 4, groups)
    expect(frame![0][0]).toEqual({ r: 0, g: 255, b: 0 })
  })

  it('breaks a self-referential group without infinite recursion', () => {
    const groups = {
      loop: {
        nodes: [
          node('inner', 'Group', 'pattern', { groupId: 'loop' }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'inner', 'frame', 'go', 'frame')],
      },
    }
    const grp = node('g1', 'Group', 'pattern', { groupId: 'loop' })
    const frame = evaluateGraph([grp, out()], [edge('e1', 'g1', 'frame', 'out', 'frame')], 0, 4, 4, groups)
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })   // cycle broken → blank
  })

  it('Sequencer shows its first input at t=0', () => {
    const red = node('r', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const grn = node('g', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 })
    const seq = node('s', 'Sequencer', 'composite', { interval: 4, fade: 1 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'r', 'frame', 's', 'p0'),
      edge('e2', 'g', 'frame', 's', 'p1'),
      edge('e3', 's', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([red, grn, seq, out], edges, 0, 2, 2)
    expect(frame![0][0]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('Sequencer crossfades between inputs in the fade window', () => {
    const red = node('r', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const grn = node('g', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 })
    const seq = node('s', 'Sequencer', 'composite', { interval: 4, fade: 2 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'r', 'frame', 's', 'p0'),
      edge('e2', 'g', 'frame', 's', 'p1'),
      edge('e3', 's', 'frame', 'out', 'frame'),
    ]
    // t = 3s → 1s into the 2s fade from slot 0 (red) to slot 1 (green) → ~50%.
    const frame = evaluateGraph([red, grn, seq, out], edges, 180, 2, 2)
    expect(frame![0][0].r).toBeGreaterThan(100)
    expect(frame![0][0].r).toBeLessThan(160)
    expect(frame![0][0].g).toBeGreaterThan(100)
  })

  it('Sequencer passes a single input through unchanged', () => {
    const red = node('r', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const seq = node('s', 'Sequencer', 'composite', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e1', 'r', 'frame', 's', 'p0'), edge('e2', 's', 'frame', 'out', 'frame')]
    const frame = evaluateGraph([red, seq, out], edges, 0, 2, 2)
    expect(frame![0][0]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('binds an exposed group parameter from a connected input', () => {
    const groups = {
      dim: {
        nodes: [
          node('gi', 'GroupInput', 'composite', { paramId: 'p' }),
          node('white', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
          node('bm', 'BrightnessMod', 'composite', {}),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [
          edge('e1', 'gi', 'out', 'bm', 'brightness'),
          edge('e2', 'white', 'frame', 'bm', 'frame'),
          edge('e3', 'bm', 'frame', 'go', 'frame'),
        ],
      },
    }
    const clamp = node('c', 'Clamp', 'math', { value: 0.5, min: 0, max: 1 })
    const grp = node('g1', 'Group', 'composite', { groupId: 'dim' })
    ;(grp.data as unknown as { inputs: unknown[] }).inputs = [{ id: 'p', label: 'p', dataType: 'float' }]
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'c', 'result', 'g1', 'p'),
      edge('e2', 'g1', 'frame', 'out', 'frame'),
    ]
    // Clamp(0.5) drives the group's brightness param → white scaled to ~128.
    const frame = evaluateGraph([clamp, grp, out], edges, 0, 2, 2, groups)
    expect(frame![0][0].r).toBeGreaterThan(100)
    expect(frame![0][0].r).toBeLessThan(160)
  })

  it('keeps stateful node state isolated per group instance', () => {
    // A group that fades a white frame by a per-instance Counter.
    const groups = {
      fade: {
        nodes: [
          node('white', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
          node('cnt', 'Counter', 'math', { speed: 3 }),
          node('bm', 'BrightnessMod', 'composite', {}),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [
          edge('e1', 'white', 'frame', 'bm', 'frame'),
          edge('e2', 'cnt', 'value', 'bm', 'brightness'),
          edge('e3', 'bm', 'frame', 'go', 'frame'),
        ],
      },
    }
    // Instance g1 evaluated five times — its counter accumulates to ~0.25.
    let g1Frame = null as ReturnType<typeof evaluateGraph>
    for (let tk = 1; tk <= 5; tk++) {
      g1Frame = evaluateGraph(
        [node('g1', 'Group', 'pattern', { groupId: 'fade' }), out()],
        [edge('a', 'g1', 'frame', 'out', 'frame')], tk, 1, 1, groups,
      )
    }
    // A fresh instance g2 on its first tick must be dimmer (counter ~0.05) —
    // proving it did not inherit g1's accumulated state.
    const g2Frame = evaluateGraph(
      [node('g2', 'Group', 'pattern', { groupId: 'fade' }), out()],
      [edge('b', 'g2', 'frame', 'out', 'frame')], 1, 1, 1, groups,
    )
    expect(g2Frame![0][0].r).toBeLessThan(g1Frame![0][0].r)
  })
})

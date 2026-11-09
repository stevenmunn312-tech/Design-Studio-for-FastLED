import { describe, it, expect } from 'vitest'
import { COMPOSITE_EVALUATORS } from '../evaluate'
import { generateCpp } from '../../../codegen/cppGenerator'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import type { RGB } from '../../../state/palettes/ledColor'
import type { EvalContext } from '../../../state/evaluator/types'
import type { StudioNode, StudioEdge } from '../../../state/graphStore'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string) =>
  ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge
const studio = {} as StudioNode
let run = 0

describe('Blur2D', () => {
  const blur = (frame: RGB[][], amount: number) => COMPOSITE_EVALUATORS.Blur2D!({
    input: () => frame, num: () => amount, W: frame[0].length, H: frame.length,
  } as unknown as EvalContext, 'n', {}, studio, 'Blur2D').frame as RGB[][]

  it('leaves the frame alone at amount 0, as blur2d(…, 0) does', () => {
    const frame = [[{ r: 0, g: 0, b: 0 }, { r: 255, g: 100, b: 7 }, { r: 0, g: 0, b: 0 }]]
    expect(blur(frame, 0)).toEqual(frame)
  })

  it("runs FastLED's row then column pass, byte for byte", () => {
    // amount 128/255 → byte 128: keep 127, seep 64. Rows: [0,255,0] → [64,127,64].
    // A one-row column pass then keeps 127/255 of each: [32,63,32].
    const px = (v: number) => ({ r: v, g: v, b: v })
    expect(blur([[px(0), px(255), px(0)]], 128 / 255 + 1e-9)).toEqual([[px(32), px(63), px(32)]])
  })
})

describe('Trails', () => {
  const fadeToBlackBy = (leds: RGB[], n: number, by: number) => {
    for (let i = 0; i < n; i++) {
      leds[i].r = (leds[i].r * (256 - by)) >> 8
      leds[i].g = (leds[i].g * (256 - by)) >> 8
      leds[i].b = (leds[i].b * (256 - by)) >> 8
    }
  }
  const simulate = (decay: number, frames: number, lit: (k: number) => boolean) => {
    const W = 4, H = 1
    const input = (k: number): RGB[][] => [Array.from({ length: W }, (_, x) => (lit(k) && x === k % W ? { r: 250, g: 120, b: 9 } : { r: 0, g: 0, b: 0 }))]
    const cpp = generateCpp([node('src', 'Code', 'code'), node('tr', 'Trails', 'composite', { decay }), node('out', 'MatrixOutput', 'output', { width: W, height: H })], [
      edge('e1', 'src', 'tr', 'frame', 'frame'), edge('e2', 'tr', 'out', 'frame', 'frame'),
    ])
    const lines = cpp.split('\n')
    const start = lines.findIndex((line) => line.includes('// Trails:'))
    const end = lines.findIndex((line, i) => i > start && line === '  }')
    const block = lines.slice(start, end + 1).map((line) => line.replace(/buf_src\b/g, 'src_in'))
    const step = compileCppSnippet(block, ['NUM_LEDS', 'buf_tr', 'src_in', 'CRGB', 't', 'fadeToBlackBy'], [])
    const board: RGB[] = Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 }))
    const key = `trails-${run++}`
    for (let k = 0; k < frames; k++) {
      const frame = input(k)
      const t = k / 60
      step(k * 16, { NUM_LEDS: W, buf_tr: board as never, src_in: frame[0] as never, CRGB: ((r: number, g: number, b: number) => ({ r, g, b })) as never, t, fadeToBlackBy: fadeToBlackBy as never })
      const preview = COMPOSITE_EVALUATORS.Trails!({
        input: () => frame, num: () => decay, t, W, H, stateKey: () => key,
      } as unknown as EvalContext, 'tr', {}, studio, 'Trails').frame as RGB[][]
      expect(board).toEqual(preview[0])
    }
    return board
  }

  it('fades on the board as in the preview, even at the default decay', () => {
    const board = simulate(0.15, 12, () => true)
    // And it does fade: the first lit pixel has decayed from 250.
    expect(board[0].r).toBeLessThan(250)
  })

  it('fades all the way to black at the default decay', () => {
    // Rounded per frame, a channel under ~148 lost less than half a level a
    // frame at 0.15 and stayed lit for ever. Its 3.4 s half-life runs a
    // full-scale channel out within 25 s, on both sides.
    const board = simulate(0.15, 1500, (k) => k < 4)
    expect(board.every((px) => px.r === 0 && px.g === 0 && px.b === 0)).toBe(true)
  })
})

describe('Zones and Blend', () => {
  it('rounds zone edges as the preview does', () => {
    const cpp = generateCpp([
      node('z', 'Zones', 'composite', { aX: 0.3, aW: 0.4 }), node('a', 'Code', 'code'),
      node('out', 'MatrixOutput', 'output', { width: 16, height: 4 }),
    ], [edge('e1', 'a', 'z', 'frame', 'a'), edge('e2', 'z', 'out', 'frame', 'frame')])
    // 0.3*16 = 4.8 starts the zone at column 5, as Math.round does.
    expect(cpp).toContain('for (int _x=(int)floorf(0.3f*WIDTH+0.5f); _x<(int)floorf(0.7f*WIDTH+0.5f) && _x<WIDTH; _x++)')
  })

  it('holds a wired Blend amount to 0..1 before the byte cast', () => {
    const cpp = generateCpp([
      node('bl', 'Blend', 'composite', { blendMode: 'normal', amount: 1.5 }), node('a', 'Code', 'code'), node('b', 'Code', 'code'),
      node('out', 'MatrixOutput', 'output', { width: 4, height: 4 }),
    ], [edge('e1', 'a', 'bl', 'frame', 'a'), edge('e2', 'b', 'bl', 'frame', 'b'), edge('e3', 'bl', 'out', 'frame', 'frame')])
    expect(cpp).toContain('(uint8_t)(constrain(1.5,0.0f,1.0f) * 255)')
  })
})

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

/**
 * Runs a colour node's per-pixel firmware loop on `pixels` and returns them.
 * `head` names the line that opens the loop (its seed copy is dropped, the
 * buffer is already the input); the body runs to the loop's closing line.
 */
function runPixelLoop(nodeType: string, properties: Record<string, unknown>, pixels: RGB[], head: RegExp): RGB[] {
  const cpp = generateCpp([node('src', 'Code', 'code'), node('fx', nodeType, 'composite', properties),
    node('out', 'MatrixOutput', 'output', { width: pixels.length, height: 1 })], [
    edge('e1', 'src', 'fx', 'frame', 'frame'), edge('e2', 'fx', 'out', 'frame', 'frame'),
  ])
  const lines = cpp.split('\n')
  const start = lines.findIndex((line) => head.test(line))
  const end = lines.findIndex((line, i) => i > start && line.trim() === '} }')
  const opening = lines[start].replace(/^.*?(float _\w+ = )/, '$1')
  const block = [opening, ...lines.slice(start + 1, end), '}']
  const leds = pixels.map((px) => ({ ...px }))
  compileCppSnippet(block, ['NUM_LEDS', 'buf_fx'], [])(0, { NUM_LEDS: leds.length, buf_fx: leds as never })
  return leds
}

describe('Mirror', () => {
  const frameOf = (W: number, H: number) => Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => ({ r: (x * 37 + y * 11) % 256, g: (x * 5 + y * 71) % 256, b: (x * y * 13 + 7) % 256 })))
  const board = (properties: Record<string, unknown>, src: RGB[][]): RGB[] => {
    const W = src[0].length, H = src.length
    const cpp = generateCpp([node('src', 'Code', 'code'), node('fx', 'Mirror', 'composite', properties),
      node('out', 'MatrixOutput', 'output', { width: W, height: H })], [
      edge('e1', 'src', 'fx', 'frame', 'frame'), edge('e2', 'fx', 'out', 'frame', 'frame'),
    ])
    const lines = cpp.split('\n')
    const start = lines.findIndex((line) => line.startsWith('  { for(int _y=0;_y<HEIGHT;_y++)'))
    const end = lines.findIndex((line, i) => i > start && line.trimEnd().endsWith(';}}'))
    const block = lines.slice(start, end + 1).map((line) => line.replace('  { for(', '  for(').replace(/CRGB (_b|_x)=/, 'let $1=').replace(/;\}\}$/, ';}'))
    const [, input] = block.join('\n').match(/=(\w+)\[_sy\*WIDTH\+_sx\]/)!
    const [, output] = block.join('\n').match(/(\w+)\[_y\*WIDTH\+_x\]=/)!
    const out: RGB[] = Array.from({ length: W * H }, () => ({ r: 0, g: 0, b: 0 }))
    compileCppSnippet(block, ['WIDTH', 'HEIGHT', input, output, 'CRGB', 'scale8', 'qadd8'], [])(0, {
      WIDTH: W, HEIGHT: H, [input]: src.flat() as never, [output]: out as never,
      CRGB: ((r: number, g: number, b: number) => ({ r, g, b })) as never,
      scale8: ((v: number, s: number) => (v * (s + 1)) >> 8) as never,
      qadd8: ((a: number, b: number) => Math.min(255, a + b)) as never,
    })
    return out
  }
  const preview = (properties: Record<string, unknown>, src: RGB[][]) => COMPOSITE_EVALUATORS.Mirror!({
    input: (_id: string, port: string) => (port === 'frame' ? src : null),
    num: (_id: string, _port: string, p: Record<string, unknown>, key: string, def: number) => Number(p[key] ?? def),
    W: src[0].length, H: src.length,
  } as unknown as EvalContext, 'fx', properties, studio, 'Mirror').frame as RGB[][]

  it.each([[4, 4], [8, 3], [3, 7]])('folds and glows in whole bytes the same way on a %ix%i matrix', (W, H) => {
    const src = frameOf(W, H)
    for (const mirrorMode of ['horizontal', 'vertical', 'quad', 'diagonal']) {
      for (const glow of [false, true]) {
        const properties = { mirrorMode, glow, glowAmount: 0.6, r: 255, g: 200, b: 90 }
        expect(board(properties, src), `${mirrorMode} glow ${glow}`).toEqual(preview(properties, src).flat())
      }
    }
  })

  it('folds a wide panel across its own corner-to-corner diagonal', () => {
    const src = frameOf(8, 3)
    const out = preview({ mirrorMode: 'diagonal', glow: false }, src)
    // The bottom row lies below the diagonal and keeps its own pixels;
    // clamping min(x, y) had copied pixel (2, 2) across every column past 2.
    expect(out[2]).toEqual(src[2])
    // Above the diagonal, the top row mirrors the first column.
    expect(out[0][7]).toEqual(src[2][0])
    expect(out[0][0]).toEqual(src[0][0])
  })
})

describe('Brightness', () => {
  it('rounds on the board as the preview does', () => {
    const pixels = [{ r: 1, g: 3, b: 5 }, { r: 255, g: 128, b: 77 }, { r: 0, g: 254, b: 9 }]
    for (const brightness of [0.5, 0.3, 1, 1.7, 3]) {
      const cpp = generateCpp([node('src', 'Code', 'code'), node('fx', 'BrightnessMod', 'composite', { brightness }),
        node('out', 'MatrixOutput', 'output', { width: pixels.length, height: 1 })], [
        edge('e1', 'src', 'fx', 'frame', 'frame'), edge('e2', 'fx', 'out', 'frame', 'frame'),
      ])
      const line = cpp.split('\n').find((l) => l.includes('float _br ='))!
      const statement = line.slice(line.indexOf('float _br =')).replace(/ \}$/, '')
      const buffer = statement.match(/(\w+)\[_i\] = CRGB/)![1]
      const leds = pixels.map((px) => ({ ...px }))
      compileCppSnippet([statement], ['NUM_LEDS', buffer, 'CRGB'], [])(0, {
        NUM_LEDS: leds.length, [buffer]: leds as never, CRGB: ((r: number, g: number, b: number) => ({ r, g, b })) as never,
      })
      const preview = COMPOSITE_EVALUATORS.BrightnessMod!({
        input: () => [pixels], num: () => brightness,
      } as unknown as EvalContext, 'fx', {}, studio, 'BrightnessMod').frame as RGB[][]
      expect(leds, `brightness ${brightness}`).toEqual(preview[0])
    }
  })
})

describe('Saturation', () => {
  const preview = (properties: Record<string, unknown>, pixels: RGB[]) => COMPOSITE_EVALUATORS.Saturation!({
    input: () => [pixels], num: (_id: string, _port: string, props: Record<string, unknown>) => Number(props.amount),
  } as unknown as EvalContext, 'fx', properties, studio, 'Saturation').frame as RGB[][]

  it('keeps brightness the same way on the board, rounding both sides', () => {
    // Every channel lands somewhere off a whole level, so truncating on one
    // side would show here.
    const pixels = [
      { r: 170, g: 140, b: 120 }, { r: 12, g: 200, b: 255 }, { r: 3, g: 2, b: 1 },
      { r: 250, g: 128, b: 9 }, { r: 90, g: 90, b: 91 }, { r: 0, g: 0, b: 0 },
    ]
    for (const amount of [0, 0.4, 1.375, 1.825, 2]) {
      const properties = { amount, keepBrightness: true }
      expect(runPixelLoop('Saturation', properties, pixels, /float _sm = fmaxf/), `amount ${amount}`)
        .toEqual(preview(properties, pixels)[0])
    }
  })
})

describe('Blend', () => {
  const pixels = (...values: number[][]) => values.map(([r, g, b]) => ({ r, g, b }))
  const A = pixels([0, 255, 17], [255, 128, 3], [90, 90, 90], [1, 2, 254])
  const B = pixels([255, 0, 200], [0, 127, 250], [91, 10, 0], [254, 253, 1])

  // Every mode, normal included, crosses on the same bytes on both sides.
  it.each(['normal', 'multiply', 'screen', 'overlay', 'add', 'difference', 'lighten'])('runs %s through the shared kernel', (blendMode) => {
    for (const amount of [0, 0.25, 0.5, 0.999, 1]) {
      const properties = { blendMode, amount }
      const cpp = generateCpp([node('a', 'Code', 'code'), node('b', 'Code', 'code'), node('bl', 'Blend', 'composite', properties),
        node('out', 'MatrixOutput', 'output', { width: A.length, height: 1 })], [
        edge('e1', 'a', 'bl', 'frame', 'a'), edge('e2', 'b', 'bl', 'frame', 'b'), edge('e3', 'bl', 'out', 'frame', 'frame'),
      ])
      const lines = cpp.split('\n')
      const start = lines.findIndex((line) => line.includes('uint8_t _opAll='))
      const end = lines.findIndex((line, i) => i > start && line.trim().endsWith('} }'))
      const pair = lines.slice(start, end + 1).join('\n').match(/CRGB _a=(\w+)\[_i\], _b=(\w+)\[_i\];/)!
      const block = lines.slice(start, end + 1).map((line) => line.replace('CRGB _a=', 'let _a=').replace(/\} \}$/, '}'))
      const leds = A.map((px) => ({ ...px }))
      compileCppSnippet(block, ['NUM_LEDS', pair[1], pair[2], 'CRGB'], [])(0, {
        NUM_LEDS: leds.length, [pair[1]]: leds as never, [pair[2]]: B as never,
        CRGB: ((r: number, g: number, b: number) => ({ r, g, b })) as never,
      })
      const preview = COMPOSITE_EVALUATORS.Blend!({
        input: (_id: string, port: string) => (port === 'a' ? [A] : port === 'b' ? [B] : null),
        num: () => amount, W: A.length, H: 1,
      } as unknown as EvalContext, 'bl', properties, studio, 'Blend').frame as RGB[][]
      expect(leds, `${blendMode} at ${amount}`).toEqual(preview[0])
    }
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
    expect(cpp).toContain('(uint8_t)(constrain(1.5,0.0f,1.0f)*255.0f)')
  })
})

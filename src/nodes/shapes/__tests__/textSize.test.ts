import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, isPropertyEnabled, libraryDefaults, propertyMeta } from '../../../state/nodeLibrary'
import { FONT_H, FONT_W, TEXT_LINE_GAP, TEXT_SIZE, textBlockLayout, textColumns, textSize } from '../../shared/font'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
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
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

let run = 0
function render(nodes: StudioNode[], edges: StudioEdge[], id: string, W: number, H: number, tick = 0): Frame {
  return evaluateGraphFull(nodes, edges, tick, W, H, {}, true, true).outputs.get(id)!.frame as Frame
}
const text = (props: Record<string, unknown>, W: number, H: number, tick = 0) => {
  const id = `t${run++}`
  return render([node(id, 'Text', props)], [], id, W, H, tick)
}
const wired = (value: string, props: Record<string, unknown>, W: number, H: number, tick = 0) => {
  const id = `t${run++}`
  return render([node('v', 'TextValue', { text: value }), node(id, 'Text', props)], [edge('e', 'v', 'text', id, 'text')], id, W, H, tick)
}
const clock = (props: Record<string, unknown>, W: number, H: number) => {
  const id = `c${run++}`
  return render([node(id, 'ClockDisplay', props)], [], id, W, H)
}
const lit = (f: Frame) => f.map((row) => row.map((px) => (px.r + px.g + px.b > 0 ? 1 : 0)))

/**
 * The emitted Text block run in JavaScript into a frame of lit pixels: C++
 * integer division becomes `__idiv`, the buffer `__out`, and a wired string's
 * source `__text`.
 */
function sketchFrame(nodes: StudioNode[], edges: StudioEdge[], marker: string, W: number, H: number, value = ''): number[][] {
  const cpp = generateCpp(
    [...nodes, node('out', 'MatrixOutput', { form: 'matrix', width: W, height: H })],
    [...edges, edge('o', 't', 'frame', 'out', 'frame')], {}, { deferPruning: true },
  )
  const lines = cpp.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`  { // ${marker}`))
  expect(start, marker).toBeGreaterThanOrEqual(0)
  let depth = 0, end = start
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
    if (depth === 0) { end = i; break }
  }
  const block = lines.slice(start, end + 1).map((line) => {
    let out = line
      .replace(/const char\* _ts = [^;]+;/, 'let _ts = __text;')
      .replace(/fill_solid\([^;]+;/, '')
      .replace(/\bbuf_\w+\[/g, '__out[')
      .replace(/CRGB\((\d+),\s*(\d+),\s*(\d+)\)/g, '1')
      .replace(/int (\w+)\[\d+\] = \{([^}]*)\};/, 'let $1 = [$2];')
    for (let prev = ''; prev !== out;) {
      prev = out
      out = out.replace(/([A-Za-z_]\w*|__idiv\([^()]*\)) \/ (\d+)(?![.\d])/g, '__idiv($1, $2)')
    }
    return out
  })
  const fontCol = (ch: string, c: number) => textColumns(ch, undefined, 0)[c] ?? 0
  const step = compileCppSnippet(block, ['WIDTH', 'HEIGHT', '__out', '__text', '__idiv', '_fontCol', 't'], [])
  const out = new Array(W * H).fill(0)
  step(0, { WIDTH: W, HEIGHT: H, __out: out as never, __text: value as never, __idiv: ((a: number, b: number) => Math.trunc(a / b)) as never, _fontCol: fontCol as never, t: 0 })
  return Array.from({ length: H }, (_, y) => out.slice(y * W, y * W + W).map((v) => (v ? 1 : 0)))
}

describe('Text and Clock Display size', () => {
  it('reads Size as a whole scale from 1 to 4', () => {
    expect([undefined, 'x', 0, 1, 1.4, 1.6, 2, 4, 9, -3].map(textSize)).toEqual([1, 1, 1, 1, 1, 2, 2, 4, 4, 1])
    expect(libraryDefaults('Text').size).toBe(TEXT_SIZE.default)
    expect(libraryDefaults('ClockDisplay').size).toBe(TEXT_SIZE.default)
    for (const type of ['Text', 'ClockDisplay']) {
      expect(propertyMeta(type, 'size')).toEqual({ control: 'slider', min: 1, max: 4, step: 1 })
    }
    expect(isPropertyEnabled('ClockDisplay', 'size', { displayMode: 'Analog' })).toBe(false)
    for (const displayMode of ['Digital HH:MM', 'Analog + Date', 'Timer']) {
      expect(isPropertyEnabled('ClockDisplay', 'size', { displayMode })).toBe(true)
    }
  })

  it('scales every measure of the layout, gaps and line spacing included', () => {
    const one = textBlockLayout('AB\nC')
    for (const scale of [2, 3, 4]) {
      const layout = textBlockLayout('AB\nC', undefined, 1, TEXT_LINE_GAP, scale)
      expect(layout.lines.map((line) => line.cols)).toEqual(one.lines.map((line) => line.cols))
      expect(layout.lines.map((line) => line.width)).toEqual([(FONT_W + 1) * 2 * scale, (FONT_W + 1) * scale])
      expect(layout.width).toBe(one.width * scale)
      expect(layout.height).toBe(one.height * scale)
      expect(layout.lineStep).toBe((FONT_H + TEXT_LINE_GAP) * scale)
    }
  })

  it('draws size 2 to 4 as the size-1 text upscaled', () => {
    const at = (size: number) => text({ text: 'HI\n42', size, units: 'pixels', x: 0, y: 0, hAlign: 'left', vAlign: 'top' }, 16 * size, 12 * size)
    const one = lit(at(1))
    for (const size of [2, 3, 4]) {
      const big = lit(at(size))
      expect(big, `size ${size}`).toEqual(big.map((row, y) => row.map((_, x) => one[Math.floor(y / size)][Math.floor(x / size)])))
    }
    // The clock's digits the same way.
    const face = (size: number) => clock({ displayMode: 'Digital HH:MM:SS', size, units: 'pixels', x: 0, y: 0, hAlign: 'left', vAlign: 'top' }, 16 * size, 12 * size)
    const clockOne = lit(face(1))
    expect(clockOne.flat().some(Boolean)).toBe(true)
    const clockTwo = lit(face(2))
    expect(clockTwo).toEqual(clockTwo.map((row, y) => row.map((_, x) => clockOne[Math.floor(y / 2)][Math.floor(x / 2)])))
  })

  it('scrolls a scaled line all the way through, its scaled width plus the matrix', () => {
    // At 10 px/s, 'HI' (8 px with its gaps) at size 1 is gone and back in
    // (8 + 16) / 10 s; at size 2 it takes (16 + 16) / 10 s.
    const props = { text: 'HI', scroll: 10, hAlign: 'left', units: 'pixels', x: 0 }
    for (const [size, period] of [[1, 24], [2, 32]]) {
      const frames = (tick: number) => lit(text({ ...props, size }, 16, 12, tick))
      expect(frames(period * 6)).toEqual(frames(0))
      expect(frames(period * 3)).not.toEqual(frames(0))
    }
  })

  it.each([1, 2, 3])('draws the same pixels in the sketch at size %i', (size) => {
    const cases: [Record<string, unknown>, number, number][] = [
      [{ text: 'HELLO' }, 24, 12],
      [{ text: 'HI\nYOU', hAlign: 'left', vAlign: 'bottom' }, 20, 24],
      [{ text: 'AB', wrap: true, x: 0.9, y: 0.1 }, 16, 12],
      [{ text: 'Q7', units: 'pixels', x: 3, y: 2, letterSpacing: 2 }, 24, 16],
    ]
    for (const [props, W, H] of cases) {
      const marker = `Text "${String(props.text).replace(/\n/g, '?')}"`
      expect(sketchFrame([node('t', 'Text', { ...props, size })], [], marker, W, H), `${marker} ${W}x${H}`)
        .toEqual(lit(text({ ...props, size }, W, H)))
    }
    for (const wrap of [false, true]) {
      const props = { size, wrap, x: 0.4, letterSpacing: 2 }
      expect(sketchFrame([node('v', 'TextValue', { text: 'A1:' }), node('t', 'Text', props)], [edge('e', 'v', 'text', 't', 'text')], 'Text (wired)', 20, 12, 'A1:'), `wired ${wrap}`)
        .toEqual(lit(wired('A1:', props, 20, 12)))
    }
  })

  it('leaves the size-1 sketch lines as they were', () => {
    const cpp = (nodes: StudioNode[], edges: StudioEdge[] = []) => generateCpp(
      [...nodes, node('out', 'MatrixOutput')], [...edges, edge('o', nodes.at(-1)!.id, 'frame', 'out', 'frame')], {}, { deferPruning: true },
    )
    const baked = cpp([node('t', 'Text', { text: 'HI\nYO' })])
    expect(baked).toContain('const int _tn_t_0 = 8;')
    expect(baked).toContain('uint8_t _col = _txt_t_0[_ci];')
    expect(baked).toContain('for (int _r = 0; _r < 5; _r++) if (_col & (1 << _r)) { int _yy = (_sy + 6) + _r - _offY;')
    const two = cpp([node('t', 'Text', { text: 'HI\nYO', size: 2 })])
    expect(two).toContain('const int _tn_t_0 = 16;')
    expect(two).toContain('uint8_t _col = _txt_t_0[_ci / 2];')
    expect(two).toContain('for (int _r = 0; _r < 10; _r++) if (_col & (1 << (_r / 2))) { int _yy = (_sy + 12) + _r - _offY;')
    const wiredCpp = cpp([node('v', 'TextValue', { text: 'HI' }), node('t', 'Text', { size: 3 })], [edge('e', 'v', 'text', 't', 'text')])
    expect(wiredCpp).toContain('int _tn = _tl * 12;')
    expect(wiredCpp).toContain('int _gc = _ci / 3 % 4; if (_gc >= 3) continue; uint8_t _col = _fontCol(_ts[_ci / 3 / 4], _gc);')
    const clockCpp = cpp([node('c', 'ClockDisplay', { size: 2 })])
    expect(clockCpp).toContain('for (int _c = 0; _c < 6; _c++) { int _x = _sx + _i * 6 + _c; if (_x < 0 || _x >= WIDTH) continue; uint8_t _bits = _cols[_c / 2];')
    expect(clockCpp).toContain('for (int _r = 0; _r < 10; _r++) if (_bits & (1 << (_r / 2))) _clkPx(_x, _sy + _r, _col); }')
    // Two lines of size-2 digits: 22 rows, the second 12 below the first,
    // and "HH:MM" 30 columns.
    const twoLine = cpp([node('c', 'ClockDisplay', { displayMode: 'Digital HH:MM:SS', size: 2 })])
    expect(twoLine).toContain('(22) * 0.5f')
    expect(twoLine).toContain('(30) * 0.5f')
    expect(twoLine).toContain('_clkText(_clkSub_c, _clkSx1_c, _clkSy_c + 12, ')
    const oneLine = cpp([node('c', 'ClockDisplay', { displayMode: 'Digital HH:MM:SS' })])
    expect(oneLine).toContain('(11) * 0.5f')
    expect(oneLine).toContain('_clkText(_clkSub_c, _clkSx1_c, _clkSy_c + 6, ')
  })
})

describe('Text and Clock Display at size 1', () => {
  // Captured before Size: the preview and the sketch draw size 1 byte for
  // byte as they did.
  const hash = (value: string) => {
    let h = 0x811c9dc5
    for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193) >>> 0
    return h.toString(16).padStart(8, '0')
  }
  const textCases: [Record<string, unknown>, number, number, number][] = [
    [{}, 16, 16, 0],
    [{ text: 'HI\nTHERE', hAlign: 'left', vAlign: 'bottom' }, 20, 12, 0],
    [{ text: 'WRAP ME', wrap: true, scroll: 7 }, 16, 8, 50],
    [{ text: 'UP\nDOWN', scroll: -5, scrollAxis: 'vertical' }, 12, 20, 33],
    [{ text: 'PX', units: 'pixels', x: 3, y: 2, letterSpacing: 2 }, 24, 8, 0],
  ]
  const clockModes = ['Digital HH:MM', 'Digital HH:MM:SS', 'Digital 12H', 'Digital + Date', 'Analog + Date', 'Stopwatch', 'Timer']
  const sketch = (nodes: StudioNode[], edges: StudioEdge[] = []) => generateCpp([...nodes, node('out', 'MatrixOutput')], edges)

  it('renders as before', () => {
    const hashes = [
      ...textCases.map(([props, W, H, tick]) => hash(JSON.stringify(text(props, W, H, tick)))),
      hash(JSON.stringify(wired('AB:9', { scroll: 4 }, 16, 8, 20))),
      ...clockModes.map((displayMode) => hash(JSON.stringify(clock({ displayMode }, 20, 16)))),
    ]
    expect(hashes.join(' ')).toBe(PREVIEW_HASHES)
  })

  it('generates the sketch as before', () => {
    const edges = (target: string) => [edge('o', target, 'frame', 'out', 'frame')]
    const hashes = [
      ...textCases.map(([props]) => hash(sketch([node('t', 'Text', props)], edges('t')))),
      hash(sketch([node('v', 'TextValue', { text: 'AB:9' }), node('t', 'Text', { scroll: 4, wrap: true })], [edge('e', 'v', 'text', 't', 'text'), ...edges('t')])),
      ...clockModes.map((displayMode) => hash(sketch([node('c', 'ClockDisplay', { displayMode })], edges('c')))),
    ]
    expect(hashes.join(' ')).toBe(SKETCH_HASHES)
  })
})

const PREVIEW_HASHES = '9285c90d ea9668fd de52a05d cbe369cd 077f6a4d c22913fd 75e37b9b e79b0e47 e79b0e47 67e9992c ba711729 5071ccff 46c2e59c'
const SKETCH_HASHES = '90c8c058 1f80010e 8069850c cace44df f3b771ee 8f97646a aa125f57 1105757d 1105757d 9d1e5860 8a50848f 1c392b97 ef07c152'

import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, isPropertyEnabled, libraryDefaults, propertyMeta } from '../../../state/nodeLibrary'
import {
  DEFAULT_FONT_ID, TEXT_FONTS, TEXT_FONT_IDS, TEXT_LINE_GAP, textBlockLayout, textColumns, type TextFontId,
} from '../../shared/font'
import { fontColCppName } from '../../shared/fontCpp'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import type { Frame } from '../../../state/palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

const OTHER_FONTS = TEXT_FONT_IDS.filter((id) => id !== DEFAULT_FONT_ID)

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
function render(nodes: StudioNode[], edges: StudioEdge[], id: string, W: number, H: number): Frame {
  return evaluateGraphFull(nodes, edges, 0, W, H, {}, true, true).outputs.get(id)!.frame as Frame
}
const text = (props: Record<string, unknown>, W: number, H: number) => {
  const id = `f${run++}`
  return render([node(id, 'Text', props)], [], id, W, H)
}
const wired = (value: string, props: Record<string, unknown>, W: number, H: number) => {
  const id = `f${run++}`
  return render([node('v', 'TextValue', { text: value }), node(id, 'Text', props)], [edge('e', 'v', 'text', id, 'text')], id, W, H)
}
const clock = (props: Record<string, unknown>, W: number, H: number) => {
  const id = `g${run++}`
  return render([node(id, 'ClockDisplay', props)], [], id, W, H)
}
const lit = (f: Frame) => f.map((row) => row.map((px) => (px.r + px.g + px.b > 0 ? 1 : 0)))

const sketch = (nodes: StudioNode[], edges: StudioEdge[] = [], target = nodes.at(-1)!.id) => generateCpp(
  [...nodes, node('out', 'MatrixOutput', { form: 'matrix', width: 32, height: 16 })],
  [...edges, edge('o', target, 'frame', 'out', 'frame')], {}, { deferPruning: true },
)

/**
 * The emitted Text block run in JavaScript into a frame of lit pixels, as
 * textSize.test.ts does: C++ integer division becomes `__idiv`, the buffer
 * `__out`, a wired string's source `__text`, and the font's lookup the same
 * table the generator wrote it from.
 */
function sketchFrame(nodes: StudioNode[], edges: StudioEdge[], marker: string, W: number, H: number, fontId: TextFontId, value = ''): number[][] {
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
  const lookup = fontColCppName(fontId)
  const block = lines.slice(start, end + 1).map((line) => {
    let out = line
      // The marker carries the typed text, whose brackets are not code.
      .replace(/^ {2}\{ \/\/ .*$/, '  {')
      .replace(/const char\* _ts = [^;]+;/, 'let _ts = __text;')
      .replace(/fill_solid\([^;]+;/, '')
      .replace(/\bbuf_\w+\[/g, '__out[')
      .replace(/CRGB\((\d+),\s*(\d+),\s*(\d+)\)/g, '1')
      .replace(/int (\w+)\[\d+\] = \{([^}]*)\};/, 'let $1 = [$2];')
      .split(`${lookup}(`).join('__fontCol(')
    for (let prev = ''; prev !== out;) {
      prev = out
      out = out.replace(/([A-Za-z_]\w*|__idiv\([^()]*\)) \/ (\d+)(?![.\d])/g, '__idiv($1, $2)')
    }
    return out
  })
  const fontCol = (ch: string, c: number) => textColumns(ch, TEXT_FONTS[fontId], 0)[c] ?? 0
  const step = compileCppSnippet(block, ['WIDTH', 'HEIGHT', '__out', '__text', '__idiv', '__fontCol', 't'], [])
  const out = new Array(W * H).fill(0)
  step(0, { WIDTH: W, HEIGHT: H, __out: out as never, __text: value as never, __idiv: ((a: number, b: number) => Math.trunc(a / b)) as never, __fontCol: fontCol as never, t: 0 })
  return Array.from({ length: H }, (_, y) => out.slice(y * W, y * W + W).map((v) => (v ? 1 : 0)))
}

describe('Text and Clock Display font', () => {
  it('offers the fonts as a select that defaults to 3x5', () => {
    for (const type of ['Text', 'ClockDisplay']) {
      expect(libraryDefaults(type).font).toBe('3x5')
      expect(propertyMeta(type, 'font')).toMatchObject({ control: 'select', options: ['3x5', '4x6', '5x8', '6x8'] })
    }
    expect(isPropertyEnabled('ClockDisplay', 'font', { displayMode: 'Analog' })).toBe(false)
    for (const displayMode of ['Digital HH:MM', 'Analog + Date', 'Timer']) {
      expect(isPropertyEnabled('ClockDisplay', 'font', { displayMode })).toBe(true)
    }
  })

  it('generates the sketch a graph had before Font, whatever the property holds', () => {
    // A save from before Font has no `font` at all; one with a value that is
    // not a font id (hand-edited, or hostile) must never reach the C++.
    const graphs: [string, (font: Record<string, unknown>) => string][] = [
      ['typed', (font) => sketch([node('t', 'Text', { text: 'Hello\n42%', scroll: 3, ...font })])],
      ['wired', (font) => sketch([node('v', 'TextValue', { text: 'abc' }), node('t', 'Text', { size: 2, ...font })], [edge('e', 'v', 'text', 't', 'text')])],
      ['clock', (font) => sketch([node('t', 'ClockDisplay', { displayMode: 'Digital 12H', ...font })])],
    ]
    for (const [name, cpp] of graphs) {
      const before = cpp({ font: undefined })
      expect(cpp({ font: '3x5' }), name).toBe(before)
      expect(cpp({ font: '5x8"; system("x"); //' }), name).toBe(before)
      expect(cpp({ font: 'constructor' }), name).toBe(before)
      expect(before, name).not.toMatch(/_fontCols?_\dx\d|Studio (?!3x5)\dx\d font/)
    }
  })

  it('keeps lower case in a font that has it and folds it in 3x5', () => {
    const at = (value: string, font: string) => lit(text({ text: value, font, units: 'pixels', x: 0, y: 0, hAlign: 'left', vAlign: 'top' }, 32, 10))
    expect(at('gap', '3x5')).toEqual(at('GAP', '3x5'))
    for (const font of OTHER_FONTS) expect(at('gap', font), font).not.toEqual(at('GAP', font))
  })

  it.each(OTHER_FONTS)('draws the %s preview from the font table, descenders included', (fontId) => {
    const font = TEXT_FONTS[fontId]
    const frame = lit(text({ text: 'gy', font: fontId, units: 'pixels', x: 0, y: 0, hAlign: 'left', vAlign: 'top' }, 16, 10))
    const cols = textColumns('gy', font, 1)
    const expected = Array.from({ length: 10 }, (_, y) => Array.from({ length: 16 }, (_, x) => (y < font.h && ((cols[x] ?? 0) >> y) & 1 ? 1 : 0)))
    expect(frame).toEqual(expected)
    // The bottom row of the cell is lit: a column type too narrow, or a row
    // loop stopping at five, would lose it.
    expect(frame[font.h - 1].some(Boolean)).toBe(true)
  })

  it.each(OTHER_FONTS.flatMap((font) => [[font, 1], [font, 2]] as [TextFontId, number][]))('draws the same pixels in the sketch in %s at size %i', (font, size) => {
    const cases: [Record<string, unknown>, number, number][] = [
      [{ text: 'Hey, Jo!' }, 64, 20],
      [{ text: 'gjpqy\n{0}~', hAlign: 'left', vAlign: 'bottom' }, 48, 40],
      [{ text: 'Ab', wrap: true, x: 0.9, y: 0.1 }, 24, 16],
      [{ text: 'Q7', units: 'pixels', x: 3, y: 2, letterSpacing: 2 }, 40, 24],
    ]
    for (const [props, W, H] of cases) {
      const marker = `Text "${String(props.text).replace(/\n/g, '?')}"`
      expect(sketchFrame([node('t', 'Text', { ...props, font, size })], [], marker, W, H, font), `${marker} ${W}x${H}`)
        .toEqual(lit(text({ ...props, font, size }, W, H)))
    }
    for (const wrap of [false, true]) {
      const props = { font, size, wrap, x: 0.4, letterSpacing: 2 }
      expect(sketchFrame([node('v', 'TextValue', { text: 'Gy1:' }), node('t', 'Text', props)], [edge('e', 'v', 'text', 't', 'text')], 'Text (wired)', 48, 20, font, 'Gy1:'), `wired ${wrap}`)
        .toEqual(lit(wired('Gy1:', props, 48, 20)))
    }
  })

  it('bakes only the columns a typed text draws, and no font table', () => {
    const cpp = sketch([node('t', 'Text', { text: 'Hi', font: '5x8' })])
    expect(cpp).toContain(`static const uint8_t _txt_t_0[] = {${textColumns('Hi', TEXT_FONTS['5x8'], 1).join(',')}};`)
    expect(cpp).toContain('for (int _r = 0; _r < 8; _r++) if (_col & (1 << _r))')
    expect(cpp).not.toMatch(/_fontCol|Studio \dx\d font/)
  })

  it('emits a wired font once, and only the fonts wired Texts use', () => {
    const count = (cpp: string, pattern: RegExp) => (cpp.match(pattern) ?? []).length
    const wiredText = (id: string, font: string, base?: string) => ({
      nodes: [node(id, 'Text', { font })],
      edges: [edge(`v-${id}`, 'v', 'text', id, 'text'), ...(base ? [edge(`b-${id}`, base, 'frame', id, 'base')] : [])],
    })
    const source = node('v', 'TextValue', { text: 'abc' })
    const one = wiredText('t', '5x8')
    const single = sketch([source, ...one.nodes], one.edges)
    expect(count(single, /^\/\/ Studio 5x8 font$/gm)).toBe(1)
    expect(single).toContain('uint8_t _col = _fontCol_5x8(_ts[_ci / 6], _gc);')
    expect(single).toContain('int _gc = _ci % 6; if (_gc >= 5) continue;')
    expect(single).not.toMatch(/Studio (3x5|4x6|6x8) font|_fontChars|_fontCol\(/)

    const a = wiredText('a', '5x8'), b = wiredText('b', '5x8', 'a'), c = wiredText('t', '3x5', 'b')
    const three = sketch([source, ...a.nodes, ...b.nodes, ...c.nodes], [...a.edges, ...b.edges, ...c.edges])
    expect(count(three, /^\/\/ Studio 5x8 font$/gm)).toBe(1)
    expect(count(three, /^static uint8_t _fontCol_5x8\(/gm)).toBe(1)
    expect(count(three, /^\/\/ Studio 3x5 font$/gm)).toBe(1)
    expect(count(three, /^static uint8_t _fontCol\(/gm)).toBe(1)
    expect(three).not.toMatch(/Studio (4x6|6x8) font/)
  })

  it.each(OTHER_FONTS)('draws the clock in %s with a column between digits, as the sketch does', (fontId) => {
    const font = TEXT_FONTS[fontId]
    const step = font.w + 1
    // Unwired, the clock reads dashes: five glyphs, each followed by its gap.
    const frame = lit(clock({ displayMode: 'Digital HH:MM:SS', font: fontId, units: 'pixels', x: 0, y: 0, hAlign: 'left', vAlign: 'top' }, 48, 20))
    const layout = textBlockLayout('--:--\n--', font, 1, TEXT_LINE_GAP, 1)
    const expected = Array.from({ length: 20 }, () => new Array(48).fill(0))
    layout.lines.forEach((line, i) => line.cols.forEach((col, x) => {
      for (let r = 0; r < font.h; r++) if ((col >> r) & 1) expected[i * layout.lineStep + r][x] = 1
    }))
    expect(frame).toEqual(expected)
    expect(layout.lines[0].width).toBe(5 * step)

    const cpp = sketch([node('t', 'ClockDisplay', { displayMode: 'Digital HH:MM:SS', font: fontId })])
    const glyphs = [...'0123456789:.-AMP'].map((ch) => `{${textColumns(ch, font, 0).join(',')}}`).join(', ')
    expect(cpp).toContain(`static const uint8_t _clkGlyphs_t[][${font.w}] = {${glyphs}};`)
    expect(cpp).toContain(`uint8_t _cols[${font.w}]; _clkCols(_s[_i], _cols);`)
    expect(cpp).toContain(`for (int _c = 0; _c < ${font.w}; _c++) { int _x = _sx + _i * ${step} + _c;`)
    expect(cpp).toContain(`for (int _r = 0; _r < ${font.h}; _r++) if (_bits & (1 << _r)) _clkPx(_x, _sy + _r, _col); }`)
    // Centred on the same extents the preview lays out: two lines high, the
    // main line five steps wide and the seconds two, the second line one
    // glyph and a line gap below the first.
    expect(cpp).toContain(`(${layout.height}) * 0.5f`)
    expect(cpp).toContain(`(${5 * step}) * 0.5f`)
    expect(cpp).toContain(`(${2 * step}) * 0.5f`)
    expect(cpp).toContain(`_clkText(_clkSub_t, _clkSx1_t, _clkSy_t + ${layout.lineStep}, `)
    expect(cpp).not.toMatch(/Studio \dx\d font|_fontCol/)
  })

  it('scales the clock digits and their gap together', () => {
    const face = (size: number) => lit(clock({ displayMode: 'Digital HH:MM', font: '5x8', size, units: 'pixels', x: 0, y: 0, hAlign: 'left', vAlign: 'top' }, 32 * size, 8 * size))
    const one = face(1), two = face(2)
    expect(one.flat().some(Boolean)).toBe(true)
    expect(two).toEqual(two.map((row, y) => row.map((_, x) => one[Math.floor(y / 2)][Math.floor(x / 2)])))
    expect(sketch([node('t', 'ClockDisplay', { font: '5x8', size: 2 })]))
      .toContain('for (int _c = 0; _c < 10; _c++) { int _x = _sx + _i * 12 + _c; if (_x < 0 || _x >= WIDTH) continue; uint8_t _bits = _cols[_c / 2];')
  })
})

import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import {
  DISPLAY_TEXT_CPP_HELPERS,
  DATE_TIME_CPP_MODE_INDEX,
  textValueCpp,
  formatNumberCpp,
  formatDateTimeCpp,
} from '../displayTextCpp'
import {
  DATE_TIME_TEXT_MODES,
  DISPLAY_TEXT_BUFFER_BYTES,
  DISPLAY_TEXT_NO_READING,
  DISPLAY_TEXT_OVERFLOW,
  DEFAULT_NUMBER_FORMAT,
  displayString,
  cppStringLiteral,
} from '../../state/displayText'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, sh: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const outputNode = node('out', 'MatrixOutput', 'output', {
  width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5,
})

/**
 * A sketch containing `nodes`, with no LED output.
 *
 * `reachableFromOutputs` prunes back from every MatrixOutput, and a text node
 * feeds a display rather than the LEDs — so until display nodes exist there is
 * nothing downstream to keep these alive. Generating without an output is how
 * the emitters get exercised now; the pruning behaviour itself is asserted
 * separately below, because it is the thing that changes when displays become
 * terminals.
 */
function sketchOf(nodes: StudioNode[], edges: StudioEdge[] = []): string {
  return generateCpp(nodes, edges)
}

describe('display text C++ helpers', () => {
  // The helper block restating a constant would be a second definition, and
  // second definitions drift. These assert the emitted C++ is generated from
  // the shared module rather than hand-copied.
  it('carries the shared buffer size', () => {
    expect(DISPLAY_TEXT_CPP_HELPERS).toContain(`#define DS_TEXT_BYTES ${DISPLAY_TEXT_BUFFER_BYTES}`)
  })

  it('carries the shared markers', () => {
    expect(DISPLAY_TEXT_CPP_HELPERS).toContain(DISPLAY_TEXT_NO_READING)
    expect(DISPLAY_TEXT_CPP_HELPERS).toContain(DISPLAY_TEXT_OVERFLOW)
  })

  it('indexes every date-time mode exactly once, in the shared order', () => {
    expect(Object.keys(DATE_TIME_CPP_MODE_INDEX).sort()).toEqual([...DATE_TIME_TEXT_MODES].sort())
    const indices = DATE_TIME_TEXT_MODES.map((mode) => DATE_TIME_CPP_MODE_INDEX[mode])
    expect(indices).toEqual(DATE_TIME_TEXT_MODES.map((_, i) => i))
  })

  // `%.*f` rounds ties by the C library's current mode, which would disagree
  // with the browser on exactly the values a user notices.
  it('rounds through explicit scaling rather than a float conversion', () => {
    expect(DISPLAY_TEXT_CPP_HELPERS).not.toContain('%.*f')
    expect(DISPLAY_TEXT_CPP_HELPERS).toContain('floor(product + 0.5)')
    expect(DISPLAY_TEXT_CPP_HELPERS).toContain('double product = value * scale')
  })

  it('never reaches for an Arduino String', () => {
    expect(DISPLAY_TEXT_CPP_HELPERS).not.toMatch(/\bString\b/)
    expect(DISPLAY_TEXT_CPP_HELPERS).toContain('snprintf')
  })
})

describe('textValueCpp', () => {
  it('bakes the finished literal rather than formatting at runtime', () => {
    expect(textValueCpp('n_t_text', 'BPM')).toBe('  static const char n_t_text[] = "BPM";')
  })

  // A TextValue's text is typed by a user and lands in generated C++.
  it('cannot be escaped out of by hostile text', () => {
    const hostile = '"); digitalWrite(0,1); //'
    const line = textValueCpp('n_t_text', hostile)
    const body = line.slice(line.indexOf('"') + 1, line.lastIndexOf('"'))
    expect(body.replace(/\\[\\"?]/g, '')).not.toContain('"')
    expect(line.endsWith('";')).toBe(true)
  })
})

describe('formatNumberCpp', () => {
  it('declares a bounded buffer and passes every setting through', () => {
    const lines = formatNumberCpp('n_f_text', 'n_a_result', {
      ...DEFAULT_NUMBER_FORMAT, decimals: 2, padWidth: 3, showSign: true, prefix: 'T', suffix: 'C',
    })
    expect(lines[0]).toBe('  char n_f_text[DS_TEXT_BYTES];')
    expect(lines[1]).toContain('_dsFormatNumber(n_f_text, (double)(n_a_result), 2, 3, true, 6, "T", "C")')
  })

  it('escapes prefix and suffix like any other user text', () => {
    const lines = formatNumberCpp('n_f_text', '0', { ...DEFAULT_NUMBER_FORMAT, prefix: '"', suffix: '\\' })
    expect(lines[1]).toContain(cppStringLiteral('"'))
    expect(lines[1]).toContain(cppStringLiteral('\\'))
  })
})

describe('formatDateTimeCpp', () => {
  it('reads the wired DateTime struct', () => {
    const lines = formatDateTimeCpp('n_d_text', 'n_r_dateTime', 'HH:MM:SS')
    expect(lines[1]).toContain('_dsFormatDateTime(n_d_text, 1, n_r_dateTime.valid, n_r_dateTime.hour')
  })

  // A build with no clock wired has no clock; the mask is the honest reading.
  it('emits an invalid reading when nothing is wired', () => {
    const lines = formatDateTimeCpp('n_d_text', null, 'HH:MM')
    expect(lines[1]).toContain('_dsFormatDateTime(n_d_text, 0, false,')
  })
})

describe('generateCpp with text nodes', () => {
  it('emits the helper block once when a text node is present', () => {
    const src = sketchOf([node('t', 'TextValue', 'math', { text: 'HELLO' })])
    const occurrences = src.split('static void _dsFormatNumber').length - 1
    expect(occurrences).toBe(1)
    expect(src).toContain('static const char n_t_text[] = "HELLO";')
  })

  it('leaves the helper block out of a sketch with no text node', () => {
    const src = generateCpp([outputNode], [])
    expect(src).not.toContain('_dsFormatNumber')
    expect(src).not.toContain('DS_TEXT_BYTES')
  })

  it('emits a FormatNumber against its wired upstream value', () => {
    const nodes = [
      node('m', 'Math', 'math', { mathOp: 'add', a: 1, b: 2 }),
      node('f', 'FormatNumber', 'math', { decimals: 1, suffix: 'C' }),
    ]
    const src = sketchOf(nodes, [edge('e', 'm', 'f', 'result', 'value')])
    expect(src).toContain('char n_f_text[DS_TEXT_BYTES];')
    expect(src).toMatch(/_dsFormatNumber\(n_f_text, \(double\)\(n_m_result\), 1, 1, false, 6, "", "C"\)/)
  })

  it('bounds a TextValue at generation time using the shared model', () => {
    const long = 'A'.repeat(300)
    const src = sketchOf([node('t', 'TextValue', 'math', { text: long })])
    expect(src).toContain(`static const char n_t_text[] = ${cppStringLiteral(displayString(long))};`)
  })

  // Today a text node feeds nothing an LED sketch keeps. Recording the current
  // behaviour makes the change visible when displays join the walk as roots.
  it('prunes a text node that reaches no output, like any other dead branch', () => {
    const src = generateCpp([outputNode, node('t', 'TextValue', 'math', { text: 'HELLO' })], [])
    expect(src).not.toContain('n_t_text')
  })
})

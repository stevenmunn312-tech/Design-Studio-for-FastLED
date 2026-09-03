// The Arduino .ino prototype hoist, which cost a whole bench session.
//
// arduino-cli runs ctags over the sketch and inserts a prototype for every
// function it finds *above* all user type definitions. A display helper takes
// its panel struct by reference, so its hoisted prototype names a type that
// does not exist yet and the build fails on a line no generator wrote:
//
//   line 155:  static void _oledIndicator(OledPanel &p, ...);
//   line 295:  struct OledPanel { ... };
//
// The fix is a forward declaration in the preamble. These tests pin the
// ordering rather than the spelling, because the ordering is the rule — the
// same trap already cost the FastLED declarations that sit beside it.

import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { generateShowSketch } from '../showGenerator'
import { playerDisplaysFromGraph } from '../playerDisplays'
import { INFO_DISPLAY_CPP_FORWARD } from '../infoDisplayCpp'
import { SEGMENT_DISPLAY_CPP_FORWARD } from '../segmentDisplayCpp'
import { TFT_DISPLAY_CPP_FORWARD } from '../tftDisplayCpp'
import { CUSTOM_DISPLAY_LVGL_FORWARD } from '../customDisplayLvglCpp'
import { createDisplayDocument } from '../../state/displayEditor'
import { addDisplayWidget } from '../../state/displayEditor'
import type { DisplayDocumentRegistry } from '../../state/displayDocument'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
}) as unknown as StudioNode

const output = node('out', 'MatrixOutput', {
  width: 16, height: 16, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB',
})
const oled = node('oled', 'InfoDisplay', {
  partId: 'sh1106-oled-128x64', infoLayout: 'Status',
  csPin: 1, dcPin: 2, resetPin: 5, sckPin: 6, mosiPin: 7,
})
const segment = node('seg', 'SegmentDisplay', {
  partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19, brightness: 4,
})
const collection = node('coll', 'PatternCollection', { patternIds: [] })
const browser = node('brw', 'InfoDisplay', {
  partId: 'sh1106-oled-128x64', infoLayout: 'Pattern Browser',
  csPin: 1, dcPin: 2, resetPin: 5, sckPin: 6, mosiPin: 7,
})
const tft = node('tft', 'TransportDisplay', {
  partId: 'st7789-tft-240x240', tftLayout: 'Now Playing',
  csPin: 15, dcPin: 2, resetPin: 4, sckPin: 14, mosiPin: 13, backlightPin: 27,
})
const custom = node('custom', 'Display', { displayId: 'custom', partId: 'st7789-tft-240x240' })
const customDisplayDocuments: DisplayDocumentRegistry = {
  custom: addDisplayWidget(createDisplayDocument('custom', 240, 240), 'Text'),
}
const browserWire = {
  id: 'bw', source: 'coll', target: 'brw', sourceHandle: 'patternset', targetHandle: 'patternset',
} as unknown as StudioEdge

/** A generative show: collection -> Music Player -> output. */
const showCollection = node('coll', 'PatternCollection', { patternIds: ['g0'] })
const master = node('master', 'PatternMaster', {})
const showEdges = [
  { id: 's1', source: 'coll', target: 'master', sourceHandle: 'patternset', targetHandle: 'patternset' },
  { id: 's2', source: 'master', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' },
  { id: 's3', source: 'master', target: 'brw', sourceHandle: 'patternSelect', targetHandle: 'patternSelect' },
] as unknown as StudioEdge[]
const showGroups = {
  g0: {
    nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
    edges: [{ id: 'e', source: 'sc', target: 'go', sourceHandle: 'frame', targetHandle: 'frame' }],
  },
}
const showSketch = (displays: StudioNode[]) => generateShowSketch(
  [output, showCollection, master, ...displays], showEdges, showGroups as never,
)

/** Offset of the first function *definition* — where ctags starts hoisting. */
function firstFunctionAt(src: string): number {
  const at = src.search(/^[\w][\w\s*&:<>,]*\([^;]*\)\s*\{/m)
  expect(at, 'no function definition found').toBeGreaterThan(-1)
  return at
}

function declaredBeforeAnyFunction(src: string, declaration: string): void {
  const at = src.indexOf(declaration)
  expect(at, `${declaration} missing`).toBeGreaterThan(-1)
  expect(at, `${declaration} must precede every function definition`)
    .toBeLessThan(firstFunctionAt(src))
}

describe('normal sketches', () => {
  it('names the panel struct before any function that takes one', () => {
    declaredBeforeAnyFunction(generateCpp([output, oled], []), INFO_DISPLAY_CPP_FORWARD)
  })

  it('names the segment struct before any function that takes one', () => {
    declaredBeforeAnyFunction(generateCpp([output, segment], []), SEGMENT_DISPLAY_CPP_FORWARD)
  })

  it('names the colour panel struct before any function that takes one', () => {
    declaredBeforeAnyFunction(generateCpp([output, tft], []), TFT_DISPLAY_CPP_FORWARD)
  })

  it('names the custom display widget struct before any function that takes one', () => {
    declaredBeforeAnyFunction(
      generateCpp([output, custom], [], {}, { displayDocuments: customDisplayDocuments }),
      CUSTOM_DISPLAY_LVGL_FORWARD,
    )
  })

  it('names both when both are on the bench', () => {
    const src = generateCpp([output, oled, segment], [])
    declaredBeforeAnyFunction(src, INFO_DISPLAY_CPP_FORWARD)
    declaredBeforeAnyFunction(src, SEGMENT_DISPLAY_CPP_FORWARD)
  })

  it('declares nothing for a sketch with no display', () => {
    const src = generateCpp([output], [])
    expect(src).not.toContain(INFO_DISPLAY_CPP_FORWARD)
    expect(src).not.toContain(SEGMENT_DISPLAY_CPP_FORWARD)
    expect(src).not.toContain(TFT_DISPLAY_CPP_FORWARD)
    expect(src).not.toContain(CUSTOM_DISPLAY_LVGL_FORWARD)
  })

  // A forward declaration is only worth anything if the definition follows it.
  it('still defines the struct it forward-declared', () => {
    const src = generateCpp(
      [output, oled, segment, tft, custom], [], {}, { displayDocuments: customDisplayDocuments },
    )
    expect(src).toContain('struct OledPanel {')
    expect(src).toContain('struct SegDisplay {')
    expect(src).toContain('struct TftPanel {')
    expect(src).toContain('struct CustomDisplayWidgetRuntime {')
  })
})

// The rule, derived rather than listed.
//
// The three hand-written assertions above each landed after a build broke, and
// the third struct (PatternSel) still slipped through because nobody thought to
// add a fourth row. This reads the emitted sketch instead: any struct defined
// in it that a function takes by reference must be named before the first
// function definition, whatever that struct turns out to be.
describe('every struct a function takes by reference', () => {
  const graphs: Array<[string, () => string]> = [
    ['info display', () => generateCpp([output, oled], [])],
    ['segment display', () => generateCpp([output, segment], [])],
    ['pattern browser', () => generateCpp([output, collection, browser], [browserWire])],
    ['transport display', () => generateCpp([output, tft], [])],
    ['custom display', () => generateCpp([output, custom], [], {}, { displayDocuments: customDisplayDocuments })],
    ['all of them', () => generateCpp(
      [output, oled, segment, tft, collection, browser, custom], [browserWire], {},
      { displayDocuments: customDisplayDocuments },
    )],
  ]

  it.each(graphs)('is declared before any function in a %s sketch', (_label, build) => {
    const src = build()
    const firstFn = firstFunctionAt(src)
    // Structs this sketch defines, and which appear as a by-reference parameter.
    const defined = [...src.matchAll(/^struct\s+(\w+)\s*\{/gm)].map((m) => m[1])
    // String.raw, because in a plain template literal `\b` is a backspace
    // character and `\s` is just an s — the regex then matches nothing and the
    // check passes vacuously. Emitted C++ bit us the same way twice tonight.
    const byReference = defined.filter((name) => new RegExp(String.raw`\b${name}\s*&`).test(src))
    expect(byReference.length, 'no by-reference struct params found — the check would pass vacuously')
      .toBeGreaterThan(0)

    for (const name of byReference) {
      const declared = src.indexOf(`struct ${name};`)
      expect(declared, `struct ${name}; is never forward-declared`).toBeGreaterThan(-1)
      expect(declared, `struct ${name}; must precede every function definition`).toBeLessThan(firstFn)
    }
  })
})

describe('the show controller sketch', () => {
  it('names the panel struct before any function that takes one', () => {
    declaredBeforeAnyFunction(showSketch([oled]), INFO_DISPLAY_CPP_FORWARD)
  })

  it('names the segment struct before any function that takes one', () => {
    declaredBeforeAnyFunction(showSketch([segment]), SEGMENT_DISPLAY_CPP_FORWARD)
  })

  it('names the colour panel struct before any function that takes one', () => {
    declaredBeforeAnyFunction(showSketch([tft]), TFT_DISPLAY_CPP_FORWARD)
  })

  // The third generator to draw, and the same rule derived rather than listed:
  // every struct it defines and passes by reference must be named up top.
  it('declares every by-reference struct before any function', () => {
    const src = showSketch([oled, segment, tft, browser])
    const firstFn = firstFunctionAt(src)
    const defined = [...src.matchAll(/^struct\s+(\w+)\s*\{/gm)].map((m) => m[1])
    const byReference = defined.filter((name) => new RegExp(String.raw`\b${name}\s*&`).test(src))
    expect(byReference.length, 'no by-reference struct params found — the check would pass vacuously')
      .toBeGreaterThan(0)
    for (const name of byReference) {
      const declared = src.indexOf(`struct ${name};`)
      expect(declared, `struct ${name}; is never forward-declared`).toBeGreaterThan(-1)
      expect(declared, `struct ${name}; must precede every function definition`).toBeLessThan(firstFn)
    }
  })

  it('declares nothing for a show with no display', () => {
    const src = showSketch([])
    expect(src).not.toContain(INFO_DISPLAY_CPP_FORWARD)
    expect(src).not.toContain(SEGMENT_DISPLAY_CPP_FORWARD)
    expect(src).not.toContain(TFT_DISPLAY_CPP_FORWARD)
  })
})

describe('the SD player sketch', () => {
  const displays = (nodes: StudioNode[]) => playerDisplaysFromGraph(nodes as never, [])

  it('names the panel struct before any function that takes one', () => {
    const src = generatePlayerSketch({}, undefined, { displays: displays([oled]) })
    declaredBeforeAnyFunction(src, INFO_DISPLAY_CPP_FORWARD)
  })

  it('names the segment struct before any function that takes one', () => {
    const src = generatePlayerSketch({}, undefined, { displays: displays([segment]) })
    declaredBeforeAnyFunction(src, SEGMENT_DISPLAY_CPP_FORWARD)
  })

  it('names the colour panel struct before any function that takes one', () => {
    const src = generatePlayerSketch({}, undefined, { displays: displays([tft]) })
    declaredBeforeAnyFunction(src, TFT_DISPLAY_CPP_FORWARD)
  })

  // Both generators draw displays, and teaching only one of them is what
  // produced a sketch calling functions that did not exist.
  it('defines the struct it forward-declared, as the normal sketch does', () => {
    const src = generatePlayerSketch({}, undefined, { displays: displays([tft]) })
    expect(src).toContain('struct TftPanel {')
    expect(src).toContain('_tftBegin(')
  })

  it('declares nothing for a player with no display', () => {
    const src = generatePlayerSketch({}, undefined, {})
    expect(src).not.toContain(INFO_DISPLAY_CPP_FORWARD)
    expect(src).not.toContain(SEGMENT_DISPLAY_CPP_FORWARD)
    expect(src).not.toContain(TFT_DISPLAY_CPP_FORWARD)
  })
})

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
import { playerDisplaysFromGraph } from '../playerDisplays'
import { INFO_DISPLAY_CPP_FORWARD } from '../infoDisplayCpp'
import { SEGMENT_DISPLAY_CPP_FORWARD } from '../segmentDisplayCpp'
import type { StudioNode } from '../../state/graphStore'

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

  it('names both when both are on the bench', () => {
    const src = generateCpp([output, oled, segment], [])
    declaredBeforeAnyFunction(src, INFO_DISPLAY_CPP_FORWARD)
    declaredBeforeAnyFunction(src, SEGMENT_DISPLAY_CPP_FORWARD)
  })

  it('declares nothing for a sketch with no display', () => {
    const src = generateCpp([output], [])
    expect(src).not.toContain(INFO_DISPLAY_CPP_FORWARD)
    expect(src).not.toContain(SEGMENT_DISPLAY_CPP_FORWARD)
  })

  // A forward declaration is only worth anything if the definition follows it.
  it('still defines the struct it forward-declared', () => {
    const src = generateCpp([output, oled, segment], [])
    expect(src).toContain('struct OledPanel {')
    expect(src).toContain('struct SegDisplay {')
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

  it('declares nothing for a player with no display', () => {
    const src = generatePlayerSketch({}, undefined, {})
    expect(src).not.toContain(INFO_DISPLAY_CPP_FORWARD)
    expect(src).not.toContain(SEGMENT_DISPLAY_CPP_FORWARD)
  })
})

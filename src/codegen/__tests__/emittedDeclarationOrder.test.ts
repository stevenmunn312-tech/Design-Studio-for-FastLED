// A node's value must be declared before the line that reads it.
//
// The sibling `emittedSymbols.test.ts` asserts that a symbol the sketch
// mentions, the sketch also declares. This asserts the other half of the same
// property, which turns out to be a different bug: the symbol *was* declared,
// 58 lines further down than the block reading it.
//
// A normal sketch is one `loop()` of straight-line C++, so a node's local is
// only in scope after its own declaration. The generator orders nodes
// topologically to guarantee that — but it deliberately drops edges into a
// display panel first, to keep a panel's own `out -> graph -> set` feedback
// from looking like a cycle. That filter used to drop *every* edge into a
// panel, including `display` and `enabled`, so a source feeding nothing but a
// panel had no reason to be ordered before it. An RTC driving a fixed Clock
// layout emitted its value after the block that read it, and the sketch named
// an undeclared variable.
//
// Every text-level test read that as correct, because the text is correct — it
// is the *order* that is wrong. Only a compiler noticed, four hours into a
// compile matrix. This catches it in a second.

import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge => ({
  id: [source, sourceHandle, target, targetHandle].join('-'),
  source, sourceHandle, target, targetHandle,
}) as StudioEdge

const panel = (id: string, properties: Record<string, unknown> = {}) => node(id, 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
  sckPin: 12, mosiPin: 11, misoPin: 13, csPin: 14, dcPin: 9, resetPin: 8, backlightPin: 7,
  ...properties,
})

/**
 * Every `n_<node>_<port>` local the loop reads, paired with where it is set.
 *
 * Derived from the emitted text rather than from a list of variables, so a
 * node added later is covered without being named here. A declaration is any
 * line that introduces the identifier with a type in front of it or assigns it
 * at the top level of the loop; a use is any other mention.
 */
function firstUseBeforeDeclaration(source: string): string[] {
  const loop = source.slice(source.indexOf('void loop() {'))
  const lines = loop.split('\n')
  const declaredAt = new Map<string, number>()
  const usedAt = new Map<string, number>()
  const declaration = /^\s*(?:static\s+)?[A-Za-z_][A-Za-z0-9_:<>,\s*&]*?\b(n_[A-Za-z0-9_]+)\s*(?:=|\[|;)/
  lines.forEach((line, index) => {
    const declared = declaration.exec(line)
    if (declared && !declaredAt.has(declared[1])) declaredAt.set(declared[1], index)
    for (const match of line.matchAll(/\bn_[A-Za-z0-9_]+\b/g)) {
      const name = match[0]
      if (declared && declared[1] === name) continue
      if (!usedAt.has(name)) usedAt.set(name, index)
    }
  })
  const faults: string[] = []
  for (const [name, used] of usedAt) {
    const declared = declaredAt.get(name)
    // A name with no declaration at all is `emittedSymbols`' business, not this
    // test's; this one is only about order.
    if (declared !== undefined && declared > used) {
      faults.push(`${name}: used on loop line ${used + 1}, declared on ${declared + 1}`)
    }
  }
  return faults
}

describe('emitted declaration order', () => {
  /*
   * The exact shape that regressed: a source wired to nothing but a panel.
   *
   * With an LED output in the graph the source is usually pulled early for
   * other reasons, which is why the three generator fixtures kept compiling
   * while this one did not.
   */
  it('declares an RTC before the fixed layout that reads it', () => {
    const nodes = [node('board', 'Board'), panel('tft', { tftLayout: 'Clock' }), node('rtc', 'RTCInput')]
    const edges = [edge('rtc', 'display', 'tft', 'display')]
    expect(firstUseBeforeDeclaration(generateCpp(nodes, edges))).toEqual([])
  })

  /*
   * A panel's own feedback must still not constrain the order.
   *
   * This is what the over-broad filter was protecting: a slider's output
   * through Math and back into the same panel's Set. Narrowing the filter to
   * widget edges has to leave that working, or the fix trades one broken
   * sketch for another.
   */
  it('orders a panel whose own widget output feeds back into it', () => {
    const nodes = [
      node('board', 'Board'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
      panel('tft'), node('math', 'Math', { mathOp: 'multiply', b: 0.5 }), node('fill', 'SolidColor'),
    ]
    const edges = [
      edge('fill', 'frame', 'out', 'frame'),
      edge('tft', 'widget:slider:out', 'math', 'a'),
      edge('math', 'result', 'tft', 'widget:slider:set'),
    ]
    expect(() => generateCpp(nodes, edges)).not.toThrow()
    expect(firstUseBeforeDeclaration(generateCpp(nodes, edges))).toEqual([])
  })

  it('declares an RTC before a panel that also renders pixels', () => {
    const nodes = [
      node('board', 'Board'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
      panel('tft', { tftLayout: 'Clock' }), node('rtc', 'RTCInput'), node('fill', 'SolidColor'),
    ]
    const edges = [edge('fill', 'frame', 'out', 'frame'), edge('rtc', 'display', 'tft', 'display')]
    expect(firstUseBeforeDeclaration(generateCpp(nodes, edges))).toEqual([])
  })
})

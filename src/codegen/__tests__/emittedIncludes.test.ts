// A sketch that calls a library must declare it.
//
// This one cost a compile that no test could see. `infoDisplayHelpersCpp`
// emits a single `OledPanel` carrying both transports and branches on
// `p.transport` at runtime, so its `Wire` calls are compiled into every build
// that draws an OLED — including one whose only panel is the 7-pin SPI SH1106
// that is actually on the bench. The include, though, was gated on a panel
// being I2C. The result was a sketch that referenced `Wire` without declaring
// it, which fails in the toolchain on a line no generator wrote:
//
//   src/main.ino:402:5: error: 'Wire' was not declared in this scope
//
// Every string-level assertion passed throughout, because the emitted text was
// exactly what the generator meant to emit. What was wrong was the relationship
// between two parts of it.
//
// So this derives the rule instead of listing headers: whatever library object
// the emitted sketch uses, the emitted sketch must include. A driver that grows
// a new dependency is caught here rather than on a bench.

import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { generateShowSketch } from '../showGenerator'
import { playerDisplaysFromGraph } from '../playerDisplays'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, over: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType, category: def.category,
      properties: { ...libraryDefaults(nodeType), ...over },
      inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

const output = node('out', 'MatrixOutput', {
  width: 16, height: 16, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB',
})
// The panel on the bench: 7-pin SPI, and the exact graph that used to fail.
const spiOled = node('oled', 'InfoDisplay', {
  partId: 'sh1106-oled-128x64', infoLayout: 'Status',
  csPin: 25, dcPin: 26, resetPin: 27, sckPin: 14, mosiPin: 13,
})
const i2cOled = node('oled2', 'InfoDisplay', { partId: 'ssd1306-oled-128x64', infoLayout: 'Status' })
const segment = node('seg', 'SegmentDisplay', {
  partId: 'tm1637-4digit-display', clkPin: 32, dioPin: 33, brightness: 4,
})
const tft = node('tft', 'TransportDisplay', { tftLayout: 'Now Playing' })

/** The collection -> Music Player -> output pipeline a show controller needs. */
const showNodes = [
  node('coll', 'PatternCollection', { patternIds: ['g0'] }),
  node('master', 'PatternMaster', {}),
]
const showEdges = [
  { id: 's1', source: 'coll', target: 'master', sourceHandle: 'patternset', targetHandle: 'patternset' },
  { id: 's2', source: 'master', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' },
] as unknown as StudioEdge[]
// GroupOutput is a canvas terminal rather than a NODE_LIBRARY entry, so the
// strict helper above cannot build one.
const bare = (id: string, nodeType: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const showGroups = {
  g0: {
    nodes: [bare('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), bare('go', 'GroupOutput')],
    edges: [{ id: 'e', source: 'sc', target: 'go', sourceHandle: 'frame', targetHandle: 'frame' }],
  },
}

/**
 * Library globals a generated sketch may reach for, and the header behind each.
 *
 * Matched on a use rather than a mention, so a header named in a comment does
 * not satisfy the rule and a call in dead-but-compiled code still demands it —
 * which is the whole point, since the branch that broke this was never taken.
 */
const LIBRARIES: Array<{ object: string; include: string; use: RegExp }> = [
  { object: 'Wire', include: '#include <Wire.h>', use: /(^|[^\w.])Wire\s*\./m },
  { object: 'SPI', include: '#include <SPI.h>', use: /(^|[^\w.])SPI\s*\./m },
]

/** Sketch text with comment lines dropped, so a mention is never a use. */
function code(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

function expectDeclaresWhatItUses(source: string, label: string): void {
  const body = code(source)
  let checked = 0
  for (const library of LIBRARIES) {
    if (!library.use.test(body)) continue
    checked++
    expect(
      source.includes(library.include),
      `${label} uses ${library.object} but never includes it`,
    ).toBe(true)
  }
  expect(checked, `${label} used no known library — the check would pass vacuously`)
    .toBeGreaterThan(0)
}

describe('normal sketches', () => {
  const graphs: Array<[string, StudioNode[]]> = [
    // The regression, first: an SPI-only OLED with no I2C device anywhere.
    ['an SPI OLED alone', [output, spiOled]],
    ['an I2C OLED alone', [output, i2cOled]],
    ['a colour panel alone', [output, tft]],
    ['a colour panel and an SPI OLED', [output, tft, spiOled]],
    ['every display at once', [output, tft, spiOled, segment]],
  ]

  it.each(graphs)('declares what it uses with %s', (label, nodes) => {
    expectDeclaresWhatItUses(generateCpp(nodes, []), `a sketch with ${label}`)
  })
})

describe('the show controller sketch', () => {
  const graphs: Array<[string, StudioNode[]]> = [
    ['an SPI OLED alone', [spiOled]],
    ['an I2C OLED alone', [i2cOled]],
    ['a colour panel alone', [tft]],
    ['every display at once', [tft, spiOled, segment]],
  ]

  it.each(graphs)('declares what it uses with %s', (label, displays) => {
    const source = generateShowSketch(
      [output, ...showNodes, ...displays], showEdges, showGroups as never,
    )
    expectDeclaresWhatItUses(source, `a show sketch with ${label}`)
  })
})

describe('the SD player sketch', () => {
  const graphs: Array<[string, StudioNode[]]> = [
    ['an SPI OLED alone', [spiOled]],
    ['an I2C OLED alone', [i2cOled]],
    ['a colour panel alone', [tft]],
    ['every display at once', [tft, spiOled, segment]],
  ]

  it.each(graphs)('declares what it uses with %s', (label, nodes) => {
    const displays = playerDisplaysFromGraph(nodes as never, [] as never)
    const source = generatePlayerSketch({}, undefined, { displays } as never)
    expectDeclaresWhatItUses(source, `a player sketch with ${label}`)
  })
})

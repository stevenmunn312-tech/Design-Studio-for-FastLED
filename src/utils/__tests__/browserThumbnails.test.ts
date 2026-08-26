// The Pattern Browser, end to end through the generator.
//
// The bake is deliberately not inside generateCpp: baking evaluates patterns,
// and a text emitter has no business doing that nor any way to know whether
// the workspace has been trusted. These check the seam — that the caller bakes,
// the generator emits what it was handed, and a browser with nothing handed to
// it says so on the panel rather than drawing a blank square.

import { describe, it, expect, beforeEach } from 'vitest'
import { bakeBrowserThumbnails, browserPatternIds, patternBrowsers } from '../browserThumbnails'
import { generateCpp } from '../../codegen/cppGenerator'
import { resetEvaluatorState, type GroupRegistry } from '../../state/graphEvaluator'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { THUMBNAIL_BYTES } from '../../state/patternThumbnail'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'output', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

const GROUPS = {
  white: {
    nodes: [node('c', 'SolidColor', { r: 255, g: 255, b: 255 }), node('o', 'GroupOutput')],
    edges: [edge('e', 'c', 'frame', 'o', 'frame')],
  },
  dark: {
    nodes: [node('c', 'SolidColor', { r: 0, g: 0, b: 0 }), node('o', 'GroupOutput')],
    edges: [edge('e', 'c', 'frame', 'o', 'frame')],
  },
} as unknown as GroupRegistry

const browserNode = (over: Record<string, unknown> = {}) => node('brw', 'InfoDisplay', {
  partId: 'sh1106-oled-128x64', infoLayout: 'Pattern Browser',
  csPin: 1, dcPin: 2, resetPin: 5, sckPin: 6, mosiPin: 7, ...over,
})

const output = node('out', 'MatrixOutput', {
  width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB',
})
const collection = node('coll', 'PatternCollection', { patternIds: ['white', 'dark'] })

const graph = (extraNodes: StudioNode[] = [], extraEdges: StudioEdge[] = []) => ({
  nodes: [output, collection, browserNode(), ...extraNodes],
  edges: [edge('e1', 'coll', 'patternset', 'brw', 'patternset'), ...extraEdges],
})

describe('finding the browsers in a graph', () => {
  it('picks out only Info Displays set to Pattern Browser', () => {
    const nodes = [browserNode(), node('other', 'InfoDisplay', { infoLayout: 'Clock' }), output]
    expect(patternBrowsers(nodes).map((n) => n.id)).toEqual(['brw'])
  })

  // Two browsers can show different collections, so guessing from whatever
  // collection is in the graph would give the second one the first's patterns.
  it('reads each browser from its own wire, not from the graph at large', () => {
    const { nodes, edges } = graph()
    expect(browserPatternIds(browserNode(), nodes, edges)).toEqual(['white', 'dark'])
    expect(browserPatternIds(node('lonely', 'InfoDisplay', {}), nodes, edges)).toEqual([])
  })
})

describe('baking for a graph', () => {
  beforeEach(() => resetEvaluatorState())

  it('bakes one entry per pattern, named from the graph', () => {
    const { nodes, edges } = graph()
    const baked = bakeBrowserThumbnails(nodes, edges, GROUPS, true, {
      white: { name: 'WHITEOUT' }, dark: { name: 'NIGHT' },
    })
    expect(baked.brw.map((entry) => entry.name)).toEqual(['WHITEOUT', 'NIGHT'])
    expect(baked.brw[0].thumbnail.data).toHaveLength(THUMBNAIL_BYTES)
  })

  it('falls back to the group id when the graph has no name for it', () => {
    const { nodes, edges } = graph()
    expect(bakeBrowserThumbnails(nodes, edges, GROUPS, true).brw.map((e) => e.name))
      .toEqual(['white', 'dark'])
  })

  it('bakes nothing for a graph with no browser', () => {
    expect(bakeBrowserThumbnails([output, collection], [], GROUPS, true)).toEqual({})
  })

  // Trust is the caller's to know, and an untrusted workspace must not get its
  // patterns evaluated because someone pressed upload. Custom Formula rather
  // than Code: Code's sandbox is async so its first tick is blank either way,
  // which would make this assert nothing.
  it('threads trust into the bake', () => {
    const groups = {
      formula: {
        nodes: [
          node('f', 'CustomFormula', { formula: '1', a: 0, b: 0, palette: 'rainbow' }),
          node('o', 'GroupOutput'),
        ],
        edges: [edge('e', 'f', 'frame', 'o', 'frame')],
      },
    } as unknown as GroupRegistry
    const nodes = [output, node('coll', 'PatternCollection', { patternIds: ['formula'] }), browserNode()]
    const edges = [edge('e1', 'coll', 'patternset', 'brw', 'patternset')]
    const lit = (entry: { thumbnail: { data: Uint8Array } }) =>
      Array.from(entry.thumbnail.data).reduce((n, b) => n + b, 0)

    const trusted = bakeBrowserThumbnails(nodes, edges, groups, true).brw[0]
    expect(lit(trusted), 'the formula must draw when trusted').toBeGreaterThan(0)

    resetEvaluatorState()
    expect(lit(bakeBrowserThumbnails(nodes, edges, groups, false).brw[0])).toBe(0)
  })
})

describe('the generated sketch', () => {
  beforeEach(() => resetEvaluatorState())

  const build = (extra: { thumbnails?: ReturnType<typeof bakeBrowserThumbnails> } = {}) => {
    const { nodes, edges } = graph()
    return generateCpp(nodes, edges, GROUPS, extra)
  }

  it('emits the table, the contract and the selection it drives', () => {
    const { nodes, edges } = graph()
    const src = generateCpp(nodes, edges, GROUPS, {
      thumbnails: bakeBrowserThumbnails(nodes, edges, GROUPS, true),
    })
    expect(src).toContain('#define THUMB_COUNT_brw  2')
    expect(src).toContain('#define SEL_BROWSE_MS')
    expect(src).toContain('static PatternSel _sel_brw;')
    expect(src).toContain('_selBegin(_sel_brw);')
    expect(src).toContain('_oledThumb(')
  })

  // A table nothing reads is flash a build with no browser should not pay for.
  it('emits none of it for a graph with no browser', () => {
    const src = generateCpp([output, node('clock', 'InfoDisplay', { infoLayout: 'Clock' })], [], GROUPS)
    expect(src).not.toContain('PatternSel')
    expect(src).not.toContain('THUMB_COUNT')
  })

  // The honest outcome for a collection nobody was allowed to render: an empty
  // table and "NO PATTERNS", rather than a blank square that looks like a bug.
  it('still builds when nothing was baked for it', () => {
    const src = build()
    expect(src).toContain('#define THUMB_COUNT_brw  0')
    expect(src).toContain('"NO PATTERNS"')
  })

  it('drives the selection from a wired encoder and press', () => {
    const encoder = node('enc', 'EncoderInput', { pinA: 8, pinB: 9, pinSW: 10 })
    const src = generateCpp(
      [output, collection, browserNode(), encoder],
      [
        edge('e1', 'coll', 'patternset', 'brw', 'patternset'),
        edge('e2', 'enc', 'position', 'brw', 'select'),
        edge('e3', 'enc', 'pressed', 'brw', 'confirm'),
      ],
      GROUPS,
    )
    expect(src).toContain('_selEncoderSteps(_sel_brw,')
    expect(src).toContain('_selUpdate(_sel_brw,')
    // The press reaches the contract as the confirm argument rather than being
    // folded into the step count.
    expect(src).toContain(
      '_selUpdate(_sel_brw, THUMB_COUNT_brw, _oledNow_brw, '
      + '_selEncoderSteps(_sel_brw, (long)lroundf(n_enc_position)), n_enc_pressed);')
  })

  it('still draws with no encoder wired, just without stepping', () => {
    expect(build()).toContain('_selUpdate(_sel_brw, THUMB_COUNT_brw, _oledNow_brw, 0, false)')
  })
})

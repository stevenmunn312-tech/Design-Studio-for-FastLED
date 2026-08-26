// The Pattern Browser, end to end through the generator.
//
// The bake is deliberately not inside generateCpp: baking evaluates patterns,
// and a text emitter has no business doing that nor any way to know whether
// the workspace has been trusted. These check the seam — that the caller bakes,
// the generator emits what it was handed, and a browser with nothing handed to
// it says so on the panel rather than drawing a blank square.

import { describe, it, expect, beforeEach } from 'vitest'
import { bakeBrowserThumbnails, browserPlayer, playerPatternIds, patternBrowsers } from '../browserThumbnails'
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

const master = node('master', 'PatternMaster')

// Collection -> player -> panel. The panel names the player, not the
// collection: one wire, and no way to picture a different set from the one
// being selected.
const graph = (extraNodes: StudioNode[] = [], extraEdges: StudioEdge[] = []) => ({
  nodes: [output, collection, master, browserNode(), ...extraNodes],
  edges: [
    edge('e1', 'coll', 'patternset', 'master', 'patternset'),
    edge('e2', 'master', 'patternSelect', 'brw', 'patternSelect'),
    ...extraEdges,
  ],
})

describe('finding the browsers in a graph', () => {
  it('picks out only Info Displays set to Pattern Browser', () => {
    const nodes = [browserNode(), node('other', 'InfoDisplay', { infoLayout: 'Clock' }), output]
    expect(patternBrowsers(nodes).map((n) => n.id)).toEqual(['brw'])
  })

  it('finds the player a browser reads, and the patterns behind it', () => {
    const { nodes, edges } = graph()
    const player = browserPlayer(browserNode(), nodes, edges)
    expect(player?.id).toBe('master')
    expect(playerPatternIds(player!, nodes, edges)).toEqual(['white', 'dark'])
  })

  // Without a player there is no selection to display, so there is nothing to
  // bake a picture of either.
  it('finds no player for an unwired browser', () => {
    const { nodes, edges } = graph()
    expect(browserPlayer(node('lonely', 'InfoDisplay', {}), nodes, edges)).toBeUndefined()
  })
})

describe('baking for a graph', () => {
  beforeEach(() => resetEvaluatorState())

  it('bakes one entry per pattern, named from the graph', () => {
    const { nodes, edges } = graph()
    const baked = bakeBrowserThumbnails(nodes, edges, GROUPS, true, {
      white: { name: 'WHITEOUT' }, dark: { name: 'NIGHT' },
    })
    expect(baked.master.map((entry) => entry.name)).toEqual(['WHITEOUT', 'NIGHT'])
    expect(baked.master[0].thumbnail.data).toHaveLength(THUMBNAIL_BYTES)
  })

  it('falls back to the group id when the graph has no name for it', () => {
    const { nodes, edges } = graph()
    expect(bakeBrowserThumbnails(nodes, edges, GROUPS, true).master.map((e) => e.name))
      .toEqual(['white', 'dark'])
  })

  it('bakes nothing for a graph with no browser', () => {
    expect(bakeBrowserThumbnails([output, collection, master], [], GROUPS, true)).toEqual({})
  })

  // A panel wired to nothing has no selection to show, so baking for it would
  // be pictures of a collection it was never pointed at.
  it('bakes nothing for a browser with no player', () => {
    expect(bakeBrowserThumbnails([output, collection, browserNode()], [], GROUPS, true)).toEqual({})
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
    const nodes = [output, node('coll', 'PatternCollection', { patternIds: ['formula'] }), master, browserNode()]
    const edges = [
      edge('e1', 'coll', 'patternset', 'master', 'patternset'),
      edge('e2', 'master', 'patternSelect', 'brw', 'patternSelect'),
    ]
    const lit = (entry: { thumbnail: { data: Uint8Array } }) =>
      Array.from(entry.thumbnail.data).reduce((n, b) => n + b, 0)

    const trusted = bakeBrowserThumbnails(nodes, edges, groups, true).master[0]
    expect(lit(trusted), 'the formula must draw when trusted').toBeGreaterThan(0)

    resetEvaluatorState()
    expect(lit(bakeBrowserThumbnails(nodes, edges, groups, false).master[0])).toBe(0)
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
    // Named for the player, because the player owns the selection.
    expect(src).toContain('#define THUMB_COUNT_master  2')
    expect(src).toContain('#define SEL_BROWSE_MS')
    expect(src).toContain('static PatternSel _sel_master;')
    expect(src).toContain('_selBegin(_sel_master);')
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
    expect(src).toContain('#define THUMB_COUNT_master  0')
    expect(src).toContain('"NO PATTERNS"')
  })

  // The panel reads; it does not step. The encoder reaches the selection
  // through Player Controls, which is where physical inputs become intent.
  it('leaves the panel reading rather than deciding', () => {
    const src = build()
    // Scoped to the display's own block: the contract still *defines*
    // _selUpdate, it just is not the panel that calls it.
    const block = src.slice(src.indexOf('{ // Info Display'))
    expect(block).not.toContain('_selUpdate(')
    expect(block).not.toContain('_selEncoderSteps(')
    expect(block).toContain('_sel_master.highlight')
  })
})

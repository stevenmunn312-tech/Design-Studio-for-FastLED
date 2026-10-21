import { beforeEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../codegen/cppGenerator'
import { resetEvaluatorState, type GroupRegistry } from '../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import {
  MAX_TRANSPORT_ARTWORKS, TRANSPORT_ARTWORK_BYTES,
} from '../../state/displays/transportDisplay'
import {
  artworkDisplays, artworkEngine, bakeDisplayArtworks, transportArtworkIssues,
} from '../transportArtworks'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'output', properties,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle } as unknown as StudioEdge)

const groups = {
  red: {
    nodes: [node('c', 'SolidColor', { r: 255, g: 0, b: 0 }), node('o', 'GroupOutput')],
    edges: [edge('go', 'c', 'frame', 'o', 'frame')],
  },
} as unknown as GroupRegistry

function graph(ids: string[] = ['red']) {
  const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })
  const collection = node('collection', 'PatternCollection', { patternIds: ids })
  const player = node('player', 'PatternMaster')
  const display = node('tft', 'TransportDisplay', {
    partId: 'st7789-tft-240x240', tftLayout: 'Now Playing',
  })
  return {
    nodes: [output, collection, player, display],
    edges: [
      edge('collection-player', 'collection', 'patternset', 'player', 'patternset'),
      edge('player-display', 'player', 'display', 'tft', 'display'),
    ],
  }
}

describe('Transport Display artwork baking', () => {
  beforeEach(() => resetEvaluatorState())

  it('finds a Now Playing panel and the player that owns its collection', () => {
    const { nodes, edges } = graph()
    expect(artworkDisplays(nodes, edges).map((display) => display.id)).toEqual(['tft'])
    expect(artworkEngine(nodes[3], nodes, edges)?.id).toBe('player')
    expect(artworkDisplays(nodes, edges, new Set(['another-player']))).toEqual([])
  })

  it('bakes exact RGB565 bytes and hands them to codegen by player id', () => {
    const { nodes, edges } = graph()
    const artworks = bakeDisplayArtworks(nodes, edges, groups, true)
    expect(artworks.player[0]).toHaveLength(TRANSPORT_ARTWORK_BYTES)
    expect(Array.from(artworks.player[0].slice(0, 2))).toEqual([0xf8, 0x00])

    // A normal sketch emits no artwork table. Now Playing is a player screen
    // and a player renders as a black fill here, so this generator can never
    // resolve that layout — the SD-player and show templates emit the
    // pictures. The bake itself still runs, for the preview and for them.
    const source = generateCpp(nodes, edges, groups, { artworks })
    expect(source).not.toContain('#define ART_COUNT_player')
  })

  it('does not bake or budget artwork for an unselected template source', () => {
    const { nodes, edges } = graph(Array.from({ length: MAX_TRANSPORT_ARTWORKS + 1 }, (_, i) => `p${i}`))
    const selected = new Set(['another-player'])
    expect(transportArtworkIssues(nodes, edges, selected)).toEqual([])
    expect(bakeDisplayArtworks(nodes, edges, groups, true, selected)).toEqual({})
  })

  it('reports a collection that exceeds the explicit flash budget', () => {
    const { nodes, edges } = graph(Array.from({ length: MAX_TRANSPORT_ARTWORKS + 1 }, (_, i) => `p${i}`))
    const [issue] = transportArtworkIssues(nodes, edges)
    expect(issue.issue).toContain(String(MAX_TRANSPORT_ARTWORKS))
    // Now Playing exists to picture the pattern, so it refuses the build.
    expect(issue.blocking).toBe(true)
    expect(bakeDisplayArtworks(nodes, edges, groups, true)).toEqual({})
  })

  // A treatment belonging to another source is ignored, not obeyed: the panel
  // is wired to a player, so it resolves Now Playing and still needs its
  // pictures baked. Reading the raw property would have skipped the bake while
  // the panel drew an empty artwork frame.
  it('bakes for a player panel left on a treatment from another source', () => {
    const { nodes, edges } = graph()
    nodes[3].data.properties.tftLayout = 'Show Status'
    expect(Object.keys(bakeDisplayArtworks(nodes, edges, groups, true))).toEqual(['player'])
  })

  // Diagnostics is device lifecycle and draws no picture, whatever is wired.
  it('does not bake for a panel showing Diagnostics', () => {
    const { nodes, edges } = graph()
    nodes[3].data.properties.tftLayout = 'Diagnostics'
    expect(artworkDisplays(nodes, edges)).toEqual([])
    expect(bakeDisplayArtworks(nodes, edges, groups, true)).toEqual({})
  })
})

describe('Show Status artwork from a Pattern Slideshow', () => {
  beforeEach(() => resetEvaluatorState())

  function slideshowGraph(ids: string[] = ['red']) {
    const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })
    const collection = node('collection', 'PatternCollection', { patternIds: ids })
    const slideshow = node('show', 'PatternSlideshow')
    const display = node('tft', 'TransportDisplay', {
      partId: 'st7789-tft-240x240', tftLayout: 'Show Status',
    })
    return {
      nodes: [output, collection, slideshow, display],
      edges: [
        edge('collection-show', 'collection', 'patternset', 'show', 'patternset'),
        edge('show-display', 'show', 'display', 'tft', 'display'),
      ],
    }
  }

  // The slideshow owns the collection the panel pictures, exactly as a
  // player owns Now Playing's: one engine, one bake, keyed by that engine.
  it('bakes the slideshow collection for its Show Status panel', () => {
    const { nodes, edges } = slideshowGraph()
    expect(artworkDisplays(nodes, edges).map((display) => display.id)).toEqual(['tft'])
    expect(artworkEngine(nodes[3], nodes, edges)?.id).toBe('show')
    const artworks = bakeDisplayArtworks(nodes, edges, groups, true)
    expect(Object.keys(artworks)).toEqual(['show'])
    expect(artworks.show[0]).toHaveLength(TRANSPORT_ARTWORK_BYTES)
    expect(Array.from(artworks.show[0].slice(0, 2))).toEqual([0xf8, 0x00])
  })

  // Scoped like the generator: a template build only bakes for the engine it
  // selected, so validation, capacity and generation agree on one collection.
  it('bakes nothing for an unselected slideshow', () => {
    const { nodes, edges } = slideshowGraph()
    expect(bakeDisplayArtworks(nodes, edges, groups, true, new Set(['another-show']))).toEqual({})
  })

  // An empty collection has nothing to picture; baking a zero-row table would
  // emit a table nothing can index.
  it('bakes nothing for an empty or unwired collection', () => {
    const { nodes, edges } = slideshowGraph([])
    expect(bakeDisplayArtworks(nodes, edges, groups, true)).toEqual({})
    const unwired = edges.filter((e) => e.id !== 'collection-show')
    expect(bakeDisplayArtworks(nodes, unwired, groups, true)).toEqual({})
  })

  // Show Status was a complete text layout before it had pictures, so an
  // over-budget slideshow still builds: it warns, bakes nothing, and the
  // panel names each pattern without picturing it.
  it('warns rather than blocks for an over-budget slideshow', () => {
    const { nodes, edges } = slideshowGraph(Array.from({ length: MAX_TRANSPORT_ARTWORKS + 1 }, (_, i) => `p${i}`))
    const [issue] = transportArtworkIssues(nodes, edges)
    expect(issue.display.id).toBe('tft')
    expect(issue.blocking).toBe(false)
    expect(issue.issue).toContain(String(MAX_TRANSPORT_ARTWORKS))
    expect(issue.issue).toContain('Show Status')
    expect(bakeDisplayArtworks(nodes, edges, groups, true)).toEqual({})
  })
})

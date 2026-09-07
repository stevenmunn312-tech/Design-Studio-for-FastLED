import { beforeEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../codegen/cppGenerator'
import { resetEvaluatorState, type GroupRegistry } from '../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import {
  MAX_TRANSPORT_ARTWORKS, TRANSPORT_ARTWORK_BYTES,
} from '../../state/transportDisplay'
import {
  artworkDisplays, artworkPlayer, bakeDisplayArtworks, transportArtworkIssues,
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
    expect(artworkPlayer(nodes[3], nodes, edges)?.id).toBe('player')
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

  it('reports a collection that exceeds the explicit flash budget', () => {
    const { nodes, edges } = graph(Array.from({ length: MAX_TRANSPORT_ARTWORKS + 1 }, (_, i) => `p${i}`))
    expect(transportArtworkIssues(nodes, edges)[0].issue).toContain(String(MAX_TRANSPORT_ARTWORKS))
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

  it('does not bake for a source whose layout has no artwork', () => {
    const { nodes, edges } = graph()
    const slideshow = node('slideshow', 'PatternSlideshow')
    const rewired = edges.map((e) => (e.id === 'player-display'
      ? edge('player-display', 'slideshow', 'display', 'tft', 'display')
      : e))
    expect(bakeDisplayArtworks([...nodes, slideshow], rewired, groups, true)).toEqual({})
  })
})

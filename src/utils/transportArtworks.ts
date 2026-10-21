// Find the colour panels that picture patterns, and bake the collection of the
// engine feeding each one: a player's for Now Playing, a Pattern Slideshow's
// for Show Status.

import type { GroupRegistry } from '../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../state/graphStore'
import { DISPLAY_SOURCE_NODE_TYPES, type DisplaySignalKind } from '../state/displays/displaySignal'
import {
  asTransportDisplayLayout, shownDesignId, transportArtworkBudgetIssue, transportLayoutForKind,
  type TransportDisplayLayout,
} from '../state/displays/transportDisplay'
import { bakeTransportArtworks } from './bakeTransportArtworks'
import { playerPatternIds } from './browserThumbnails'

export type TransportArtworks = Record<string, Uint8Array[]>

/** The layouts that draw baked artwork, and the engine kind that owns each one's collection. */
const ARTWORK_LAYOUT_KINDS: Partial<Record<TransportDisplayLayout, DisplaySignalKind>> = {
  'Now Playing': 'player',
  'Show Status': 'slideshow',
}

/**
 * The engine behind a panel, found down its one content wire.
 *
 * Artwork identity used to arrive on whichever of three metadata ports
 * happened to be wired. There is one socket now, and the engine publishes the
 * selection (and, for a player, the track) together on it, so there is nothing
 * to disambiguate. Both engine kinds own a collection and an active index:
 * a player's Now Playing and a slideshow's Show Status picture the same
 * player-owned bake, so this is the one place that says whose collection a
 * panel's pictures come from.
 */
export function artworkEngine(
  display: StudioNode,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): StudioNode | undefined {
  const sourceIds = edges
    .filter((edge) => edge.target === display.id && edge.targetHandle === 'display')
    .map((edge) => edge.source)
  // Derived from the source registry rather than named: every engine that
  // publishes a `player` or `slideshow` envelope carries the collection and
  // the active index this needs, and listing one of them here would have
  // silently skipped baking a Performance Generator's artwork while its panel
  // drew an empty frame.
  return nodes.find((node) => {
    if (!sourceIds.includes(node.id)) return false
    const kind = DISPLAY_SOURCE_NODE_TYPES[node.data.nodeType]
    return kind === 'player' || kind === 'slideshow'
  })
}

/**
 * Panels that will actually draw a picture.
 *
 * Derived the same way the evaluator and both generators derive it — from what
 * is plugged in, then the treatment property — rather than from the property
 * alone. A panel left on `Show Status` and wired to a player resolves to Now
 * Playing, and reading the raw property would have skipped baking its artwork
 * while the panel drew an empty frame.
 */
export function artworkDisplays(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  sourceIds?: ReadonlySet<string>,
): StudioNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return nodes.filter((node) => {
    if (node.data.nodeType !== 'TransportDisplay') return false
    // A mounted screen design draws its own widgets, not a fixed layout.
    if (shownDesignId(node.data.properties as Record<string, unknown>)) return false
    const props = node.data.properties as { tftLayout?: unknown }
    if (asTransportDisplayLayout(props.tftLayout) === 'Diagnostics') return false
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === 'display')
    const source = edge && byId.get(edge.source)
    if (source && sourceIds && !sourceIds.has(source.id)) return false
    const kind = source ? DISPLAY_SOURCE_NODE_TYPES[source.data.nodeType] : undefined
    if (!kind) return false
    const layout = transportLayoutForKind(kind, props.tftLayout)
    return layout !== null && ARTWORK_LAYOUT_KINDS[layout] === kind
  })
}

export interface TransportArtworkIssue {
  display: StudioNode
  issue: string
  /**
   * Whether the build should refuse. Now Playing exists to picture the
   * pattern, so a collection it cannot picture blocks; Show Status was a
   * complete text layout before it had pictures, so an over-budget slideshow
   * still builds and its panel names each pattern without picturing it.
   */
  blocking: boolean
}

export function transportArtworkIssues(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  sourceIds?: ReadonlySet<string>,
): TransportArtworkIssue[] {
  const issues: TransportArtworkIssue[] = []
  for (const display of artworkDisplays(nodes, edges, sourceIds)) {
    const engine = artworkEngine(display, nodes, edges)
    if (!engine) continue
    const issue = transportArtworkBudgetIssue(playerPatternIds(engine, nodes, edges).length)
    if (!issue) continue
    const slideshow = DISPLAY_SOURCE_NODE_TYPES[engine.data.nodeType] === 'slideshow'
    issues.push(slideshow
      ? { display, issue: `${issue} Until then Show Status names each pattern without picturing it.`, blocking: false }
      : { display, issue, blocking: true })
  }
  return issues
}

export function bakeDisplayArtworks(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  groups: GroupRegistry,
  trusted: boolean,
  sourceIds?: ReadonlySet<string>,
): TransportArtworks {
  const out: TransportArtworks = {}
  for (const display of artworkDisplays(nodes, edges, sourceIds)) {
    const engine = artworkEngine(display, nodes, edges)
    if (!engine || out[engine.id]) continue
    const ids = playerPatternIds(engine, nodes, edges)
    // An empty collection bakes nothing, so a panel wired to it emits no
    // table and no blit rather than a zero-row table nobody can index.
    if (ids.length === 0) continue
    const baked = bakeTransportArtworks(ids, groups, trusted)
    if (!baked.issue) out[engine.id] = baked.artworks.map((entry) => entry.artwork)
  }
  return out
}

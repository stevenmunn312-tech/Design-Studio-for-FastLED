// Find Now Playing colour panels and bake the pattern collection feeding them.

import type { GroupRegistry } from '../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../state/graphStore'
import { DISPLAY_SOURCE_NODE_TYPES } from '../state/displaySignal'
import { transportArtworkBudgetIssue, transportLayoutForKind } from '../state/transportDisplay'
import { bakeTransportArtworks } from './bakeTransportArtworks'
import { playerPatternIds } from './browserThumbnails'

export type TransportArtworks = Record<string, Uint8Array[]>

/**
 * The player behind a panel, found down its one content wire.
 *
 * Artwork identity used to arrive on whichever of three metadata ports
 * happened to be wired. There is one socket now, and the player publishes the
 * track and the selection together on it, so there is nothing to disambiguate.
 */
export function artworkPlayer(
  display: StudioNode,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): StudioNode | undefined {
  const sourceIds = edges
    .filter((edge) => edge.target === display.id && edge.targetHandle === 'display')
    .map((edge) => edge.source)
  return nodes.find((node) => sourceIds.includes(node.id) && node.data.nodeType === 'PatternMaster')
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
): StudioNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return nodes.filter((node) => {
    if (node.data.nodeType !== 'TransportDisplay') return false
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === 'display')
    const source = edge && byId.get(edge.source)
    const kind = source ? DISPLAY_SOURCE_NODE_TYPES[source.data.nodeType] : undefined
    if (!kind) return false
    const layout = transportLayoutForKind(kind, (node.data.properties as { tftLayout?: unknown }).tftLayout)
    return layout === 'Now Playing'
  })
}

export function transportArtworkIssues(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): { display: StudioNode; issue: string }[] {
  const issues: { display: StudioNode; issue: string }[] = []
  for (const display of artworkDisplays(nodes, edges)) {
    const player = artworkPlayer(display, nodes, edges)
    if (!player) continue
    const issue = transportArtworkBudgetIssue(playerPatternIds(player, nodes, edges).length)
    if (issue) issues.push({ display, issue })
  }
  return issues
}

export function bakeDisplayArtworks(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  groups: GroupRegistry,
  trusted: boolean,
): TransportArtworks {
  const out: TransportArtworks = {}
  for (const display of artworkDisplays(nodes, edges)) {
    const player = artworkPlayer(display, nodes, edges)
    if (!player) continue
    const baked = bakeTransportArtworks(playerPatternIds(player, nodes, edges), groups, trusted)
    if (!baked.issue) out[player.id] = baked.artworks.map((entry) => entry.artwork)
  }
  return out
}

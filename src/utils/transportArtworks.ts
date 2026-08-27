// Find Now Playing colour panels and bake the pattern collection feeding them.

import type { GroupRegistry } from '../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../state/graphStore'
import { asTransportDisplayLayout, transportArtworkBudgetIssue } from '../state/transportDisplay'
import { bakeTransportArtworks } from './bakeTransportArtworks'
import { playerPatternIds } from './browserThumbnails'

export type TransportArtworks = Record<string, Uint8Array[]>

export function artworkPlayer(
  display: StudioNode,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): StudioNode | undefined {
  const sourceIds = edges
    .filter((edge) => edge.target === display.id
      && (edge.targetHandle === 'patternSelect' || edge.targetHandle === 'patternIndex'
        || edge.targetHandle === 'patternName'))
    .map((edge) => edge.source)
  return nodes.find((node) => sourceIds.includes(node.id) && node.data.nodeType === 'PatternMaster')
}

export function artworkDisplays(nodes: readonly StudioNode[]): StudioNode[] {
  return nodes.filter((node) => node.data.nodeType === 'TransportDisplay'
    && asTransportDisplayLayout((node.data.properties as { tftLayout?: unknown }).tftLayout) === 'Now Playing')
}

export function transportArtworkIssues(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): { display: StudioNode; issue: string }[] {
  const issues: { display: StudioNode; issue: string }[] = []
  for (const display of artworkDisplays(nodes)) {
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
  for (const display of artworkDisplays(nodes)) {
    const player = artworkPlayer(display, nodes, edges)
    if (!player) continue
    const baked = bakeTransportArtworks(playerPatternIds(player, nodes, edges), groups, trusted)
    if (!baked.issue) out[player.id] = baked.artworks.map((entry) => entry.artwork)
  }
  return out
}

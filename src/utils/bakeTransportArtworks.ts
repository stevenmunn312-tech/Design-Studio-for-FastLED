// Render pattern groups into the fixed RGB565 artwork carried by a colour TFT.
//
// Like the OLED thumbnail baker, this sits outside codegen because evaluating
// a group crosses the workspace trust boundary. The generator receives only
// finished bytes and never evaluates user-authored nodes.

import { evaluateGraph, type GroupRegistry, type Frame } from '../state/graphEvaluator'
import {
  blankTransportArtwork, transportArtworkBudgetIssue, transportArtworkFromFrame,
  TRANSPORT_ARTWORK_H, TRANSPORT_ARTWORK_SUPERSAMPLE, TRANSPORT_ARTWORK_TICK_SEC,
  TRANSPORT_ARTWORK_W,
} from '../state/transportDisplay'

export interface BakedTransportArtwork {
  groupId: string
  artwork: Uint8Array
  missing: boolean
}

export interface BakedTransportArtworks {
  artworks: BakedTransportArtwork[]
  issue: string | null
}

export function renderPatternForTransportArtwork(
  groupId: string,
  groups: GroupRegistry,
  trusted: boolean,
): Frame | null {
  const group = groups[groupId]
  if (!group) return null
  return evaluateGraph(
    group.nodes, group.edges, TRANSPORT_ARTWORK_TICK_SEC,
    TRANSPORT_ARTWORK_W * TRANSPORT_ARTWORK_SUPERSAMPLE,
    TRANSPORT_ARTWORK_H * TRANSPORT_ARTWORK_SUPERSAMPLE,
    groups, `tft-art/${groupId}/`, new Set([groupId]), {}, null, trusted,
  )
}

export function bakeTransportArtworks(
  patternIds: readonly string[],
  groups: GroupRegistry,
  trusted: boolean,
): BakedTransportArtworks {
  const issue = transportArtworkBudgetIssue(patternIds.length)
  if (issue) return { artworks: [], issue }
  return {
    artworks: patternIds.map((groupId) => {
      const frame = renderPatternForTransportArtwork(groupId, groups, trusted)
      return frame
        ? { groupId, artwork: transportArtworkFromFrame(frame), missing: false }
        : { groupId, artwork: blankTransportArtwork(), missing: true }
    }),
    issue: null,
  }
}

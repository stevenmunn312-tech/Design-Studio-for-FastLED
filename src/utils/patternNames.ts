// The names of the patterns a rotating engine holds, for the panels that say
// which one is playing.
//
// Separate from `bakeBrowserThumbnails` on purpose, and this is the whole
// point of the file. A name is metadata: reading it evaluates nothing, so it
// needs no trust decision, costs a few bytes rather than a flash budget, and
// survives a collection too large to picture. Baking pictures is none of those
// things. While the two travelled together, a Show Status panel with no OLED
// beside it had no name table at all and reported blanks, and an over-budget
// collection lost its names along with its thumbnails.

import type { StudioNode, StudioEdge } from '../state/graphStore'
import { DISPLAY_SOURCE_NODE_TYPES } from '../state/displaySignal'
import { playerPatternIds } from './browserThumbnails'

/** Pattern names in collection order, per rotating-engine node id. */
export type PatternNames = Record<string, string[]>

/**
 * Every Music Player and Pattern Slideshow's collection, named.
 *
 * Keyed by the engine rather than by the panel, the same way the baked
 * thumbnails are: the engine owns the collection, and two panels reading one
 * show must name the same patterns.
 */
export function collectionPatternNames(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  graphNames: Record<string, { name?: string }> = {},
): PatternNames {
  const out: PatternNames = {}
  for (const node of nodes) {
    const kind = DISPLAY_SOURCE_NODE_TYPES[node.data.nodeType]
    if (kind !== 'player' && kind !== 'slideshow') continue
    out[node.id] = playerPatternIds(node, nodes, edges).map((id) => graphNames[id]?.name ?? id)
  }
  return out
}

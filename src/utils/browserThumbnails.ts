// Which Pattern Browsers in a graph need thumbnails, and baking them.
//
// This sits between the graph and the generator on purpose. Baking *evaluates*
// patterns — Code and formula nodes included — and `generateCpp` is a text
// emitter that has no business evaluating anything, nor any way to know
// whether the workspace has been trusted. So the caller that does know bakes
// first and hands the finished bytes over.
//
// The generator's fallback for a browser with no entry is an empty table and
// "NO PATTERNS" on the panel, which is the honest outcome for a collection
// nobody was allowed to render.

import { bakePatternThumbnails } from './bakePatternThumbnails'
import type { GroupRegistry } from '../state/graphEvaluator'
import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { ThumbnailEmit } from '../codegen/patternThumbnailCpp'
import { asInfoDisplayLayout } from '../state/infoDisplay'

/** Baked thumbnails per Info Display node id. */
export type BrowserThumbnails = Record<string, ThumbnailEmit[]>

/**
 * The pattern ids a Pattern Browser is pointed at.
 *
 * Read from its own `patternset` wire rather than from whatever collection
 * happens to be in the graph: two browsers can show different collections, and
 * guessing would silently give the second one the first one's patterns.
 */
export function browserPatternIds(
  display: StudioNode,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): string[] {
  const wire = edges.find((edge) => edge.target === display.id && edge.targetHandle === 'patternset')
  if (!wire) return []
  const collection = nodes.find((node) => node.id === wire.source)
  const ids = (collection?.data.properties as { patternIds?: string[] } | undefined)?.patternIds
  return Array.isArray(ids) ? ids : []
}

/** Every Info Display in `nodes` whose layout is the Pattern Browser. */
export function patternBrowsers(nodes: readonly StudioNode[]): StudioNode[] {
  return nodes.filter((node) => node.data.nodeType === 'InfoDisplay'
    && asInfoDisplayLayout((node.data.properties as { infoLayout?: unknown }).infoLayout) === 'Pattern Browser')
}

/**
 * Bake what every Pattern Browser in the graph needs.
 *
 * `trusted` is passed through rather than assumed: an imported workspace that
 * has not been trusted must not get its patterns evaluated because someone
 * pressed upload.
 */
export function bakeBrowserThumbnails(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  groups: GroupRegistry,
  trusted: boolean,
  graphNames: Record<string, { name?: string }> = {},
): BrowserThumbnails {
  const out: BrowserThumbnails = {}
  for (const display of patternBrowsers(nodes)) {
    const ids = browserPatternIds(display, nodes, edges)
    const baked = bakePatternThumbnails(ids, groups, trusted)
    // An over-budget collection bakes nothing and the panel says so, rather
    // than shipping half a set of pictures — the patterns without one would
    // look broken rather than like the ones that ran out of flash.
    if (baked.issue) continue
    out[display.id] = baked.thumbnails.map((entry) => ({
      name: graphNames[entry.groupId]?.name ?? entry.groupId,
      thumbnail: entry.thumbnail,
    }))
  }
  return out
}

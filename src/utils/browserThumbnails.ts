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
import { thumbnailBudgetIssue } from '../state/patternThumbnail'
import type { GroupRegistry } from '../state/graphEvaluator'
import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { ThumbnailEmit } from '../codegen/patternThumbnailCpp'
import { DISPLAY_SOURCE_NODE_TYPES } from '../state/displaySignal'

/** Baked thumbnails per Info Display node id. */
export type BrowserThumbnails = Record<string, ThumbnailEmit[]>

/**
 * The player a Pattern Browser reads, or undefined when it is not wired to one.
 *
 * A panel no longer names its own collection: it names the player that owns
 * the selection, and the player already has the patterns. One wire instead of
 * two, and no way to point the picture at a different collection from the one
 * being selected.
 */
export function browserPlayer(
  display: StudioNode,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): StudioNode | undefined {
  const wire = edges.find((edge) => edge.target === display.id && edge.targetHandle === 'display')
  if (!wire) return undefined
  return nodes.find((node) => node.id === wire.source
    && DISPLAY_SOURCE_NODE_TYPES[node.data.nodeType] === 'slideshow')
}

/** The pattern ids behind a player, through its own collection wire. */
export function playerPatternIds(
  player: StudioNode,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): string[] {
  const wire = edges.find((edge) => edge.target === player.id && edge.targetHandle === 'patternset')
  if (!wire) return []
  const collection = nodes.find((node) => node.id === wire.source)
  const ids = (collection?.data.properties as { patternIds?: string[] } | undefined)?.patternIds
  return Array.isArray(ids) ? ids : []
}

/**
 * Every Info Display showing a pattern browser.
 *
 * Which is every Info Display fed by something that rotates patterns — the
 * layout is not a property to read, it is what the wire implies.
 */
export function patternBrowsers(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): StudioNode[] {
  return nodes.filter((node) => node.data.nodeType === 'InfoDisplay'
    && browserPlayer(node, nodes, edges) !== undefined)
}

/**
 * Why a Pattern Browser in this graph cannot have its pictures baked.
 *
 * Separate from the bake, and deliberately free of it: this counts patterns,
 * where the bake evaluates them. That means validation can say so without a
 * trust decision and without rendering anything, and it means the reason
 * reaches the user at all — `bakeBrowserThumbnails` can only skip the browser,
 * after which the panel says "NO PATTERNS" and nothing explains why.
 */
export function browserThumbnailIssues(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): { display: StudioNode; issue: string }[] {
  const issues: { display: StudioNode; issue: string }[] = []
  for (const display of patternBrowsers(nodes, edges)) {
    const player = browserPlayer(display, nodes, edges)
    if (!player) continue
    const issue = thumbnailBudgetIssue(playerPatternIds(player, nodes, edges).length)
    if (issue) issues.push({ display, issue })
  }
  return issues
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
  for (const display of patternBrowsers(nodes, edges)) {
    const player = browserPlayer(display, nodes, edges)
    if (!player) continue
    const ids = playerPatternIds(player, nodes, edges)
    const baked = bakePatternThumbnails(ids, groups, trusted)
    // An over-budget collection bakes nothing and the panel says so, rather
    // than shipping half a set of pictures — the patterns without one would
    // look broken rather than like the ones that ran out of flash.
    if (baked.issue) continue
    out[player.id] = baked.thumbnails.map((entry) => ({
      name: graphNames[entry.groupId]?.name ?? entry.groupId,
      thumbnail: entry.thumbnail,
    }))
  }
  return out
}

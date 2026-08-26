// Rendering a Pattern Collection down to the thumbnails a browser layout shows.
//
// The bake happens here, in the browser, at export. `patternThumbnail.ts` owns
// what a thumbnail *is* — size, packing, dither — and this owns getting a
// pattern rendered in the first place, which needs the evaluator and therefore
// cannot live beside the pure model.
//
// Trust is threaded rather than defaulted. `evaluateGraph` trusts its caller
// unless told otherwise, and a bake evaluates whatever nodes a collected
// pattern contains — Code and formula nodes included. An imported workspace
// that has not been trusted must not get those evaluated merely because
// someone pressed export.

import { evaluateGraph, type GroupRegistry, type Frame } from '../state/graphEvaluator'
import {
  thumbnailFromFrame, blankThumbnail, thumbnailBudgetIssue,
  THUMBNAIL_W, THUMBNAIL_H, THUMBNAIL_SUPERSAMPLE, THUMBNAIL_TICK_SEC,
  type PatternThumbnail,
} from '../state/patternThumbnail'

export interface BakedThumbnail {
  /** Pattern group id, so a reorder cannot silently repoint a picture. */
  groupId: string
  thumbnail: PatternThumbnail
  /** True when the group could not be rendered and the square is blank. */
  missing: boolean
}

export interface BakedThumbnails {
  thumbnails: BakedThumbnail[]
  /** Why the collection could not be baked in full, or null. */
  issue: string | null
}

/**
 * Render one pattern group at the baking tick.
 *
 * Returns null when the group is not in the registry — a collection can name a
 * pattern that has since been deleted, and a blank square is a better answer
 * than a failed export.
 */
export function renderPatternForThumbnail(
  groupId: string,
  groups: GroupRegistry,
  trusted: boolean,
): Frame | null {
  const group = groups[groupId]
  if (!group) return null
  return evaluateGraph(
    group.nodes, group.edges, THUMBNAIL_TICK_SEC,
    THUMBNAIL_W * THUMBNAIL_SUPERSAMPLE, THUMBNAIL_H * THUMBNAIL_SUPERSAMPLE,
    groups,
    // Recursion bookkeeping left defaulted except the stack, which stops a
    // collection that contains itself from recursing while baking.
    `thumb/${groupId}/`, new Set([groupId]), {}, null,
    trusted,
  )
}

/**
 * Bake every pattern in a collection, in the collection's own order.
 *
 * An over-budget collection bakes nothing and says why: half a set of pictures
 * is worse than none, because the patterns without one look like the broken
 * ones rather than the ones that ran out of flash.
 */
export function bakePatternThumbnails(
  patternIds: readonly string[],
  groups: GroupRegistry,
  trusted: boolean,
): BakedThumbnails {
  const issue = thumbnailBudgetIssue(patternIds.length)
  if (issue) return { thumbnails: [], issue }

  return {
    thumbnails: patternIds.map((groupId) => {
      const frame = renderPatternForThumbnail(groupId, groups, trusted)
      return frame
        ? { groupId, thumbnail: thumbnailFromFrame(frame), missing: false }
        : { groupId, thumbnail: blankThumbnail(), missing: true }
    }),
    issue: null,
  }
}

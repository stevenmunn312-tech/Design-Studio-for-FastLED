// The project context Pattern Insights judges and prices library patterns in.
// Kept apart from patternRating.ts, whose driver takes the context as an
// argument and never reads the graph store itself.

import { getGroupRegistry, rootGraphEdges, rootGraphNodes, useGraphStore } from '../graphStore'
import { renderBufferDims } from '../output/outputRouting'
import type { GroupRegistry } from '../graphEvaluator'
import { patternRamBudget, type PatternRamBudget } from '../../utils/validateGraph'

/**
 * The group registry a rating is made with. The displays a pattern is judged
 * on come from its own Best displayed on tags, not from the open project.
 * Shared by the Pattern Insights popup and the Pattern Collection picker so a
 * score made from one is current in the other.
 */
export function currentRatingContext(): { groups: GroupRegistry } {
  return { groups: getGroupRegistry() }
}

/**
 * The canvas the project's firmware sizes its render buffers by, which is the
 * size a pattern's RAM estimate is stated for. Hardware belongs to the root
 * graph, so this asks the root even while a pattern group is open.
 */
export function currentFirmwareDims(): { w: number; h: number } {
  const state = useGraphStore.getState()
  const { w, h } = renderBufferDims(rootGraphNodes(state), rootGraphEdges(state))
  return { w: Math.max(1, w), h: Math.max(1, h) }
}

/**
 * The chosen board's internal-RAM budget, which a pattern's RAM estimate is
 * weighed against. Undefined when the project has no board or the board
 * declares no budget; the estimate is then banded per LED.
 */
export function currentRamBudget(): PatternRamBudget | undefined {
  return patternRamBudget(rootGraphNodes(useGraphStore.getState()))
}

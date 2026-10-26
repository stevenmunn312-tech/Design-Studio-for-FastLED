import type { GroupRegistry } from '../../state/evaluator/types'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { DisplayDocumentRegistry } from '../../state/displays/displayDocument'
import { templateControlRouting, showControlTargets } from '../displays/templateControlRouting'
import { expandGroups } from '../../state/expandGroups'
import { enginePostChain, routePostChain } from '../enginePostChain'
import { selectionSourceExpressions } from '../displays/displaySourceExpressions'
export { controlBundleVariable, showControlOutputIds, showControlTargets } from '../displays/templateControlRouting'

/**
 * One show, one cursor, one thumbnail table.
 *
 * Same reasoning as the player's stem: a controller sketch runs exactly one
 * show, so two panels wired to it must read one selection. Stem-composed
 * symbol names (_sel_show, THUMB_COUNT_show) are derived from this by both the
 * emitting and the referencing code.
 */
export const SHOW_SELECTION_STEM = 'show'

/** The show's running pattern index, readable from anywhere in the sketch. */
export const SHOW_PATTERN_INDEX = 'showPatternIndex'

/**
 * What a show can answer for a widget bound to its panel's source.
 *
 * A slideshow has no music, so every song field stays absent and is reported
 * by name — the same stance `SHOW_DISPLAY_EXPRESSIONS` takes for the fixed
 * layouts. What it does know is which pattern is running, and it answers that
 * from the one cursor the pixels are already driven by, so a hand-drawn screen
 * and a Show Status panel beside it cannot disagree.
 *
 * It lives here rather than in the generator because validation, the asset
 * hook and the sketch all resolve their bindings through this one routing walk:
 * a table held by the generator alone would have had the other two reporting
 * every bound field as unanswerable.
 */
export const SHOW_SOURCE_EXPRESSIONS = selectionSourceExpressions({
  // Counted from one, matching what the browser publishes and what a person
  // reading "3 of 12" expects.
  indexExpr: `((float)(${SHOW_PATTERN_INDEX} + 1))`,
  countExpr: '((float)PATTERN_COUNT)',
  nameExpr: `_patNameStr_${SHOW_SELECTION_STEM}(_sel_${SHOW_SELECTION_STEM}.active)`,
})

/**
 * Controls for a generated show controller.
 *
 * Two kinds of destination, resolved by one walk: the LED outputs the show
 * renders, which latch blackout and dimming, and the Pattern Slideshow itself,
 * which takes pattern intent. The second is separated out here rather than
 * left in the LED map because it drives the cursor, not a latch — and because
 * the generator has to know whether it needs a cursor at all.
 */
export function showControlRouting(
  nodes: StudioNode[], edges: StudioEdge[], documents?: DisplayDocumentRegistry, engineId?: string, groups: GroupRegistry = {},
) {
  const targets = showControlTargets(nodes, edges, engineId)
  const speedNode = nodes.find((node) => node.data.nodeType === 'MasterSpeed')
  // Frame nodes between the slideshow and its LEDs, on the graph the routing
  // walks, so their number inputs are read with the show's other controls.
  const expanded = expandGroups(nodes, edges, groups)
  const postChain = enginePostChain(expanded.nodes, expanded.edges, targets.engineId)
  const routing = templateControlRouting(nodes, edges, documents, {
    label: 'a generated show controller', widgetLabel: 'the show',
    destinationIds: new Set([
      ...targets.outputIds,
      ...(targets.engineId ? [targets.engineId] : []),
    ]),
    scalarOutputIds: targets.outputIds,
    scalarInputs: [
      ...(speedNode ? [{ nodeId: speedNode.id, port: 'speed', type: 'float' as const }] : []),
      ...(postChain?.inputs ?? []),
    ],
    sourceExpressions: SHOW_SOURCE_EXPRESSIONS,
    ledStatus: { drivenIds: targets.outputIds, latch: true },
  }, groups)
  const post = routePostChain(postChain, expanded.nodes, expanded.edges, routing.scalarInputs, routing.errors)
  // The chain runs on the one canvas every output is cut from, so it would
  // reach outputs it is not wired to.
  if (post && targets.outputIds.size > 1) {
    routing.errors.push('Frame nodes after the Pattern Slideshow change its whole canvas, so with more than one LED output they would reach outputs they are not wired to. '
      + 'Wire the slideshow straight to its outputs, or drive one output.')
  }
  return {
    ...routing,
    post,
    /** LED outputs with a bundle, keyed by output id. */
    outputs: new Map([...routing.bundles].filter(([id]) => targets.outputIds.has(id))),
    /** The bundle carrying pattern intent into the show's cursor, if wired. */
    patternCommands: (targets.engineId && routing.bundles.get(targets.engineId)) || null,
    /** Live bounded-control routes feeding Master Speed, if wired. */
    masterSpeedInputExpr: speedNode ? routing.scalarInputs.get(`${speedNode.id}:speed`) ?? null : null,
  }
}

export type ShowControlRouting = ReturnType<typeof showControlRouting>

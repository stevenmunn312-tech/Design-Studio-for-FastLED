import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { DisplayDocumentRegistry } from '../state/displayDocument'
import { templateControlRouting, showControlTargets } from './templateControlRouting'
export { controlBundleVariable, showControlOutputIds, showControlTargets } from './templateControlRouting'

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
  nodes: StudioNode[], edges: StudioEdge[], documents?: DisplayDocumentRegistry, engineId?: string,
) {
  const targets = showControlTargets(nodes, edges, engineId)
  const routing = templateControlRouting(nodes, edges, documents, {
    label: 'a generated show controller', widgetLabel: 'the show',
    destinationIds: new Set([...targets.outputIds, ...(targets.engineId ? [targets.engineId] : [])]),
    scalarOutputIds: targets.outputIds,
  })
  return {
    ...routing,
    /** LED outputs with a bundle, keyed by output id. */
    outputs: new Map([...routing.bundles].filter(([id]) => targets.outputIds.has(id))),
    /** The bundle carrying pattern intent into the show's cursor, if wired. */
    patternCommands: (targets.engineId && routing.bundles.get(targets.engineId)) || null,
  }
}

export type ShowControlRouting = ReturnType<typeof showControlRouting>

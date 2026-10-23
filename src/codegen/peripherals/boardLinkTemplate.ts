/**
 * A board link in the show and SD player templates.
 *
 * Those sketches resolve their controls through the control graph rather than
 * a node-by-node walk, so a link-in is a typed control source there
 * (`boardLinkControlEmission`) and a link-out reads either a control-graph
 * value or the generator's own field table: a Music Player's track and
 * pattern, a slideshow's pattern. Validation, the asset hook and the sketch
 * all go through the same routing walk, so a value the template cannot send
 * is reported once, by name, everywhere. See docs/design/board-links.md.
 */

import type { StudioNode } from '../../state/graphStore'
import { controlReferenceCpp, type createControlGraph } from '../controlGraph'
import type { DisplaySourceExpressions } from '../displays/displaySourceExpressions'
import { isGeneratorOwnerNodeType } from '../../build/boardLinks'
import { boardLinkPlan, boardLinkSends, type BoardLinkPlan, type LinkSend } from './espNowLinkCpp'

/** What a template's board link sends, and the fields of its own table it reads. */
export interface TemplateBoardLink {
  plan: BoardLinkPlan
  sends: LinkSend[]
  /** Source fields read from the generator's table, so it emits what answers them. */
  fields: Set<string>
  errors: string[]
}

/**
 * The template half of a board link, or null when the partition holds no link
 * node. `ownerExpressions` is the generator's field table; `clockFor` answers
 * an RTC's struct, as the template's own clock layouts read it.
 */
export function templateBoardLink(
  nodes: readonly StudioNode[],
  graph: ReturnType<typeof createControlGraph>,
  ownerExpressions: DisplaySourceExpressions,
  clockFor: (rtcId: string) => string | null,
  generatorLabel: string,
): TemplateBoardLink | null {
  const plan = boardLinkPlan(nodes)
  if (!plan) return null
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const fields = new Set<string>()
  const errors: string[] = []
  const label = (id: string) => String(byId.get(id)?.data.label || id)
  const refuse = (sourceId: string, what: string) => errors.push(
    `${label(sourceId)}: ${generatorLabel} cannot send ${what} over the board link. Send it from a source the template can evaluate, or build a normal sketch.`,
  )
  const sends = boardLinkSends(plan, (_linkOut, props, field) => {
    const source = byId.get(props.sourceNodeId)
    if (!source) return null
    const type = String(source.data.nodeType ?? '')
    if (field !== null) {
      if (isGeneratorOwnerNodeType(type)) {
        const expression = ownerExpressions[field]
        if (!expression) { refuse(source.id, `"${field}"`); return null }
        fields.add(field)
        return expression
      }
      if (props.displayKind === 'clock') {
        const symbol = clockFor(source.id)
        if (!symbol) refuse(source.id, 'the time')
        return symbol
      }
      if (props.displayKind === 'powerMonitor') {
        const reference = graph.resolve(source.id, field, 'float')
        if (!reference) { refuse(source.id, field); return null }
        return controlReferenceCpp(reference)
      }
      refuse(source.id, field)
      return null
    }
    if (props.dataType === 'datetime') {
      const symbol = clockFor(source.id)
      if (!symbol) refuse(source.id, 'the time')
      return symbol
    }
    if (props.dataType === 'display') return null
    const reference = graph.resolve(source.id, props.sourceHandle, props.dataType)
    if (!reference) { refuse(source.id, props.sourceHandle); return null }
    return controlReferenceCpp(reference)
  })
  return { plan, sends, fields, errors }
}

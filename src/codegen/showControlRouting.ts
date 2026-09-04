import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { DisplayDocumentRegistry } from '../state/displayDocument'
import { templateControlRouting, showControlOutputIds } from './templateControlRouting'
export { controlBundleVariable, showControlOutputIds } from './templateControlRouting'

export function showControlRouting(nodes: StudioNode[], edges: StudioEdge[], documents?: DisplayDocumentRegistry) {
  return templateControlRouting(nodes, edges, documents, {
    label: 'a generated show controller', widgetLabel: 'the show',
    destinationIds: showControlOutputIds(nodes, edges), scalarOutputs: true,
  })
}

export type ShowControlRouting = ReturnType<typeof showControlRouting>

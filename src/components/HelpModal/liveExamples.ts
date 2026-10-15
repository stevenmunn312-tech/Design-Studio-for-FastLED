/**
 * The "Try it live" example graph for each node.
 *
 * Every example is written by hand beside its node's reference copy in
 * `reference/`; this module is the narrow door the Help article, the
 * node-card generator and the firmware dead-code corpus read them through.
 */
import type { LiveExampleSpec } from '../../utils/insertLiveExample'
import type { NodeDefinition } from '../../types'
import { nodeReferenceEntry } from './reference'
import type { ReferenceLiveExample } from './reference'

export type { ReferenceLiveExample } from './reference'

/** The example graph a node's reference article shows and inserts. */
export function liveExampleForNode(node: NodeDefinition): ReferenceLiveExample {
  return nodeReferenceEntry(node).example
}

/** True when an example starts the browser audio input after insertion. */
export function exampleUsesMicrophone(example: LiveExampleSpec): boolean {
  return example.nodes.some((node) => node.sourceProvider?.type === 'MicInput' || node.sourceProvider?.type === 'LineInput')
}


import type { ReferenceLiveExample } from './example'

/**
 * One node's page in the Node Reference.
 *
 * Everything here is written for that node. Generic copy keyed by category or
 * port type read the same on every page and drifted from what the node does,
 * so the article falls back only to the port type's description, and only for
 * a port this entry does not describe.
 */
export interface NodeReferenceEntry {
  /** What it does, when to reach for it, and what to watch out for: two to four short paragraphs. */
  overview: string[]
  /** Numbered set-up steps, for nodes that need hardware or assets before they do anything. */
  steps?: string[]
  /** Port id → what this port means on this node. */
  inputs?: Record<string, string>
  outputs?: Record<string, string>
  /** One line under the property list: how the settings work together. */
  propertyNote?: string
  /** For a workflow example: what the reader gets instead of an LED picture. */
  outcome?: string
  example: ReferenceLiveExample
}

export type NodeReferenceMap = Record<string, NodeReferenceEntry>

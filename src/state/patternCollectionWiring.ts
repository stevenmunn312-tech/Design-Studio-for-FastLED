import type { Edge } from '@xyflow/react'
import type { StudioNode, StudioNodeData } from './graphStore'

const nodeType = (node: StudioNode) => (node.data as StudioNodeData).nodeType

/**
 * The Pattern Collection wired into a show engine's `patternset` input: its
 * ordered group ids and each pattern's section tags (aligned by index;
 * `[]` means eligible in any section). Both are empty when nothing is wired.
 *
 * Kept in this dependency-light module because live music analysis needs the
 * graph query, while firmware upload additionally needs the much larger
 * code-generation stack. Importing the query must not pull codegen into the
 * editor's startup bundle.
 */
export function wiredPatternCollection(
  nodes: StudioNode[],
  edges: Edge[],
): { ids: string[]; sectionTags: string[][] } {
  const empty = { ids: [], sectionTags: [] }
  const engine = nodes.find((node) => nodeType(node) === 'PerformanceGenerator' || nodeType(node) === 'PatternMaster')
  if (!engine) return empty
  const link = edges.find((edge) => edge.target === engine.id && edge.targetHandle === 'patternset')
  if (!link) return empty
  const collection = nodes.find((node) => node.id === link.source && nodeType(node) === 'PatternCollection')
  if (!collection) return empty
  const properties = collection.data.properties as {
    patternIds?: string[]
    patternSections?: Record<string, string[]>
  }
  const ids = properties.patternIds ?? []
  const sections = properties.patternSections ?? {}
  return { ids, sectionTags: ids.map((id) => sections[id] ?? []) }
}

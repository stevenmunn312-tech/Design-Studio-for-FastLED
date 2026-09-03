import type { ShowFile } from '../../types/showFile'
import type { GraphMeta, StudioEdge, StudioNode } from '../../state/graphStore'
import { isPatternSelect } from '../../state/patternSelection'
import { showStateAt } from '../../state/showPreview'

function nodeTypeOf(node: StudioNode | undefined): string {
  return String(node?.data.nodeType ?? '')
}

function groupIdOf(node: StudioNode | undefined): string | null {
  const groupId = (node?.data.properties as { groupId?: string } | undefined)?.groupId
  return typeof groupId === 'string' && groupId ? groupId : null
}

function stageFrameSourceNode(
  nodes: StudioNode[],
  edges: StudioEdge[],
  outputId = '',
): StudioNode | undefined {
  const output = nodes.find((node) => node.id === outputId && nodeTypeOf(node) === 'MatrixOutput')
    ?? nodes.find((node) => nodeTypeOf(node) === 'MatrixOutput')
  if (!output) return undefined
  const sourceEdge = edges.find((edge) => edge.target === output.id && edge.targetHandle === 'frame')
  return nodes.find((node) => node.id === sourceEdge?.source)
}

// Single-entry cache of the library-pattern lookups (id set + name counts),
// rebuilt only when the saved-patterns array changes.
let libraryLookupSource: { id: string; name: string }[] | null = null
let libraryLookupCache = { ids: new Set<string>(), nameCounts: new Map<string, number>() }

export function libraryLookup(patterns: { id: string; name: string }[]) {
  if (patterns !== libraryLookupSource) {
    libraryLookupSource = patterns
    const ids = new Set<string>()
    const nameCounts = new Map<string, number>()
    for (const pattern of patterns) {
      ids.add(pattern.id)
      nameCounts.set(pattern.name, (nameCounts.get(pattern.name) ?? 0) + 1)
    }
    libraryLookupCache = { ids, nameCounts }
  }
  return libraryLookupCache
}

function libraryPatternNameForGroup(
  groupId: string | undefined | null,
  graphs: Record<string, GraphMeta>,
  libraryPatternIds: Set<string>,
  libraryNameCounts: Map<string, number>,
): string | null {
  if (!groupId) return null
  const meta = graphs[groupId]
  if (!meta) return null
  if (meta.sourcePatternId) return libraryPatternIds.has(meta.sourcePatternId) ? meta.name : null
  // Best-effort fallback for workspaces saved before sourcePatternId existed.
  return (libraryNameCounts.get(meta.name) ?? 0) === 1 ? meta.name : null
}

/** The show engine whose published selection drives the selected LED output. */
export function activeStagePatternEngineId(
  nodes: StudioNode[],
  edges: StudioEdge[],
  outputId = '',
): string {
  const source = stageFrameSourceNode(nodes, edges, outputId)
  return nodeTypeOf(source) === 'PatternMaster' || nodeTypeOf(source) === 'PatternSlideshow'
    ? source?.id ?? ''
    : ''
}

/** Resolve the active group from the evaluator's observable preview snapshot. */
export function activePatternGroupIdFromPreview(
  outputs: Map<string, Record<string, unknown>>,
  engineId: string,
): string | null {
  if (!engineId) return null
  const selection = outputs.get(engineId)?.patternSelect
  if (!isPatternSelect(selection)) return null
  return selection.ids[selection.activeIndex] ?? null
}

export function activeStagePatternName(
  nodes: StudioNode[],
  edges: StudioEdge[],
  graphs: Record<string, GraphMeta>,
  libraryPatternIds: Set<string>,
  libraryNameCounts: Map<string, number>,
  playbackShow: ShowFile | null,
  playbackPosMs: number,
  outputId = '',
  livePatternGroupId: string | null = null,
): string | null {
  if (playbackShow?.patternSet?.length) {
    const live = showStateAt(playbackShow, playbackPosMs)
    const groupId = live.patternIndex >= 0 ? playbackShow.patternSet[live.patternIndex] : undefined
    return libraryPatternNameForGroup(groupId, graphs, libraryPatternIds, libraryNameCounts)
  }

  const sourceNode = stageFrameSourceNode(nodes, edges, outputId)
  if (!sourceNode) return null

  if (nodeTypeOf(sourceNode) === 'Group') {
    return libraryPatternNameForGroup(groupIdOf(sourceNode), graphs, libraryPatternIds, libraryNameCounts)
  }

  if (nodeTypeOf(sourceNode) === 'PatternMaster' || nodeTypeOf(sourceNode) === 'PatternSlideshow') {
    const setEdge = edges.find((edge) => edge.target === sourceNode.id && edge.targetHandle === 'patternset')
    const collection = nodes.find((node) => node.id === setEdge?.source && nodeTypeOf(node) === 'PatternCollection')
    const patternIds = ((collection?.data.properties as { patternIds?: string[] } | undefined)?.patternIds) ?? []
    if (patternIds.length === 0) return null
    // A graph edit can briefly leave the last preview snapshot in the store.
    // Only accept a live id that still belongs to the currently wired set.
    const groupId = livePatternGroupId && patternIds.includes(livePatternGroupId)
      ? livePatternGroupId
      : patternIds[0]
    return libraryPatternNameForGroup(groupId, graphs, libraryPatternIds, libraryNameCounts)
  }

  return null
}

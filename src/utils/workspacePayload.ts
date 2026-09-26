import type { StudioEdge, StudioNode, WorkspaceExtras } from '../state/graphStore'
import type { PersistedWorkspace } from '../state/workspacePersistence'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isWorkspaceNode(value: unknown): value is StudioNode {
  if (!isPlainObject(value) || typeof value.id !== 'string') return false
  if (!isPlainObject(value.data)) return false
  return typeof value.data.nodeType === 'string'
}

function isWorkspaceEdge(value: unknown): value is StudioEdge {
  if (!isPlainObject(value)) return false
  return typeof value.source === 'string' && typeof value.target === 'string'
}

/** Top-level workspace object whose `nodes` and `edges` are arrays.
 *  Item shape is not required: one bad node is dropped, not the file. */
export function isWorkspacePayload(
  value: unknown,
): value is WorkspaceExtras & { nodes: unknown[]; edges: unknown[] } {
  return isPlainObject(value) && Array.isArray(value.nodes) && Array.isArray(value.edges)
}

export interface SanitizedWorkspacePayload {
  workspace: PersistedWorkspace
  dropped: number
}

function keepLists(nodes: unknown[], edges: unknown[]): { nodes: StudioNode[]; edges: StudioEdge[]; dropped: number } {
  const keptNodes = nodes.filter(isWorkspaceNode)
  const keptEdges = edges.filter(isWorkspaceEdge)
  return {
    nodes: keptNodes,
    edges: keptEdges,
    dropped: (nodes.length - keptNodes.length) + (edges.length - keptEdges.length),
  }
}

/** Copy a payload that passed `isWorkspacePayload`, leaving out nodes and
 *  edges that cannot be loaded. Null when the top level is not a workspace. */
export function sanitizeWorkspacePayload(value: unknown): SanitizedWorkspacePayload | null {
  if (!isWorkspacePayload(value)) return null
  const active = keepLists(value.nodes, value.edges)
  let dropped = active.dropped
  let graphData: PersistedWorkspace['graphData']
  if (value.graphData !== undefined) {
    graphData = {}
    if (!isPlainObject(value.graphData)) {
      dropped += 1
    } else {
      for (const [id, content] of Object.entries(value.graphData)) {
        if (!isPlainObject(content)) {
          dropped += 1
          continue
        }
        const nestedNodes = Array.isArray(content.nodes) ? content.nodes : []
        const nestedEdges = Array.isArray(content.edges) ? content.edges : []
        if (content.nodes !== undefined && !Array.isArray(content.nodes)) dropped += 1
        if (content.edges !== undefined && !Array.isArray(content.edges)) dropped += 1
        const nested = keepLists(nestedNodes, nestedEdges)
        dropped += nested.dropped
        graphData[id] = { nodes: nested.nodes, edges: nested.edges }
      }
    }
  }
  const graphsAreUsable = value.graphs === undefined || isPlainObject(value.graphs)
  if (!graphsAreUsable) dropped += 1
  const workspace: PersistedWorkspace = {
    ...(value as PersistedWorkspace),
    nodes: active.nodes,
    edges: active.edges,
    ...(graphData !== undefined ? { graphData } : {}),
  }
  if (!graphsAreUsable) delete workspace.graphs
  return { dropped, workspace }
}

export function workspaceLoadStatus(base: string, dropped: number): string {
  if (dropped <= 0) return base
  const items = dropped === 1 ? 'item' : 'items'
  return `${base}. Skipped ${dropped} invalid ${items}.`
}

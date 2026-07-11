import type { StudioNode, StudioEdge, WorkspaceExtras } from './graphStore'

/** The full workspace shape that needs to persist across autosave, project
 *  switches, JSON export/import, and rolling recovery snapshots. */
export interface PersistedWorkspace {
  nodes: StudioNode[]
  edges: StudioEdge[]
  graphData?: WorkspaceExtras['graphData']
  graphs?: WorkspaceExtras['graphs']
  activeGraphId?: string
}

export function blankWorkspace(): PersistedWorkspace {
  return { nodes: [], edges: [] }
}

export function captureWorkspace(
  state: Pick<PersistedWorkspace, 'nodes' | 'edges' | 'graphData' | 'graphs' | 'activeGraphId'>
): PersistedWorkspace {
  return {
    nodes: state.nodes,
    edges: state.edges,
    graphData: state.graphData,
    graphs: state.graphs,
    activeGraphId: state.activeGraphId,
  }
}

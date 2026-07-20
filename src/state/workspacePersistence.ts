import type { StudioNode, StudioEdge, WorkspaceExtras } from './graphStore'
import type { PerformanceDeckConfig } from './performanceDeck'

/** The full workspace shape that needs to persist across autosave, project
 *  switches, JSON export/import, and rolling recovery snapshots. */
export interface PersistedWorkspace {
  nodes: StudioNode[]
  edges: StudioEdge[]
  graphData?: WorkspaceExtras['graphData']
  graphs?: WorkspaceExtras['graphs']
  activeGraphId?: string
  /** Whether this workspace's CustomFormula/FieldFormula/Code nodes are
   *  allowed to evaluate their preview logic (see todo.md's P0 trust-boundary
   *  item). Missing/undefined is treated as trusted by `graphStore.loadGraph`
   *  — content that predates this field is the user's own prior local work. */
  trusted?: boolean
  /** Performance Control Deck: pinned controls, parameter scenes, and
   *  MIDI/keyboard bindings. Missing = an empty deck — pre-existing saves,
   *  share links, and JSON imports created before this field all fall back
   *  safely via `normalizeDeckConfig`. */
  performanceDeck?: PerformanceDeckConfig
}

export function blankWorkspace(): PersistedWorkspace {
  return { nodes: [], edges: [] }
}

export function cloneWorkspace(workspace: PersistedWorkspace): PersistedWorkspace {
  return structuredClone(workspace)
}

export function captureWorkspace(
  state: Pick<PersistedWorkspace, 'nodes' | 'edges' | 'graphData' | 'graphs' | 'activeGraphId' | 'trusted' | 'performanceDeck'>
): PersistedWorkspace {
  return cloneWorkspace({
    nodes: state.nodes,
    edges: state.edges,
    graphData: state.graphData,
    graphs: state.graphs,
    activeGraphId: state.activeGraphId,
    trusted: state.trusted,
    performanceDeck: state.performanceDeck,
  })
}

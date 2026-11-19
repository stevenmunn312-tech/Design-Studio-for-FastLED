// React Flow decorates the nodes and edges it is given with what it learns
// while the canvas runs: what is selected, what is being dragged, how big a
// node measured. None of that is project content. Left in, a save changes
// whenever someone clicks, and a share link or bundled pattern carries the
// last selection of whoever made it.
//
// `stripRuntimeFields` is the one place that removes them, applied wherever a
// workspace is copied for persistence (`cloneWorkspace`, so autosave, project
// files, recovery snapshots and imports) and where a share link is built.
// Kept: `position` and everything the app itself sets, `style` (an edge's
// colour) and `reconnectable` included. Node `width`/`height` are dropped
// because no node here is user-resizable: they only ever hold a measurement.

const NODE_RUNTIME_KEYS = [
  'selected', 'dragging', 'resizing', 'measured', 'width', 'height', 'positionAbsolute', 'internals', 'zIndex',
] as const
const EDGE_RUNTIME_KEYS = ['selected', 'zIndex'] as const

function without<T extends object>(value: T, keys: readonly string[]): T {
  if (!keys.some((key) => key in value)) return value
  const copy: Record<string, unknown> = { ...value }
  for (const key of keys) delete copy[key]
  return copy as T
}

interface GraphParts<N extends object, E extends object> { nodes: N[]; edges: E[] }

/** A graph's nodes and edges without runtime fields. Objects that carry none
 *  are returned as they are, and the input is never changed. */
export function stripRuntimeGraph<N extends object, E extends object, G extends GraphParts<N, E>>(graph: G): G {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => without(node, NODE_RUNTIME_KEYS)),
    edges: graph.edges.map((edge) => without(edge, EDGE_RUNTIME_KEYS)),
  }
}

/** A workspace (root graph and every stored sub-graph) without runtime fields. */
export function stripRuntimeFields<W extends { nodes: object[]; edges: object[]; graphData?: Record<string, GraphParts<object, object>> }>(
  workspace: W,
): W {
  const stripped = stripRuntimeGraph(workspace)
  if (!workspace.graphData) return stripped
  return {
    ...stripped,
    graphData: Object.fromEntries(
      Object.entries(workspace.graphData).map(([id, graph]) => [id, stripRuntimeGraph(graph)]),
    ),
  }
}

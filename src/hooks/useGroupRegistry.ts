import { useMemo } from 'react'
import { getGroupRegistry, ROOT_GRAPH_ID, useGraphStore } from '../state/graphStore'
import { useCodegenGraph } from '../utils/codegenGraph'

/**
 * Include edits to the currently open subgraph in every routing consumer.
 *
 * The registry's identity is what its consumers memoise on, and some of them
 * are expensive: the capacity watcher regenerates the whole sketch, which for
 * a large pattern collection takes seconds. So it must change only when a
 * subgraph does. At the root the open graph is not part of the registry at
 * all, and inside a subgraph React Flow still replaces `nodes` on every click
 * (selection, measuring), so the open graph is keyed on its codegen content.
 */
export function useGroupRegistry() {
  const graphData = useGraphStore((state) => state.graphData)
  const activeGraphId = useGraphStore((state) => state.activeGraphId)
  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  const open = useCodegenGraph(nodes, edges)
  const openSubgraph = activeGraphId === ROOT_GRAPH_ID ? null : open
  return useMemo(() => getGroupRegistry({
    ...useGraphStore.getState(),
    graphData,
    activeGraphId,
    nodes: openSubgraph?.nodes ?? [],
    edges: openSubgraph?.edges ?? [],
  }), [graphData, activeGraphId, openSubgraph])
}

import { useMemo } from 'react'
import { getGroupRegistry, useGraphStore } from '../state/graphStore'

/** Include edits to the currently open subgraph in every routing consumer. */
export function useGroupRegistry() {
  const graphData = useGraphStore((state) => state.graphData)
  const activeGraphId = useGraphStore((state) => state.activeGraphId)
  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  return useMemo(() => getGroupRegistry({ ...useGraphStore.getState(), graphData, activeGraphId, nodes, edges }),
    [graphData, activeGraphId, nodes, edges])
}

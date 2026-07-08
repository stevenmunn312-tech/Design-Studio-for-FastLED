import type { Edge } from '@xyflow/react'

/**
 * Return the nodes that genuinely feed or consume the selected node.
 *
 * Walking incoming and outgoing edges separately avoids pulling in sibling
 * branches just because they share an ancestor. That makes focus mode useful
 * even when most of the show eventually converges on one MatrixOutput.
 */
export function traceSignalPath(edges: Edge[], selectedId: string | null): Set<string> {
  if (!selectedId) return new Set()

  // Adjacency maps so each traversal step is O(degree) instead of a scan of
  // every edge — this runs on hot paths (per store update while dragging).
  const bySource = new Map<string, string[]>()
  const byTarget = new Map<string, string[]>()
  for (const edge of edges) {
    const out = bySource.get(edge.source)
    if (out) out.push(edge.target)
    else bySource.set(edge.source, [edge.target])
    const into = byTarget.get(edge.target)
    if (into) into.push(edge.source)
    else byTarget.set(edge.target, [edge.source])
  }

  const path = new Set([selectedId])

  const walk = (adjacency: Map<string, string[]>) => {
    const pending = [selectedId]
    const seen = new Set([selectedId])
    while (pending.length) {
      const id = pending.pop()!
      for (const next of adjacency.get(id) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        path.add(next)
        pending.push(next)
      }
    }
  }

  walk(byTarget)   // upstream
  walk(bySource)   // downstream

  return path
}

// Single-entry cache: every mounted node's focus-state selector asks for the
// same (edges, selectedId) path on every graph-store update, so recompute only
// when either input actually changes rather than once per node per update.
let cachedEdges: Edge[] | null = null
let cachedSelectedId: string | null = null
let cachedPath: Set<string> = new Set()

/** Memoised `traceSignalPath` — safe to call from per-node store selectors. */
export function signalPathFor(edges: Edge[], selectedId: string | null): Set<string> {
  if (edges !== cachedEdges || selectedId !== cachedSelectedId) {
    cachedEdges = edges
    cachedSelectedId = selectedId
    cachedPath = traceSignalPath(edges, selectedId)
  }
  return cachedPath
}

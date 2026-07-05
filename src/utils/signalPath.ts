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

  const path = new Set([selectedId])
  const upstream = [selectedId]
  const downstream = [selectedId]
  const seenUpstream = new Set([selectedId])
  const seenDownstream = new Set([selectedId])

  while (upstream.length) {
    const target = upstream.pop()!
    for (const edge of edges) {
      if (edge.target !== target || seenUpstream.has(edge.source)) continue
      seenUpstream.add(edge.source)
      path.add(edge.source)
      upstream.push(edge.source)
    }
  }

  while (downstream.length) {
    const source = downstream.pop()!
    for (const edge of edges) {
      if (edge.source !== source || seenDownstream.has(edge.target)) continue
      seenDownstream.add(edge.target)
      path.add(edge.target)
      downstream.push(edge.target)
    }
  }

  return path
}

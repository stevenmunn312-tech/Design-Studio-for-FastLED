import { useRef } from 'react'
import type { StudioEdge, StudioNode } from '../state/graphStore'

/**
 * Referential stability for the graph inputs the sketch generators actually read.
 *
 * React Flow replaces the whole `nodes` array on every pointer move of a drag,
 * so a `useMemo` keyed on `[nodes, edges]` re-runs its body ~60×/sec while a
 * node is being dragged. That is fine for cheap derivations, but
 * `generateCpp`/`generateShowSketch` walk the entire graph and emit a full
 * sketch — work that a position change cannot possibly alter, since codegen
 * reads only node ids, types, properties, ports, and the edge list (every
 * `width`/`height` it touches is a MatrixOutput *property*, not canvas
 * geometry).
 *
 * `useCodegenGraph` hands back the previous arrays unchanged while that
 * codegen-relevant content is identical, so a memo keyed on its result stays
 * warm across a drag and only recomputes on a real edit.
 */
export interface CodegenGraph {
  nodes: StudioNode[]
  edges: StudioEdge[]
}

/** Compact fingerprint of everything the sketch generators consume. Cheap
 *  relative to codegen itself, and deliberately excludes `position`,
 *  `selected`, `dragging`, and the measured `width`/`height` React Flow
 *  maintains on each node. */
export function codegenSignature(nodes: StudioNode[], edges: StudioEdge[]): string {
  const parts: string[] = []
  for (const node of nodes) {
    const data = node.data as {
      nodeType?: string
      label?: unknown
      properties?: unknown
      inputs?: unknown
      outputs?: unknown
    }
    parts.push(
      node.id,
      String(data.nodeType ?? ''),
      String(data.label ?? ''),
      JSON.stringify(data.properties ?? null),
      JSON.stringify(data.inputs ?? null),
      JSON.stringify(data.outputs ?? null),
    )
  }
  parts.push('|')
  for (const edge of edges) {
    parts.push(
      String(edge.source ?? ''), String(edge.sourceHandle ?? ''),
      String(edge.target ?? ''), String(edge.targetHandle ?? ''),
    )
  }
  // NUL-delimited so adjacent fields can't run together into a false match
  // (["ab", "x"] reading the same as ["a", "bx"]) — node ids and labels are
  // user-controllable, and a false match here means a missed re-check.
  return parts.join('\u0000')
}

export function useCodegenGraph(nodes: StudioNode[], edges: StudioEdge[]): CodegenGraph {
  const signature = codegenSignature(nodes, edges)
  const cached = useRef<{ signature: string; graph: CodegenGraph } | null>(null)
  if (!cached.current || cached.current.signature !== signature) {
    cached.current = { signature, graph: { nodes, edges } }
  }
  return cached.current.graph
}

// The Debug node is a workshop instrument, not project content. A part's
// `debug` output wired into it, or its `targetPartId`, names the one part under
// test; the node shows guidance and runs diagnostics for that part.
//
// Two invariants keep it out of the project (docs/development/patterns/debug-node.md):
//  - It is not a sink (`isSinkDefinition` excludes canvas tools), and its
//    preview and firmware handlers are empty, so wiring it changes neither the
//    preview nor the sketch.
//  - `withoutTransientNodes` drops it, and every edge touching it, where an
//    edge alone would count: board membership (a debug wire must not join or
//    link boards), graph diagnostics (it must not hide "disconnected"), and
//    every copy made for persistence or sharing (`stripRuntimeGraph`).

export const DEBUG_NODE_TYPE = 'Debug'

/** Data type of a part's debug output and of the Debug node's input. */
export const DEBUG_DATA_TYPE = 'debug'

/** The debug socket's handle id on a part, drawn by `StudioNode`, never in
 *  `data.outputs`: saved port lists and codegen never see it. */
export const DEBUG_SOURCE_HANDLE = 'debug'

/** The Debug node's one input. */
export const DEBUG_TARGET_HANDLE = 'part'

/** Node types that exist only for the session that placed them. */
export const TRANSIENT_NODE_TYPES: ReadonlySet<string> = new Set([DEBUG_NODE_TYPE])

export function isTransientNodeType(nodeType: string): boolean {
  return TRANSIENT_NODE_TYPES.has(nodeType)
}

interface GraphLike<N, E> { nodes: readonly N[]; edges: readonly E[] }

function nodeTypeOf(node: object): string {
  const data = (node as { data?: { nodeType?: unknown } }).data
  return typeof data?.nodeType === 'string' ? data.nodeType : ''
}

/**
 * The graph without transient nodes and the edges touching them. With none
 * present the same arrays come back, so identity-keyed caches downstream keep
 * hitting.
 */
export function withoutTransientNodes<N extends object, E extends object>(
  nodes: readonly N[], edges: readonly E[],
): GraphLike<N, E> {
  const transient = new Set<unknown>()
  for (const node of nodes) {
    if (isTransientNodeType(nodeTypeOf(node))) transient.add((node as { id?: unknown }).id)
  }
  if (transient.size === 0) return { nodes, edges }
  return {
    nodes: nodes.filter((node) => !transient.has((node as { id?: unknown }).id)),
    edges: edges.filter((edge) => {
      const { source, target } = edge as { source?: unknown; target?: unknown }
      return !transient.has(source) && !transient.has(target)
    }),
  }
}

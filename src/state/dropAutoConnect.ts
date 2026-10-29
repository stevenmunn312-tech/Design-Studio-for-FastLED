import type { Connection } from '@xyflow/react'
import type { StudioEdge, StudioNode } from './graphStore'

type Port = { id: string; dataType: string }

/**
 * Sources with only one sensible destination. An audio source, a Transition
 * Pool, a Pattern Collection, Player Particles or a Music Library is placed
 * to feed something, and when the graph has exactly one open input of its
 * kind there is nothing to choose, so the drop wires itself.
 */
const AUTO_CONNECT_DATA_TYPES: ReadonlySet<string> = new Set([
  'audio', 'transitionset', 'patternset', 'playerparticles', 'music',
])

/**
 * The connection a freshly placed node should make on its own, or null.
 *
 * Only an input nothing feeds yet counts: a wired input belongs to its
 * source, and a drop never takes one away. Two or more open inputs is a
 * choice the user makes by hand.
 */
export function soleDropConnection(
  nodeId: string,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): Connection | null {
  const node = nodes.find((entry) => entry.id === nodeId)
  if (!node) return null
  const outputs = ((node.data.outputs as Port[] | undefined) ?? [])
    .filter((port) => AUTO_CONNECT_DATA_TYPES.has(port.dataType))
  if (outputs.length !== 1) return null
  const output = outputs[0]
  const wired = new Set(edges.map((edge) => `${edge.target}\u0000${edge.targetHandle ?? ''}`))
  const open = nodes.flatMap((target) => target.id === nodeId ? [] : ((target.data.inputs as Port[] | undefined) ?? [])
    .filter((port) => port.dataType === output.dataType && !wired.has(`${target.id}\u0000${port.id}`))
    .map((port) => ({ target: target.id, targetHandle: port.id })))
  if (open.length !== 1) return null
  return { source: nodeId, sourceHandle: output.id, ...open[0] }
}

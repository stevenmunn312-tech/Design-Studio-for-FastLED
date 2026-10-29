import type { Connection } from '@xyflow/react'
import type { StudioEdge, StudioNode } from './graphStore'

type Port = { id: string; dataType: string }

/**
 * Connections that rarely leave a choice. Audio, a Transition Pool, a Pattern
 * Collection, Player Particles, a Music Library, a clock's date and time, a
 * DMX universe and image data each have few sources and few consumers, so a
 * placed node can often find its partner unaided.
 */
const AUTO_CONNECT_DATA_TYPES: ReadonlySet<string> = new Set([
  'audio', 'transitionset', 'patternset', 'playerparticles', 'music',
  'datetime', 'dmx', 'image',
])

const portsOf = (node: StudioNode, side: 'inputs' | 'outputs') =>
  ((node.data[side] as Port[] | undefined) ?? []).filter((port) => AUTO_CONNECT_DATA_TYPES.has(port.dataType))

/**
 * The connections a freshly placed node should make on its own.
 *
 * Each of its outputs wires to the one open input of that type, if there is
 * exactly one: an input something already feeds belongs to its source, and a
 * drop never takes one away. Each of its inputs wires to the one source of
 * that type, if there is exactly one: a source may feed many inputs, so it
 * need not be idle. Anything with two candidates is a choice left to the user.
 */
export function dropConnections(
  nodeId: string,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): Connection[] {
  const node = nodes.find((entry) => entry.id === nodeId)
  if (!node) return []
  const others = nodes.filter((entry) => entry.id !== nodeId)
  const wired = new Set(edges.map((edge) => `${edge.target}\u0000${edge.targetHandle ?? ''}`))
  const connections: Connection[] = []

  for (const output of portsOf(node, 'outputs')) {
    const open = others.flatMap((target) => portsOf(target, 'inputs')
      .filter((port) => port.dataType === output.dataType && !wired.has(`${target.id}\u0000${port.id}`))
      .map((port) => ({ target: target.id, targetHandle: port.id })))
    if (open.length === 1) connections.push({ source: nodeId, sourceHandle: output.id, ...open[0] })
  }

  for (const input of portsOf(node, 'inputs')) {
    if (wired.has(`${nodeId}\u0000${input.id}`)) continue
    const sources = others.flatMap((source) => portsOf(source, 'outputs')
      .filter((port) => port.dataType === input.dataType)
      .map((port) => ({ source: source.id, sourceHandle: port.id })))
    if (sources.length === 1) connections.push({ ...sources[0], target: nodeId, targetHandle: input.id })
  }

  return connections
}

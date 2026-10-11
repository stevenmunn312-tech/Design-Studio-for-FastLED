import { isHardwareNodeType } from '../build/hardware'
import type { StudioEdge, StudioNode } from './graphStore'
import type { GroupRegistry } from './evaluator/types'

type Source = { nodeId: string; port: string }
const key = (source: Source) => JSON.stringify([source.nodeId, source.port])

/** Inline group boundaries without evaluating any authored content. A missing
 * input removes the wire, preserving each consumer's own property fallback. */
export function expandGroups(nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry) {
  const flatNodes: StudioNode[] = [], flatEdges: StudioEdge[] = []
  const errors = new Set<string>()
  const aliases = new Map<string, Source | null>()
  const ids = new Set<string>(), boundaries = new Set<string>()
  const symbols = new Map<string, string>()
  let count = 0
  const expand = (graphNodes: StudioNode[], graphEdges: StudioEdge[], prefix: string,
    stack: ReadonlySet<string>, bindings?: Map<string, Source>) => {
    if (stack.size > 256) { errors.add('Group nesting exceeds 256 levels. Simplify the graph.'); return }
    const source = (edge: StudioEdge): Source => ({ nodeId: prefix + edge.source, port: edge.sourceHandle ?? '' })
    const groupNodes = new Set(graphNodes.filter((node) => node.data.nodeType === 'Group').map((node) => node.id))
    const terminals = new Set(graphNodes.filter((node) => bindings && ['GroupInput', 'GroupOutput'].includes(node.data.nodeType)).map((node) => node.id))
    for (const node of graphNodes) {
      const id = prefix + node.id
      if (++count > 10000) { errors.add('Group expansion exceeds 10000 nodes. Split or simplify the graph.'); return }
      if (ids.has(id)) { errors.add(`Group expansion: duplicate node identifier ${id}. Rename or recreate this node.`); continue }
      ids.add(id)
      if (bindings && isHardwareNodeType(node.data.nodeType)) {
        errors.add(`${node.data.label || id}: hardware must remain in the root graph. Expose a group input instead.`)
        continue
      }
      if (node.data.nodeType === 'Group') {
        boundaries.add(id)
        const groupId = String(node.data.properties.groupId ?? '')
        const definition = groups[groupId]
        if (!definition || stack.has(groupId)) {
          errors.add(`${node.data.label || id}: ${definition ? 'recursive group definition' : 'missing group definition'}.`)
          continue
        }
        const childPrefix = `${id}__`
        const terminal = definition.nodes.find((entry) => entry.data.nodeType === 'GroupOutput')
        for (const port of (node.data.outputs as { id: string }[] | undefined) ?? []) aliases.set(key({ nodeId: id, port: port.id }), null)
        if (terminal) for (const edge of definition.edges.filter((entry) => entry.target === terminal.id)) {
          aliases.set(key({ nodeId: id, port: edge.targetHandle ?? '' }),
            { nodeId: childPrefix + edge.source, port: edge.sourceHandle ?? '' })
        }
        const inputs = new Map(graphEdges.filter((edge) => edge.target === node.id)
          .map((edge) => [edge.targetHandle ?? '', source(edge)]))
        expand(definition.nodes, definition.edges, childPrefix, new Set([...stack, groupId]), inputs)
      } else if (bindings && node.data.nodeType === 'GroupInput') {
        boundaries.add(id)
        aliases.set(key({ nodeId: id, port: 'out' }), bindings.get(String(node.data.properties.paramId ?? '')) ?? null)
      } else if (!terminals.has(node.id)) {
        const symbol = id.replace(/[^a-zA-Z0-9_]/g, '_')
        const previous = symbols.get(symbol)
        if (previous && previous !== id) errors.add(`${id}: generated identifiers collide with ${previous}. Rename or recreate this node.`)
        symbols.set(symbol, id)
        flatNodes.push({ ...node, id })
      }
    }
    for (const edge of graphEdges) {
      if (groupNodes.has(edge.target) || terminals.has(edge.target)) continue
      flatEdges.push({ ...edge, id: prefix + edge.id, source: prefix + edge.source, target: prefix + edge.target })
    }
  }
  expand(nodes, edges, '', new Set())
  const resolve = (source: Source): Source | null => {
    const seen = new Set<string>()
    let current = source
    while (true) {
      const id = key(current)
      if (seen.has(id)) { errors.add('Group boundary wiring contains an instantaneous cycle. Remove a feedback wire.'); return null }
      seen.add(id)
      if (!aliases.has(id)) {
        if (boundaries.has(current.nodeId)) {
          errors.add(`${current.nodeId}.${current.port}: group output is missing or unwired.`)
          return null
        }
        return current
      }
      const next = aliases.get(id)
      if (!next) return null
      current = next
    }
  }
  const resolvedEdges = flatEdges.flatMap((edge) => {
    const resolved = resolve({ nodeId: edge.source, port: edge.sourceHandle ?? '' })
    return resolved ? [{ ...edge, source: resolved.nodeId, sourceHandle: resolved.port }] : []
  })
  return { nodes: flatNodes, edges: resolvedEdges, errors: [...errors] }
}

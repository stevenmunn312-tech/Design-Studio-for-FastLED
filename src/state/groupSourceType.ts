import type { StudioNode, StudioEdge } from './graphStore'
import type { GroupRegistry } from './evaluator/types'

interface Scope {
  nodes: StudioNode[]
  edges: StudioEdge[]
  path: string[]
  groups: ReadonlySet<string>
  parent?: { scope: Scope; instance: string }
}

/** Follow transparent group boundaries so contact debounce survives grouping. */
export function groupSourceType(nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry,
  inputTypes: Record<string, string | undefined> = {}) {
  const root: Scope = { nodes, edges, path: [], groups: new Set() }
  const input = (scope: Scope, nodeId: string, port: string, seen: ReadonlySet<string>): string | undefined => {
    const wire = scope.edges.find((edge) => edge.target === nodeId && edge.targetHandle === port)
    return wire ? walk(scope, wire.source, wire.sourceHandle ?? '', seen) : undefined
  }
  const walk = (scope: Scope, nodeId: string, port: string, seen: ReadonlySet<string>): string | undefined => {
    const key = JSON.stringify([scope.path, nodeId, port])
    if (seen.has(key) || seen.size >= 512) return undefined
    const next = new Set([...seen, key])
    const node = scope.nodes.find((entry) => entry.id === nodeId)
    if (!node) return undefined
    if (node.data.nodeType === 'GroupInput') {
      const param = String(node.data.properties.paramId ?? '')
      return scope.parent ? input(scope.parent.scope, scope.parent.instance, param, next) : inputTypes[param]
    }
    if (node.data.nodeType !== 'Group') return node.data.nodeType
    const groupId = String(node.data.properties.groupId ?? '')
    const definition = groups[groupId]
    if (!definition || scope.groups.has(groupId) || scope.groups.size >= 256) return undefined
    const terminal = definition.nodes.find((entry) => entry.data.nodeType === 'GroupOutput')
    if (!terminal) return undefined
    return input({ ...definition, path: [...scope.path, nodeId], groups: new Set([...scope.groups, groupId]),
      parent: { scope, instance: nodeId } }, terminal.id, port, next)
  }
  const cache = new Map<string, string | undefined>()
  return (nodeId: string, port: string): string | undefined => {
    const key = JSON.stringify([nodeId, port])
    if (!cache.has(key)) cache.set(key, input(root, nodeId, port, new Set()))
    return cache.get(key)
  }
}

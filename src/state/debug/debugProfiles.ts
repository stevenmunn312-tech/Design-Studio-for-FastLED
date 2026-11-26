// Every Debug profile, by node type. A node type with a profile gets a debug
// socket on the canvas; one without has nothing for a Debug node to offer.

import type { StudioEdge, StudioNode } from '../graphStore'
import type { DebugProfile } from './debugProfile'
import { DEBUG_NODE_TYPE, DEBUG_SOURCE_HANDLE, DEBUG_TARGET_HANDLE } from './debugNode'
import { CONTROL_PROFILES } from './profiles/controls'

export const DEBUG_PROFILES: readonly DebugProfile[] = [...CONTROL_PROFILES]

const BY_TYPE = new Map<string, DebugProfile>(
  DEBUG_PROFILES.flatMap((profile) => profile.nodeTypes.map((type) => [type, profile] as const)),
)

export function debugProfileFor(nodeType: string): DebugProfile | undefined {
  return BY_TYPE.get(nodeType)
}

export function hasDebugProfile(nodeType: string): boolean {
  return BY_TYPE.has(nodeType)
}

/**
 * The part a Debug node tests: the source of a wire into its Part input,
 * else its `targetPartId`. Reads the root graph, where hardware lives.
 */
export function debugTargetOf(
  debugNodeId: string, rootNodes: readonly StudioNode[], rootEdges: readonly StudioEdge[],
): StudioNode | undefined {
  const wire = rootEdges.find((edge) => edge.target === debugNodeId && edge.targetHandle === DEBUG_TARGET_HANDLE)
  const debugNode = rootNodes.find((node) => node.id === debugNodeId)
  const id = wire?.source ?? String((debugNode?.data.properties as Record<string, unknown> | undefined)?.targetPartId ?? '')
  return id ? rootNodes.find((node) => node.id === id) : undefined
}

/**
 * Whether a connection is valid by the debug rules, or null when it is not a
 * debug connection at all and ordinary port typing decides. A part's debug
 * socket goes only into a Debug node's Part input, and that input takes only
 * a debug socket.
 */
export function debugConnectionVerdict(
  sourceType: string, sourceHandle: string | null | undefined,
  targetType: string, targetHandle: string | null | undefined,
): boolean | null {
  const fromDebug = sourceHandle === DEBUG_SOURCE_HANDLE && hasDebugProfile(sourceType)
  const intoDebug = targetType === DEBUG_NODE_TYPE && targetHandle === DEBUG_TARGET_HANDLE
  if (!fromDebug && !intoDebug) return null
  return fromDebug && intoDebug
}

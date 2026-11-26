// Every Debug profile, by node type. A node type with a profile gets a debug
// socket on the canvas; one without has nothing for a Debug node to offer.

import type { StudioEdge, StudioNode } from '../graphStore'
import type { DebugPart, DebugProfile } from './debugProfile'
import { DEBUG_NODE_TYPE, DEBUG_SOURCE_HANDLE, DEBUG_TARGET_HANDLE } from './debugNode'
import { CONTROL_PROFILES } from './profiles/controls'
import { I2C_PROFILE } from './profiles/i2c'
import { LED_OUTPUT_PROFILE } from './profiles/ledOutput'
import { POWER_PROFILES } from './profiles/power'
import { MODULE_PROFILES } from './profiles/modules'

export const DEBUG_PROFILES: readonly DebugProfile[] = [...CONTROL_PROFILES, LED_OUTPUT_PROFILE, I2C_PROFILE, ...POWER_PROFILES, ...MODULE_PROFILES]

export type { DebugPart }

const BY_TYPE = new Map<string, DebugProfile[]>()
for (const profile of DEBUG_PROFILES) {
  for (const type of profile.nodeTypes) BY_TYPE.set(type, [...(BY_TYPE.get(type) ?? []), profile])
}

/** The profile for a part as configured: a node type can have one profile per
 *  kind of module (an I2C light sensor and an analog one are tested apart). */
export function debugProfileFor(part: DebugPart): DebugProfile | undefined {
  return BY_TYPE.get(part.data.nodeType)?.find((profile) => profile.applies?.(part) ?? true)
}

export function hasDebugProfile(part: DebugPart): boolean {
  return debugProfileFor(part) !== undefined
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
  source: DebugPart, sourceHandle: string | null | undefined,
  targetType: string, targetHandle: string | null | undefined,
): boolean | null {
  const fromDebug = sourceHandle === DEBUG_SOURCE_HANDLE && hasDebugProfile(source)
  const intoDebug = targetType === DEBUG_NODE_TYPE && targetHandle === DEBUG_TARGET_HANDLE
  if (!fromDebug && !intoDebug) return null
  return fromDebug && intoDebug
}

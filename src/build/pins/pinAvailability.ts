import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { outputMirrorLeaders, outputRoutes } from '../../state/output/outputRouting'
import { collectPinUses } from '../hardwareManifest'
import { findPinCollisions, type BusPinUse } from './busTopology'

/** Occupied GPIOs that this assignment cannot share, within one board. */
export function pinAssignmentBlockers(
  nodes: StudioNode[],
  edges: StudioEdge[],
  nodeId: string,
  nodeType: string,
  propertyKey: string,
  selectedFqbn: string,
): Map<number, string[]> {
  const uses = collectPinUses(nodes, selectedFqbn)
  const current = uses.find((use) => use.nodeId === nodeId && use.propertyKey === propertyKey)
  const candidate: BusPinUse = current ?? { nodeId, nodeType, propertyKey, pin: 0, label: '' }
  const others = uses.filter((use) => use !== current)
  const labels = new Map(nodes.map((node) => [node.id, node.data.label]))
  const routes = nodeType === 'MatrixOutput' && propertyKey === 'dataPin' ? outputRoutes(nodes) : []
  const blockers = new Map<number, string[]>()

  for (const pin of new Set(others.map((use) => use.pin))) {
    // Evaluate the proposed pin too, so a new parallel LED connection can be
    // selected. Exempt only its matching output, never unrelated hardware.
    const leaders = outputMirrorLeaders(routes.map((route) =>
      route.id === nodeId ? { ...route, dataPin: pin } : route), edges)
    const names = others.filter((other) => {
      if (other.pin !== pin) return false
      if (other.nodeType === 'MatrixOutput' && other.propertyKey === 'dataPin'
        && leaders.has(nodeId) && leaders.get(nodeId) === leaders.get(other.nodeId)) return false
      return findPinCollisions([{ ...candidate, pin }, other]).length > 0
    }).map((other) => other.nodeId === nodeId ? other.label : labels.get(other.nodeId) ?? other.label)
    if (names.length) blockers.set(pin, [...new Set(names)])
  }
  return blockers
}

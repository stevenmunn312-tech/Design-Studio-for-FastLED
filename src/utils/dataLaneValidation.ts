/**
 * Deploy faults in LED outputs split across data pins
 * (src/state/output/dataLanes.ts). Pin collisions between lanes and other
 * parts are found by the shared pin walk, which already claims every lane pin;
 * this covers what only the lane settings can say.
 */
import type { StudioEdge, StudioNode } from '../state/graphStore'
import { findDataLaneIssues, requestedDataLanes } from '../state/output/dataLanes'
import { outputMirrorLeaders, outputRoutes } from '../state/output/outputRouting'

export interface DataLaneIssue {
  nodeId: string
  nodeLabel: string
  message: string
}

export function findDataLaneIssuesInGraph(nodes: StudioNode[], edges: StudioEdge[] = []): DataLaneIssue[] {
  const outputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const issues: DataLaneIssue[] = outputs.flatMap((node) => {
    const label = node.data.label || 'LED output'
    return findDataLaneIssues(node.data.properties as Record<string, unknown>, label)
      .map((message) => ({ nodeId: node.id, nodeLabel: label, message }))
  })
  // A parallel mirror shares its leader's one data line and array. A split
  // leader would feed the mirror only its first lane, and a split mirror's
  // lanes are never driven, so neither side of a mirror can split.
  const routes = outputRoutes(outputs)
  const leaders = outputMirrorLeaders(routes, edges)
  const byId = new Map(outputs.map((node) => [node.id, node]))
  for (const route of routes) {
    const leaderId = leaders.get(route.id)
    if (!leaderId || leaderId === route.id) continue
    const mirror = byId.get(route.id)
    const leader = byId.get(leaderId)
    if (!mirror || !leader) continue
    const split = [mirror, leader].find((node) => requestedDataLanes(node.data.properties as Record<string, unknown>) > 1)
    if (!split) continue
    issues.push({
      nodeId: split.id,
      nodeLabel: split.data.label,
      message: `${mirror.data.label} mirrors ${leader.data.label} on GPIO ${route.dataPin}, but ${split.data.label} is split across data pins, which a mirror cannot share. Give ${mirror.data.label} its own data pin, or set Data lanes to 1.`,
    })
  }
  return issues
}

export function findDataLaneErrors(nodes: StudioNode[], edges: StudioEdge[] = []): string[] {
  return findDataLaneIssuesInGraph(nodes, edges).map((issue) => issue.message).sort()
}

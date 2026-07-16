import type { StudioEdge, StudioNode } from '../../state/graphStore'

interface PortLike {
  id?: string
  dataType?: string
}

const AUDIO_REACTIVE_TYPES = new Set(['FFTAnalyzer', 'BeatDetect', 'PercussionDetect', 'AudioFeatures', 'PatternMaster', 'SpectrumVisualizer'])

function outputReachableNodeIds(nodes: StudioNode[], edges: StudioEdge[]): Set<string> {
  const reachable = new Set<string>()
  const stack = nodes
    .filter((node) => ['MatrixOutput', 'GroupOutput'].includes(String(node.data.nodeType)))
    .map((node) => node.id)

  while (stack.length > 0) {
    const nodeId = stack.pop()!
    if (reachable.has(nodeId)) continue
    reachable.add(nodeId)
    for (const edge of edges) {
      if (edge.target === nodeId && edge.source) stack.push(edge.source)
    }
  }

  return reachable
}

function hasIncomingEdge(edges: StudioEdge[], nodeId: string, handleId: string): boolean {
  return edges.some((edge) => edge.target === nodeId && edge.targetHandle === handleId)
}

export function graphConsumesAudio(nodes: StudioNode[], edges: StudioEdge[]): boolean {
  const reachable = outputReachableNodeIds(nodes, edges)

  return nodes.some((node) => {
    if (!reachable.has(node.id)) return false

    const nodeType = String(node.data.nodeType ?? '')
    if (AUDIO_REACTIVE_TYPES.has(nodeType)) {
      return hasIncomingEdge(edges, node.id, 'audio')
    }

    if (nodeType === 'Group') {
      const inputs = ((node.data as { inputs?: PortLike[] }).inputs ?? [])
      return inputs.some((port) => port.id && port.dataType === 'audio' && hasIncomingEdge(edges, node.id, port.id))
    }

    return false
  })
}

import { useMemo } from 'react'
import { useGraphStore, type StudioEdge, type StudioNode } from '../../state/graphStore'
import { evaluateScalarSeries } from '../../state/graphEvaluator'
import { PREVIEW_POINTS, PREVIEW_SECONDS } from '../../state/wave'
import WaveScope from './WaveScope'

// Serialise everything upstream of `nodeId` that can affect its sampled output:
// the wiring plus each upstream node's type and properties. Node positions are
// deliberately excluded, so dragging nodes around never invalidates the scope —
// previously any graph-store update (every drag pointermove) re-ran the full
// sample sweep.
function upstreamSignature(nodes: StudioNode[], edges: StudioEdge[], nodeId: string): string {
  const byTarget = new Map<string, StudioEdge[]>()
  for (const edge of edges) {
    const into = byTarget.get(edge.target)
    if (into) into.push(edge)
    else byTarget.set(edge.target, [edge])
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  let sig = ''
  const pending = [nodeId]
  const seen = new Set([nodeId])
  while (pending.length) {
    const id = pending.pop()!
    const node = nodeById.get(id)
    if (node) sig += `${id}=${node.data.nodeType}|${JSON.stringify(node.data.properties)};`
    for (const edge of byTarget.get(id) ?? []) {
      sig += `${edge.target}:${edge.targetHandle}<${edge.source}:${edge.sourceHandle};`
      if (seen.has(edge.source)) continue
      seen.add(edge.source)
      pending.push(edge.source)
    }
  }
  return sig
}

// Sample ticks across the preview window (t = tick/60 seconds).
const SCOPE_TICKS = Array.from(
  { length: PREVIEW_POINTS },
  (_, i) => (i / (PREVIEW_POINTS - 1)) * PREVIEW_SECONDS * 60,
)

/**
 * Live scope for a ComplexWave node: samples the node's own `result` output
 * across the preview window via the real evaluator, so it reflects the actual
 * upstream inputs and the chosen operation. Subscribed to a signature of the
 * upstream subgraph so it resamples when wiring or properties change.
 */
export default function ComplexWaveScope({ nodeId }: { nodeId: string }) {
  const signature = useGraphStore((s) => upstreamSignature(s.nodes, s.edges, nodeId))

  const samples = useMemo(() => {
    const { nodes, edges } = useGraphStore.getState()
    return evaluateScalarSeries(nodes, edges, nodeId, 'result', SCOPE_TICKS)
    // `signature` is the real dependency: it changes exactly when the upstream
    // subgraph (types/properties/wiring) changes, never on plain node moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, nodeId])

  return <WaveScope samples={samples} />
}

import { useMemo } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { evaluateScalar } from '../../state/graphEvaluator'
import { PREVIEW_POINTS, PREVIEW_SECONDS } from '../../state/wave'
import WaveScope from './WaveScope'

/**
 * Live scope for a ComplexWave node: samples the node's own `result` output
 * across the preview window via the real evaluator, so it reflects the actual
 * upstream inputs and the chosen operation. Subscribed to nodes/edges so it
 * updates when an upstream wave changes.
 */
export default function ComplexWaveScope({ nodeId }: { nodeId: string }) {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)

  const samples = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < PREVIEW_POINTS; i++) {
      const tick = (i / (PREVIEW_POINTS - 1)) * PREVIEW_SECONDS * 60 // t = tick/60 seconds
      out.push(evaluateScalar(nodes, edges, nodeId, 'result', tick))
    }
    return out
  }, [nodes, edges, nodeId])

  return <WaveScope samples={samples} />
}

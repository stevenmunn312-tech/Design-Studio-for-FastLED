import { memo } from 'react'
import { getBezierPath, useReactFlow } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import { CATEGORY_COLOR } from '../../state/nodeLibrary'
import { usePreviewStore } from '../../state/previewStore'
import styles from './GlowEdge.module.css'

function GlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  sourceHandleId,
  style,
  data,
}: EdgeProps) {
  const { getNode } = useReactFlow()
  const sourceNode = getNode(source)
  const category = (sourceNode?.data as { category?: string })?.category ?? 'output'
  const signal = usePreviewStore((state) =>
    sourceHandleId ? state.signals.get(`${source}:${sourceHandleId}`) : undefined
  )
  const color = signal?.emissive || (typeof style?.stroke === 'string' && style.stroke) || CATEGORY_COLOR[category] || '#00bfff'
  const edgeData = data as { spliceArmed?: boolean; splicePreview?: boolean } | undefined
  const spliceArmed = edgeData?.spliceArmed === true
  const splicePreview = edgeData?.splicePreview === true

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <g>
      {/* During a sidebar drag this transparent stroke makes the real curved
          noodle—not a straight-line approximation—the splice hit target. */}
      {spliceArmed && (
        <path
          data-splice-edge-id={id}
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={SPLICE_HIT_WIDTH}
          pointerEvents="stroke"
        />
      )}
      {/* Compatible node hovering in the splice zone — make the target
          unmistakable without changing the normal noodle treatment. */}
      {splicePreview && (
        <path
          className={styles.spliceTarget}
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={18}
          strokeLinecap="round"
          style={{ '--edge-color': color } as React.CSSProperties}
        />
      )}
      {/* Outer halo — wide and very soft */}
      <path d={edgePath} fill="none" stroke={color} strokeWidth={14} strokeOpacity={0.07} />
      {/* Mid bloom */}
      <path d={edgePath} fill="none" stroke={color} strokeWidth={7} strokeOpacity={0.18} />
      {/* Core — animated dash */}
      <path
        id={id}
        className={`${styles.core} ${splicePreview ? styles.coreReady : ''}`}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="10 6"
        style={{ '--edge-color': color } as React.CSSProperties}
      />
      {/* Discrete packets make direction and activity legible at a glance. The
          staggered pair reads like charge moving through a physical patch
          cable rather than another decorative dashed line. */}
      {[0, 1].map((packet) => (
        <circle
          key={packet}
          className={styles.packet}
          r={packet === 0 ? 3.2 : 2.1}
          fill={color}
          opacity={Math.min(0.95, 0.42 + (signal?.energy ?? 0.45) * 0.5)}
          style={{ '--edge-color': color } as React.CSSProperties}
        >
          <animateMotion
            dur="1.75s"
            begin={`${packet * -0.875}s`}
            repeatCount="indefinite"
            path={edgePath}
          />
        </circle>
      ))}
      {/* Bright dot at the target port */}
      <circle cx={targetX} cy={targetY} r={4} fill={color} opacity={0.85} />
    </g>
  )
}

// Matches the 48-flow-unit radius used by the geometric fallback in the
// canvas (SVG stroke width extends equally on both sides of the noodle).
const SPLICE_HIT_WIDTH = 96

export default memo(GlowEdge)

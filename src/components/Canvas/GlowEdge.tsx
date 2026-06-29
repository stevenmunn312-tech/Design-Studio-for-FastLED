import { memo } from 'react'
import { getBezierPath, useReactFlow } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import { CATEGORY_COLOR } from '../../state/nodeLibrary'
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
  style,
}: EdgeProps) {
  const { getNode } = useReactFlow()
  const sourceNode = getNode(source)
  const category = (sourceNode?.data as { category?: string })?.category ?? 'output'
  const color = (typeof style?.stroke === 'string' && style.stroke) || CATEGORY_COLOR[category] || '#00bfff'

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
      {/* Outer halo — wide and very soft */}
      <path d={edgePath} fill="none" stroke={color} strokeWidth={14} strokeOpacity={0.07} />
      {/* Mid bloom */}
      <path d={edgePath} fill="none" stroke={color} strokeWidth={7} strokeOpacity={0.18} />
      {/* Core — animated dash */}
      <path
        id={id}
        className={styles.core}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="10 6"
        style={{ '--edge-color': color } as React.CSSProperties}
      />
      {/* Bright dot at the target port */}
      <circle cx={targetX} cy={targetY} r={4} fill={color} opacity={0.85} />
    </g>
  )
}

export default memo(GlowEdge)

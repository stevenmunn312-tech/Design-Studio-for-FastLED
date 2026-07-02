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
  data,
}: EdgeProps) {
  const { getNode } = useReactFlow()
  const sourceNode = getNode(source)
  const category = (sourceNode?.data as { category?: string })?.category ?? 'output'
  const color = (typeof style?.stroke === 'string' && style.stroke) || CATEGORY_COLOR[category] || '#00bfff'
  const splicePreview = (data as { splicePreview?: boolean } | undefined)?.splicePreview === true

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
      {/* Bright dot at the target port */}
      <circle cx={targetX} cy={targetY} r={4} fill={color} opacity={0.85} />
    </g>
  )
}

export default memo(GlowEdge)

import { memo } from 'react'
import { getBezierPath, useReactFlow } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import styles from './GlowEdge.module.css'

const ACCENT: Record<string, string> = {
  audio: '#00ffff',
  pattern: '#ff00ff',
  math: '#a8ff00',
  output: '#00bfff',
  hardware: '#ffa500',
}

function GlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
}: EdgeProps) {
  const { getNode } = useReactFlow()
  const sourceNode = getNode(source)
  const category = (sourceNode?.data as { category?: string })?.category ?? 'output'
  const color = ACCENT[category] ?? '#00bfff'

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

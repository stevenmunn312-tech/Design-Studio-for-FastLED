import { memo } from 'react'
import { getBezierPath, useReactFlow } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import { CATEGORY_COLOR } from '../../state/nodeLibrary'
import { usePreviewStore } from '../../state/previewStore'
import styles from './GlowEdge.module.css'

type SignalFamily = 'frame' | 'audio' | 'color' | 'control'

function signalFamily(dataType?: string): SignalFamily {
  if (dataType === 'frame') return 'frame'
  if (dataType === 'audio') return 'audio'
  if (dataType === 'color' || dataType === 'palette') return 'color'
  return 'control'
}

function familyMotion(family: SignalFamily) {
  switch (family) {
    case 'frame':
      return {
        outerWidth: 16,
        outerOpacity: 0.08,
        midWidth: 8,
        midOpacity: 0.18,
        coreWidth: 2.8,
        dash: '24 18',
        duration: 3.2,
        packetDuration: 2.8,
        packetRadii: [3.4, 2.5, 1.8],
      }
    case 'audio':
      return {
        outerWidth: 15,
        outerOpacity: 0.09,
        midWidth: 7,
        midOpacity: 0.22,
        coreWidth: 2.8,
        dash: '5 10',
        duration: 0.72,
        packetDuration: 0.88,
        packetRadii: [3.5, 2.4],
      }
    case 'color':
      return {
        outerWidth: 14,
        outerOpacity: 0.07,
        midWidth: 7,
        midOpacity: 0.2,
        coreWidth: 2.6,
        dash: '2 14',
        duration: 1.55,
        packetDuration: 1.7,
        packetRadii: [3, 2.1],
      }
    default:
      return {
        outerWidth: 13,
        outerOpacity: 0.06,
        midWidth: 6,
        midOpacity: 0.16,
        coreWidth: 2.3,
        dash: '11 8',
        duration: 1.18,
        packetDuration: 1.42,
        packetRadii: [2.2],
      }
  }
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
  sourceHandleId,
  style,
  data,
}: EdgeProps) {
  const { getNode } = useReactFlow()
  const sourceNode = getNode(source)
  const category = (sourceNode?.data as { category?: string })?.category ?? 'output'
  const sourceType = (sourceNode?.data as { outputs?: Array<{ id: string; dataType: string }> } | undefined)?.outputs
    ?.find((output) => output.id === sourceHandleId)?.dataType
  const family = signalFamily(sourceType)
  const motion = familyMotion(family)
  const signal = usePreviewStore((state) =>
    sourceHandleId ? state.signals.get(`${source}:${sourceHandleId}`) : undefined
  )
  const color = signal?.emissive || (typeof style?.stroke === 'string' && style.stroke) || CATEGORY_COLOR[category] || '#00bfff'
  const edgeData = data as {
    spliceArmed?: boolean
    splicePreview?: boolean
    focusState?: 'active' | 'dim'
    connectionPulse?: number
  } | undefined
  const spliceArmed = edgeData?.spliceArmed === true
  const splicePreview = edgeData?.splicePreview === true
  const focusState = edgeData?.focusState
  const familyClass =
    family === 'frame' ? styles.familyFrame :
    family === 'audio' ? styles.familyAudio :
    family === 'color' ? styles.familyColor :
    styles.familyControl

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <g className={`${familyClass} ${focusState === 'dim' ? styles.focusDim : focusState === 'active' ? styles.focusActive : ''}`}>
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
      <path d={edgePath} fill="none" stroke={color} strokeWidth={motion.outerWidth} strokeOpacity={motion.outerOpacity} />
      {/* Mid bloom */}
      <path d={edgePath} fill="none" stroke={color} strokeWidth={motion.midWidth} strokeOpacity={motion.midOpacity} />
      {/* Core — animated dash */}
      <path
        id={id}
        className={`${styles.core} ${splicePreview ? styles.coreReady : ''}`}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={motion.coreWidth}
        strokeLinecap="round"
        strokeDasharray={motion.dash}
        style={{
          '--edge-color': color,
          '--edge-flow-duration': `${motion.duration}s`,
        } as React.CSSProperties}
      />
      {edgeData?.connectionPulse && (
        <>
          <path
            key={`flash-${edgeData.connectionPulse}`}
            className={styles.connectionFlash}
            d={edgePath}
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            style={{ '--edge-color': color } as React.CSSProperties}
          />
          <circle
            key={`charge-${edgeData.connectionPulse}`}
            data-connection-charge
            className={styles.connectionCharge}
            r={5}
            fill="#fff"
            style={{ '--edge-color': color } as React.CSSProperties}
          >
            <animateMotion dur="0.52s" repeatCount="1" path={edgePath} />
          </circle>
        </>
      )}
      {/* Discrete packets make direction and activity legible at a glance. The
          staggered pair reads like charge moving through a physical patch
          cable rather than another decorative dashed line. */}
      {motion.packetRadii.map((radius, packet) => (
        <circle
          key={`${family}-${packet}`}
          className={styles.packet}
          r={radius}
          fill={color}
          opacity={Math.min(0.95, 0.3 + (signal?.energy ?? 0.4) * 0.55)}
          style={{
            '--edge-color': color,
            '--packet-duration': `${motion.packetDuration}s`,
          } as React.CSSProperties}
        >
          <animateMotion
            dur={`${motion.packetDuration}s`}
            begin={`${-(packet / motion.packetRadii.length) * motion.packetDuration}s`}
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

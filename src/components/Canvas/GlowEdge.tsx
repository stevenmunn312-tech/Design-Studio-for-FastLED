import { memo, useState } from 'react'
import { getBezierPath, useReactFlow } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import { CATEGORY_COLOR } from '../../state/nodeLibrary'
import { useGraphStore } from '../../state/graphStore'
import { usePreviewStore } from '../../state/previewStore'
import { useUiStore } from '../../state/uiStore'
import styles from './GlowEdge.module.css'

function formatSignalValue(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const rounded = Math.round(value * 1000) / 1000
    return String(rounded)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return null
}

// Packet budget by graph size: every packet is a continuously-animating element,
// so on busy graphs each noodle drops to a single packet, and past the upper
// bound packets are dropped entirely (the dashed core still shows flow).
const PACKET_LEAN_EDGE_COUNT = 24
const PACKET_OFF_EDGE_COUNT = 60

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
        outerOpacity: 0.045,
        midWidth: 8,
        midOpacity: 0.12,
        coreWidth: 2.8,
        dash: '24 18',
        duration: 3.2,
        packetDuration: 2.8,
        packetRadii: [3.4, 2.5, 1.8],
      }
    case 'audio':
      return {
        outerWidth: 15,
        outerOpacity: 0.05,
        midWidth: 7,
        midOpacity: 0.14,
        coreWidth: 2.8,
        dash: '5 10',
        duration: 0.72,
        packetDuration: 0.88,
        packetRadii: [3.5, 2.4],
      }
    case 'color':
      return {
        outerWidth: 14,
        outerOpacity: 0.04,
        midWidth: 7,
        midOpacity: 0.13,
        coreWidth: 2.6,
        dash: '2 14',
        duration: 1.55,
        packetDuration: 1.7,
        packetRadii: [3, 2.1],
      }
    default:
      return {
        outerWidth: 13,
        outerOpacity: 0.035,
        midWidth: 6,
        midOpacity: 0.1,
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
  const [hovered, setHovered] = useState(false)
  const showsValueReadout = sourceType === 'float' || sourceType === 'bool'
  const rawValue = usePreviewStore((state) =>
    showsValueReadout && sourceHandleId ? state.outputs.get(source)?.[sourceHandleId] : undefined
  )
  const readout = hovered && showsValueReadout ? formatSignalValue(rawValue) : null
  const uiEffectsEnabled = useUiStore((state) => state.uiEffectsEnabled)
  const packetCap = useGraphStore((s) =>
    s.edges.length > PACKET_OFF_EDGE_COUNT ? 0
    : s.edges.length > PACKET_LEAN_EDGE_COUNT ? 1
    : Number.POSITIVE_INFINITY)
  const signalEnergy = signal?.energy ?? 0
  const activity = Math.min(1, signalEnergy)
  const idleVisibility = 1 - Math.min(1, signalEnergy * 1.35)
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

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const hoverHitPath = showsValueReadout && (
    <path
      d={edgePath}
      fill="none"
      stroke="transparent"
      strokeWidth={SPLICE_HIT_WIDTH}
      pointerEvents="stroke"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  )

  const valueReadout = readout != null && (
    <g className={styles.signalReadout} transform={`translate(${labelX}, ${labelY})`}>
      <rect x={-1} y={-9} width={readout.length * 6.4 + 10} height={16} rx={4} fill="rgba(10, 12, 16, 0.88)" stroke={color} strokeWidth={1} />
      <text x={4} y={3} fill={color} fontSize={11} fontFamily="monospace">{readout}</text>
    </g>
  )

  if (!uiEffectsEnabled) {
    return (
      <g className={focusState === 'dim' ? styles.focusDim : focusState === 'active' ? styles.focusActive : ''}>
        {hoverHitPath}
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
        {splicePreview && (
          <path
            className={styles.spliceTarget}
            d={edgePath}
            fill="none"
            stroke={color}
            strokeWidth={14}
            strokeLinecap="round"
            style={{ '--edge-color': color } as React.CSSProperties}
          />
        )}
        <path
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeOpacity={0.58 + activity * 0.28}
        />
        <circle cx={targetX} cy={targetY} r={3.2} fill={color} opacity={0.82} />
        {valueReadout}
      </g>
    )
  }

  return (
    <g className={`${familyClass} ${focusState === 'dim' ? styles.focusDim : focusState === 'active' ? styles.focusActive : ''}`}>
      {hoverHitPath}
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
      <path d={edgePath} fill="none" stroke={color} strokeWidth={motion.outerWidth} strokeOpacity={motion.outerOpacity + activity * 0.055} />
      {/* Mid bloom */}
      <path d={edgePath} fill="none" stroke={color} strokeWidth={motion.midWidth} strokeOpacity={motion.midOpacity + activity * 0.08} />
      {/* Neutral carrier keeps dark noodles legible against the field even when
          the sampled signal is resting near black. It fades back as activity
          increases so the live color still owns the motion cue. */}
      <path
        className={styles.carrier}
        d={edgePath}
        fill="none"
        stroke="rgba(255 255 255 / 0.78)"
        strokeWidth={motion.coreWidth + 2}
        strokeLinecap="round"
        strokeOpacity={0.08 + idleVisibility * 0.12}
      />
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
        strokeOpacity={0.62 + activity * 0.24}
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
            style={{ '--edge-color': color, offsetPath: `path('${edgePath}')` } as React.CSSProperties}
          />
        </>
      )}
      {/* Discrete packets make direction and activity legible at a glance. The
          staggered pair reads like charge moving through a physical patch
          cable rather than another decorative dashed line. Motion is a CSS
          offset-path animation (not SMIL animateMotion): CSS animations are far
          cheaper for the main thread with many edges alive at once. */}
      {motion.packetRadii.slice(0, packetCap).map((radius, packet) => (
        <circle
          key={`${family}-${packet}`}
          className={styles.packet}
          r={radius}
          fill={color}
          opacity={Math.min(0.95, 0.24 + Math.max(signalEnergy, 0.12) * 0.56)}
          style={{
            '--edge-color': color,
            '--packet-duration': `${motion.packetDuration}s`,
            '--packet-delay': `${-(packet / motion.packetRadii.length) * motion.packetDuration}s`,
            offsetPath: `path('${edgePath}')`,
          } as React.CSSProperties}
        />
      ))}
      {/* Bright dot at the target port */}
      <circle cx={targetX} cy={targetY} r={4} fill={color} opacity={0.85} />
      {valueReadout}
    </g>
  )
}

// Matches the 48-flow-unit radius used by the geometric fallback in the
// canvas (SVG stroke width extends equally on both sides of the noodle).
const SPLICE_HIT_WIDTH = 96

export default memo(GlowEdge)

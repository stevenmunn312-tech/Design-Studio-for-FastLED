import { memo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
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

// Cable gauge per family: frame cables are the fattest trunk lines, control
// wires the thinnest. Packets keep their per-family cadence.
function familyMotion(family: SignalFamily) {
  switch (family) {
    case 'frame':
      return { cable: 6, packetDuration: 2.8, packetRadii: [3.2, 2.4, 1.8] }
    case 'audio':
      return { cable: 5.4, packetDuration: 0.88, packetRadii: [3.2, 2.2] }
    case 'color':
      return { cable: 5, packetDuration: 1.7, packetRadii: [2.8, 2] }
    default:
      return { cable: 4.4, packetDuration: 1.42, packetRadii: [2] }
  }
}

// A physical patch cable exits its jack horizontally, then droops under its
// own weight. Control points push out from each port and sag downward; longer
// runs droop more. Returns the path plus its midpoint (for the value readout).
function cablePath(sx: number, sy: number, tx: number, ty: number) {
  const dx = tx - sx
  const dist = Math.hypot(dx, ty - sy)
  const sag = Math.min(80, 16 + dist * 0.14)
  const spread = Math.max(36, Math.abs(dx) * 0.32)
  const c1x = sx + spread
  const c1y = sy + sag
  const c2x = tx - spread
  const c2y = ty + sag
  return {
    path: `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`,
    midX: (sx + 3 * c1x + 3 * c2x + tx) / 8,
    midY: (sy + 3 * c1y + 3 * c2y + ty) / 8,
  }
}

function GlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
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
  const color = signal?.emissive || (typeof style?.stroke === 'string' && style.stroke) || CATEGORY_COLOR[category] || '#00bfff'
  // Darkened jacket colour makes the round cable read as a solid object.
  const jacket = `color-mix(in srgb, ${color} 55%, #000)`
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

  const { path: edgePath, midX: labelX, midY: labelY } = cablePath(sourceX, sourceY, targetX, targetY)

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
          stroke={jacket}
          strokeWidth={motion.cable + 1.6}
          strokeLinecap="round"
        />
        <path
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={motion.cable - 1}
          strokeLinecap="round"
          strokeOpacity={0.78 + activity * 0.2}
        />
        <circle cx={sourceX} cy={sourceY} r={motion.cable / 2 + 1.6} fill={jacket} />
        <circle cx={targetX} cy={targetY} r={motion.cable / 2 + 1.6} fill={jacket} />
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
      {/* Soft activity glow around the whole cable */}
      <path d={edgePath} fill="none" stroke={color} strokeWidth={motion.cable + 8} strokeOpacity={0.03 + activity * 0.08} />
      {/* Drop shadow lifts the cable off the panel */}
      <path
        d={edgePath}
        transform="translate(1.5 3)"
        fill="none"
        stroke="rgba(0, 0, 0, 0.4)"
        strokeWidth={motion.cable + 1}
        strokeLinecap="round"
      />
      {/* Jacket outline — the darkened rim that makes the cable read round */}
      <path d={edgePath} fill="none" stroke={jacket} strokeWidth={motion.cable + 2} strokeLinecap="round" />
      {/* Cable body */}
      <path
        id={id}
        className={splicePreview ? styles.coreReady : styles.cableBody}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={motion.cable}
        strokeLinecap="round"
        strokeOpacity={0.82 + activity * 0.18}
        style={{ '--edge-color': color } as React.CSSProperties}
      />
      {/* Sheen — a thin top highlight running the cable's length */}
      <path
        d={edgePath}
        transform="translate(0 -1)"
        fill="none"
        stroke="rgba(255, 255, 255, 0.3)"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeOpacity={0.4 + activity * 0.2}
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
      {/* Plug boots where the cable enters each jack */}
      <circle cx={sourceX} cy={sourceY} r={motion.cable / 2 + 2} fill={jacket} stroke="rgba(0, 0, 0, 0.6)" strokeWidth={1} />
      <circle cx={sourceX} cy={sourceY} r={motion.cable / 2 - 0.5} fill={color} opacity={0.9} />
      <circle cx={targetX} cy={targetY} r={motion.cable / 2 + 2} fill={jacket} stroke="rgba(0, 0, 0, 0.6)" strokeWidth={1} />
      <circle cx={targetX} cy={targetY} r={motion.cable / 2 - 0.5} fill={color} opacity={0.9} />
      {valueReadout}
    </g>
  )
}

// Matches the 48-flow-unit radius used by the geometric fallback in the
// canvas (SVG stroke width extends equally on both sides of the noodle).
const SPLICE_HIT_WIDTH = 96

export default memo(GlowEdge)

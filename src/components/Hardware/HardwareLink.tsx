import type { CSSProperties } from 'react'
import { getBezierPath, Position } from '@xyflow/react'
import { familyMotion, signalFamily } from '../Canvas/noodleMotion'
import styles from './HardwareLink.module.css'

interface HardwareLinkProps {
  /** Drives the motion signature, exactly as the port type does on the canvas. */
  dataType: string
  /** Fallback colour when nothing is flowing — the part's category accent. */
  color: string
  /** Live signal colour sampled from the port this run carries, when there is one. */
  emissive?: string
  /** 0–1 activity on that port, brightening the run the way it does on the canvas. */
  energy?: number
  x1: number
  y1: number
  x2: number
  y2: number
  effects: boolean
  label: string
}

/**
 * One run between two parts, drawn as the same noodle the graph canvas draws:
 * halo, bloom, white carrier, animated dashed core and travelling packets, on
 * the same bezier `GlowEdge` uses so a run between parts the layout stacked
 * curves exactly as it would between two nodes.
 *
 * Renders a `<g>` into the arrangement's shared overlay, so its geometry comes
 * from the layout rather than from measuring its own box.
 */
export default function HardwareLink({
  dataType, color, emissive, energy = 0, x1, y1, x2, y2, effects, label,
}: HardwareLinkProps) {
  const motion = familyMotion(signalFamily(dataType))
  const [path] = getBezierPath({
    sourceX: x1,
    sourceY: y1,
    sourcePosition: Position.Right,
    targetX: x2,
    targetY: y2,
    targetPosition: Position.Left,
  })

  const stroke = emissive || color
  const activity = Math.min(1, energy)
  const idleVisibility = 1 - Math.min(1, energy * 1.35)

  if (!effects) {
    return (
      <g aria-label={label}>
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeOpacity={0.58 + activity * 0.28}
        />
        <circle cx={x1} cy={y1} r={3.2} fill={stroke} opacity={0.82} />
        <circle cx={x2} cy={y2} r={3.2} fill={stroke} opacity={0.82} />
      </g>
    )
  }

  return (
    <g aria-label={label}>
      {/* Outer halo — wide and very soft */}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={motion.outerWidth}
        strokeOpacity={motion.outerOpacity + activity * 0.055}
      />
      {/* Mid bloom */}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={motion.midWidth}
        strokeOpacity={motion.midOpacity + activity * 0.08}
      />
      {/* Neutral carrier keeps a dark run legible, fading back as the live
          colour takes over the motion cue. */}
      <path
        className={styles.carrier}
        d={path}
        fill="none"
        stroke="rgba(255 255 255 / 0.78)"
        strokeWidth={motion.coreWidth + 2}
        strokeLinecap="round"
        strokeOpacity={0.08 + idleVisibility * 0.12}
      />
      {/* Core — animated dash */}
      <path
        className={styles.core}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={motion.coreWidth}
        strokeLinecap="round"
        strokeDasharray={motion.dash}
        strokeOpacity={0.62 + activity * 0.24}
        style={{ '--edge-flow-duration': `${motion.duration}s` } as CSSProperties}
      />
      {/* Packets animate `offset-distance` forever, so they must carry no CSS
          filter — an infinite animation under a filter leaks GPU buffers in
          Chromium. Same rule as GlowEdge. */}
      {motion.packetRadii.map((radius, packet) => (
        <circle
          key={packet}
          className={styles.packet}
          r={radius}
          fill={stroke}
          opacity={Math.min(0.95, 0.24 + Math.max(energy, 0.12) * 0.56)}
          style={{
            '--packet-duration': `${motion.packetDuration}s`,
            '--packet-delay': `${-(packet / motion.packetRadii.length) * motion.packetDuration}s`,
            offsetPath: `path('${path}')`,
          } as CSSProperties}
        />
      ))}
      {/* A dot at each end, so the run reads as plugged into both parts rather
          than floating in the gap between them. */}
      <circle cx={x1} cy={y1} r={4} fill={stroke} opacity={0.85} />
      <circle cx={x2} cy={y2} r={4} fill={stroke} opacity={0.85} />
    </g>
  )
}

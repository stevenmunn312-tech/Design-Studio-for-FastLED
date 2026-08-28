import type { CSSProperties } from 'react'
import { familyMotion, signalFamily } from '../Canvas/noodleMotion'
import { orthogonalLinkPath } from './hardwareLayout'
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
  /** Every corner of the run, both ends included, from the layout. */
  points: Array<{ x: number; y: number }>
  /** Radius the corners are rounded to. */
  corner: number
  effects: boolean
  label: string
  /**
   * Scales the link's visual weight with the hardware layout. The path itself
   * already lives in layout coordinates; this keeps strokes, plugs, dashes and
   * travelling packets proportional when that layout draws the parts smaller.
   */
  visualScale?: number
}

function scaledDash(dash: string, scale: number): string {
  return dash
    .split(/([ ,]+)/)
    .map((part) => {
      const value = Number(part)
      return Number.isFinite(value) && part.trim() ? String(value * scale) : part
    })
    .join('')
}

/**
 * One run between two parts: halo, bloom, white carrier, animated dashed core
 * and travelling packets, exactly the noodle the graph canvas draws — but along
 * the bench's orthogonal route rather than a bezier.
 *
 * The canvas curves because a node may sit anywhere and a curve is the readable
 * way between two arbitrary points. The bench places its parts in rows, so its
 * runs are cable: down out of a part, along a lane, and down into the next,
 * turning square corners. Every layer here reads the one path string, so the
 * motion, the packets and the glow all follow the route without knowing its
 * shape.
 *
 * Renders a `<g>` into the arrangement's shared overlay, so its geometry comes
 * from the layout rather than from measuring its own box.
 */
export default function HardwareLink({
  dataType, color, emissive, energy = 0, x1, y1, x2, y2, points, corner,
  effects, label, visualScale = 1,
}: HardwareLinkProps) {
  const motion = familyMotion(signalFamily(dataType))
  const scale = Number.isFinite(visualScale) && visualScale > 0 ? visualScale : 1
  const path = orthogonalLinkPath(points, corner)

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
          strokeWidth={2.4 * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.58 + activity * 0.28}
        />
        <circle cx={x1} cy={y1} r={3.2 * scale} fill={stroke} opacity={0.82} />
        <circle cx={x2} cy={y2} r={3.2 * scale} fill={stroke} opacity={0.82} />
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
        strokeWidth={motion.outerWidth * scale}
        strokeLinejoin="round"
        strokeOpacity={motion.outerOpacity + activity * 0.055}
      />
      {/* Mid bloom */}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={motion.midWidth * scale}
        strokeLinejoin="round"
        strokeOpacity={motion.midOpacity + activity * 0.08}
      />
      {/* Neutral carrier keeps a dark run legible, fading back as the live
          colour takes over the motion cue. */}
      <path
        className={styles.carrier}
        d={path}
        fill="none"
        stroke="rgba(255 255 255 / 0.78)"
        strokeWidth={(motion.coreWidth + 2) * scale}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.08 + idleVisibility * 0.12}
      />
      {/* Core — animated dash */}
      <path
        className={styles.core}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={motion.coreWidth * scale}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={scaledDash(motion.dash, scale)}
        strokeOpacity={0.62 + activity * 0.24}
        style={{
          '--edge-flow-duration': `${motion.duration}s`,
          '--edge-flow-distance': `${-72 * scale}`,
        } as CSSProperties}
      />
      {/* Packets animate `offset-distance` forever, so they must carry no CSS
          filter — an infinite animation under a filter leaks GPU buffers in
          Chromium. Same rule as GlowEdge. */}
      {motion.packetRadii.map((radius, packet) => (
        <circle
          key={packet}
          className={styles.packet}
          r={radius * scale}
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
      <circle cx={x1} cy={y1} r={4 * scale} fill={stroke} opacity={0.85} />
      <circle cx={x2} cy={y2} r={4 * scale} fill={stroke} opacity={0.85} />
    </g>
  )
}

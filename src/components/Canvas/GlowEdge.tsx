import { memo, useState } from 'react'
import { getBezierPath, useReactFlow } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import { CATEGORY_COLOR } from '../../state/nodeLibrary'
import { useGraphStore } from '../../state/graphStore'
import { wiredPropertyIsInert } from '../../state/propertyInputs'
import { touchControlWireInert } from '../../state/player/wireFirstControls'
import { usePreviewStore } from '../../state/previewStore'
import { useUiStore } from '../../state/uiStore'
import { familyMotion, signalFamily } from './noodleMotion'
import { edgeDisplayColor } from './edgeDisplayColor'
import styles from './GlowEdge.module.css'
import { ScreenTooltip } from '../ScreenTooltip/ScreenTooltip'

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
  target,
  targetHandleId,
  style,
  data,
}: EdgeProps) {
  const { getNode } = useReactFlow()
  const sourceNode = getNode(source)
  /*
   * A wire into a property the destination is currently ignoring is drawn
   * dark: the connection is real, it is just not doing anything under the
   * node's present settings. Read from the target rather than stored on the
   * edge, so changing a Formula Field's variant re-lights its knobs' wires
   * with nothing to keep in step.
   */
  const targetNode = getNode(target)
  const targetData = targetNode?.data as
    { nodeType?: string; properties?: Record<string, unknown> } | undefined
  /*
   * A wire out of a touch control is judged by the control predicate instead,
   * which asks this same target-side question *and* the one only a control
   * has: a widget that has been wired but never placed on a screen is a
   * control no finger can reach, so the wire is as inert as one landing on a
   * property the node is ignoring. `null` means this is not a control wire —
   * not that it is live — so the ordinary rule still answers for every other
   * property wire. Both read the target each render, so changing a variant or
   * placing the widget re-lights the wire with nothing to keep in step.
   */
  const controlInert = useGraphStore((state) => (
    touchControlWireInert(state, source, sourceHandleId, target, targetHandleId)
  ))
  const inert = controlInert ?? wiredPropertyIsInert(
    targetData?.nodeType ?? '', targetHandleId, targetData?.properties ?? {})
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
  const color = edgeDisplayColor(signal?.emissive, sourceType, style?.stroke, CATEGORY_COLOR[category])
  const edgeData = data as {
    spliceArmed?: boolean
    splicePreview?: boolean
    focusState?: 'active' | 'dim'
    connectionPulse?: number
    /** Set on a root wire a board link carries: its tooltip sentence. */
    boardLink?: string
  } | undefined
  const spliceArmed = edgeData?.spliceArmed === true
  const splicePreview = edgeData?.splicePreview === true
  const focusState = edgeData?.focusState
  const boardLink = typeof edgeData?.boardLink === 'string' && edgeData.boardLink ? edgeData.boardLink : null
  const [linkHover, setLinkHover] = useState<{ x: number; y: number } | null>(null)
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

  // On a link wire the radio mark holds the midpoint, so the readout sits
  // just past it.
  const readoutX = boardLink ? labelX + LINK_MARK_RADIUS + 4 : labelX
  const valueReadout = readout != null && (
    <g className={styles.signalReadout} transform={`translate(${readoutX}, ${labelY})`}>
      <rect x={-1} y={-9} width={readout.length * 6.4 + 10} height={16} rx={4} fill="rgba(10, 12, 16, 0.88)" stroke={color} strokeWidth={1} />
      <text x={4} y={3} fill={color} fontSize={11} fontFamily="monospace">{readout}</text>
    </g>
  )

  /*
   * A link wire: the value crosses boards over ESP-NOW rather than a cable,
   * so it is drawn dashed with a radio mark at its midpoint, and hovering the
   * mark names the boards. Static: nothing here animates, and nothing here
   * carries a CSS filter. See docs/design/board-links.md.
   */
  const linkMark = boardLink && (
    <g
      className={styles.linkMark}
      transform={`translate(${labelX}, ${labelY})`}
      data-board-link={boardLink}
      onMouseEnter={(event) => setLinkHover({ x: event.clientX, y: event.clientY })}
      onMouseMove={(event) => setLinkHover({ x: event.clientX, y: event.clientY })}
      onMouseLeave={() => setLinkHover(null)}
    >
      <circle className={styles.linkMarkDisc} r={LINK_MARK_RADIUS} stroke={color} />
      <circle r={1.6} fill={color} />
      <path d="M -3.2 -2.6 A 4 4 0 0 0 -3.2 2.6 M 3.2 -2.6 A 4 4 0 0 1 3.2 2.6" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      {/* In screen space, above the nodes drawn after every edge. */}
      {linkHover && <ScreenTooltip tip={boardLink} x={linkHover.x} y={linkHover.y} />}
    </g>
  )

  if (!uiEffectsEnabled) {
    return (
      <g className={`${focusState === 'dim' ? styles.focusDim : focusState === 'active' ? styles.focusActive : ''} ${inert ? styles.inert : ''}`}>
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
          strokeDasharray={boardLink ? LINK_DASH : undefined}
          strokeOpacity={0.58 + activity * 0.28}
        />
        <circle cx={targetX} cy={targetY} r={3.2} fill={color} opacity={0.82} />
        {linkMark}
        {valueReadout}
      </g>
    )
  }

  return (
    <g className={`${familyClass} ${focusState === 'dim' ? styles.focusDim : focusState === 'active' ? styles.focusActive : ''} ${inert ? styles.inert : ''}`}>
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
      {/* A link wire has no carrier: the gaps in its dash are the point. */}
      {!boardLink && (
        <path
          className={styles.carrier}
          d={edgePath}
          fill="none"
          stroke="rgba(255 255 255 / 0.78)"
          strokeWidth={motion.coreWidth + 2}
          strokeLinecap="round"
          strokeOpacity={0.08 + idleVisibility * 0.12}
        />
      )}
      {/* Core — animated dash. A link wire's longer dash marches the same
          way; its period divides the flow's 72-unit loop, so it never jumps. */}
      <path
        id={id}
        className={`${styles.core} ${splicePreview ? styles.coreReady : ''}`}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={motion.coreWidth}
        strokeLinecap={boardLink ? 'butt' : 'round'}
        strokeDasharray={boardLink ? LINK_DASH : motion.dash}
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
      {/* A link wire carries no packets: it is radio, not a cable, and the
          marching dash already shows which way the value goes. */}
      {motion.packetRadii.slice(0, boardLink ? 0 : packetCap).map((radius, packet) => (
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
      {linkMark}
      {valueReadout}
    </g>
  )
}

// Matches the 48-flow-unit radius used by the geometric fallback in the
// canvas (SVG stroke width extends equally on both sides of the noodle).
const SPLICE_HIT_WIDTH = 96

/** A link wire's dash; its 12-unit period divides `flow`'s 72-unit loop. */
const LINK_DASH = '8 4'
const LINK_MARK_RADIUS = 7

export default memo(GlowEdge)

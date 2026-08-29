import styles from './BuildDiagramWorkspace.module.css'
import { COMMON_NET_CALLOUT_HEIGHT } from './physicalDiagramLayout'

/**
 * Shared-rail net stubs.
 *
 * GND / +5V / 3V3 are single nets that reach nearly every device. Drawing each
 * one as a physical polyline back to its source forced every run through the
 * same narrow corridor between the controller and the level shifter, which is
 * what made a busy build unreadable. Schematics solve this with a local net
 * symbol at each terminal plus a stated rule that all like symbols are bonded;
 * that rule lives in the diagram's common-net callout.
 */

export type NetStubDirection = 'up' | 'down' | 'left' | 'right'
export type NetStubKind = 'gnd' | 'v5' | 'v3v3'

/** Clockwise rotation that turns the canonical downward symbol toward `direction`. */
const ROTATION: Record<NetStubDirection, number> = { down: 0, left: 90, up: 180, right: 270 }

export const DEFAULT_STUB_LEAD = 9

const NET_LABEL: Record<NetStubKind, string> = { gnd: 'GND', v5: '+5V', v3v3: '3V3' }

const NET_LEAD_CLASS: Record<NetStubKind, string> = {
  gnd: styles.groundStubLead,
  v5: styles.railStubLead5v,
  v3v3: styles.railStubLead3v3,
}

const NET_SYMBOL_CLASS: Record<NetStubKind, string> = {
  gnd: styles.groundStubSymbol,
  v5: styles.railStubSymbol5v,
  v3v3: styles.railStubSymbol3v3,
}

/** How far the symbol itself extends past the end of the lead. */
function symbolDepth(kind: NetStubKind) {
  return kind === 'gnd' ? 8 : 0
}

function labelPlacement(direction: NetStubDirection, end: number) {
  if (direction === 'down') return { x: 0, y: end + 13, anchor: 'middle' as const }
  if (direction === 'up') return { x: 0, y: -(end + 7), anchor: 'middle' as const }
  if (direction === 'left') return { x: -(end + 6), y: 3, anchor: 'end' as const }
  return { x: end + 6, y: 3, anchor: 'start' as const }
}

export interface NetStubProps {
  x: number
  y: number
  kind: NetStubKind
  /** Which way the stub points away from the terminal. */
  direction?: NetStubDirection
  /** Lengthen the lead to clear a component body or label before the symbol starts. */
  lead?: number
  /** Preserved so each rail connection keeps the identity it had as a full wire. */
  wireId: string
  wireRole?: string
  label?: string
}

export function NetStub({
  x,
  y,
  kind,
  direction = 'down',
  lead = DEFAULT_STUB_LEAD,
  wireId,
  wireRole,
  label,
}: NetStubProps) {
  const depth = symbolDepth(kind)
  const place = labelPlacement(direction, lead + depth)
  return (
    <g
      data-net-stub={kind}
      data-net-stub-direction={direction}
      data-net-stub-for={wireId}
      data-net-stub-x={x}
      data-net-stub-y={y}
    >
      <g transform={`translate(${x} ${y}) rotate(${ROTATION[direction]})`}>
        <path data-wire={wireId} data-wire-role={wireRole} d={`M0 0V${lead}`} className={NET_LEAD_CLASS[kind]} />
        {kind === 'gnd' ? (
          <g className={NET_SYMBOL_CLASS[kind]}>
            <line x1={-8} y1={lead} x2={8} y2={lead} />
            <line x1={-5} y1={lead + 4} x2={5} y2={lead + 4} />
            <line x1={-2} y1={lead + 8} x2={2} y2={lead + 8} />
          </g>
        ) : (
          <line x1={-8} y1={lead} x2={8} y2={lead} className={NET_SYMBOL_CLASS[kind]} />
        )}
      </g>
      <text x={x + place.x} y={y + place.y} textAnchor={place.anchor} className={styles.netStubLabel}>
        {label ?? NET_LABEL[kind]}
      </text>
    </g>
  )
}

/**
 * States the bonding rule the stubs rely on. Without this the diagram would
 * imply the grounds are independent, which is the one misreading that damages
 * hardware.
 */
export function CommonNetCallout({ x, y, width, powerBelow = true }: { x: number; y: number; width: number; powerBelow?: boolean }) {
  return (
    <g data-common-net-callout="true" transform={`translate(${x} ${y})`}>
      <rect width={width} height={COMMON_NET_CALLOUT_HEIGHT} rx="8" fill="#fffdf4" stroke="#c9bb86" strokeWidth="2" />
      <text x="16" y="22" className={styles.physicalLegendTitle}>SHARED NETS — SYMBOLS REPLACE DRAWN WIRES</text>
      <text className={styles.physicalLegendMeta}>
        <tspan x="16" y="42">Every GND symbol is one common net: bond controller, level shifter, peripheral and all PSU</tspan>
        <tspan x="16" y="58">zone grounds together. +5V feeds low-current modules from the controller 5V rail; LED loads</tspan>
        <tspan x="16" y="74">use the fused bus {powerBelow ? 'below' : 'on the power sheet'}. 3V3 draws from the controller regulator.</tspan>
      </text>
    </g>
  )
}

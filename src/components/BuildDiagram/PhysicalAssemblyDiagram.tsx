import type { ElectricalPlanSummary, OutputElectricalPlan } from '../../build/electricalPlan'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import { fuseBlockAllocations, type FuseBlockCircuitCount } from '../../build/powerDistribution'
import devKitCBoardRender from '../../assets/boards/esp32-s3-devkitc-1.png'
import microphoneRender from '../../assets/components/inmp441-breakout.png'
import levelShifterRender from '../../assets/components/sn74ahct125n-dip14.png'
import buttonModuleRender from '../../assets/components/button-module.png'
import potentiometerModuleRender from '../../assets/components/potentiometer-module.png'
import encoderModuleRender from '../../assets/components/encoder-module.png'
import psuRender from '../../assets/components/5v-psu.png'
import capacitorRender from '../../assets/components/panasonic-eeufr0j102b-1000uf.png'
import resistorRender from '../../assets/components/330ohm-blue-axial-resistor.png'
import fuseBlock2Render from '../../assets/components/fuse-block-2-circuit.png'
import fuseBlock4Render from '../../assets/components/fuse-block-4-circuit.png'
import fuseBlock6Render from '../../assets/components/fuse-block-6-circuit.png'
import fuseBlock8Render from '../../assets/components/fuse-block-8-circuit.png'
import fuseBlock10Render from '../../assets/components/fuse-block-10-circuit.png'
import fuseBlock12Render from '../../assets/components/fuse-block-12-circuit.png'
import styles from './BuildDiagramWorkspace.module.css'
import { CommonNetCallout, NetStub } from './netStubs'
import type { BuildSectionLayers } from './diagramSections'
import {
  itemLayouts,
  LEVEL_SHIFTER_HEIGHT,
  LEVEL_SHIFTER_WIDTH,
  LEVEL_SHIFTER_X,
  levelShifterChipY,
  levelShifterSupplyPoint,
  levelShifterTerminalPoint,
  COMMON_NET_CALLOUT_GAP,
  diagramContentBottom,
  feedCombLaneY,
  feedIndexForFuseSlot,
  fuseBlockPoints,
  FUSE_BLOCK_CELL_HEIGHT,
  FUSE_BLOCK_CELL_WIDTH,
  FUSE_BLOCK_START_X,
  fuseColumnSplit,
  fuseSlotForFeed,
  groundCombLaneY,
  peripheralPadCount,
  peripheralPadLabel,
  peripheralPadPoint,
  PERIPHERAL_LANE_BASE,
  PERIPHERAL_LANE_SPACING,
  PERIPHERAL_RENDER_H,
  PERIPHERAL_RENDER_W,
  PERIPHERAL_STUB_LEAD,
  physicalAssemblyDiagramHeight,
  powerDistributionSectionLayout,
  POWER_BRANCH_ROW_SPACING,
  POWER_FEED_PAIR_GAP,
  powerSectionStartY,
  powerZoneBands,
  type ItemLayout,
  type PowerZoneBand,
  type LevelShifterTerminalPoint,
} from './physicalDiagramLayout'

export interface PhysicalDiagramConnection {
  id: string
  itemId: string
  pinLabel: string
  useLabel: string
  boardAnchorId?: string
}

interface PhysicalAssemblyDiagramProps {
  boardProfile: PhysicalBoardProfile
  items: HardwareManifestItem[]
  connections: PhysicalDiagramConnection[]
  plan: ElectricalPlanSummary
  selectedItemId: string
  onSelectItem: (itemId: string) => void
  exportScope?: 'current-view' | 'complete-build'
  /** Which subsystem layers this sheet draws. Defaults to the complete build. */
  layers?: BuildSectionLayers
  /**
   * Window onto the full sheet, in diagram units. Printing puts one PSU zone on
   * a page by cropping to that zone's band rather than by re-laying the sheet
   * out, so a printed zone keeps the coordinates the on-screen sheet gave it.
   */
  crop?: { y: number; height: number }
}

const ALL_LAYERS: BuildSectionLayers = { signalWires: true, levelShifter: true, powerDistribution: true }

const CANVAS_WIDTH = 1120

const FUSE_BLOCK_RENDERS: Record<FuseBlockCircuitCount, string> = {
  2: fuseBlock2Render,
  4: fuseBlock4Render,
  6: fuseBlock6Render,
  8: fuseBlock8Render,
  10: fuseBlock10Render,
  12: fuseBlock12Render,
}

const DEVKITC_RENDER = {
  x: 74,
  y: 104,
  width: 184,
  height: 426,
  sourceWidth: 398,
  sourceHeight: 922,
  leftPinX: 48,
  rightPinX: 351,
  firstPinY: 76.5,
  lastPinY: 795.5,
} as const

type ControllerTerminalPoint = {
  x: number
  y: number
  side: 'left' | 'right'
}

function shortBoardLabel(label: string) {
  if (label.includes('XIAO')) return 'XIAO ESP32S3'
  if (label.includes('DevKitC')) return 'ESP32-S3 DevKitC-1'
  if (label.includes('ESP-32D')) return 'ESP32 DevKit v1'
  return 'ESP32-S3 N16R8'
}

function formatAmps(valueMa: number) {
  return `${Number((valueMa / 1000).toFixed(valueMa % 1000 === 0 ? 0 : 1))}A`
}

function connectionPinLabel(connection: PhysicalDiagramConnection) {
  return connection.pinLabel.replace('GPIO', 'IO')
}

function controllerConnectionY(index: number, count: number) {
  if (count <= 1) return 350
  return 252 + ((194 * index) / (count - 1))
}

function devKitTerminalPoint(anchorId: string | undefined): ControllerTerminalPoint | undefined {
  const match = /^(j1|j3)-(\d+)$/.exec(anchorId ?? '')
  if (!match) return undefined
  const pinIndex = Number(match[2]) - 1
  if (pinIndex < 0 || pinIndex >= 22) return undefined
  const side = match[1] === 'j1' ? 'left' : 'right'
  const sourceX = side === 'left' ? DEVKITC_RENDER.leftPinX : DEVKITC_RENDER.rightPinX
  const sourceY = DEVKITC_RENDER.firstPinY
    + (pinIndex * ((DEVKITC_RENDER.lastPinY - DEVKITC_RENDER.firstPinY) / 21))
  return {
    x: DEVKITC_RENDER.x + ((sourceX / DEVKITC_RENDER.sourceWidth) * DEVKITC_RENDER.width),
    y: DEVKITC_RENDER.y + ((sourceY / DEVKITC_RENDER.sourceHeight) * DEVKITC_RENDER.height),
    side,
  }
}

function controllerConnectionPoint(
  connection: PhysicalDiagramConnection,
  index: number,
  count: number,
  boardProfile: PhysicalBoardProfile,
): ControllerTerminalPoint {
  if (boardProfile.id === 'espressif-esp32-s3-devkitc-1') {
    const point = devKitTerminalPoint(connection.boardAnchorId)
    if (point) return point
  }
  return { x: 280, y: controllerConnectionY(index, count), side: 'right' }
}

function controllerPowerPoint(
  kind: '3v3' | 'ground' | 'usb',
  boardProfile: PhysicalBoardProfile,
): ControllerTerminalPoint {
  if (boardProfile.id === 'espressif-esp32-s3-devkitc-1') {
    if (kind === '3v3') return devKitTerminalPoint('j1-1')!
    if (kind === 'ground') return devKitTerminalPoint('j3-22')!
    return {
      x: DEVKITC_RENDER.x + ((270 / DEVKITC_RENDER.sourceWidth) * DEVKITC_RENDER.width),
      y: DEVKITC_RENDER.y + ((875 / DEVKITC_RENDER.sourceHeight) * DEVKITC_RENDER.height),
      side: 'right',
    }
  }
  if (kind === '3v3') return { x: 280, y: 220, side: 'right' }
  if (kind === 'ground') return { x: 280, y: 476, side: 'right' }
  return { x: 166, y: 512, side: 'right' }
}

/**
 * Two descent bands share the gap between the controller and the resistors, and
 * they must not overlap.
 *
 * Bus wires (mic, output data) all terminate above y~520, so they can hug the
 * board in 266..290 where the USB-C block is no obstacle. Control wires run all
 * the way down to the module lanes, so they need 296..328 — clear of that block
 * (ends x=291) and of the series resistors (start x=350).
 */
const BUS_LANE_X = 266
const BUS_LANE_SPACING = 6
const BUS_LANE_COUNT = 5
const CONTROL_CORRIDOR_X = 296
const CONTROL_CORRIDOR_SPACING = 8
const CONTROL_CORRIDOR_COUNT = 5

function routeFromController(
  point: ControllerTerminalPoint,
  targetX: number,
  targetY: number,
  laneIndex: number,
) {
  const rightLane = BUS_LANE_X + ((laneIndex % BUS_LANE_COUNT) * BUS_LANE_SPACING)
  if (point.side === 'right') return `M${point.x} ${point.y}H${rightLane}V${targetY}H${targetX}`
  const laneSlot = laneIndex % 6
  const leftLane = 58 - (laneSlot * 6)
  const detourY = 542 + (laneSlot * 7)
  return `M${point.x} ${point.y}H${leftLane}V${detourY}H${rightLane}V${targetY}H${targetX}`
}

/**
 * Level-shifter corridors, one per output.
 *
 * These used to be shared constants — every right-side Y pin dropped down the
 * same x=650 vertical and every right-side A pin came in via x=410 — so wires
 * for different outputs were drawn on top of each other rather than merely
 * close. Each output now owns its own corridor and detour lane.
 */
const LS_CORRIDOR_SPACING = 12

/** Between the series resistors (end x=390) and the chip body (starts x=453). */
function levelShifterEntryX(outputIndex: number) {
  return 402 + ((outputIndex % 4) * LS_CORRIDOR_SPACING)
}

/** Between the chip body (ends x=587) and the output corridors. */
function levelShifterWrapX(outputIndex: number) {
  return 591 + ((outputIndex % 4) * 9)
}

/** Between the chip and the LED panels (start x=820). */
function levelShifterOutputX(outputIndex: number) {
  return 626 + (outputIndex * 13)
}

/** Lane below each chip, used by whichever side has to wrap around it. */
function levelShifterDetourY(outputIndex: number) {
  return levelShifterChipY(outputIndex) + LEVEL_SHIFTER_HEIGHT + 18 + ((outputIndex % 4) * 13)
}

function routeToLevelShifterInput(outputIndex: number, point: LevelShifterTerminalPoint) {
  if (point.side === 'left') return `M390 ${point.y}H${point.x}`
  return `M390 ${point.y}H${levelShifterEntryX(outputIndex)}V${levelShifterDetourY(outputIndex)}H${levelShifterWrapX(outputIndex)}V${point.y}H${point.x}`
}

function routeFromLevelShifterOutput(
  outputIndex: number,
  point: LevelShifterTerminalPoint,
  targetX: number,
  targetY: number,
) {
  const corridorX = levelShifterOutputX(outputIndex)
  if (point.side === 'right') return `M${point.x} ${point.y}H${corridorX}V${targetY}H${targetX}`
  return `M${point.x} ${point.y}H${levelShifterEntryX(outputIndex)}V${levelShifterDetourY(outputIndex)}H${corridorX}V${targetY}H${targetX}`
}

const CONTROL_WIRE_CLASSES = [styles.controlWireA, styles.controlWireB, styles.controlWireC]

function controlWireClass(moduleIndex: number) {
  return CONTROL_WIRE_CLASSES[moduleIndex % CONTROL_WIRE_CLASSES.length]
}

/**
 * Control signals leave the controller, drop to their own lane below the module
 * row, run across, and climb into their pad.
 *
 * Lanes are ordered by pad x, which makes the routing planar: a wire only ever
 * climbs at a point that deeper lanes have not yet reached, so no climb crosses
 * another lane's horizontal run.
 */
function assignControlLanes(
  peripheralLayouts: ItemLayout[],
  connections: PhysicalDiagramConnection[],
) {
  const lanes = new Map<string, { index: number; y: number }>()
  const rows = new Map<number, Array<{ id: string; padX: number; rowTop: number }>>()
  peripheralLayouts.forEach((layout) => {
    const own = connections.filter((connection) => connection.itemId === layout.item.id)
    own.forEach((connection, index) => {
      const entry = rows.get(layout.y) ?? []
      entry.push({ id: connection.id, padX: peripheralPadPoint(layout, index + 1).x, rowTop: layout.y })
      rows.set(layout.y, entry)
    })
  })
  rows.forEach((entries) => {
    entries
      .slice()
      .sort((a, b) => a.padX - b.padX)
      .forEach((entry, index) => {
        lanes.set(entry.id, {
          index,
          y: entry.rowTop + PERIPHERAL_RENDER_H + PERIPHERAL_LANE_BASE + (index * PERIPHERAL_LANE_SPACING),
        })
      })
  })
  return lanes
}

function routeToControlPad(
  point: ControllerTerminalPoint,
  pad: { x: number; y: number },
  laneY: number,
  laneIndex: number,
) {
  // Left-side pins exit past the board edge before dropping; the USB-C block
  // and the board render both sit between the header and the lanes.
  const corridorX = point.side === 'right'
    ? CONTROL_CORRIDOR_X + ((laneIndex % CONTROL_CORRIDOR_COUNT) * CONTROL_CORRIDOR_SPACING)
    : 56 - ((laneIndex % 5) * 7)
  return `M${point.x} ${point.y}H${corridorX}V${laneY}H${pad.x}V${pad.y}`
}

type MicrophoneSignalRole = 'bclk' | 'ws' | 'dout'

type MicrophoneTerminalRole = MicrophoneSignalRole | 'channel' | 'vdd' | 'gnd'

const MICROPHONE_TERMINALS: Record<MicrophoneTerminalRole, { x: number; y: number }> = {
  bclk: { x: 23, y: 22 },
  ws: { x: 23, y: 45 },
  channel: { x: 23, y: 68 },
  dout: { x: 23, y: 90 },
  vdd: { x: 23, y: 113 },
  gnd: { x: 23, y: 136 },
}

function microphoneTerminalPoint(layout: ItemLayout, role: MicrophoneTerminalRole) {
  const terminal = MICROPHONE_TERMINALS[role]
  return { x: layout.x + terminal.x, y: layout.y + terminal.y }
}

function microphoneSignalPresentation(connection: PhysicalDiagramConnection): {
  label: string
  role: MicrophoneSignalRole
  terminalClassName: string
  wireClassName: string
} | null {
  if (connection.id.endsWith(':i2sSck')) {
    return { label: 'BCLK', role: 'bclk', terminalClassName: styles.microphoneBclkTerminal, wireClassName: styles.microphoneBclkWire }
  }
  if (connection.id.endsWith(':i2sWs')) {
    return { label: 'WS', role: 'ws', terminalClassName: styles.microphoneWsTerminal, wireClassName: styles.microphoneWsWire }
  }
  if (connection.id.endsWith(':i2sSd')) {
    return { label: 'DOUT', role: 'dout', terminalClassName: styles.microphoneDoutTerminal, wireClassName: styles.microphoneDoutWire }
  }
  return null
}

function LedPixels({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  const columns = 4
  const rows = 4
  const gapX = width / columns
  const gapY = height / rows
  return (
    <g data-led-preview="4x4">
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        return (
          <g key={index} transform={`translate(${x + (column * gapX) + 3} ${y + (row * gapY) + 3})`}>
            <rect width={Math.max(8, gapX - 7)} height={Math.max(8, gapY - 7)} rx="2" fill="#e9e9e3" stroke="#686d70" strokeWidth="1" />
            <circle cx={Math.max(8, gapX - 7) / 2} cy={Math.max(8, gapY - 7) / 2} r="2.5" fill={index % 4 === 0 ? '#70cf63' : index % 4 === 1 ? '#49b9d1' : '#f0b94a'} />
          </g>
        )
      })}
    </g>
  )
}

function ControllerGraphic({ boardProfile, connections, selected }: { boardProfile: PhysicalBoardProfile; connections: PhysicalDiagramConnection[]; selected: boolean }) {
  if (boardProfile.id === 'espressif-esp32-s3-devkitc-1') {
    const power3v3 = controllerPowerPoint('3v3', boardProfile)
    const ground = controllerPowerPoint('ground', boardProfile)
    const usb = controllerPowerPoint('usb', boardProfile)
    return (
      <g className={selected ? styles.physicalSelected : undefined} data-controller-render="esp32-s3-devkitc-1">
        <image
          href={devKitCBoardRender}
          x={DEVKITC_RENDER.x}
          y={DEVKITC_RENDER.y}
          width={DEVKITC_RENDER.width}
          height={DEVKITC_RENDER.height}
          preserveAspectRatio="xMidYMid meet"
          className={styles.physicalBoardRender}
        />
        <text x={DEVKITC_RENDER.x + (DEVKITC_RENDER.width / 2)} y="554" textAnchor="middle" className={styles.physicalComponentLabel}>{shortBoardLabel(boardProfile.label)}</text>
        <g data-terminal="controller-3v3">
          <circle cx={power3v3.x} cy={power3v3.y} r="6" className={styles.controllerPowerTerminal} />
          <title>3V3</title>
        </g>
        {connections.map((connection, index) => {
          const point = controllerConnectionPoint(connection, index, connections.length, boardProfile)
          return (
            <g key={connection.id} data-terminal={`controller-${connection.id}`} data-board-anchor={connection.boardAnchorId}>
              <circle
                cx={point.x}
                cy={point.y}
                r="6"
                className={microphoneSignalPresentation(connection)?.terminalClassName ?? styles.controllerSignalTerminal}
              />
              <title>{connection.pinLabel} · {connection.useLabel}</title>
            </g>
          )
        })}
        <g data-terminal="controller-gnd">
          <circle cx={ground.x} cy={ground.y} r="6" className={styles.controllerGroundTerminal} />
          <title>GND</title>
        </g>
        <g data-terminal="controller-usb">
          <circle cx={usb.x} cy={usb.y} r="6" className={styles.controllerUsbTerminal} />
          <title>USB-C power</title>
        </g>
      </g>
    )
  }

  const boardLabel = boardProfile.label
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <rect x="54" y="188" width="226" height="324" rx="16" fill="#202528" stroke={selected ? '#1fa5ad' : '#121517'} strokeWidth={selected ? 4 : 2} />
      <rect x="83" y="211" width="166" height="105" rx="7" fill="#d6d8d2" stroke="#6c7274" strokeWidth="2" />
      <path d="M99 228h134v67H99z" fill="#ecece7" stroke="#adb0aa" />
      <path d="M104 235h124v11H104zm0 18h124v8H104zm0 15h124v8H104z" fill="#c7cac4" opacity=".8" />
      <text x="166" y="281" textAnchor="middle" className={styles.physicalBoardSilk}>ESPRESSIF</text>
      <text x="166" y="296" textAnchor="middle" className={styles.physicalBoardSubSilk}>{boardProfile.moduleSilk ?? boardProfile.model}</text>
      <rect x="88" y="337" width="156" height="104" rx="6" fill="#171b1d" stroke="#484e51" />
      <rect x="105" y="352" width="48" height="45" rx="3" fill="#2f3437" />
      <rect x="164" y="352" width="52" height="22" rx="3" fill="#34393c" />
      <circle cx="170" cy="410" r="6" fill="#828789" />
      <circle cx="202" cy="410" r="6" fill="#828789" />
      <rect x="129" y="459" width="76" height="42" rx="8" fill="#c9d0d1" stroke="#72797b" strokeWidth="2" />
      <rect x="141" y="470" width="52" height="16" rx="4" fill="#727a7d" />
      <text x="166" y="538" textAnchor="middle" className={styles.physicalComponentLabel}>{shortBoardLabel(boardLabel)}</text>

      <g data-terminal="controller-3v3">
        <circle cx="280" cy="220" r="5" fill="#d9a638" stroke="#f5d16e" />
        <text x="268" y="224" textAnchor="end" className={styles.physicalPinLabel}>3V3</text>
      </g>
      {connections.map((connection, index) => (
        <g key={connection.id} data-terminal={`controller-${connection.id}`}>
          <circle
            cx="280"
            cy={controllerConnectionY(index, connections.length)}
            r="5"
            fill="#d9a638"
            stroke="#f5d16e"
            className={microphoneSignalPresentation(connection)?.terminalClassName}
          />
          <text x="268" y={controllerConnectionY(index, connections.length) + 4} textAnchor="end" className={styles.physicalPinLabel}>{connectionPinLabel(connection)}</text>
        </g>
      ))}
      <g data-terminal="controller-gnd">
        <circle cx="280" cy="476" r="5" fill="#1c2022" stroke="#f5d16e" />
        <text x="268" y="480" textAnchor="end" className={styles.physicalPinLabel}>GND</text>
      </g>
      <g data-terminal="controller-usb">
        <circle cx="166" cy="512" r="5" fill="#55bdc7" stroke="#d9f5f7" />
        <text x="166" y="503" textAnchor="middle" className={styles.physicalBoardSubSilk}>USB-C POWER</text>
      </g>
    </g>
  )
}

function MicrophoneGraphic({ layout, connections, selected }: { layout: ItemLayout; connections: PhysicalDiagramConnection[]; selected: boolean }) {
  const { x, y, item } = layout
  const terminal = (role: MicrophoneTerminalRole, className: string, label: string) => {
    const point = microphoneTerminalPoint(layout, role)
    return <g data-terminal={`${item.id}-${role}`} data-microphone-role={role}>
      <circle cx={point.x} cy={point.y} r="5" className={className} />
      <title>{label}</title>
    </g>
  }
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <text x={x + 102} y={y - 16} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
      <image
        data-component-render="inmp441-breakout"
        href={microphoneRender}
        x={x}
        y={y}
        width={layout.width}
        height={layout.height}
        preserveAspectRatio="xMidYMid meet"
        className={styles.physicalBoardRender}
      />
      {terminal('vdd', styles.microphoneVddTerminal, 'VDD · 3V3')}
      {connections.map((connection) => {
        const presentation = microphoneSignalPresentation(connection)
        if (!presentation) return null
        const point = microphoneTerminalPoint(layout, presentation.role)
        return <g key={connection.id} data-terminal={`${item.id}-${connection.id}`} data-microphone-role={presentation.role}>
          <circle cx={point.x} cy={point.y} r="5" className={presentation.terminalClassName} />
          <title>{presentation.label} · {connection.pinLabel}</title>
        </g>
      })}
      {terminal('channel', styles.microphoneGroundTerminal, 'L/R · GND for left channel')}
      {terminal('gnd', styles.microphoneGroundTerminal, 'GND')}
    </g>
  )
}

const PERIPHERAL_RENDERS: Partial<Record<HardwareManifestItem['kind'], { href: string; id: string }>> = {
  'button-input': { href: buttonModuleRender, id: 'button-module' },
  'pot-input': { href: potentiometerModuleRender, id: 'potentiometer-module' },
  'encoder-input': { href: encoderModuleRender, id: 'encoder-module' },
}

function InputGraphic({ layout, connections, selected }: { layout: ItemLayout; connections: PhysicalDiagramConnection[]; selected: boolean }) {
  const { x, y, item } = layout
  const render = PERIPHERAL_RENDERS[item.kind]
  const padLabel = (index: number) => peripheralPadLabel(item.kind, index)
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <text x={x + (PERIPHERAL_RENDER_W / 2)} y={y - 12} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
      {render && (
        <image
          data-component-render={render.id}
          href={render.href}
          x={x}
          y={y}
          width={PERIPHERAL_RENDER_W}
          height={PERIPHERAL_RENDER_H}
          preserveAspectRatio="xMidYMid meet"
          className={styles.physicalBoardRender}
        />
      )}
      {/* Pad 0 is VCC and the last pad is GND on every module; the signals sit
          between them in the order the connection list already uses. */}
      <g data-terminal={`${item.id}-3v3`}>
        <circle cx={peripheralPadPoint(layout, 0).x} cy={peripheralPadPoint(layout, 0).y} r="5" className={styles.peripheralPowerTerminal} />
        <title>VCC · 3V3</title>
      </g>
      {connections.map((connection, index) => {
        const point = peripheralPadPoint(layout, index + 1)
        return (
          <g key={connection.id} data-terminal={`${item.id}-${connection.id}`}>
            <circle cx={point.x} cy={point.y} r="5" className={styles.peripheralSignalTerminal} />
            <title>{padLabel(index + 1)} · {connectionPinLabel(connection)}</title>
          </g>
        )
      })}
      <g data-terminal={`${item.id}-gnd`}>
        <circle
          cx={peripheralPadPoint(layout, peripheralPadCount(item.kind) - 1).x}
          cy={peripheralPadPoint(layout, peripheralPadCount(item.kind) - 1).y}
          r="5"
          className={styles.peripheralGroundTerminal}
        />
        <title>GND</title>
      </g>
    </g>
  )
}

function OutputGraphic({ layout, selected, plan, powerPlanBelow }: { layout: ItemLayout; selected: boolean; plan?: OutputElectricalPlan; powerPlanBelow: boolean }) {
  const { x, y, width, item } = layout
  return (
    <g data-output-card={item.id} className={selected ? styles.physicalSelected : undefined}>
      <text x={x + (width / 2)} y={y - 32} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
      <text x={x + (width / 2)} y={y - 14} textAnchor="middle" className={styles.physicalMetaLabel}>{item.subtitle}</text>
      <rect x={x} y={y} width={width} height="174" rx="8" fill="#202426" stroke={selected ? '#1fa5ad' : '#0f1213'} strokeWidth={selected ? 4 : 2} />
      <rect x={x + 18} y={y + 12} width={width - 30} height="140" fill="#15191a" stroke="#515759" />
      <LedPixels x={x + ((width - 128) / 2)} y={y + 18} width={128} height={128} />
      {[['DIN', 66]].map(([label, offset]) => (
        <g key={label} data-terminal={`${item.id}-${String(label).toLowerCase()}`}>
          <circle cx={x} cy={y + Number(offset)} r="6" fill="#3dab5b" stroke="#d9a14a" strokeWidth="2" />
          <text x={x + 14} y={y + Number(offset) + 4} className={styles.physicalPinLabel}>{label}</text>
        </g>
      ))}
      {plan?.operatingCurrentCapMa != null && (
        <text data-operating-current-cap={plan.operatingCurrentCapMa} x={x + (width / 2)} y={y + 158} textAnchor="middle" className={styles.physicalCurrentCapLabel}>CURRENT LIMIT {formatAmps(plan.operatingCurrentCapMa)}</text>
      )}
      {/* Only points down the sheet when the PSU zones are actually on it. */}
      {plan && <text x={x + (width / 2)} y={y + (plan.operatingCurrentCapMa != null ? 170 : 167)} textAnchor="middle" className={styles.physicalBoardSubSilk}>{plan.recommendedFeedCount} FUSED FEEDS · {powerPlanBelow ? 'PSU PLAN BELOW' : 'SEE POWER SECTION'}</text>}
    </g>
  )
}

/**
 * Feed-lane harness for one PSU zone.
 *
 * Every branch runs down and to the right into its own vertical lane, and the
 * lanes are ordered right to left as the destination row gets deeper. A lane
 * drop therefore always happens to the left of every shallower row's run, so
 * the fan-out never crosses itself. Each pair keeps its ground immediately
 * left of its positive for the same reason: the ground lands 32px lower, so it
 * has to pass the positive row on the outside.
 */
const LANE_BAND_RIGHT = 742
const LANE_BAND_LEFT = FUSE_BLOCK_START_X + FUSE_BLOCK_CELL_WIDTH + 28
const LANE_MAX_PITCH = 24
const LANE_MIN_PITCH = 7
/** Rails the left-column feeds drop down, outside the block and inside the PSU. */
const LEFT_RAIL_X = FUSE_BLOCK_START_X - 16
const LEFT_RAIL_STEP = 10
const LEFT_RAIL_MIN_X = 230
/**
 * PSU trunk risers, kept left of every branch rail. The ground riser is the
 * outer one so the two trunks never cross each other on their way in.
 */
const PSU_POSITIVE_TRUNK_X = 212
const PSU_GROUND_TRUNK_X = 196

/**
 * Panasonic EEUFR0J102B render, cropped to its own alpha bounds. The part is
 * drawn from the side with both leads out the left, positive above the striped
 * negative, so the leads sit straight on the two feed wires.
 */
const CAPACITOR_ASPECT = 1382 / 504
const CAPACITOR_POSITIVE_LEAD_RATIO = 142 / 504
const CAPACITOR_NEGATIVE_LEAD_RATIO = 361 / 504
const CAPACITOR_HEIGHT = Math.round(POWER_FEED_PAIR_GAP / (CAPACITOR_NEGATIVE_LEAD_RATIO - CAPACITOR_POSITIVE_LEAD_RATIO))
const CAPACITOR_WIDTH = Math.round(CAPACITOR_HEIGHT * CAPACITOR_ASPECT)
/**
 * The feed run ends on the LED panel terminals and the capacitor's own leads
 * pick up from there, so the part reads as bridging the pair at the injection
 * point rather than sitting in series with it.
 */
const FEED_RUN_END = 900
const LED_TERMINAL_X = FEED_RUN_END - 16
const CAPACITOR_X = FEED_RUN_END - 2
const FEED_LABEL_X = 748

function laneGeometry(feedCount: number) {
  const pitch = Math.round(Math.min(
    LANE_MAX_PITCH,
    Math.max(LANE_MIN_PITCH, (LANE_BAND_RIGHT - LANE_BAND_LEFT) / Math.max(1, feedCount)),
  ))
  const pairGap = Math.max(3, Math.min(7, Math.round(pitch * 0.45)))
  return {
    positive: (index: number) => LANE_BAND_RIGHT - (index * pitch),
    ground: (index: number) => LANE_BAND_RIGHT - (index * pitch) - pairGap,
  }
}

function leftRailGeometry(leftColumnFeedCount: number) {
  const step = leftColumnFeedCount > 1
    ? Math.min(LEFT_RAIL_STEP, (LEFT_RAIL_X - LEFT_RAIL_MIN_X) / (leftColumnFeedCount - 1))
    : LEFT_RAIL_STEP
  return (rank: number) => Math.round(LEFT_RAIL_X - (rank * step))
}

function PowerDistributionSections({ plan, bands }: { plan: ElectricalPlanSummary; bands: PowerZoneBand[] }) {
  const injections = plan.outputs.flatMap((output) => output.injections)
  const sections = (plan.totals?.supplies ?? []).map((supply, index) => {
    const assigned = injections.filter((injection) => injection.supplyId === supply.id)
    const sectionLayout = powerDistributionSectionLayout(assigned.length)
    return {
      supply,
      assigned,
      sectionY: bands[index]?.y ?? 0,
      sectionHeight: sectionLayout.sectionHeight,
      sectionLayout,
    }
  })
  return <g>
    {sections.map(({ supply, assigned, sectionY, sectionHeight, sectionLayout }, supplyIndex) => {
      const blocks = fuseBlockAllocations(assigned.length).map((allocation, blockIndex) => ({
        ...allocation,
        blockIndex,
        x: FUSE_BLOCK_START_X,
        y: sectionLayout.blockTops[blockIndex] ?? sectionLayout.fuseBlockY,
      }))
      const lanes = laneGeometry(assigned.length)
      const leftColumnTotal = blocks.reduce((sum, block) => sum + fuseColumnSplit(block.assignedFeedCount).leftCount, 0)
      const leftRail = leftRailGeometry(leftColumnTotal)
      // Left-column feeds share one rail fan and one comb, ranked by feed order
      // so the deepest row takes the outermost rail and the lowest comb lane.
      const leftColumnRanks = new Map<string, number>()
      assigned.forEach((injection, index) => {
        const block = blocks.find((candidate) => index >= candidate.firstFeedIndex && index < candidate.firstFeedIndex + candidate.assignedFeedCount)
        if (!block) return
        if (fuseSlotForFeed(index - block.firstFeedIndex, block.assignedFeedCount).isRightColumn) return
        leftColumnRanks.set(injection.id, leftColumnRanks.size)
      })
      // Terminal coordinates measured from the labelled PSU Cycles render:
      // use the second +V screw and the adjacent first -V screw.
      const psuPositive = { x: 153, y: sectionLayout.psuY + 64 }
      const psuGround = { x: 153, y: sectionLayout.psuY + 87 }
      // The +5 V trunk enters each block through the clear band between its
      // negative bus and its first fuse row, then drops the gutter between the
      // two screw columns onto the positive input. Going round the outside
      // instead would have to cut across the branch rails that wrap the block.
      const positiveBus = blocks.map((block, blockIndex) => {
        const points = fuseBlockPoints(block.circuitCount, block.x, block.y)
        const point = points.positive
        // Level with the PSU terminal for the first block, so that run is dead
        // straight; later blocks step down the same riser.
        const entryY = blockIndex === 0
          ? sectionLayout.trunkEntryY
          : Math.round((points.groundCircuit(0).y + points.circuit(0).y) / 2)
        return `M${psuPositive.x} ${psuPositive.y}H${PSU_POSITIVE_TRUNK_X}V${entryY}H${point.x}V${point.y}`
      }).join('')
      const groundBus = blocks.map((block) => {
        const point = fuseBlockPoints(block.circuitCount, block.x, block.y).ground
        return `M${psuGround.x} ${psuGround.y}H${PSU_GROUND_TRUNK_X}V${point.y}H${point.x}`
      }).join('')

      return <g key={supply.id} data-power-zone={supply.id} data-power-zone-y={sectionY} transform={`translate(0 ${sectionY})`}>
        <rect x="24" y="0" width="1072" height={sectionHeight} rx="12" fill="none" stroke="#a9afac" strokeWidth="2" />
        <text x="42" y="32" className={styles.physicalPowerLabel}>PSU ZONE {supplyIndex + 1} · RECOMMENDED POWER SUPPLY</text>
        <text data-psu-recommendation={supply.recommendedCurrentMa} x="42" y="58" className={styles.physicalPowerValue}>5 V · {formatAmps(supply.recommendedCurrentMa)} · {supply.recommendedWattage} W</text>
        {supply.psuSizingCurrentMa < supply.designCurrentMa && <>
          <text x="610" y="32" className={styles.physicalPowerBasisLabel}>CONFIGURED OPERATING BUDGET · {formatAmps(supply.psuSizingCurrentMa)}</text>
          <text data-uncapped-current-ceiling={supply.designCurrentMa} x="610" y="58" className={styles.physicalPowerCeilingLabel}>UNCAPPED FULL-WHITE CEILING · {formatAmps(supply.designCurrentMa)}</text>
        </>}

        <image
          data-component-render="5v-psu"
          href={psuRender}
          x="42"
          y={sectionLayout.psuY}
          width="123"
          height="220"
          preserveAspectRatio="xMidYMid meet"
          className={styles.physicalBoardRender}
          filter="url(#component-shadow)"
        />
        <circle cx={psuPositive.x} cy={psuPositive.y} r="6" fill="#d84938" stroke="#f0a093" strokeWidth="2" data-terminal={`${supply.id}-positive`}>
          <title>PSU +5 V output terminal</title>
        </circle>
        <circle cx={psuGround.x} cy={psuGround.y} r="6" fill="#202425" stroke="#f2c766" strokeWidth="2" data-terminal={`${supply.id}-ground`}>
          <title>PSU negative output terminal / common ground</title>
        </circle>

        {/* Origin of the rails the level shifter and controller reach by shared-net symbol. */}
        <NetStub x={244} y={82} kind="v5" direction="up" wireId={`${supply.id}-rail-positive`} />
        <NetStub x={264} y={82} kind="gnd" direction="up" wireId={`${supply.id}-rail-ground`} />

        <g data-fuse-value-schedule={`${supply.id}`}>
          <text x="42" y={sectionLayout.scheduleY} className={styles.physicalLegendTitle}>FUSE BLOCK VALUES</text>
          {blocks.flatMap((block) => {
            const values = Array.from({ length: block.circuitCount }, (_, slot) => {
              const localIndex = feedIndexForFuseSlot(slot, block.assignedFeedCount)
              const injection = localIndex < 0 ? undefined : assigned[block.firstFeedIndex + localIndex]
              const value = injection?.fuse.ratingMa ? formatAmps(injection.fuse.ratingMa) : 'SPARE'
              return `${slot + 1}: ${value}`
            })
            const lines = []
            for (let start = 0; start < values.length; start += 6) {
              lines.push({ block: block.blockIndex + 1, values: values.slice(start, start + 6), continuation: start > 0 })
            }
            return lines
          }).map((line, lineIndex) => (
            <text key={`${line.block}-${lineIndex}`} x="42" y={sectionLayout.scheduleY + 21 + (lineIndex * 18)} className={styles.physicalWireLabel}>
              {line.continuation ? '           ' : `BLOCK ${line.block} · `}{line.values.join('  ·  ')}
            </text>
          ))}
        </g>

        {blocks.map((block) => {
          const points = fuseBlockPoints(block.circuitCount, block.x, block.y)
          const { x: positiveX, y: positiveY } = points.positive
          const { x: groundX, y: groundY } = points.ground
          const spareCount = block.circuitCount - block.assignedFeedCount
          return <g key={`${supply.id}-block-${block.blockIndex + 1}`} data-fuse-block-circuits={block.circuitCount}>
            <text
              x={block.x + (FUSE_BLOCK_CELL_WIDTH / 2)}
              y={groundCombLaneY(block.y, 0, block.assignedFeedCount) - 14}
              textAnchor="middle"
              className={styles.physicalMetaLabel}
            >
              {block.circuitCount}-CIRCUIT FIXED FUSE BLOCK{spareCount ? ` · ${spareCount} SPARE` : ''}
            </text>
            <image
              data-component-render={`fuse-block-${block.circuitCount}-circuit`}
              href={FUSE_BLOCK_RENDERS[block.circuitCount]}
              x={block.x}
              y={block.y}
              width={FUSE_BLOCK_CELL_WIDTH}
              height={FUSE_BLOCK_CELL_HEIGHT}
              preserveAspectRatio="xMidYMid meet"
              className={styles.physicalBoardRender}
            />
            <circle data-terminal={`${supply.id}-fuse-block-${block.blockIndex + 1}-positive`} cx={positiveX} cy={positiveY} r="5" fill="#d84938" stroke="#ffd1d7" strokeWidth="2" />
            <circle data-terminal={`${supply.id}-fuse-block-${block.blockIndex + 1}-ground`} cx={groundX} cy={groundY} r="5" fill="#202425" stroke="#f2c766" strokeWidth="2" />
          </g>
        })}

        {/* Drawn after the block renders: both trunks land on terminals that sit
            inside the artwork, so they have to read as wires over the block. */}
        <path data-wire={`${supply.id}-positive-bus`} data-wire-role="main-psu-positive" d={positiveBus} className={styles.mainPowerWire} />
        <path data-wire={`${supply.id}-ground-bus`} data-wire-role="main-psu-ground" d={groundBus} className={styles.mainGroundWire} />

        {assigned.map((injection, index) => {
          const rowY = sectionLayout.firstBranchY + (index * POWER_BRANCH_ROW_SPACING)
          const fuseText = injection.fuse.ratingMa ? formatAmps(injection.fuse.ratingMa) : 'RATED'
          const wireText = injection.conductor ? `AWG ${injection.conductor.awg}` : 'WIRE TBD'
          const destination = `${injection.outputTitle} · ${injection.role.toUpperCase()} @ ${injection.positionMm} mm`
          const block = blocks.find((candidate) => index >= candidate.firstFeedIndex && index < candidate.firstFeedIndex + candidate.assignedFeedCount)!
          const localIndex = index - block.firstFeedIndex
          const { slot, isRightColumn, columnRank } = fuseSlotForFeed(localIndex, block.assignedFeedCount)
          const leftRank = leftColumnRanks.get(injection.id) ?? 0
          const points = fuseBlockPoints(block.circuitCount, block.x, block.y)
          const { x: fuseX, y: fuseY } = points.circuit(slot)
          const { x: groundX, y: groundY } = points.groundCircuit(slot)
          const { x: positiveX, y: positiveY } = points.positive
          const positiveLaneX = lanes.positive(index)
          const groundLaneX = lanes.ground(index)
          const groundRowY = rowY + POWER_FEED_PAIR_GAP
          // Right-column feeds leave straight out to their lane. Left-column
          // feeds drop down a rail beside the block and cross under it in the
          // feed comb, so nothing ever has to climb back over the block.
          const railX = leftRail(leftRank)
          const feedCombY = feedCombLaneY(sectionLayout.feedCombY, leftRank)
          const positivePath = isRightColumn
            ? `M${fuseX} ${fuseY}H${positiveLaneX}V${rowY}H${FEED_RUN_END}`
            : `M${fuseX} ${fuseY}H${railX}V${feedCombY}H${positiveLaneX}V${rowY}H${FEED_RUN_END}`
          const groundCombY = groundCombLaneY(block.y, localIndex, block.assignedFeedCount)
          const capacitorY = rowY - (CAPACITOR_HEIGHT * CAPACITOR_POSITIVE_LEAD_RATIO)
          // Lead tips: where the part's own leads meet the two feed wires.
          const capacitorLeadX = CAPACITOR_X + 8

          return <g key={injection.id}>
            {/* The unfused positive path is physically internal to the rendered block. */}
            <path data-wire={`${injection.id}-positive`} d={`M${positiveX} ${positiveY}V${fuseY}H${fuseX}`} className={styles.powerWire} opacity="0" />
            <g data-terminal={`${injection.id}-fuse`}>
              <circle cx={fuseX} cy={fuseY} r="6" fill="#d84938" stroke="#ffd1d7" strokeWidth="2" />
              <title>{fuseText} branch fuse · circuit {slot + 1}</title>
            </g>
            <circle
              data-terminal={`${injection.id}-ground-screw`}
              cx={groundX}
              cy={groundY}
              r="4"
              fill="#202425"
              stroke="#f2c766"
              strokeWidth="2"
            >
              <title>Ground return · negative bus screw {slot + 1}</title>
            </circle>
            <path
              data-wire={`${injection.id}-fused-positive`}
              data-feed-column={isRightColumn ? 'right' : 'left'}
              data-feed-column-rank={columnRank}
              d={positivePath}
              className={styles.powerWire}
            />
            <path
              data-wire={`${injection.id}-ground`}
              data-ground-screw-slot={slot + 1}
              data-ground-screw-count={block.circuitCount}
              d={`M${groundX} ${groundY}V${groundCombY}H${groundLaneX}V${groundRowY}H${FEED_RUN_END}`}
              className={styles.groundWire}
            />
            {/* Both captions sit above the pair: the gap below it belongs to the
                next feed, and the capacitor owns the space beside the wires. */}
            <text x={FEED_LABEL_X} y={rowY - 36} className={styles.physicalWireLabel}>{destination} · {formatAmps(injection.designCurrentMa)} · {wireText} · 500 mm</text>
            <g data-terminal={`${injection.id}-capacitor`}>
              <image
                data-component-render="panasonic-eeufr0j102b-1000uf"
                href={capacitorRender}
                x={CAPACITOR_X}
                y={capacitorY}
                width={CAPACITOR_WIDTH}
                height={CAPACITOR_HEIGHT}
                preserveAspectRatio="xMidYMid meet"
                className={styles.physicalBoardRender}
              />
              <circle data-terminal={`${injection.id}-capacitor-positive`} cx={capacitorLeadX} cy={rowY} r="4" fill="#d84938" stroke="#ffd1d7" />
              <circle data-terminal={`${injection.id}-capacitor-negative`} cx={capacitorLeadX} cy={groundRowY} r="4" fill="#202425" stroke="#f2c766" />
              <title>Panasonic EEUFR0J102B · 1000 µF, 6.3 V · positive lead to fused +5 V, striped negative lead to common ground</title>
            </g>
            <text x={FEED_LABEL_X} y={rowY - 22} className={styles.physicalWireLabel}>1000 µF · 6.3 V · STRIPED LEAD TO GND</text>
            {/* Polarity is carried by the wire colours, the legend and the
                capacitor note, so the pair stays free of per-row pin text. */}
            <circle cx={LED_TERMINAL_X} cy={rowY} r="6" fill="#d84938" stroke="#f0a093" data-terminal={`${injection.id}-led-positive`}>
              <title>{injection.outputTitle} +5 V injection · {injection.role.toUpperCase()} @ {injection.positionMm} mm</title>
            </circle>
            <circle cx={LED_TERMINAL_X} cy={groundRowY} r="6" fill="#202425" stroke="#aeb6b7" data-terminal={`${injection.id}-led-ground`}>
              <title>{injection.outputTitle} ground return · {injection.role.toUpperCase()} @ {injection.positionMm} mm</title>
            </circle>
          </g>
        })}
      </g>
    })}
    {/* Zone negatives are one net: bond them along the shared ground riser. */}
    {sections.length > 1 && <path
      data-wire="multi-psu-common-ground"
      d={`M${PSU_GROUND_TRUNK_X} ${sections[0].sectionY + sections[0].sectionLayout.psuY + 87}V${sections[sections.length - 1].sectionY + sections[sections.length - 1].sectionLayout.psuY + 87}`}
      className={styles.groundWire}
    />}
  </g>
}

function WireLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return <text x={x} y={y} className={styles.physicalWireLabel}>{children}</text>
}

export default function PhysicalAssemblyDiagram({ boardProfile, items, connections, plan, selectedItemId, onSelectItem, exportScope = 'current-view', layers = ALL_LAYERS, crop }: PhysicalAssemblyDiagramProps) {
  const boardLabel = boardProfile.label
  const layouts = itemLayouts(items)
  const outputLayouts = layouts.filter((layout) => layout.item.kind === 'matrix-output')
  const microphoneLayout = layouts.find((layout) => layout.item.kind === 'mic-input')
  const peripheralLayouts = layouts.filter((layout) => layout.item.kind !== 'matrix-output' && layout.item.kind !== 'mic-input')
  const outputConnections = connections.filter((connection) => outputLayouts.some((layout) => layout.item.id === connection.itemId))
  const micConnections = microphoneLayout ? connections.filter((connection) => connection.itemId === microphoneLayout.item.id) : []
  const controllerConnections = [...outputConnections, ...micConnections, ...connections.filter((connection) => !outputConnections.includes(connection) && !micConnections.includes(connection))]
  const controller3v3 = controllerPowerPoint('3v3', boardProfile)
  const controllerGround = controllerPowerPoint('ground', boardProfile)
  const controllerUsb = controllerPowerPoint('usb', boardProfile)
  const powerSectionY = powerSectionStartY(items, layers)
  const showPowerDistribution = layers.powerDistribution && outputLayouts.length > 0
  // Every control module render carries a VCC pad, not just the pot.
  const usesThreeVolt = !!microphoneLayout || peripheralLayouts.length > 0
  const controlLanes = assignControlLanes(peripheralLayouts, connections)
  // Dense lane index over just the wires that use the bus band, so the five
  // lanes are spent on real users rather than on gaps left by control wires
  // that route through their own corridor.
  const busLanes = new Map([...outputConnections, ...micConnections].map((connection, index) => [connection.id, index]))
  const busLane = (connection: PhysicalDiagramConnection, fallback: number) =>
    busLanes.get(connection.id) ?? fallback
  const canvasHeight = physicalAssemblyDiagramHeight(items, plan, layers)
  const viewTop = crop?.y ?? 0
  const viewHeight = crop?.height ?? canvasHeight

  return (
    <svg
      className={styles.physicalDiagram}
      viewBox={`0 ${viewTop} ${CANVAS_WIDTH} ${viewHeight}`}
      width={CANVAS_WIDTH}
      height={viewHeight}
      role="img"
      data-build-export={exportScope}
      aria-labelledby="physical-diagram-title physical-diagram-desc"
    >
      <title id="physical-diagram-title">Generated physical LED controller wiring diagram</title>
      <desc id="physical-diagram-desc">Every visible wire terminates at a labelled controller, microphone, level-shifter, LED, protection, distribution, capacitor, or supply terminal.</desc>
      <defs>
        <filter id="component-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#111" floodOpacity=".22" /></filter>
        <linearGradient id="supply-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#405248" /><stop offset="1" stopColor="#171d1a" /></linearGradient>
      </defs>

      <rect data-pan-background="true" width={CANVAS_WIDTH} height={canvasHeight} fill="#f4f4f1" />
      <g opacity=".23">
        {Array.from({ length: 22 }, (_, index) => <line key={`v${index}`} x1={index * 52} y1="0" x2={index * 52} y2={canvasHeight} stroke="#afb4b4" strokeWidth=".7" />)}
        {Array.from({ length: Math.ceil(canvasHeight / 52) }, (_, index) => <line key={`h${index}`} x1="0" y1={index * 52} x2={CANVAS_WIDTH} y2={index * 52} stroke="#afb4b4" strokeWidth=".7" />)}
      </g>

      <g className={styles.physicalWires}>
        {microphoneLayout && (() => {
          const vddPoint = microphoneTerminalPoint(microphoneLayout, 'vdd')
          const channelPoint = microphoneTerminalPoint(microphoneLayout, 'channel')
          const groundPoint = microphoneTerminalPoint(microphoneLayout, 'gnd')
          return <>
          <NetStub x={vddPoint.x} y={vddPoint.y} kind="v3v3" direction="left" lead={26} wireId="microphone-vdd" wireRole="vdd" />
          {layers.signalWires && micConnections.map((connection) => {
            const controllerIndex = controllerConnections.indexOf(connection)
            const controllerPoint = controllerConnectionPoint(connection, controllerIndex, controllerConnections.length, boardProfile)
            const presentation = microphoneSignalPresentation(connection)
            if (!presentation) return null
            const target = microphoneTerminalPoint(microphoneLayout, presentation.role)
            return <path key={connection.id} data-wire={connection.id} data-wire-role={presentation.role} d={routeFromController(controllerPoint, target.x, target.y, busLane(connection, controllerIndex))} className={presentation.wireClassName} />
          })}
          {/* Hooks right, over the breakout, so the left edge stays clear for the rail stubs. */}
          <path data-wire="microphone-channel-select" data-wire-role="channel-select" d={`M${channelPoint.x} ${channelPoint.y}H${channelPoint.x + 12}V${groundPoint.y}H${groundPoint.x}`} className={styles.groundWire} />
          <NetStub x={groundPoint.x} y={groundPoint.y} kind="gnd" direction="left" lead={26} wireId="microphone-ground" />
        </>
        })()}

        {layers.signalWires && outputLayouts.map((layout, index) => {
          const connection = outputConnections.find((entry) => entry.itemId === layout.item.id)
          if (!connection) return null
          const controllerIndex = controllerConnections.indexOf(connection)
          const controllerPoint = controllerConnectionPoint(connection, controllerIndex, controllerConnections.length, boardProfile)
          const wireClass = selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.signalWire : styles.dimWire
          // Without the shifter layer there is nothing to route through, so the
          // data run goes straight from the controller pin to the panel.
          if (!layers.levelShifter) {
            return <path key={layout.item.id} data-wire={`${layout.item.id}-data-in`} d={routeFromController(controllerPoint, layout.x, layout.y + 66, busLane(connection, controllerIndex))} className={wireClass} />
          }
          const inputPoint = levelShifterTerminalPoint(index, 'a')
          const outputPoint = levelShifterTerminalPoint(index, 'y')
          return <g key={layout.item.id}>
            <path data-wire={`${layout.item.id}-data-in`} d={routeFromController(controllerPoint, 350, inputPoint.y, busLane(connection, controllerIndex))} className={wireClass} />
            <path data-wire={`${layout.item.id}-level-shifter-input`} d={routeToLevelShifterInput(index, inputPoint)} className={wireClass} />
            <path data-wire={`${layout.item.id}-conditioned-data`} d={routeFromLevelShifterOutput(index, outputPoint, layout.x, layout.y + 66)} className={wireClass} />
          </g>
        })}
        {peripheralLayouts.map((layout, layoutIndex) => {
          const peripheralConnections = connections.filter((connection) => connection.itemId === layout.item.id)
          const vccPad = peripheralPadPoint(layout, 0)
          const groundPad = peripheralPadPoint(layout, peripheralPadCount(layout.item.kind) - 1)
          return <g key={layout.item.id}>
            <NetStub x={vccPad.x} y={vccPad.y} kind="v3v3" direction="down" lead={PERIPHERAL_STUB_LEAD} wireId={`${layout.item.id}-3v3`} />
            {layers.signalWires && peripheralConnections.map((connection, index) => {
              const controllerIndex = controllerConnections.indexOf(connection)
              const controllerPoint = controllerConnectionPoint(connection, controllerIndex, controllerConnections.length, boardProfile)
              const pad = peripheralPadPoint(layout, index + 1)
              const lane = controlLanes.get(connection.id)
              if (!lane) return null
              return <path
                key={connection.id}
                data-wire={connection.id}
                data-control-lane={lane.index}
                d={routeToControlPad(controllerPoint, pad, lane.y, lane.index)}
                className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? controlWireClass(layoutIndex) : styles.dimWire}
              />
            })}
            <NetStub x={groundPad.x} y={groundPad.y} kind="gnd" direction="down" lead={PERIPHERAL_STUB_LEAD} wireId={`${layout.item.id}-ground`} />
          </g>
        })}
        {layers.levelShifter && Array.from({ length: Math.ceil(outputLayouts.length / 4) }, (_, chipIndex) => {
          const usedChannels = Math.min(4, outputLayouts.length - (chipIndex * 4))
          const vccPoint = levelShifterSupplyPoint(chipIndex, 'vcc')
          const groundPoint = levelShifterSupplyPoint(chipIndex, 'gnd')
          return <g key={`level-shifter-wires-${chipIndex}`}>
            <NetStub x={vccPoint.x} y={vccPoint.y} kind="v5" direction="right" wireId={`level-shifter-${chipIndex + 1}-vcc`} />
            <NetStub x={groundPoint.x} y={groundPoint.y} kind="gnd" direction="left" lead={26} wireId={`level-shifter-${chipIndex + 1}-ground`} />
            {Array.from({ length: usedChannels }, (_, channelIndex) => {
              const oePoint = levelShifterTerminalPoint((chipIndex * 4) + channelIndex, 'oe')
              // /OE ties low. Four identical cross-canvas runs per chip carried no
              // information beyond that, so each becomes a stub on its own pin side.
              return <NetStub
                key={channelIndex}
                x={oePoint.x}
                y={oePoint.y}
                kind="gnd"
                direction={oePoint.side === 'left' ? 'left' : 'right'}
                lead={oePoint.side === 'left' ? 26 : undefined}
                wireId={`level-shifter-${chipIndex + 1}-oe-${channelIndex + 1}`}
              />
            })}
          </g>
        })}
        {/* Source ends of the two rails the controller supplies, so each net still shows both ends. */}
        <NetStub x={controllerGround.x} y={controllerGround.y} kind="gnd" direction="right" lead={26} wireId="controller-common-ground" />
        {usesThreeVolt && <NetStub x={controller3v3.x} y={controller3v3.y} kind="v3v3" direction="left" lead={26} wireId="controller-3v3-rail" />}
      </g>

      {layers.levelShifter && outputLayouts.length > 0 && <g filter="url(#component-shadow)">
        {outputLayouts.map((layout, index) => (
          <g key={`${layout.item.id}-resistor`} transform={`translate(350 ${levelShifterTerminalPoint(index, 'a').y - 14})`}>
            <text x="20" y="-8" textAnchor="middle" className={styles.physicalComponentLabel}>330Ω</text>
            <image
              data-component-render="330ohm-blue-axial-resistor"
              href={resistorRender}
              x="0"
              y="0"
              width="40"
              height="28"
              preserveAspectRatio="xMidYMid meet"
              className={styles.physicalBoardRender}
            />
          </g>
        ))}
        {Array.from({ length: Math.ceil(outputLayouts.length / 4) }, (_, chipIndex) => {
          const chipY = levelShifterChipY(chipIndex * 4)
          const vccPoint = levelShifterSupplyPoint(chipIndex, 'vcc')
          const groundPoint = levelShifterSupplyPoint(chipIndex, 'gnd')
          return <g key={`level-shifter-${chipIndex}`} transform={`translate(${LEVEL_SHIFTER_X} ${chipY})`}>
            <text x={LEVEL_SHIFTER_WIDTH / 2} y="-14" textAnchor="middle" className={styles.physicalComponentLabel}>74AHCT125 DIP-14 level shifter {chipIndex + 1}</text>
            <image data-component-render="sn74ahct125n-dip14" href={levelShifterRender} x="23" y="0" width="134" height={LEVEL_SHIFTER_HEIGHT} preserveAspectRatio="xMidYMid meet" className={styles.physicalBoardRender} />
            <g data-terminal={`level-shifter-${chipIndex + 1}-vcc`}>
              <circle cx={vccPoint.x - LEVEL_SHIFTER_X} cy={vccPoint.y - chipY} r="6" fill="#d84938" stroke="#ffd1d7" strokeWidth="2" />
              <text x={vccPoint.x - LEVEL_SHIFTER_X - 12} y={vccPoint.y - chipY + 4} textAnchor="end" className={styles.physicalChipLabel}>P14 VCC</text>
            </g>
            {Array.from({ length: 4 }, (_, channelIndex) => {
              const outputIndex = (chipIndex * 4) + channelIndex
              const inputPoint = levelShifterTerminalPoint(outputIndex, 'a')
              const outputPoint = levelShifterTerminalPoint(outputIndex, 'y')
              const oePoint = levelShifterTerminalPoint(outputIndex, 'oe')
              const inputPin = [2, 5, 9, 12][channelIndex]
              const outputPin = [3, 6, 8, 11][channelIndex]
              const oePin = [1, 4, 10, 13][channelIndex]
              const terminal = (point: LevelShifterTerminalPoint, label: string) => {
                const x = point.x - LEVEL_SHIFTER_X
                const y = point.y - chipY
                return <><circle cx={x} cy={y} r="5" fill="#d2d5d1" stroke="#465054" strokeWidth="2" /><text x={x + (point.side === 'left' ? 12 : -12)} y={y + 4} textAnchor={point.side === 'left' ? 'start' : 'end'} className={styles.physicalChipLabel}>{label}</text></>
              }
              return <g key={channelIndex}>
                <g data-terminal={`level-shifter-${chipIndex + 1}-a${channelIndex + 1}`}>{terminal(inputPoint, `P${inputPin} A${channelIndex + 1}`)}</g>
                <g data-terminal={`level-shifter-${chipIndex + 1}-y${channelIndex + 1}`}>{terminal(outputPoint, `P${outputPin} Y${channelIndex + 1}`)}</g>
                <g data-terminal={`level-shifter-${chipIndex + 1}-oe${channelIndex + 1}`}>{terminal(oePoint, `P${oePin} /OE${channelIndex + 1}`)}</g>
              </g>
            })}
            <g data-terminal={`level-shifter-${chipIndex + 1}-gnd`}>
              <circle cx={groundPoint.x - LEVEL_SHIFTER_X} cy={groundPoint.y - chipY} r="6" fill="#202425" stroke="#f2c766" strokeWidth="2" />
              <text x={groundPoint.x - LEVEL_SHIFTER_X + 12} y={groundPoint.y - chipY + 4} className={styles.physicalChipLabel}>P7 GND</text>
            </g>
          </g>
        })}
      </g>}

      {/* The callout follows the stubs, not the PSU zones — a section sheet that
          drops power still draws net symbols and must still explain them. */}
      {layouts.length > 0 && (
        <CommonNetCallout
          x={320}
          y={showPowerDistribution ? powerSectionY - 78 : diagramContentBottom(items, layers) + COMMON_NET_CALLOUT_GAP}
          width={776}
          powerBelow={showPowerDistribution}
        />
      )}
      {showPowerDistribution && <PowerDistributionSections plan={plan} bands={powerZoneBands(items, plan, layers)} />}

      <g filter="url(#component-shadow)" transform={`translate(${controllerUsb.x - 92} 592)`}>
        <rect width="184" height="62" rx="12" fill="#e9ecea" stroke="#879092" strokeWidth="2" />
        <path d="M138 19h30v24h-30l-12-12z" fill="#aeb7ba" stroke="#5f696c" />
        <text x="18" y="27" className={styles.physicalComponentLabel}>USB-C power</text>
        <text x="18" y="46" className={styles.physicalMetaLabel}>controller only</text>
        <path data-wire="controller-usb-power" d={`M92 0V${controllerUsb.y - 592}`} className={styles.logicPowerWire} />
      </g>

      <g role="button" tabIndex={0} aria-label={`Select ${boardLabel}`} onClick={() => onSelectItem('controller')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem('controller') }} className={styles.physicalClickable}>
        {/* A sheet without signal runs shows no signal pins either, so the
            header strip carries only the terminals that sheet actually uses. */}
        <ControllerGraphic boardProfile={boardProfile} connections={layers.signalWires ? controllerConnections : []} selected={selectedItemId === 'controller'} />
      </g>
      {outputLayouts.map((layout) => <g key={layout.item.id} role="button" tabIndex={0} aria-label={`Select ${layout.item.title}`} onClick={() => onSelectItem(layout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(layout.item.id) }} className={styles.physicalClickable}><OutputGraphic layout={layout} selected={selectedItemId === layout.item.id} plan={plan.outputs.find((entry) => entry.itemId === layout.item.id)} powerPlanBelow={showPowerDistribution} /></g>)}
      {microphoneLayout && <g role="button" tabIndex={0} aria-label={`Select ${microphoneLayout.item.title}`} onClick={() => onSelectItem(microphoneLayout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(microphoneLayout.item.id) }} className={styles.physicalClickable}><MicrophoneGraphic layout={microphoneLayout} connections={micConnections} selected={selectedItemId === microphoneLayout.item.id} /></g>}
      {peripheralLayouts.map((layout) => <g key={layout.item.id} role="button" tabIndex={0} aria-label={`Select ${layout.item.title}`} onClick={() => onSelectItem(layout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(layout.item.id) }} className={styles.physicalClickable}><InputGraphic layout={layout} connections={connections.filter((connection) => connection.itemId === layout.item.id)} selected={selectedItemId === layout.item.id} /></g>)}

      <g transform="translate(30 28)">
        <rect width="272" height="68" rx="8" fill="#ffffff" stroke="#d2d4d1" />
        <text x="16" y="24" className={styles.physicalLegendTitle}>GENERATED WIRING PLAN</text>
        <text x="16" y="45" className={styles.physicalLegendMeta}>{items.length + 1} graph devices · {connections.length} GPIO routes</text>
        <text x="16" y="60" className={styles.physicalLegendMeta}>{plan.ruleSetVersion}</text>
      </g>
      <g transform={`translate(674 ${canvasHeight - 22})`}>
        <line x1="0" y1="0" x2="28" y2="0" className={styles.powerWire} /><WireLabel x={36} y={4}>+5V</WireLabel>
        <line x1="80" y1="0" x2="108" y2="0" className={styles.groundWire} /><WireLabel x={116} y={4}>GND</WireLabel>
        <line x1="166" y1="0" x2="194" y2="0" className={styles.signalWire} /><WireLabel x={202} y={4}>SIGNAL</WireLabel>
        <g transform="translate(292 -8)">
          <g className={styles.groundStubSymbol}>
            <line x1={-6} y1={4} x2={6} y2={4} /><line x1={-4} y1={8} x2={4} y2={8} /><line x1={-1.5} y1={12} x2={1.5} y2={12} />
          </g>
        </g>
        <WireLabel x={306} y={4}>SHARED NET — SEE CALLOUT</WireLabel>
      </g>
    </svg>
  )
}

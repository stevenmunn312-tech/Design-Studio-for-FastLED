import type { ElectricalPlanSummary, OutputElectricalPlan } from '../../build/electricalPlan'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import devKitCBoardRender from '../../assets/boards/esp32-s3-devkitc-1.png'
import levelShifterRender from '../../assets/components/sn74ahct125n-dip14.png'
import styles from './BuildDiagramWorkspace.module.css'
import {
  itemLayouts,
  LEVEL_SHIFTER_HEIGHT,
  LEVEL_SHIFTER_WIDTH,
  LEVEL_SHIFTER_X,
  levelShifterChipY,
  levelShifterSupplyPoint,
  levelShifterTerminalPoint,
  physicalAssemblyDiagramHeight,
  type ItemLayout,
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
}

const CANVAS_WIDTH = 1120
const DISTRIBUTION_POSITIVE_BUS_Y = 100
const DISTRIBUTION_GROUND_BUS_Y = 132

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

function routeFromController(
  point: ControllerTerminalPoint,
  targetX: number,
  targetY: number,
  laneIndex: number,
  preferTop = false,
) {
  const rightLane = 304 + (laneIndex * 8)
  if (point.side === 'right') return `M${point.x} ${point.y}H${rightLane}V${targetY}H${targetX}`
  const laneSlot = laneIndex % 6
  const leftLane = 58 - (laneSlot * 6)
  const detourY = preferTop ? 102 : 542 + (laneSlot * 7)
  return `M${point.x} ${point.y}H${leftLane}V${detourY}H${rightLane}V${targetY}H${targetX}`
}

function routeToLevelShifterInput(outputIndex: number, point: LevelShifterTerminalPoint) {
  if (point.side === 'left') return `M390 ${point.y}H${point.x}`
  const chipY = levelShifterChipY(outputIndex)
  const detourY = chipY + LEVEL_SHIFTER_HEIGHT + 16 + ((outputIndex % 4) * 7)
  return `M390 ${point.y}H410V${detourY}H${point.x + 18}V${point.y}H${point.x}`
}

function routeFromLevelShifterOutput(
  outputIndex: number,
  point: LevelShifterTerminalPoint,
  targetX: number,
  targetY: number,
) {
  if (point.side === 'right') return `M${point.x} ${point.y}H650V${targetY}H${targetX}`
  const chipY = levelShifterChipY(outputIndex)
  const detourY = chipY + LEVEL_SHIFTER_HEIGHT + 16 + ((outputIndex % 4) * 7)
  return `M${point.x} ${point.y}H410V${detourY}H650V${targetY}H${targetX}`
}

function peripheralSignalOffset(item: HardwareManifestItem, index: number) {
  if (item.kind === 'pot-input') return 48
  return 24 + (index * 24)
}

function peripheralGroundOffset(item: HardwareManifestItem) {
  return item.kind === 'encoder-input' ? 94 : 82
}

type MicrophoneSignalRole = 'bclk' | 'ws' | 'dout'

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
      <text x="166" y="296" textAnchor="middle" className={styles.physicalBoardSubSilk}>ESP32-S3-WROOM</text>
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
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <text x={x + 102} y={y - 16} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
      <rect x={x} y={y} width="205" height="138" rx="10" fill="#12659a" stroke={selected ? '#1fa5ad' : '#0b3f62'} strokeWidth={selected ? 4 : 2} />
      <circle cx={x + 52} cy={y + 68} r="31" fill="#1b2022" stroke="#d9d9ce" strokeWidth="3" />
      <circle cx={x + 52} cy={y + 68} r="18" fill="#282e30" />
      <text x={x + 102} y={y + 28} className={styles.physicalBoardSilk}>INMP441</text>
      <g data-terminal={`${item.id}-vdd`} data-microphone-role="vdd"><circle cx={x} cy={y + 30} r="5" className={styles.microphoneVddTerminal} /><text x={x + 12} y={y + 34} className={styles.physicalPinLabel}>VDD 3V3</text></g>
      {connections.map((connection, index) => {
        const presentation = microphoneSignalPresentation(connection)
        return <g key={connection.id} data-terminal={`${item.id}-${connection.id}`} data-microphone-role={presentation?.role ?? 'data'}>
          <circle cx={x} cy={y + 56 + (index * 24)} r="5" className={presentation?.terminalClassName} />
          <text x={x + 12} y={y + 60 + (index * 24)} className={styles.physicalPinLabel}>{presentation?.label ?? 'DATA'} · {connection.pinLabel}</text>
        </g>
      })}
      <g data-terminal={`${item.id}-gnd`}><circle cx={x} cy={y + 128} r="5" fill="#202425" stroke="#e8ad46" /><text x={x + 12} y={y + 132} className={styles.physicalPinLabel}>GND</text></g>
    </g>
  )
}

function InputGraphic({ layout, connections, selected }: { layout: ItemLayout; connections: PhysicalDiagramConnection[]; selected: boolean }) {
  const { x, y, item } = layout
  const needsPower = item.kind === 'pot-input'
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <rect x={x} y={y} width={layout.width} height={layout.height} rx="12" fill="#245f68" stroke={selected ? '#1fa5ad' : '#123b42'} strokeWidth={selected ? 4 : 2} />
      <circle cx={x + 118} cy={y + 52} r="25" fill="#171b1d" stroke="#d8ab4f" strokeWidth="4" />
      <circle cx={x + 118} cy={y + 52} r="8" fill="#5b6265" />
      <path d={`M${x + 118} ${y + 52}l12 -16`} stroke="#d7dad5" strokeWidth="3" strokeLinecap="round" />
      {needsPower && <g data-terminal={`${item.id}-3v3`}><circle cx={x} cy={y + 18} r="5" fill="#d84836" /><text x={x + 10} y={y + 22} className={styles.physicalPinLabel}>3V3</text></g>}
      {connections.map((connection, index) => (
        <g key={connection.id} data-terminal={`${item.id}-${connection.id}`}>
          <circle cx={x} cy={y + peripheralSignalOffset(item, index)} r="5" fill="#3dab5b" stroke="#d9a14a" />
          <text x={x + 10} y={y + peripheralSignalOffset(item, index) + 4} className={styles.physicalPinLabel}>{connectionPinLabel(connection)}</text>
        </g>
      ))}
      <g data-terminal={`${item.id}-gnd`}><circle cx={x} cy={y + peripheralGroundOffset(item)} r="5" fill="#202425" stroke="#d9a14a" /><text x={x + 10} y={y + peripheralGroundOffset(item) + 4} className={styles.physicalPinLabel}>GND</text></g>
      <text x={x + 118} y={y + 20} textAnchor="middle" className={styles.physicalBoardSilk}>{item.kind === 'button-input' ? 'BUTTON' : item.kind === 'pot-input' ? 'POT' : 'ENCODER'}</text>
      <text x={x + 80} y={y + 126} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
    </g>
  )
}

function OutputGraphic({ layout, selected, plan }: { layout: ItemLayout; selected: boolean; plan?: OutputElectricalPlan }) {
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
      {plan && <text x={x + (width / 2)} y={y + (plan.operatingCurrentCapMa != null ? 170 : 167)} textAnchor="middle" className={styles.physicalBoardSubSilk}>{plan.recommendedFeedCount} FUSED FEEDS · PSU PLAN BELOW</text>}
    </g>
  )
}

function PowerDistributionSections({ plan, startY }: { plan: ElectricalPlanSummary; startY: number }) {
  const injections = plan.outputs.flatMap((output) => output.injections)
  let y = startY
  const sections = (plan.totals?.supplies ?? []).map((supply) => {
    const assigned = injections.filter((injection) => injection.supplyId === supply.id)
    const sectionY = y
    const sectionHeight = 170 + (assigned.length * 54)
    y += sectionHeight + 34
    return { supply, assigned, sectionY, sectionHeight }
  })
  return <g>
    {sections.map(({ supply, assigned, sectionY, sectionHeight }, supplyIndex) => <g key={supply.id} transform={`translate(0 ${sectionY})`}>
      <rect x="24" y="0" width="1072" height={sectionHeight} rx="12" fill="none" stroke="#a9afac" strokeWidth="2" />
      <text x="42" y="32" className={styles.physicalPowerLabel}>PSU ZONE {supplyIndex + 1} · RECOMMENDED POWER SUPPLY</text>
      <text data-psu-recommendation={supply.recommendedCurrentMa} x="42" y="58" className={styles.physicalPowerValue}>5 V · {formatAmps(supply.recommendedCurrentMa)} · {supply.recommendedWattage} W</text>
      {supply.psuSizingCurrentMa < supply.designCurrentMa && <>
        <text x="610" y="32" className={styles.physicalPowerBasisLabel}>CONFIGURED OPERATING BUDGET · {formatAmps(supply.psuSizingCurrentMa)}</text>
        <text data-uncapped-current-ceiling={supply.designCurrentMa} x="610" y="58" className={styles.physicalPowerCeilingLabel}>UNCAPPED FULL-WHITE CEILING · {formatAmps(supply.designCurrentMa)}</text>
      </>}

      <g transform="translate(42 76)" filter="url(#component-shadow)">
        <rect width="188" height="78" rx="8" fill="url(#supply-body)" stroke="#151917" strokeWidth="2" />
        <circle cx="188" cy="24" r="7" fill="#d84938" stroke="#f0a093" data-terminal={`${supply.id}-positive`} />
        <circle cx="188" cy="56" r="7" fill="#202425" stroke="#aeb6b7" data-terminal={`${supply.id}-ground`} />
        <text x="86" y="32" textAnchor="middle" className={styles.physicalSupplyText}>5V CONSTANT-VOLTAGE PSU</text>
        <text x="86" y="54" textAnchor="middle" className={styles.physicalBoardSubSilk}>{supply.outputTitles.join(' + ')}</text>
      </g>

      <path data-wire={`${supply.id}-positive-bus`} d={`M230 ${DISTRIBUTION_POSITIVE_BUS_Y}H500`} className={styles.powerWire} />
      <path data-wire={`${supply.id}-ground-bus`} d={`M230 ${DISTRIBUTION_GROUND_BUS_Y}H500`} className={styles.groundWire} />
      <g transform="translate(262 82)">
        <rect width="92" height="68" rx="7" fill="#292e30" stroke="#111" />
        <text x="46" y="20" textAnchor="middle" className={styles.physicalFuseText}>1000µF MIN</text>
        <text x="46" y="38" textAnchor="middle" className={styles.physicalFuseText}>BULK ELECTROLYTIC</text>
        <circle cx="0" cy="18" r="5" fill="#d84938" data-terminal={`${supply.id}-bulk-positive`} />
        <circle cx="0" cy="50" r="5" fill="#202425" stroke="#aeb6b7" data-terminal={`${supply.id}-bulk-negative`} />
      </g>
      <rect x="390" y="84" width="110" height="66" rx="7" fill="#263035" stroke="#111" />
      <text x="445" y="108" textAnchor="middle" className={styles.physicalFuseText}>FUSED +5V</text>
      <text x="445" y="134" textAnchor="middle" className={styles.physicalFuseText}>GROUND BUS</text>

      {assigned.map((injection, index) => {
        const rowY = 170 + (index * 54)
        const fuseText = injection.fuse.ratingMa ? formatAmps(injection.fuse.ratingMa) : 'RATED'
        const wireText = injection.conductor ? `AWG ${injection.conductor.awg}` : 'WIRE TBD'
        const destination = `${injection.outputTitle} · ${injection.role.toUpperCase()} @ ${injection.positionMm} mm`
        return <g key={injection.id}>
          <path data-wire={`${injection.id}-positive`} d={`M500 ${DISTRIBUTION_POSITIVE_BUS_Y}H530V${rowY}H560`} className={styles.powerWire} />
          <rect x="560" y={rowY - 15} width="70" height="30" rx="6" fill="#4b2423" stroke="#a7473f" data-terminal={`${injection.id}-fuse`} />
          <text x="595" y={rowY + 4} textAnchor="middle" className={styles.physicalFuseText}>{fuseText} FUSE</text>
          <path data-wire={`${injection.id}-fused-positive`} d={`M630 ${rowY}H1000`} className={styles.powerWire} />
          <path data-wire={`${injection.id}-ground`} d={`M500 ${DISTRIBUTION_GROUND_BUS_Y}H520V${rowY + 22}H1000`} className={styles.groundWire} />
          <text x="650" y={rowY - 8} className={styles.physicalWireLabel}>{destination} · {formatAmps(injection.designCurrentMa)} · {wireText} · 500 mm</text>
          <g transform={`translate(950 ${rowY})`} data-terminal={`${injection.id}-ceramic`}>
            <line x1="0" y1="0" x2="0" y2="7" className={styles.powerWire} />
            <line x1="-8" y1="7" x2="8" y2="7" stroke="#766f4a" strokeWidth="3" />
            <line x1="-8" y1="15" x2="8" y2="15" stroke="#766f4a" strokeWidth="3" />
            <line x1="0" y1="15" x2="0" y2="22" className={styles.groundWire} />
            <text x="14" y="15" className={styles.physicalFuseText}>CER</text>
          </g>
          <circle cx="1000" cy={rowY} r="6" fill="#d84938" stroke="#f0a093" data-terminal={`${injection.id}-led-positive`} />
          <circle cx="1000" cy={rowY + 22} r="6" fill="#202425" stroke="#aeb6b7" data-terminal={`${injection.id}-led-ground`} />
          <text x="1012" y={rowY + 5} className={styles.physicalPinLabel}>+5V</text>
          <text x="1012" y={rowY + 27} className={styles.physicalPinLabel}>GND</text>
        </g>
      })}
    </g>)}
    {sections.length > 1 && <path
      data-wire="multi-psu-common-ground"
      d={`M230 ${sections[0].sectionY + 132}V${sections[sections.length - 1].sectionY + 132}`}
      className={styles.groundWire}
    />}
  </g>
}

function WireLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return <text x={x} y={y} className={styles.physicalWireLabel}>{children}</text>
}

export default function PhysicalAssemblyDiagram({ boardProfile, items, connections, plan, selectedItemId, onSelectItem, exportScope = 'current-view' }: PhysicalAssemblyDiagramProps) {
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
  const hardwareBottom = Math.max(0, ...layouts.map((layout) => layout.y + layout.height))
  const powerSectionY = Math.max(670, hardwareBottom + 54)
  const canvasHeight = physicalAssemblyDiagramHeight(items, plan)

  return (
    <svg
      className={styles.physicalDiagram}
      viewBox={`0 0 ${CANVAS_WIDTH} ${canvasHeight}`}
      width={CANVAS_WIDTH}
      height={canvasHeight}
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
        {microphoneLayout && <>
          <path data-wire="microphone-vdd" data-wire-role="vdd" d={routeFromController(controller3v3, microphoneLayout.x, microphoneLayout.y + 30, 0, true)} className={styles.microphoneVddWire} />
          {micConnections.map((connection, index) => {
            const controllerIndex = controllerConnections.indexOf(connection)
            const controllerPoint = controllerConnectionPoint(connection, controllerIndex, controllerConnections.length, boardProfile)
            const presentation = microphoneSignalPresentation(connection)
            return <path key={connection.id} data-wire={connection.id} data-wire-role={presentation?.role ?? 'data'} d={routeFromController(controllerPoint, microphoneLayout.x, microphoneLayout.y + 56 + (index * 24), controllerIndex)} className={presentation?.wireClassName ?? styles.auxWire} />
          })}
          <path data-wire="microphone-ground" d={`M${microphoneLayout.x} ${microphoneLayout.y + 128}H316V${controllerGround.y}H${controllerGround.x}`} className={styles.groundWire} />
        </>}

        {outputLayouts.map((layout, index) => {
          const connection = outputConnections.find((entry) => entry.itemId === layout.item.id)
          if (!connection) return null
          const controllerIndex = controllerConnections.indexOf(connection)
          const controllerPoint = controllerConnectionPoint(connection, controllerIndex, controllerConnections.length, boardProfile)
          const inputPoint = levelShifterTerminalPoint(index, 'a')
          const outputPoint = levelShifterTerminalPoint(index, 'y')
          return <g key={layout.item.id}>
            <path data-wire={`${layout.item.id}-data-in`} d={routeFromController(controllerPoint, 350, inputPoint.y, controllerIndex)} className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.signalWire : styles.dimWire} />
            <path data-wire={`${layout.item.id}-level-shifter-input`} d={routeToLevelShifterInput(index, inputPoint)} className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.signalWire : styles.dimWire} />
            <path data-wire={`${layout.item.id}-conditioned-data`} d={routeFromLevelShifterOutput(index, outputPoint, layout.x, layout.y + 66)} className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.signalWire : styles.dimWire} />
          </g>
        })}
        {peripheralLayouts.map((layout, layoutIndex) => {
          const peripheralConnections = connections.filter((connection) => connection.itemId === layout.item.id)
          return <g key={layout.item.id}>
            {layout.item.kind === 'pot-input' && <path data-wire={`${layout.item.id}-3v3`} d={routeFromController(controller3v3, layout.x, layout.y + 18, layoutIndex)} className={styles.logicPowerWire} />}
            {peripheralConnections.map((connection, index) => {
              const controllerIndex = controllerConnections.indexOf(connection)
              const controllerPoint = controllerConnectionPoint(connection, controllerIndex, controllerConnections.length, boardProfile)
              return <path key={connection.id} data-wire={connection.id} d={routeFromController(controllerPoint, layout.x, layout.y + peripheralSignalOffset(layout.item, index), controllerIndex)} className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.auxWire : styles.dimWire} />
            })}
            <path data-wire={`${layout.item.id}-ground`} d={`M${layout.x} ${layout.y + peripheralGroundOffset(layout.item)}H${316 + (layoutIndex * 8)}V${controllerGround.y}H${controllerGround.x}`} className={styles.groundWire} />
          </g>
        })}
        {Array.from({ length: Math.ceil(outputLayouts.length / 4) }, (_, chipIndex) => {
          const chipY = levelShifterChipY(chipIndex * 4)
          const usedChannels = Math.min(4, outputLayouts.length - (chipIndex * 4))
          const vccPoint = levelShifterSupplyPoint(chipIndex, 'vcc')
          const groundPoint = levelShifterSupplyPoint(chipIndex, 'gnd')
          return <g key={`level-shifter-wires-${chipIndex}`}>
            <path data-wire={`level-shifter-${chipIndex + 1}-vcc`} d={`M${vccPoint.x} ${vccPoint.y}H610V236H370V${powerSectionY + DISTRIBUTION_POSITIVE_BUS_Y}H390`} className={styles.powerWire} />
            <path data-wire={`level-shifter-${chipIndex + 1}-ground`} d={`M${groundPoint.x} ${groundPoint.y}H360V${powerSectionY + DISTRIBUTION_GROUND_BUS_Y}H390`} className={styles.groundWire} />
            {Array.from({ length: usedChannels }, (_, channelIndex) => {
              const outputIndex = (chipIndex * 4) + channelIndex
              const oePoint = levelShifterTerminalPoint(outputIndex, 'oe')
              const detourY = chipY + LEVEL_SHIFTER_HEIGHT + 10 + (channelIndex * 6)
              const path = oePoint.side === 'left'
                ? `M${oePoint.x} ${oePoint.y}H360V${powerSectionY + DISTRIBUTION_GROUND_BUS_Y}H390`
                : `M${oePoint.x} ${oePoint.y}H610V${detourY}H360V${powerSectionY + DISTRIBUTION_GROUND_BUS_Y}H390`
              return <path key={channelIndex} data-wire={`level-shifter-${chipIndex + 1}-oe-${channelIndex + 1}`} d={path} className={styles.groundWire} />
            })}
          </g>
        })}
        {outputLayouts.length > 0 && <path data-wire="controller-common-ground" d={`M${controllerGround.x} ${controllerGround.y}H360V${powerSectionY + DISTRIBUTION_GROUND_BUS_Y}H390`} className={styles.groundWire} />}
      </g>

      {outputLayouts.length > 0 && <g filter="url(#component-shadow)">
        {outputLayouts.map((layout, index) => (
          <g key={`${layout.item.id}-resistor`} transform={`translate(350 ${levelShifterTerminalPoint(index, 'a').y - 14})`}>
            <text x="20" y="-8" textAnchor="middle" className={styles.physicalComponentLabel}>330Ω</text>
            <line x1="0" y1="14" x2="7" y2="14" stroke="#269847" strokeWidth="4" />
            <rect x="7" y="4" width="26" height="20" rx="4" fill="#dfc39a" stroke="#795f38" />
            <line x1="33" y1="14" x2="40" y2="14" stroke="#269847" strokeWidth="4" />
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
              <text x={vccPoint.x - LEVEL_SHIFTER_X - 12} y={vccPoint.y - chipY + 4} textAnchor="end" className={styles.physicalChipLabel}>VCC · P14</text>
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
                <g data-terminal={`level-shifter-${chipIndex + 1}-a${channelIndex + 1}`}>{terminal(inputPoint, `A${channelIndex + 1} · P${inputPin}`)}</g>
                <g data-terminal={`level-shifter-${chipIndex + 1}-y${channelIndex + 1}`}>{terminal(outputPoint, `Y${channelIndex + 1} · P${outputPin}`)}</g>
                <g data-terminal={`level-shifter-${chipIndex + 1}-oe${channelIndex + 1}`}>{terminal(oePoint, `/OE${channelIndex + 1} · P${oePin}`)}</g>
              </g>
            })}
            <g data-terminal={`level-shifter-${chipIndex + 1}-gnd`}>
              <circle cx={groundPoint.x - LEVEL_SHIFTER_X} cy={groundPoint.y - chipY} r="6" fill="#202425" stroke="#f2c766" strokeWidth="2" />
              <text x={groundPoint.x - LEVEL_SHIFTER_X + 12} y={groundPoint.y - chipY + 4} className={styles.physicalChipLabel}>GND · P7</text>
            </g>
          </g>
        })}
      </g>}

      {outputLayouts.length > 0 && <PowerDistributionSections plan={plan} startY={powerSectionY} />}

      <g filter="url(#component-shadow)" transform={`translate(${controllerUsb.x - 92} 592)`}>
        <rect width="184" height="62" rx="12" fill="#e9ecea" stroke="#879092" strokeWidth="2" />
        <path d="M138 19h30v24h-30l-12-12z" fill="#aeb7ba" stroke="#5f696c" />
        <text x="18" y="27" className={styles.physicalComponentLabel}>USB-C power</text>
        <text x="18" y="46" className={styles.physicalMetaLabel}>controller only</text>
        <path data-wire="controller-usb-power" d={`M92 0V${controllerUsb.y - 592}`} className={styles.logicPowerWire} />
      </g>

      <g role="button" tabIndex={0} aria-label={`Select ${boardLabel}`} onClick={() => onSelectItem('controller')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem('controller') }} className={styles.physicalClickable}>
        <ControllerGraphic boardProfile={boardProfile} connections={controllerConnections} selected={selectedItemId === 'controller'} />
      </g>
      {outputLayouts.map((layout) => <g key={layout.item.id} role="button" tabIndex={0} aria-label={`Select ${layout.item.title}`} onClick={() => onSelectItem(layout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(layout.item.id) }} className={styles.physicalClickable}><OutputGraphic layout={layout} selected={selectedItemId === layout.item.id} plan={plan.outputs.find((entry) => entry.itemId === layout.item.id)} /></g>)}
      {microphoneLayout && <g role="button" tabIndex={0} aria-label={`Select ${microphoneLayout.item.title}`} onClick={() => onSelectItem(microphoneLayout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(microphoneLayout.item.id) }} className={styles.physicalClickable}><MicrophoneGraphic layout={microphoneLayout} connections={micConnections} selected={selectedItemId === microphoneLayout.item.id} /></g>}
      {peripheralLayouts.map((layout) => <g key={layout.item.id} role="button" tabIndex={0} aria-label={`Select ${layout.item.title}`} onClick={() => onSelectItem(layout.item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem(layout.item.id) }} className={styles.physicalClickable}><InputGraphic layout={layout} connections={connections.filter((connection) => connection.itemId === layout.item.id)} selected={selectedItemId === layout.item.id} /></g>)}

      <g transform="translate(30 28)">
        <rect width="272" height="68" rx="8" fill="#ffffff" stroke="#d2d4d1" />
        <text x="16" y="24" className={styles.physicalLegendTitle}>GENERATED WIRING PLAN</text>
        <text x="16" y="45" className={styles.physicalLegendMeta}>{items.length + 1} graph devices · {connections.length} GPIO routes</text>
        <text x="16" y="60" className={styles.physicalLegendMeta}>{plan.ruleSetVersion}</text>
      </g>
      <g transform={`translate(804 ${canvasHeight - 22})`}>
        <line x1="0" y1="0" x2="28" y2="0" className={styles.powerWire} /><WireLabel x={36} y={4}>+5V</WireLabel>
        <line x1="80" y1="0" x2="108" y2="0" className={styles.groundWire} /><WireLabel x={116} y={4}>GND</WireLabel>
        <line x1="166" y1="0" x2="194" y2="0" className={styles.signalWire} /><WireLabel x={202} y={4}>SIGNAL</WireLabel>
      </g>
    </svg>
  )
}

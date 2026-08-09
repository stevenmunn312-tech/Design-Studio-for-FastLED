import type { ElectricalPlanSummary, OutputElectricalPlan } from '../../build/electricalPlan'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import styles from './BuildDiagramWorkspace.module.css'

export interface PhysicalDiagramConnection {
  id: string
  itemId: string
  pinLabel: string
  useLabel: string
}

interface PhysicalAssemblyDiagramProps {
  boardLabel: string
  items: HardwareManifestItem[]
  connections: PhysicalDiagramConnection[]
  plan: ElectricalPlanSummary
  selectedItemId: string
  onSelectItem: (itemId: string) => void
  exportScope?: 'current-view' | 'complete-build'
}

type ItemLayout = {
  item: HardwareManifestItem
  x: number
  y: number
  width: number
  height: number
}

const CANVAS_WIDTH = 1120

function shortBoardLabel(label: string) {
  if (label.includes('XIAO')) return 'XIAO ESP32S3'
  if (label.includes('DevKitC')) return 'ESP32-S3 DevKitC-1'
  return 'ESP32-S3 N16R8'
}

function formatAmps(valueMa: number) {
  return `${Number((valueMa / 1000).toFixed(valueMa % 1000 === 0 ? 0 : 1))}A`
}

function itemLayouts(items: HardwareManifestItem[]): ItemLayout[] {
  const outputs = items.filter((item) => item.kind === 'matrix-output')
  const peripherals = items.filter((item) => item.kind !== 'matrix-output' && item.kind !== 'mic-input')
  const layouts: ItemLayout[] = outputs.map((item, index) => ({
    item,
    x: 820,
    y: 92 + (index * 212),
    width: 252,
    height: 174,
  }))
  const microphone = items.find((item) => item.kind === 'mic-input')
  if (microphone) layouts.push({ item: microphone, x: 350, y: 62, width: 205, height: 138 })
  peripherals.forEach((item, index) => {
    layouts.push({ item, x: 330 + (index * 190), y: 500, width: 160, height: 104 })
  })
  return layouts
}

function connectionPinLabel(connection: PhysicalDiagramConnection) {
  return connection.pinLabel.replace('GPIO', 'IO')
}

function controllerConnectionY(index: number, count: number) {
  if (count <= 1) return 350
  return 252 + ((194 * index) / (count - 1))
}

function peripheralSignalOffset(item: HardwareManifestItem, index: number) {
  if (item.kind === 'pot-input') return 48
  return 24 + (index * 24)
}

function peripheralGroundOffset(item: HardwareManifestItem) {
  return item.kind === 'encoder-input' ? 94 : 82
}

function LedPixels({ x, y, width, height, count = 48 }: { x: number; y: number; width: number; height: number; count?: number }) {
  const columns = Math.max(5, Math.ceil(Math.sqrt(count * (width / height))))
  const rows = Math.max(3, Math.ceil(count / columns))
  const gapX = width / columns
  const gapY = height / rows
  return (
    <g>
      {Array.from({ length: Math.min(count, columns * rows) }, (_, index) => {
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

function ControllerGraphic({ boardLabel, connections, selected }: { boardLabel: string; connections: PhysicalDiagramConnection[]; selected: boolean }) {
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
          <circle cx="280" cy={controllerConnectionY(index, connections.length)} r="5" fill="#d9a638" stroke="#f5d16e" />
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
  const signalLabels = ['BCLK', 'WS', 'DOUT']
  return (
    <g className={selected ? styles.physicalSelected : undefined}>
      <text x={x + 102} y={y - 16} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
      <rect x={x} y={y} width="205" height="138" rx="10" fill="#12659a" stroke={selected ? '#1fa5ad' : '#0b3f62'} strokeWidth={selected ? 4 : 2} />
      <circle cx={x + 52} cy={y + 68} r="31" fill="#1b2022" stroke="#d9d9ce" strokeWidth="3" />
      <circle cx={x + 52} cy={y + 68} r="18" fill="#282e30" />
      <text x={x + 102} y={y + 28} className={styles.physicalBoardSilk}>INMP441</text>
      <g data-terminal={`${item.id}-vdd`}><circle cx={x} cy={y + 30} r="5" fill="#e8ad46" /><text x={x + 12} y={y + 34} className={styles.physicalPinLabel}>VDD 3V3</text></g>
      {connections.map((connection, index) => (
        <g key={connection.id} data-terminal={`${item.id}-${connection.id}`}>
          <circle cx={x} cy={y + 56 + (index * 24)} r="5" fill="#e8ad46" />
          <text x={x + 12} y={y + 60 + (index * 24)} className={styles.physicalPinLabel}>{signalLabels[index] ?? 'DATA'} · {connection.pinLabel}</text>
        </g>
      ))}
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
    <g className={selected ? styles.physicalSelected : undefined}>
      <text x={x + (width / 2)} y={y - 32} textAnchor="middle" className={styles.physicalComponentLabel}>{item.title}</text>
      <text x={x + (width / 2)} y={y - 14} textAnchor="middle" className={styles.physicalMetaLabel}>{item.subtitle}</text>
      <rect x={x} y={y} width={width} height="174" rx="8" fill="#202426" stroke={selected ? '#1fa5ad' : '#0f1213'} strokeWidth={selected ? 4 : 2} />
      <rect x={x + 18} y={y + 12} width={width - 30} height="140" fill="#15191a" stroke="#515759" />
      <LedPixels x={x + 23} y={y + 17} width={width - 40} height={130} />
      {[['+5V', 34], ['DIN', 66], ['GND', 98]].map(([label, offset], index) => (
        <g key={label} data-terminal={`${item.id}-${String(label).toLowerCase()}`}>
          <circle cx={x} cy={y + Number(offset)} r="6" fill={index === 0 ? '#d84836' : index === 1 ? '#3dab5b' : '#202425'} stroke="#d9a14a" strokeWidth="2" />
          <text x={x + 14} y={y + Number(offset) + 4} className={styles.physicalPinLabel}>{label}</text>
        </g>
      ))}
      {plan && <text x={x + 18} y={y + 167} className={styles.physicalBoardSubSilk}>{plan.recommendedFeedCount} FUSED FEEDS · ≤ {plan.pixelsPerFeed} PIXELS / FEED</text>}
    </g>
  )
}

function WireLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return <text x={x} y={y} className={styles.physicalWireLabel}>{children}</text>
}

export default function PhysicalAssemblyDiagram({ boardLabel, items, connections, plan, selectedItemId, onSelectItem, exportScope = 'current-view' }: PhysicalAssemblyDiagramProps) {
  const layouts = itemLayouts(items)
  const outputLayouts = layouts.filter((layout) => layout.item.kind === 'matrix-output')
  const microphoneLayout = layouts.find((layout) => layout.item.kind === 'mic-input')
  const peripheralLayouts = layouts.filter((layout) => layout.item.kind !== 'matrix-output' && layout.item.kind !== 'mic-input')
  const outputConnections = connections.filter((connection) => outputLayouts.some((layout) => layout.item.id === connection.itemId))
  const micConnections = microphoneLayout ? connections.filter((connection) => connection.itemId === microphoneLayout.item.id) : []
  const controllerConnections = [...outputConnections, ...micConnections, ...connections.filter((connection) => !outputConnections.includes(connection) && !micConnections.includes(connection))]
  const totals = plan.totals
  const totalFeedCount = plan.outputs.reduce((sum, output) => sum + output.recommendedFeedCount, 0)
  const fuseRatings = [...new Set(plan.outputs.map((output) => output.fuse.ratingMa).filter((rating): rating is number => !!rating))]
  const fuseLabel = fuseRatings.length === 1 ? formatAmps(fuseRatings[0]) : fuseRatings.length > 1 ? 'SIZED' : 'RATED'
  const hardwareBottom = Math.max(0, ...layouts.map((layout) => layout.y + layout.height))
  const distributionY = Math.max(670, hardwareBottom + 54)
  const positiveBusY = distributionY + 35
  const groundBusY = distributionY + 81
  const supplyY = positiveBusY - 18
  const canvasHeight = outputLayouts.length > 0 ? supplyY + 112 : 760
  const supplyLabel = totals
    ? totals.recommendedSupplyCount > 1
      ? `${totals.recommendedSupplyCount} × 5V ${formatAmps(totals.perSupplyCurrentMa)} supplies`
      : `5V ${formatAmps(totals.perSupplyCurrentMa)} supply`
    : '5V LED supply'

  return (
    <svg
      className={styles.physicalDiagram}
      viewBox={`0 0 ${CANVAS_WIDTH} ${canvasHeight}`}
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

      <rect width={CANVAS_WIDTH} height={canvasHeight} fill="#f4f4f1" />
      <g opacity=".23">
        {Array.from({ length: 22 }, (_, index) => <line key={`v${index}`} x1={index * 52} y1="0" x2={index * 52} y2={canvasHeight} stroke="#afb4b4" strokeWidth=".7" />)}
        {Array.from({ length: Math.ceil(canvasHeight / 52) }, (_, index) => <line key={`h${index}`} x1="0" y1={index * 52} x2={CANVAS_WIDTH} y2={index * 52} stroke="#afb4b4" strokeWidth=".7" />)}
      </g>

      <g className={styles.physicalWires}>
        {microphoneLayout && <>
          <path data-wire="microphone-vdd" d={`M280 220H320V${microphoneLayout.y + 30}H${microphoneLayout.x}`} className={styles.logicPowerWire} />
          {micConnections.map((connection, index) => {
            const controllerIndex = controllerConnections.indexOf(connection)
            return <path key={connection.id} data-wire={connection.id} d={`M280 ${controllerConnectionY(controllerIndex, controllerConnections.length)}H${310 + (index * 12)}V${microphoneLayout.y + 56 + (index * 24)}H${microphoneLayout.x}`} className={selectedItemId === 'controller' || selectedItemId === microphoneLayout.item.id ? styles.auxWire : styles.dimWire} />
          })}
          <path data-wire="microphone-ground" d={`M${microphoneLayout.x} ${microphoneLayout.y + 128}H316V476H280`} className={styles.groundWire} />
        </>}

        {outputLayouts.map((layout, index) => {
          const connection = outputConnections.find((entry) => entry.itemId === layout.item.id)
          if (!connection) return null
          const controllerIndex = controllerConnections.indexOf(connection)
          return <g key={layout.item.id}>
            <path data-wire={`${layout.item.id}-data-in`} d={`M280 ${controllerConnectionY(controllerIndex, controllerConnections.length)}H330V${260 + (index * 28)}H350`} className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.signalWire : styles.dimWire} />
            <path data-wire={`${layout.item.id}-conditioned-data`} d={`M390 ${260 + (index * 28)}H430V${324 + (index * 28)}H590V${layout.y + 66}H${layout.x}`} className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.signalWire : styles.dimWire} />
            <path data-wire={`${layout.item.id}-power`} d={`M700 ${positiveBusY}H760V${layout.y + 34}H${layout.x}`} className={styles.powerWire} />
            <path data-wire={`${layout.item.id}-ground`} d={`M700 ${groundBusY}H780V${layout.y + 98}H${layout.x}`} className={styles.groundWire} />
          </g>
        })}
        {peripheralLayouts.map((layout, layoutIndex) => {
          const peripheralConnections = connections.filter((connection) => connection.itemId === layout.item.id)
          return <g key={layout.item.id}>
            {layout.item.kind === 'pot-input' && <path data-wire={`${layout.item.id}-3v3`} d={`M280 220H${300 + (layoutIndex * 8)}V${layout.y + 18}H${layout.x}`} className={styles.logicPowerWire} />}
            {peripheralConnections.map((connection, index) => {
              const controllerIndex = controllerConnections.indexOf(connection)
              return <path key={connection.id} data-wire={connection.id} d={`M280 ${controllerConnectionY(controllerIndex, controllerConnections.length)}H${304 + (layoutIndex * 8) + (index * 4)}V${layout.y + peripheralSignalOffset(layout.item, index)}H${layout.x}`} className={selectedItemId === 'controller' || selectedItemId === layout.item.id ? styles.auxWire : styles.dimWire} />
            })}
            <path data-wire={`${layout.item.id}-ground`} d={`M${layout.x} ${layout.y + peripheralGroundOffset(layout.item)}H${316 + (layoutIndex * 8)}V476H280`} className={styles.groundWire} />
          </g>
        })}
        {outputLayouts.length > 0 && <>
          <path data-wire="level-shifter-vcc" d={`M430 300H410V236H760V${positiveBusY}`} className={styles.powerWire} />
          <path data-wire="level-shifter-ground-left" d={`M430 408H410V476H700V${groundBusY}`} className={styles.groundWire} />
          <path data-wire="level-shifter-ground-right" d={`M590 408H610V476H700V${groundBusY}`} className={styles.groundWire} />
          <path data-wire="level-shifter-oe" d={`M590 300H620V476H700V${groundBusY}`} className={styles.groundWire} />
          <path data-wire="controller-common-ground" d={`M280 476H700V${groundBusY}`} className={styles.groundWire} />
          <path data-wire="capacitor-positive" d={`M760 ${positiveBusY}V390H750`} className={styles.powerWire} />
          <path data-wire="capacitor-negative" d={`M780 ${groundBusY}V390H774`} className={styles.groundWire} />
          <path data-wire="supply-positive" d={`M860 ${positiveBusY}H824`} className={styles.powerWire} />
          <path data-wire="fuse-to-distribution" d={`M754 ${positiveBusY}H700`} className={styles.powerWire} />
          <path data-wire="supply-ground" d={`M860 ${positiveBusY + 50}H730V${groundBusY}H700`} className={styles.groundWire} />
        </>}
      </g>

      {outputLayouts.length > 0 && <g filter="url(#component-shadow)">
        {outputLayouts.map((layout, index) => (
          <g key={`${layout.item.id}-resistor`} transform={`translate(350 ${246 + (index * 28)})`}>
            <text x="20" y="-8" textAnchor="middle" className={styles.physicalComponentLabel}>330Ω</text>
            <line x1="0" y1="14" x2="7" y2="14" stroke="#269847" strokeWidth="4" />
            <rect x="7" y="4" width="26" height="20" rx="4" fill="#dfc39a" stroke="#795f38" />
            <line x1="33" y1="14" x2="40" y2="14" stroke="#269847" strokeWidth="4" />
          </g>
        ))}
        <g transform="translate(430 276)">
          <text x="80" y="-14" textAnchor="middle" className={styles.physicalComponentLabel}>74AHCT125 level shifter</text>
          <rect width="160" height="154" rx="9" fill="#292d2f" stroke="#111" strokeWidth="2" />
          <circle cx="80" cy="15" r="5" fill="#d8d9d4" />
          {[['VCC', 24], ['A1', 48], ['A2', 76], ['A3', 104], ['GND', 132]].map(([label, y]) => <g key={label}><circle cx="0" cy={Number(y)} r="6" fill="#d2d5d1" stroke="#64696a" /><text x="14" y={Number(y) + 4} className={styles.physicalChipLabel}>{label}</text></g>)}
          {[['OE', 24], ['Y1', 48], ['Y2', 76], ['Y3', 104], ['GND', 132]].map(([label, y]) => <g key={label}><circle cx="160" cy={Number(y)} r="6" fill="#d2d5d1" stroke="#64696a" /><text x="146" y={Number(y) + 4} textAnchor="end" className={styles.physicalChipLabel}>{label}</text></g>)}
        </g>
        <g transform="translate(736 350)">
          <text x="24" y="-12" textAnchor="middle" className={styles.physicalComponentLabel}>1000µF / 16V</text>
          <ellipse cx="24" cy="10" rx="20" ry="9" fill="#505659" stroke="#1b1e20" />
          <path d="M4 10v54c0 13 40 13 40 0V10" fill="#292e30" stroke="#111" strokeWidth="2" />
          <ellipse cx="24" cy="64" rx="20" ry="8" fill="#171a1b" />
          <line x1="14" y1="72" x2="14" y2="40" stroke="#d92e2e" strokeWidth="3" />
          <line x1="38" y1="72" x2="38" y2="40" stroke="#202425" strokeWidth="3" />
          <text x="2" y="42" className={styles.physicalPolarity}>+</text>
          <text x="42" y="42" className={styles.physicalPolarity}>−</text>
        </g>
        <g transform={`translate(520 ${distributionY})`}>
          <text x="90" y="-14" textAnchor="middle" className={styles.physicalComponentLabel}>Fused power distribution</text>
          <rect width="180" height="116" rx="10" fill="#263035" stroke="#111" strokeWidth="2" />
          <rect x="14" y="18" width="152" height="34" rx="6" fill="#4b2423" stroke="#a7473f" />
          <rect x="14" y="64" width="152" height="34" rx="6" fill="#1c2426" stroke="#667175" />
          <text x="90" y="40" textAnchor="middle" className={styles.physicalFuseText}>{totalFeedCount || 1} × {fuseLabel} BRANCH FUSES</text>
          <text x="90" y="86" textAnchor="middle" className={styles.physicalFuseText}>COMMON GROUND BUS</text>
        </g>
        <g transform={`translate(754 ${positiveBusY - 20})`}>
          <rect width="70" height="40" rx="8" fill="#272c2e" stroke="#111" strokeWidth="2" />
          <rect x="20" y="6" width="30" height="28" rx="5" fill="#484e50" />
          <text x="35" y="26" textAnchor="middle" className={styles.physicalFuseText}>{totals?.recommendedSupplyCount ?? 1} × MAIN</text>
        </g>
        <g transform={`translate(860 ${supplyY})`}>
          <rect width="190" height="88" rx="8" fill="url(#supply-body)" stroke="#151917" strokeWidth="2" />
          <rect x="0" y="9" width="38" height="70" rx="5" fill="#2f6b49" stroke="#163822" />
          <circle cx="0" cy="18" r="7" fill="#d84938" stroke="#f0a093" />
          <circle cx="0" cy="68" r="7" fill="#202425" stroke="#aeb6b7" />
          <text x="112" y="36" textAnchor="middle" className={styles.physicalSupplyText}>{supplyLabel}</text>
          <text x="112" y="57" textAnchor="middle" className={styles.physicalBoardSubSilk}>{totals ? `${formatAmps(totals.recommendedSupplyCurrentMa)} TOTAL · ${totals.recommendedSupplyWattage}W` : 'LED POWER'}</text>
        </g>
      </g>}

      <g filter="url(#component-shadow)" transform="translate(74 576)">
        <rect width="184" height="62" rx="12" fill="#e9ecea" stroke="#879092" strokeWidth="2" />
        <path d="M138 19h30v24h-30l-12-12z" fill="#aeb7ba" stroke="#5f696c" />
        <text x="18" y="27" className={styles.physicalComponentLabel}>USB-C power</text>
        <text x="18" y="46" className={styles.physicalMetaLabel}>controller only</text>
        <path data-wire="controller-usb-power" d="M92 0V-64" className={styles.logicPowerWire} />
      </g>

      <g role="button" tabIndex={0} aria-label={`Select ${boardLabel}`} onClick={() => onSelectItem('controller')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectItem('controller') }} className={styles.physicalClickable}>
        <ControllerGraphic boardLabel={boardLabel} connections={controllerConnections} selected={selectedItemId === 'controller'} />
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

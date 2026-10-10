import type { ElectricalPlanSummary } from '../../build/power/electricalPlan'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import { partById, partRenderSrc } from '../../build/parts/partCatalogue'
import type { BatteryBand } from './physicalDiagramLayout'
import { NetStub } from './netStubs'
import styles from './BuildDiagramWorkspace.module.css'

export const BATTERY_PAD_MM = 12

interface ModuleBox {
  item: HardwareManifestItem
  partId: string
  terminals: string[]
  x: number
  y: number
  width: number
  height: number
}

function terminalPoint(box: ModuleBox, label: string) {
  const index = box.terminals.indexOf(label)
  if (index < 0) return undefined
  return {
    x: box.x + BATTERY_PAD_MM + ((box.width - (2 * BATTERY_PAD_MM)) * ((index + 0.5) / box.terminals.length)),
    y: box.y + box.height - BATTERY_PAD_MM,
  }
}

function firstTerminal(box: ModuleBox, labels: Array<string | undefined>) {
  for (const label of labels) {
    if (!label) continue
    const point = terminalPoint(box, label)
    if (point) return { label, ...point }
  }
  return undefined
}

function tapIndex(label: string, series: number) {
  if (label === 'B-' || label === 'B0' || label === '-BAT') return 0
  if (label === 'B+' || label === '+BAT') return series
  const match = /^B(\d+)$/.exec(label)
  return match ? Math.min(series, Number(match[1])) : undefined
}

export function BatteryAssembly({ items, plan, band }: {
  items: HardwareManifestItem[]
  plan: ElectricalPlanSummary
  band: BatteryBand
}) {
  const battery = plan.battery
  if (!battery) return null
  const packItem = items.find((item) => item.id === battery.packItemId)
  if (!packItem) return null

  const x = 34
  const y = band.y + 22
  const packX = x + 18
  const packY = y + 66
  const packWidth = 300
  const packHeight = 250
  const cellWidth = packWidth / battery.pack.series
  const cellHeight = packHeight / battery.pack.parallel
  const cellRender = partRenderSrc(battery.pack.partId)
  const tapY = packY - 14
  const tapPoint = (index: number) => ({ x: packX + ((packWidth * index) / battery.pack.series), y: tapY })
  const fuseX = packX + packWidth + 42
  const fuseY = tapY - 12
  const busX = fuseX + 118
  const moduleItems = battery.modules.flatMap((module) => {
    const item = items.find((candidate) => candidate.id === module.itemId)
    const entry = partById(module.partId)
    return item && entry ? [{ module, item, entry }] : []
  })
  const moduleBoxes: ModuleBox[] = moduleItems.map(({ item, entry }, index) => ({
    item,
    partId: entry.partId,
    terminals: entry.pinLabelsLeftToRight ?? [],
    x: 570 + ((index % 2) * 260),
    y: y + 38 + (Math.floor(index / 2) * 154),
    width: 220,
    height: 120,
  }))
  const boxFor = (itemId: string | undefined) => moduleBoxes.find((box) => box.item.id === itemId)
  const protectionBox = boxFor(battery.protection?.itemId)
  const protectionNegative = protectionBox
    ? firstTerminal(protectionBox, ['B-', '-BAT'])
    : undefined
  const protectedNegative = protectionBox
    ? firstTerminal(protectionBox, ['P-'])
      ?? firstTerminal(protectionBox, battery.output?.itemId === battery.protection?.itemId ? battery.output?.spec.output?.terminals.filter((terminal) => terminal.includes('-')) ?? [] : [])
    : undefined

  return (
    <g data-battery-assembly="true" data-pack-series={battery.pack.series} data-pack-parallel={battery.pack.parallel}>
      <rect x={x} y={y} width="1052" height={band.height - 34} rx="14" fill="#eef0e9" stroke="#65716a" strokeWidth="2" />
      <text x={x + 18} y={y + 27} className={styles.physicalPowerLabel}>BATTERY ASSEMBLY · {battery.pack.series}S{battery.pack.parallel}P · {battery.window.minV}-{battery.window.ceilingV} V</text>
      <text x={x + 18} y={y + 47} className={styles.physicalMetaLabel}>P− IS SYSTEM 0 V · ONLY PROTECTION BOARD AND B0 SENSE MAY TOUCH B−</text>

      <g data-battery-pack={packItem.id}>
        <text x={packX + (packWidth / 2)} y={packY - 34} textAnchor="middle" className={styles.physicalComponentLabel}>{packItem.title}</text>
        <rect x={packX} y={packY} width={packWidth} height={packHeight} rx="10" fill="#d9ddd5" stroke="#465049" strokeWidth="2" />
        {Array.from({ length: battery.pack.cellCount }, (_, index) => {
          const column = index % battery.pack.series
          const row = Math.floor(index / battery.pack.series)
          return cellRender ? (
            <image
              key={index}
              data-battery-cell={index + 1}
              href={cellRender}
              x={packX + (column * cellWidth) + 3}
              y={packY + (row * cellHeight) + 3}
              width={cellWidth - 6}
              height={cellHeight - 6}
              preserveAspectRatio="xMidYMid meet"
              className={styles.physicalBoardRender}
            />
          ) : <rect key={index} data-battery-cell={index + 1} x={packX + (column * cellWidth) + 3} y={packY + (row * cellHeight) + 3} width={cellWidth - 6} height={cellHeight - 6} rx="5" fill="#70836e" />
        })}
        {Array.from({ length: battery.pack.series + 1 }, (_, index) => {
          const tap = tapPoint(index)
          return <g key={index} data-battery-tap={`B${index}`} data-terminal={`${packItem.id}-B${index}`}>
            <circle cx={tap.x} cy={tap.y} r="5" fill={index === battery.pack.series ? '#d84938' : '#d9a14a'} stroke="#3d4741" strokeWidth="1.5" />
            <text x={tap.x} y={tap.y - 9} textAnchor="middle" className={styles.physicalPinLabel}>{index === battery.pack.series ? `B${index} / B+` : index === 0 ? 'B0 / B−' : `B${index}`}</text>
          </g>
        })}
      </g>

      <path data-battery-wire="main-positive" d={`M${tapPoint(battery.pack.series).x} ${tapY}H${fuseX}`} className={styles.mainPowerWire} />
      <g data-battery-main-fuse={battery.mainFuse.ratingMa ?? 'unresolved'} transform={`translate(${fuseX} ${fuseY})`}>
        <rect width="82" height="24" rx="5" fill="#f4f2ea" stroke="#252b28" strokeWidth="2" />
        <line x1="8" y1="12" x2="74" y2="12" stroke="#252b28" strokeWidth="2" />
        <text x="41" y="-7" textAnchor="middle" className={styles.physicalPinLabel}>{battery.mainFuse.ratingMa ? `${battery.mainFuse.ratingMa / 1000} A` : 'RATED'} {battery.mainFuseClass?.label ?? 'FUSE'}</text>
      </g>
      <path data-battery-wire="fused-positive" d={`M${fuseX + 82} ${tapY}H${busX}`} className={styles.mainPowerWire} />
      <NetStub x={busX} y={tapY} kind="vbat" direction="right" lead={28} wireId="battery-positive-bus" />

      {protectionNegative && <path data-battery-wire="cell-negative" d={`M${tapPoint(0).x} ${tapY}V${packY - 2}H${protectionNegative.x}V${protectionNegative.y}`} className={styles.mainGroundWire} />}
      {protectedNegative && <NetStub x={protectedNegative.x} y={protectedNegative.y} kind="gnd" direction="down" lead={20} wireId="battery-protected-negative" label="P− / GND" />}

      {moduleBoxes.map((box) => {
        const module = battery.modules.find((candidate) => candidate.itemId === box.item.id)!
        const render = partRenderSrc(box.partId)
        const chargerPositive = module.spec.charger ? firstTerminal(box, [module.spec.charger.batteryTerminals[0]]) : undefined
        const chargerNegative = module.spec.charger ? firstTerminal(box, [module.spec.charger.batteryTerminals[1]]) : undefined
        const outputPositive = module.spec.output ? firstTerminal(box, module.spec.output.terminals.filter((terminal) => terminal.includes('+') || terminal === '5V')) : undefined
        const outputNegative = module.spec.output ? firstTerminal(box, module.spec.output.terminals.filter((terminal) => terminal.includes('-') || terminal === 'GND')) : undefined
        const isProtection = module.itemId === battery.protection?.itemId
        const branchFuseX = box.x - 28
        const branchFuseY = box.y + 34
        return <g key={box.item.id} data-battery-module={box.partId}>
          <text x={box.x + (box.width / 2)} y={box.y - 7} textAnchor="middle" className={styles.physicalComponentLabel}>{box.item.title}</text>
          <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="8" fill="#d8ddd9" stroke="#4d5852" />
          {render && <image data-component-render={box.partId} href={render} x={box.x + 8} y={box.y + 8} width={box.width - 16} height={box.height - 38} preserveAspectRatio="xMidYMid meet" className={styles.physicalBoardRender} />}
          {box.terminals.map((terminal, index) => {
            const point = terminalPoint(box, terminal)!
            return <g key={`${terminal}-${index}`} data-battery-terminal={`${box.partId}:${terminal}`}>
              <circle cx={point.x} cy={point.y} r="4" fill={terminal.includes('-') || terminal === 'GND' ? '#202425' : terminal.includes('+') ? '#d84938' : '#d9a14a'} stroke="#f2c766" />
              <text x={point.x} y={point.y + 14} textAnchor="middle" className={styles.physicalPinLabel}>{terminal}</text>
            </g>
          })}
          {module.spec.balance?.balanceTerminals.map((terminal) => {
            const index = tapIndex(terminal, battery.pack.series)
            const terminalAt = terminalPoint(box, terminal)
            if (index === undefined || !terminalAt) return null
            const tap = tapPoint(index)
            return <path key={terminal} data-battery-sense={terminal} d={`M${tap.x} ${tap.y}V${packY - 4 - (index * 3)}H${terminalAt.x}V${terminalAt.y}`} className={styles.batterySenseWire} />
          })}
          {module.spec.charger && chargerPositive && <>
            <path data-battery-wire={`charger-positive:${box.partId}`} d={`M${busX} ${tapY}V${branchFuseY + 8}H${branchFuseX}`} className={styles.mainPowerWire} />
            <g data-battery-charger-fuse={box.partId} transform={`translate(${branchFuseX} ${branchFuseY})`}>
              <rect width="42" height="16" rx="3" fill="#f4f2ea" stroke="#252b28" />
              <line x1="5" y1="8" x2="37" y2="8" stroke="#252b28" />
            </g>
            <path data-battery-wire={`charger-fused:${box.partId}`} d={`M${branchFuseX + 42} ${branchFuseY + 8}H${chargerPositive.x}V${chargerPositive.y}`} className={styles.mainPowerWire} />
          </>}
          {module.spec.charger && chargerNegative && !isProtection && <NetStub x={chargerNegative.x} y={chargerNegative.y} kind="gnd" direction="down" lead={20} wireId={`charger-negative:${box.partId}`} label="P− / GND" />}
          {module.spec.output && outputPositive && <NetStub x={outputPositive.x} y={outputPositive.y} kind="v5" direction="down" lead={20} wireId={`battery-output-positive:${box.partId}`} />}
          {module.spec.output && outputNegative && <NetStub x={outputNegative.x} y={outputNegative.y} kind="gnd" direction="down" lead={20} wireId={`battery-output-negative:${box.partId}`} label="P− / GND" />}
        </g>
      })}
    </g>
  )
}

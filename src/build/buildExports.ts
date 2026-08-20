import type { PhysicalBoardProfile } from './boardProfiles'
import type { BuildProfile } from './buildProfile'
import type { ElectricalPlanSummary } from './electricalPlan'
import { boardPinLabelForUse, type HardwareManifest, type HardwareManifestItem, type HardwarePinUse } from './hardwareManifest'
import { fuseBlockAllocations } from './powerDistribution'

export interface BuildConnectionRow {
  from: string
  fromTerminal: string
  to: string
  toTerminal: string
  purpose: string
}

export interface BuildBomRow {
  quantity: string
  item: string
  specification: string
  status: 'configured' | 'calculated' | 'unresolved'
}

export interface BuildExportMetadata {
  status: string
  ruleSetVersion: string
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function formatAmps(valueMa: number): string {
  return `${Number((valueMa / 1000).toFixed(valueMa % 1000 === 0 ? 0 : 1))} A`
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function buildConnectionRows(
  items: HardwareManifestItem[],
  plan: ElectricalPlanSummary,
  exactBoard?: PhysicalBoardProfile,
): BuildConnectionRow[] {
  const rows: BuildConnectionRow[] = []
  const controller = exactBoard?.label ?? 'Controller'
  const outputs = items.filter((item) => item.kind === 'matrix-output')
  const nonOutputs = items.filter((item) => item.kind !== 'matrix-output')
  const boardTerminal = (pin: HardwarePinUse) => boardPinLabelForUse(exactBoard, pin)
  const includedOutputIds = new Set(outputs.map((output) => output.id))
  const includedPlanOutputs = plan.outputs.filter((output) => includedOutputIds.has(output.itemId))
  const logicSupplyId = includedPlanOutputs.flatMap((output) => output.injections)
    .find((injection) => injection.supplyId)?.supplyId ?? 'supply-1'
  const logicDistribution = `5 V PSU ${logicSupplyId.replace('supply-', '')} fuse-block distribution`

  rows.push({ from: 'USB-C power source', fromTerminal: 'USB-C', to: controller, toTerminal: 'USB-C power', purpose: 'Controller power only' })

  for (const item of nonOutputs) {
    for (const pin of item.pins) {
      rows.push({
        from: controller,
        fromTerminal: boardTerminal(pin),
        to: item.title,
        toTerminal: pin.label,
        purpose: 'Signal',
      })
    }
    if (item.kind === 'mic-input' || item.kind === 'pot-input' || item.kind === 'rtc-input') {
      rows.push({ from: controller, fromTerminal: '3V3', to: item.title, toTerminal: item.kind === 'mic-input' ? 'VDD' : '3V3', purpose: 'Logic power' })
    }
    rows.push({ from: controller, fromTerminal: 'GND', to: item.title, toTerminal: 'GND', purpose: 'Common ground reference' })
  }

  outputs.forEach((item, outputIndex) => {
    const pin = item.pins[0]
    if (!pin) return
    const outputPlan = includedPlanOutputs.find((output) => output.itemId === item.id)
    const chip = Math.floor(outputIndex / 4) + 1
    const channel = (outputIndex % 4) + 1
    const shifter = `74AHCT125 level shifter ${chip}`
    const resistor = `${item.title} 330 ohm data resistor`
    rows.push({ from: controller, fromTerminal: boardTerminal(pin), to: shifter, toTerminal: `A${channel}`, purpose: '3.3 V LED data' })
    rows.push({ from: shifter, fromTerminal: `Y${channel}`, to: resistor, toTerminal: 'Input', purpose: '5 V conditioned LED data' })
    rows.push({
      from: resistor,
      fromTerminal: 'Output',
      to: item.title,
      toTerminal: 'DIN',
      purpose: outputPlan?.operatingCurrentCapMa != null
        ? `Series-protected LED data; configured FastLED current limit ${outputPlan.operatingCurrentCapMa} mA`
        : 'Series-protected LED data',
    })
    rows.push({ from: shifter, fromTerminal: `/OE${channel}`, to: 'Common ground bus', toTerminal: 'GND', purpose: 'Enable level-shifter channel' })
  })
  if (outputs.length > 0) {
    rows.push({ from: controller, fromTerminal: 'GND', to: 'Common ground bus', toTerminal: 'GND', purpose: 'Common ground reference' })
    for (let chip = 1; chip <= Math.ceil(outputs.length / 4); chip += 1) {
      rows.push({ from: logicDistribution, fromTerminal: '+5V bus', to: `74AHCT125 level shifter ${chip}`, toTerminal: 'VCC', purpose: 'Level-shifter power' })
      rows.push({ from: 'Common ground bus', fromTerminal: 'GND', to: `74AHCT125 level shifter ${chip}`, toTerminal: 'GND', purpose: 'Level-shifter ground' })
    }
  }

  const includedInjections = includedPlanOutputs.flatMap((output) => output.injections)
  const includedInjectionIds = new Set(includedInjections.map((injection) => injection.id))
  for (const supply of plan.totals?.supplies ?? []) {
    const supplyInjections = includedInjections.filter((injection) =>
      injection.supplyId === supply.id && includedInjectionIds.has(injection.id))
    if (supplyInjections.length === 0) continue
    const supplyLabel = `5 V PSU ${supply.id.replace('supply-', '')}`
    const distribution = `${supplyLabel} fuse-block distribution`
    rows.push({ from: supplyLabel, fromTerminal: '+5V', to: distribution, toTerminal: 'Positive input stud', purpose: 'DC supply positive' })
    rows.push({ from: supplyLabel, fromTerminal: 'GND', to: distribution, toTerminal: 'Common negative bus', purpose: 'DC supply return' })
    for (const injection of supplyInjections) {
      const destination = `${injection.outputTitle} ${injection.role} injection @ ${injection.positionMm} mm`
      const fuse = `${destination} ${injection.fuse.ratingMa ?? 'rated'} mA branch fuse`
      const capacitor = `${destination} 1000 uF 6.3 V electrolytic capacitor`
      rows.push({ from: distribution, fromTerminal: '+5V bus', to: fuse, toTerminal: 'Input', purpose: `${injection.designCurrentMa} mA protected branch` })
      rows.push({ from: fuse, fromTerminal: 'Output', to: capacitor, toTerminal: '+', purpose: 'Fused capacitor positive' })
      rows.push({ from: distribution, fromTerminal: 'Common negative bus', to: capacitor, toTerminal: '-', purpose: 'Capacitor negative and branch return' })
      rows.push({ from: capacitor, fromTerminal: '+', to: destination, toTerminal: '+5V', purpose: `Power injection via ${injection.conductor ? `AWG ${injection.conductor.awg}` : 'rated'} copper pair` })
      rows.push({ from: capacitor, fromTerminal: '-', to: destination, toTerminal: 'GND', purpose: 'Power-injection return' })
    }
  }
  const includedSupplyIds = [...new Set(includedInjections.map((injection) => injection.supplyId).filter(Boolean))]
  for (const supplyId of includedSupplyIds.slice(1)) {
    rows.push({ from: `5 V PSU ${String(supplyId).replace('supply-', '')}`, fromTerminal: 'GND', to: 'Common ground bus', toTerminal: 'GND', purpose: 'Shared data-reference ground; keep +5 V zones isolated' })
  }
  return rows
}

export function buildBomRows(
  manifest: HardwareManifest,
  plan: ElectricalPlanSummary,
  _buildProfile: BuildProfile,
  exactBoard?: PhysicalBoardProfile,
  includedItemIds?: Set<string>,
): BuildBomRow[] {
  const include = (item: HardwareManifestItem) => !includedItemIds || includedItemIds.has(item.id)
  const items = manifest.primaryItems.filter(include)
  const rows: BuildBomRow[] = []
  const outputPlanByItemId = new Map(plan.outputs.map((output) => [output.itemId, output]))
  if (exactBoard) rows.push({ quantity: '1', item: exactBoard.label, specification: exactBoard.confidence.replace(/-/g, ' '), status: 'configured' })
  for (const item of items) {
    const outputPlan = outputPlanByItemId.get(item.id)
    const limit = outputPlan?.operatingCurrentCapMa != null
      ? `; configured FastLED current limit ${formatAmps(outputPlan.operatingCurrentCapMa)}; uncapped full-white ceiling ${formatAmps(outputPlan.designCurrentMa)}`
      : ''
    rows.push({ quantity: '1', item: item.title, specification: `${item.subtitle}${limit}`, status: 'configured' })
  }
  const outputs = plan.outputs.filter((output) => items.some((item) => item.id === output.itemId))
  if (outputs.length > 0) {
    rows.push({ quantity: String(Math.ceil(outputs.length / 4)), item: '74AHCT125 level shifter', specification: '5 V supply, TTL-compatible input; one channel per LED data route', status: 'calculated' })
    rows.push({ quantity: String(outputs.length), item: 'Data-line resistor', specification: '330 ohm at each LED data entry', status: 'calculated' })
  }
  if (plan.totals && outputs.length > 0) {
    const outputIds = new Set(outputs.map((output) => output.itemId))
    const includedInjectionIds = new Set(outputs.flatMap((output) => output.injections.map((injection) => injection.id)))
    const supplies = plan.totals.supplies.filter((supply) => supply.outputIds.some((id) => outputIds.has(id))
      && supply.injectionIds.some((id) => includedInjectionIds.has(id)))
    for (const supply of supplies) {
      const sizingBasis = supply.psuSizingCurrentMa < supply.designCurrentMa
        ? `derived from ${formatAmps(supply.psuSizingCurrentMa)} configured operating budget with ${plan.totals.headroomPercent}% target headroom; ${formatAmps(supply.designCurrentMa)} uncapped full-white ceiling; use a quality supply with overload and short-circuit protection`
        : `derived from worst-case load with ${plan.totals.headroomPercent}% target headroom`
      rows.push({ quantity: '1', item: `Recommended 5 V DC power supply ${supply.id.replace('supply-', '')}`, specification: `5 V, ${formatAmps(supply.recommendedCurrentMa)}, ${supply.recommendedWattage} W continuous; ${sizingBasis}`, status: 'calculated' })
      const feedCount = supply.injectionIds.filter((id) => includedInjectionIds.has(id)).length
      for (const [blockIndex, block] of fuseBlockAllocations(feedCount).entries()) {
        rows.push({
          quantity: '1',
          item: `${supply.id} fuse block ${blockIndex + 1}`,
          specification: `${block.circuitCount}-circuit fixed fuse block with common negative bus; ${block.assignedFeedCount} circuit${block.assignedFeedCount === 1 ? '' : 's'} used`,
          status: 'calculated',
        })
      }
    }
    rows.push({ quantity: String(includedInjectionIds.size), item: 'Power-output electrolytic capacitor', specification: '1000 uF, 6.3 V, good-quality low-ESR radial electrolytic; one correctly polarized across +5 V and GND after every branch fuse', status: 'calculated' })
  }
  for (const output of outputs) {
    for (const injection of output.injections) {
      const location = `${injection.role} @ ${injection.positionMm} mm`
      rows.push({ quantity: '1 run', item: `${output.title} ${location} feed conductor`, specification: injection.conductor ? `AWG ${injection.conductor.awg} / ${injection.conductor.crossSectionMm2} mm2 ${injection.conductor.material} minimum, ${injection.conductor.oneWayLengthMm} mm one-way, ${injection.conductor.voltageDrop} V calculated drop` : 'Unresolved conductor size', status: injection.conductor ? 'calculated' : 'unresolved' })
      rows.push({ quantity: '1', item: `${output.title} ${location} connector`, specification: injection.connectorMinimumMa ? `${injection.connectorMinimumMa} mA minimum continuous rating` : 'Unresolved connector rating', status: injection.connectorMinimumMa ? 'calculated' : 'unresolved' })
      rows.push({ quantity: '1', item: `${output.title} ${location} branch fuse`, specification: injection.fuse.ratingMa ? `${injection.fuse.ratingMa} mA` : injection.fuse.unresolvedReason ?? 'Unresolved fuse rating', status: injection.fuse.ratingMa ? 'calculated' : 'unresolved' })
    }
  }
  return rows
}

export function connectionsCsv(rows: BuildConnectionRow[], metadata?: BuildExportMetadata): string {
  const metadataHeaders = metadata ? ['Export status', 'Rule set'] : []
  return rowsToCsv(
    ['From', 'From terminal', 'To', 'To terminal', 'Purpose', ...metadataHeaders],
    rows.map((row) => [
      row.from,
      row.fromTerminal,
      row.to,
      row.toTerminal,
      row.purpose,
      ...(metadata ? [metadata.status, metadata.ruleSetVersion] : []),
    ]),
  )
}

export function bomCsv(rows: BuildBomRow[], metadata?: BuildExportMetadata): string {
  const metadataHeaders = metadata ? ['Export status', 'Rule set'] : []
  return rowsToCsv(
    ['Quantity', 'Item', 'Specification', 'Status', ...metadataHeaders],
    rows.map((row) => [
      row.quantity,
      row.item,
      row.specification,
      row.status,
      ...(metadata ? [metadata.status, metadata.ruleSetVersion] : []),
    ]),
  )
}

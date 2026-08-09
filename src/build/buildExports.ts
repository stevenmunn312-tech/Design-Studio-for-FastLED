import type { PhysicalBoardProfile } from './boardProfiles'
import type { BuildProfile } from './buildProfile'
import type { ElectricalPlanSummary } from './electricalPlan'
import type { HardwareManifest, HardwareManifestItem } from './hardwareManifest'

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

export function rowsToCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function buildConnectionRows(
  items: HardwareManifestItem[],
  plan: ElectricalPlanSummary,
  exactBoard?: PhysicalBoardProfile,
): BuildConnectionRow[] {
  const rows: BuildConnectionRow[] = []
  for (const item of items) {
    for (const pin of item.pins) {
      rows.push({
        from: exactBoard?.label ?? 'Controller',
        fromTerminal: `GPIO ${pin.pin}`,
        to: item.title,
        toTerminal: pin.label,
        purpose: item.kind === 'matrix-output' ? 'Conditioned LED data' : 'Signal',
      })
    }
    rows.push({ from: exactBoard?.label ?? 'Controller', fromTerminal: 'GND', to: item.title, toTerminal: 'GND', purpose: 'Common ground reference' })
  }
  for (const output of plan.outputs.filter((entry) => items.some((item) => item.id === entry.itemId))) {
    rows.push({ from: 'LED supply / distribution', fromTerminal: `+${output.nominalVoltage} V`, to: output.title, toTerminal: '+V through branch fuse', purpose: 'Direct LED load power' })
    rows.push({ from: 'LED supply / distribution', fromTerminal: 'GND', to: output.title, toTerminal: 'GND', purpose: 'LED load return' })
  }
  return rows
}

export function buildBomRows(
  manifest: HardwareManifest,
  plan: ElectricalPlanSummary,
  buildProfile: BuildProfile,
  exactBoard?: PhysicalBoardProfile,
  includedItemIds?: Set<string>,
): BuildBomRow[] {
  const include = (item: HardwareManifestItem) => !includedItemIds || includedItemIds.has(item.id)
  const items = manifest.primaryItems.filter(include)
  const rows: BuildBomRow[] = []
  if (exactBoard) rows.push({ quantity: '1', item: exactBoard.label, specification: exactBoard.confidence.replace(/-/g, ' '), status: 'configured' })
  for (const item of items) rows.push({ quantity: '1', item: item.title, specification: item.subtitle, status: 'configured' })
  const outputs = plan.outputs.filter((output) => items.some((item) => item.id === output.itemId))
  if (outputs.length > 0) {
    rows.push({ quantity: String(Math.ceil(outputs.length / 4)), item: '74AHCT125 level shifter', specification: '5 V supply, TTL-compatible input; one channel per LED data route', status: 'calculated' })
    rows.push({ quantity: String(outputs.length), item: 'Data-line resistor', specification: '330 ohm at each LED data entry', status: 'calculated' })
    rows.push({ quantity: String(outputs.length), item: 'Bulk capacitor', specification: '1000 uF, voltage rating above branch voltage, correctly polarized', status: 'calculated' })
  }
  for (const output of outputs) {
    rows.push({ quantity: '1', item: `${output.title} supply branch`, specification: `${output.nominalVoltage} V, ${output.recommendedSupplyCurrentMa} mA continuous, ${output.recommendedSupplyWattage} W including headroom`, status: buildProfile.ownedParts?.supplyAssignments?.[output.itemId] ? 'configured' : 'calculated' })
    rows.push({ quantity: '1 run', item: `${output.title} feed conductor`, specification: output.conductor ? `AWG ${output.conductor.awg} / ${output.conductor.crossSectionMm2} mm2 ${output.conductor.material}, ${output.conductor.oneWayLengthMm} mm one-way, ${output.conductor.voltageDropPercent}% drop` : 'Unresolved conductor size', status: output.conductor ? 'calculated' : 'unresolved' })
    rows.push({ quantity: '1', item: `${output.title} connector`, specification: output.connectorMinimumMa ? `${output.connectorMinimumMa} mA minimum continuous rating` : 'Unresolved connector rating', status: output.connectorMinimumMa ? 'calculated' : 'unresolved' })
    rows.push({ quantity: '1', item: `${output.title} branch fuse`, specification: output.fuse.ratingMa ? `${output.fuse.ratingMa} mA` : output.fuse.unresolvedReason ?? 'Unresolved fuse rating', status: output.fuse.ratingMa ? 'calculated' : 'unresolved' })
    rows.push({ quantity: output.injectionPointsMm.length ? String(output.injectionPointsMm.length) : '-', item: `${output.title} injection feeds`, specification: output.injectionPointsMm.length ? output.injectionPointsMm.map((point) => `${point} mm`).join(', ') : output.injectionUnresolvedReason ?? 'Unresolved', status: output.injectionPointsMm.length ? 'configured' : 'unresolved' })
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

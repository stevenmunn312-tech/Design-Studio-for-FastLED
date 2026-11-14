import {
  PART_CATALOGUE,
  partById,
  type PartBatteryCellSpec,
  type PartBatteryModuleSpec,
  type PartPowerConverterSpec,
} from '../../build/parts/partCatalogue'

export const BATTERY_PACK_NODE_TYPE = 'BatteryPack'
export const BATTERY_MODULE_NODE_TYPE = 'BatteryModule'
export const DEFAULT_BATTERY_CELL_PART_ID = 'samsung-inr18650-35e'

export interface BatteryPackFacts {
  partId: string
  label: string
  series: number
  parallel: number
  cellCount: number
  chemistry: PartBatteryCellSpec['chemistry']
  nominalV: number
  capacityAh: number
  energyWh: number
  maxContinuousDischargeMa: number
  maxChargeMa: number
}

export interface BatterySourceWindow {
  minV: number
  fullV: number
  ceilingV: number
}

export function batteryCellSpec(partId: unknown): PartBatteryCellSpec | undefined {
  return partById(String(partId ?? ''))?.batteryCell
}

export function batteryModuleSpec(partId: unknown): PartBatteryModuleSpec | undefined {
  return partById(String(partId ?? ''))?.batteryModule
}

/** The `use` property's values, which are also what its field shows. */
export const BATTERY_MODULE_USES = ['Protection and charging', 'Charging only'] as const
export const BATTERY_MODULE_CHARGE_ONLY = BATTERY_MODULE_USES[1]

/**
 * A board that both protects and charges can be wired as a charger alone,
 * beside a protection board with a higher rating: its battery pads go to the
 * protected bus and its own protected output is left unused. A board with a
 * regulated output cannot, since that output runs through its protection.
 */
export function batteryModuleCanChargeOnly(spec: PartBatteryModuleSpec | undefined): boolean {
  return Boolean(spec?.protection && spec.charger && !spec.output)
}

/**
 * The functions this board provides as it is wired on the bench. Every reader
 * of a bench board's functions asks this, not `batteryModuleSpec`, so a board
 * set to charge only is never also counted as the pack's protection.
 */
export function batteryModuleSpecFor(partId: unknown, use: unknown): PartBatteryModuleSpec | undefined {
  const spec = batteryModuleSpec(partId)
  if (!spec || use !== BATTERY_MODULE_CHARGE_ONLY || !batteryModuleCanChargeOnly(spec)) return spec
  const chargerOnly = { ...spec }
  delete chargerOnly.protection
  return chargerOnly
}

const BATTERY_FUNCTION_KEYS = ['protection', 'balance', 'charger', 'output'] as const
export type BatteryFunction = typeof BATTERY_FUNCTION_KEYS[number]

export function batteryFunctions(spec: PartBatteryModuleSpec | undefined): BatteryFunction[] {
  return spec ? BATTERY_FUNCTION_KEYS.filter((key) => Boolean(spec[key])) : []
}

export function batteryCellPartIds(): string[] {
  return Object.values(PART_CATALOGUE).filter((entry) => entry.batteryCell).map((entry) => entry.partId)
}

export function batteryModulePartIds(): string[] {
  return Object.values(PART_CATALOGUE).filter((entry) => entry.batteryModule).map((entry) => entry.partId)
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Math.round(Number(value))
  return Number.isFinite(number) && number > 0 ? number : fallback
}

export function packFacts(
  partId: unknown,
  seriesValue: unknown,
  parallelValue: unknown,
): BatteryPackFacts | undefined {
  const id = String(partId ?? '')
  const entry = partById(id)
  const cell = entry?.batteryCell
  if (!entry || !cell) return undefined
  const series = positiveInteger(seriesValue, 1)
  const parallel = positiveInteger(parallelValue, 1)
  const capacityAh = (cell.capacityMah * parallel) / 1000
  const nominalV = cell.nominalV * series
  return {
    partId: id,
    label: entry.label,
    series,
    parallel,
    cellCount: series * parallel,
    chemistry: cell.chemistry,
    nominalV: Number(nominalV.toFixed(2)),
    capacityAh: Number(capacityAh.toFixed(3)),
    energyWh: Number((nominalV * capacityAh).toFixed(2)),
    maxContinuousDischargeMa: cell.maxContinuousDischargeMa * parallel,
    maxChargeMa: cell.maxChargeMa * parallel,
  }
}

export function packWindow(
  pack: BatteryPackFacts,
  protection?: PartBatteryModuleSpec['protection'],
  charger?: PartBatteryModuleSpec['charger'],
): BatterySourceWindow | undefined {
  const cell = batteryCellSpec(pack.partId)
  if (!cell) return undefined
  const chargeV = charger?.chargeVPerCell ?? cell.chargeV
  const overchargeV = protection?.overchargeV ?? chargeV
  const minimumV = protection?.overDischargeV ?? cell.dischargeCutoffV
  return {
    minV: Number((pack.series * minimumV).toFixed(2)),
    fullV: Number((pack.series * chargeV).toFixed(2)),
    ceilingV: Number((pack.series * Math.max(chargeV, overchargeV)).toFixed(2)),
  }
}

export function prospectiveShortCircuitA(pack: BatteryPackFacts): number | undefined {
  const cell = batteryCellSpec(pack.partId)
  if (!cell || cell.internalResistanceMohm <= 0) return undefined
  return Math.ceil((pack.parallel * cell.chargeV) / (cell.internalResistanceMohm / 1000))
}

const CELL_POSITIVE_NAMES = ['B+', '+BAT', 'BAT+']
const CELL_NEGATIVE_NAMES = ['B-', '-BAT', 'BAT-', 'B0']
const PROTECTED_POSITIVE_NAMES = ['P+', 'OUT+']
// `C-` is the charge-and-load negative on boards that share the cell positive.
const PROTECTED_NEGATIVE_NAMES = ['P-', 'OUT-', 'C-']

export interface ProtectionPads {
  cellPositive?: string
  cellNegative?: string
  /** Pad the battery main fuse leaves. Equals the cell positive when the board has no separate protected positive. */
  protectedPositive?: string
  protectedNegative?: string
}

function firstNamed(terminals: readonly string[], names: readonly string[]): string | undefined {
  return names.find((name) => terminals.includes(name))
}

/**
 * Cell pads and the protected port, by role rather than one spelling.
 * `5V+` stays out of the protected-positive list: that name is a regulated
 * output, and the pack fuse must not land on it.
 */
export function protectionPads(
  powerTerminals: readonly string[],
  outputTerminals: readonly string[] = [],
): ProtectionPads {
  const cellPositive = firstNamed(powerTerminals, CELL_POSITIVE_NAMES)
  const cellNegative = firstNamed(powerTerminals, CELL_NEGATIVE_NAMES)
  const outputNegative = outputTerminals.find((terminal) => terminal.includes('-') || terminal === 'GND')
  return {
    cellPositive,
    cellNegative,
    protectedPositive: firstNamed(powerTerminals, PROTECTED_POSITIVE_NAMES) ?? cellPositive,
    protectedNegative: firstNamed(powerTerminals, PROTECTED_NEGATIVE_NAMES)
      ?? (outputNegative && powerTerminals.includes(outputNegative) ? outputNegative : undefined),
  }
}

/** A combined protection/charger board already joins these pads to the cells. */
export function chargerUsesCellPads(
  chargerItemId: string,
  protectionItemId: string | undefined,
  batteryTerminals: readonly [string, string],
  pads: ProtectionPads | undefined,
): boolean {
  if (!protectionItemId || chargerItemId !== protectionItemId) return false
  if (!pads?.cellPositive || !pads.cellNegative) return false
  return batteryTerminals[0] === pads.cellPositive && batteryTerminals[1] === pads.cellNegative
}

/** Adapt a board's integrated 5 V output to the normal rail-converter contract. */
export function batteryOutputConverterSpec(
  module: PartBatteryModuleSpec,
): PartPowerConverterSpec | undefined {
  const output = module.output
  if (!output) return undefined
  const protection = module.protection
  return {
    role: 'led-rail',
    topology: `${output.topology} (integrated pack output)`,
    inputMinV: protection?.overDischargeV ?? 0,
    inputMaxV: protection?.overchargeV ?? Number.POSITIVE_INFINITY,
    minHeadroomV: 0,
    outputSetV: output.outputV,
    continuousCurrentMa: output.continuousMa,
    peakCurrentMa: output.continuousMa,
    typicalEfficiency: output.typicalEfficiency,
    isolated: false,
    adjustable: false,
    terminals: output.terminals,
  }
}

export function batteryPackFootprint(partId: unknown, seriesValue: unknown, parallelValue: unknown) {
  const entry = partById(String(partId ?? ''))
  if (!entry?.batteryCell) return undefined
  const series = positiveInteger(seriesValue, 1)
  const parallel = positiveInteger(parallelValue, 1)
  return {
    width: entry.dimensionsMm.width * series,
    height: entry.dimensionsMm.height * parallel,
  }
}

export function batteryModuleSummary(partId: unknown): string | undefined {
  const spec = batteryModuleSpec(partId)
  if (!spec) return undefined
  const functions = [
    spec.protection && 'protection',
    spec.balance && `${spec.balance.type} balance`,
    spec.charger && 'charger',
    spec.output && `${spec.output.outputV} V output`,
  ].filter((value): value is string => Boolean(value))
  return `${spec.series}S ${spec.chemistries.join('/')} · ${functions.join(', ')}`
}

import type { HardwareManifest, HardwareManifestItem } from '../hardwareManifest'
import { partById, type PartBatteryModuleSpec } from '../parts/partCatalogue'
import {
  batteryCellSpec,
  batteryModuleSpec,
  packFacts,
  packWindow,
  type BatteryPackFacts,
  type BatterySourceWindow,
} from '../../state/peripherals/battery'
import { recommendConductor, recommendFuse, standardFuseRatingFor, type ConductorRecommendation, type FuseRecommendation } from './electricalRules'
import type { ElectricalPlanIssue, ElectricalPlanTotals, ControllerSupplyPlan } from './electricalPlan'
import type { PlanSource } from './planSource'

export interface BatteryPlanModule {
  itemId: string
  partId: string
  label: string
  spec: PartBatteryModuleSpec
}

export interface BatteryPlan {
  packItemId: string
  pack: BatteryPackFacts
  modules: BatteryPlanModule[]
  window: BatterySourceWindow
  dischargeDesignCurrentMa: number
  mainFuse: FuseRecommendation
  trunkConductor?: ConductorRecommendation
  limitedBy: string
  runtimeHours?: number
  limitedRuntimeHours?: number
  charger?: BatteryPlanModule
  protection?: BatteryPlanModule
  balance?: BatteryPlanModule
  output?: BatteryPlanModule
}

export interface BatteryPlanResult {
  source?: Extract<PlanSource, { kind: 'battery' }>
  battery?: BatteryPlan
  blockers: ElectricalPlanIssue[]
  warnings: ElectricalPlanIssue[]
  recommendations: string[]
}

function modulesFor(manifest: HardwareManifest): BatteryPlanModule[] {
  return manifest.items.flatMap((item) => {
    if (item.kind !== 'battery-module') return []
    const partId = String(item.facts.partId ?? '')
    const spec = batteryModuleSpec(partId)
    return spec ? [{ itemId: item.id, partId, label: item.title, spec }] : []
  })
}

function packItems(manifest: HardwareManifest): HardwareManifestItem[] {
  return manifest.items.filter((item) => item.kind === 'battery-pack')
}

export function batterySourceFor(manifest: HardwareManifest): Extract<PlanSource, { kind: 'battery' }> | undefined {
  const item = packItems(manifest).find((candidate) => candidate.supported)
  if (!item) return undefined
  const pack = packFacts(item.facts.partId, item.facts.series, item.facts.parallel)
  if (!pack) return undefined
  const modules = modulesFor(manifest)
  const protection = modules.find((module) => module.spec.protection)?.spec.protection
  const charger = modules.find((module) => module.spec.charger)?.spec.charger
  const window = packWindow(pack, protection, charger)
  return window ? { kind: 'battery', packItemId: item.id, ...window } : undefined
}

function issue(id: string, severity: 'blocking' | 'warning', title: string, detail: string): ElectricalPlanIssue {
  return { id, severity, title, detail }
}

function formatCurrent(valueMa: number): string {
  return valueMa >= 1000 ? `${Number((valueMa / 1000).toFixed(2))} A` : `${Math.round(valueMa)} mA`
}

export function planBattery(
  manifest: HardwareManifest,
  totals: ElectricalPlanTotals | undefined,
  controllerSupply: ControllerSupplyPlan | undefined,
): BatteryPlanResult {
  const packs = packItems(manifest)
  const modules = modulesFor(manifest)
  const blockers: ElectricalPlanIssue[] = []
  const warnings: ElectricalPlanIssue[] = []
  const recommendations: string[] = []

  if (packs.length > 1) {
    blockers.push(issue('battery-pack-count', 'blocking', 'Battery pack', `${packs.length} battery packs are on the bench. Keep one shared DC source.`))
  }
  if (packs.length === 0) {
    if (modules.length > 0) warnings.push(issue('battery-module-orphan', 'warning', 'Pack electronics', 'Pack electronics are on the bench without a battery pack.'))
    return { blockers, warnings, recommendations }
  }

  const packItem = packs.find((candidate) => candidate.supported)
  if (!packItem) return { blockers, warnings, recommendations }
  const pack = packFacts(packItem.facts.partId, packItem.facts.series, packItem.facts.parallel)
  const cell = batteryCellSpec(packItem.facts.partId)
  if (!pack || !cell) return { blockers, warnings, recommendations }

  const providers = (functionName: keyof Pick<PartBatteryModuleSpec, 'protection' | 'balance' | 'charger' | 'output'>) =>
    modules.filter((module) => Boolean(module.spec[functionName]))
  const duplicateFunctions = (['protection', 'balance', 'charger', 'output'] as const)
    .map((functionName) => ({ functionName, count: providers(functionName).length }))
    .filter(({ count }) => count > 1)
  if (duplicateFunctions.length > 0) {
    blockers.push(issue('battery-function-count', 'blocking', 'Pack electronics', `${duplicateFunctions.map(({ functionName, count }) => `${count} boards provide ${functionName}`).join('; ')}. Keep one provider for each pack function.`))
  }

  const protection = providers('protection')[0]
  const balance = providers('balance')[0]
  const charger = providers('charger')[0]
  const output = providers('output')[0]
  if (!protection) blockers.push(issue('battery-no-protection', 'blocking', 'Battery protection', 'No board protects the pack. Add a protection board matched to its series count and chemistry.'))
  if (protection && (protection.spec.protection?.port !== 'common' || protection.spec.protection?.switchedLine !== 'negative')) {
    blockers.push(issue('battery-protection-unsupported', 'blocking', protection.label, 'Only common-port, negative-switched protection is planned. This board needs a different wiring model.'))
  }
  if (pack.series > 1 && !balance) warnings.push(issue('battery-no-balance', 'warning', 'Cell balancing', `${pack.series} cells are in series, but no board balances them.`))

  for (const module of modules) {
    if (module.spec.series !== pack.series) {
      blockers.push(issue(`battery-${module.partId}-series`, 'blocking', module.label, `${module.spec.series}S board does not match the ${pack.series}S pack.`))
    }
    if (!module.spec.chemistries.includes(cell.chemistry)) {
      blockers.push(issue(`battery-${module.partId}-chemistry`, 'blocking', module.label, `Board does not support ${cell.chemistry} cells.`))
    }
  }

  const window = packWindow(pack, protection?.spec.protection, charger?.spec.charger)!
  const source: Extract<PlanSource, { kind: 'battery' }> = { kind: 'battery', packItemId: packItem.id, ...window }
  if (window.ceilingV > 32) blockers.push(issue('battery-pack-voltage', 'blocking', 'Battery voltage', `${window.ceilingV} V pack ceiling exceeds the 32 V temporary limit. Fuse interrupt-rating selection lands in the next step.`))
  if (protection?.spec.protection && protection.spec.protection.overDischargeV < cell.dischargeCutoffV) {
    warnings.push(issue('battery-cutoff-below-cell', 'warning', protection.label, `${protection.spec.protection.overDischargeV} V protection cutoff is below the cell's ${cell.dischargeCutoffV} V rated cutoff.`))
  }

  if (charger?.spec.charger) {
    if (charger.spec.charger.chargeVPerCell > cell.chargeV) {
      blockers.push(issue('battery-charger-voltage', 'blocking', charger.label, `${charger.spec.charger.chargeVPerCell} V/cell charger exceeds the cell's ${cell.chargeV} V charge limit.`))
    }
    const chargeLimit = Math.min(pack.maxChargeMa, protection?.spec.protection?.continuousChargeMa ?? Number.POSITIVE_INFINITY)
    if (charger.spec.charger.maxChargeMa > chargeLimit) {
      blockers.push(issue('battery-charge-current', 'blocking', charger.label, `${formatCurrent(charger.spec.charger.maxChargeMa)} charge current exceeds the ${formatCurrent(chargeLimit)} protected pack limit.`))
    }
  }
  if (protection?.spec.protection && !protection.spec.protection.temperatureSensor) {
    warnings.push(issue('battery-charge-temperature', 'warning', protection.label, 'Protection board has no temperature sensor. Charge only within the cell temperature range.'))
  }

  const hasLedLoad = (totals?.designCurrentMa ?? 0) > 0
  const hasRail = Boolean(output || manifest.primaryItems.some((item) => item.kind === 'power-converter' && item.facts.role === 'led-rail'))
  if (hasLedLoad && !hasRail) blockers.push(issue('battery-led-without-rail', 'blocking', 'LED rail', 'Battery pack and LED outputs need a 5 V rail converter or a board with a 5 V output.'))
  if (!controllerSupply && !output) warnings.push(issue('battery-controller-usb', 'warning', 'Controller power', 'Battery is present, but no battery-fed controller converter or module output is on the bench. Controller remains on USB.'))
  if (!hasLedLoad && !controllerSupply) warnings.push(issue('battery-no-load', 'warning', 'Battery load', 'Battery pack is present, but no planned load draws from it.'))
  if (manifest.primaryItems.some((item) => item.kind === 'pd-trigger')) warnings.push(issue('pd-trigger-battery', 'warning', 'Power source', 'USB-C PD trigger and battery pack are both present. Battery pack is used as the DC source.'))

  const dischargeDesignCurrentMa = (totals?.supplies ?? []).reduce((sum, supply) => sum + (supply.converter?.inputCurrentMa ?? 0), 0)
    + (controllerSupply?.inputCurrentMa ?? 0)
  const protectionLimit = protection?.spec.protection?.continuousDischargeMa ?? 0
  const cellLimit = pack.maxContinuousDischargeMa
  const pathLimit = Math.min(protectionLimit || Number.POSITIVE_INFINITY, cellLimit)
  const mainFuseRating = standardFuseRatingFor(dischargeDesignCurrentMa)
  const conductor = mainFuseRating ? recommendConductor({
    designCurrentMa: mainFuseRating,
    oneWayLengthMm: 500,
    circuitVoltage: window.minV,
    allowedVoltageDropPercent: 5,
    material: 'copper',
    ambientC: 30,
    bundledCircuits: 1,
  }) : undefined
  const mainFuse = conductor
    ? recommendFuse(dischargeDesignCurrentMa, conductor.deratedAmpacityMa, pathLimit)
    : { minimumLoadRatingMa: Math.ceil(dischargeDesignCurrentMa / 0.75), maximumProtectiveRatingMa: pathLimit, unresolvedReason: 'No reviewed conductor carries the battery main fuse.' }
  if (dischargeDesignCurrentMa > 0 && !mainFuse.ratingMa) {
    blockers.push(issue('battery-main-fuse', 'blocking', 'Battery main fuse', mainFuse.unresolvedReason ?? 'No standard fuse fits the protected pack path.'))
  }

  const converterEfficiencies = (totals?.supplies ?? []).map((supply) => {
    const partId = supply.converter?.partId
    return partId ? partById(partId)?.powerConverter?.typicalEfficiency : undefined
  }).filter((value): value is number => typeof value === 'number')
  const efficiency = converterEfficiencies.length > 0 ? Math.min(...converterEfficiencies) : output?.spec.output?.typicalEfficiency
  const fullWhiteOutputW = ((totals?.designCurrentMa ?? 0) / 1000) * (totals?.nominalVoltage ?? 5)
  const runtimeHours = fullWhiteOutputW > 0 && efficiency
    ? Number((pack.energyWh / (fullWhiteOutputW / efficiency)).toFixed(2))
    : undefined
  const limitedOutputW = ((totals?.operatingCurrentCapMa ?? 0) / 1000) * (totals?.nominalVoltage ?? 5)
  const limitedRuntimeHours = limitedOutputW > 0 && efficiency
    ? Number((pack.energyWh / (limitedOutputW / efficiency)).toFixed(2))
    : undefined
  if (runtimeHours !== undefined && runtimeHours < 2) {
    warnings.push(issue('battery-discharge-rate', 'warning', 'Battery runtime', `Full white empties the rated pack in at most about ${runtimeHours} h. Use enough capacity for at least 2 h.`))
  }

  recommendations.push(
    'Put the battery main fuse on B+ as close to the cells as the holder allows.',
    'Use protection P- as the one 0 V net. Nothing except the protection board and its B0 sense lead may touch B-.',
  )
  if (pack.series > 1) recommendations.push('Connect balance leads in the board\'s printed B0-to-BS order, verify each step with a meter, then plug in the harness last.')
  const chargerSpec = charger?.spec.charger
  if (chargerSpec?.inputProtocols.includes('USB-C')) recommendations.push(`Use a USB-C PD charger rated at least ${chargerSpec.inputMaxW} W${chargerSpec.inputMaxW >= 100 ? ' and a 5 A e-marked cable' : ''}.`)
  if (chargerSpec?.bidirectional) recommendations.push(`${charger.label}'s USB-C port can discharge the pack; do not use that path for the LED load.`)
  if (balance?.spec.balance?.standbyMa) recommendations.push(`${balance.label} draws about ${balance.spec.balance.standbyMa} mA on standby; include that drain in storage plans.`)
  if (dischargeDesignCurrentMa > 30000) recommendations.push('Pack current exceeds 30 A. Have a professional with high-power, low-voltage experience check the build.')
  if (runtimeHours !== undefined) recommendations.push(`Full-white runtime is at most about ${runtimeHours} h from rated cell energy.${limitedRuntimeHours !== undefined ? ` Configured running limit gives about ${limitedRuntimeHours} h.` : ''}`)

  return {
    source,
    battery: {
      packItemId: packItem.id,
      pack,
      modules,
      window,
      dischargeDesignCurrentMa,
      mainFuse,
      trunkConductor: conductor,
      limitedBy: protectionLimit <= cellLimit && protection ? protection.label : `${pack.parallel} parallel cell${pack.parallel === 1 ? '' : 's'}`,
      runtimeHours,
      limitedRuntimeHours,
      charger,
      protection,
      balance,
      output,
    },
    blockers,
    warnings,
    recommendations,
  }
}

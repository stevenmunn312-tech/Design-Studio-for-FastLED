import type { PhysicalBoardProfile } from './boardProfiles'
import type { BuildProfile } from './buildProfile'
import type { HardwareManifest } from './hardwareManifest'
import {
  ELECTRICAL_RULESET_VERSION,
  recommendConductor,
  recommendFuse,
  type ConductorRecommendation,
  type FuseRecommendation,
} from './electricalRules'

const DEFAULT_SUPPLY_HEADROOM_PERCENT = 20
const WS2812_WORST_CASE_MA_PER_PIXEL = 60
const DEFAULT_LED_DENSITY_PER_METER = 60
const DEFAULT_FEED_CABLE_LENGTH_MM = 500
const MAX_END_FEED_CURRENT_MA = 5000
const MAX_CENTER_FEED_CURRENT_MA = 10000
const MAX_VOLTAGE_DROP_V = 0.4
const MAX_RECOMMENDED_SUPPLY_CURRENT_MA = 60000
const STANDARD_CONNECTOR_RATINGS_MA = [3000, 5000, 7500, 10000, 15000, 20000, 30000, 45000, 60000] as const

export type ElectricalPlanSeverity = 'blocking' | 'warning' | 'info'

export interface ElectricalPlanIssue {
  id: string
  severity: ElectricalPlanSeverity
  title: string
  detail: string
}

export interface OutputElectricalPlan {
  itemId: string
  title: string
  topology: string
  feedLocation: string
  pixelCount: number
  nominalVoltage: number
  physicalLengthMm: number
  estimatedDensityPerMeter: number
  estimatedPitchMm: number
  currentPerMeterMa: number
  designCurrentMa: number
  operatingCurrentCapMa?: number
  psuSizingCurrentMa: number
  recommendedSupplyCurrentMa: number
  recommendedSupplyWattage: number
  recommendedFeedCount: number
  pixelsPerFeed: number
  branchDesignCurrentMa: number
  conductor?: ConductorRecommendation
  connectorMinimumMa?: number
  fuse: FuseRecommendation
  injectionPointsMm: number[]
  injections: PowerInjectionPlan[]
  injectionUnresolvedReason?: string
}

export type PowerInjectionRole = 'start' | 'center' | 'end'

export interface PowerInjectionPlan {
  id: string
  itemId: string
  outputTitle: string
  role: PowerInjectionRole
  positionMm: number
  pixelCount: number
  designCurrentMa: number
  maximumCurrentMa: number
  conductor?: ConductorRecommendation
  connectorMinimumMa?: number
  fuse: FuseRecommendation
  supplyId?: string
}

export interface SupplyRecommendation {
  id: string
  designCurrentMa: number
  psuSizingCurrentMa: number
  recommendedCurrentMa: number
  recommendedWattage: number
  outputIds: string[]
  outputTitles: string[]
  injectionIds: string[]
}

export interface ElectricalPlanTotals {
  designCurrentMa: number
  operatingCurrentCapMa?: number
  psuSizingCurrentMa: number
  recommendedSupplyCurrentMa: number
  recommendedSupplyWattage: number
  recommendedSupplyCount: number
  perSupplyCurrentMa: number
  nominalVoltage: number
  headroomPercent: number
  supplies: SupplyRecommendation[]
}

export interface ElectricalPlanSummary {
  status: 'blocked' | 'calculated'
  requirementsCalculatedText: string
  powerReadyText: string
  powerReadyPasses: boolean
  blockers: ElectricalPlanIssue[]
  warnings: ElectricalPlanIssue[]
  outputs: OutputElectricalPlan[]
  totals?: ElectricalPlanTotals
  controllerPowerPath?: string
  supplyChecks: OwnedSupplyCheck[]
  branchChecks: OwnedBranchCheck[]
  recommendations: string[]
  unresolved: string[]
  assumptionsUsed: string[]
  ruleSetVersion: string
}

// Retained in the public result shape so existing saved profiles and callers remain compatible.
export interface OwnedSupplyCheck {
  supplyId: string
  label: string
  assignedOutputIds: string[]
  assignedOutputTitles: string[]
  requiredVoltage: number
  requiredCurrentMa: number
  requiredWattage: number
  declaredVoltage: number
  declaredCurrentMa: number
  declaredWattage?: number
  issues: ElectricalPlanIssue[]
}

export interface OwnedBranchCheck {
  itemId: string
  title: string
  wireId?: string
  connectorId?: string
  fuseId?: string
  issues: ElectricalPlanIssue[]
}

function roundToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

function recommendSupplyCurrent(psuSizingCurrentMa: number): number {
  const targetCurrentMa = psuSizingCurrentMa * (1 + (DEFAULT_SUPPLY_HEADROOM_PERCENT / 100))
  if (targetCurrentMa <= 10000) return roundToStep(targetCurrentMa, 1000)

  const lowerTenAmps = Math.floor(targetCurrentMa / 10000) * 10000
  const roundedCurrentMa = targetCurrentMa - lowerTenAmps < 2000
    ? lowerTenAmps
    : lowerTenAmps + 10000

  // Never recommend a nameplate current below the cap-aware operating budget.
  return Math.max(roundToStep(psuSizingCurrentMa, 1000), roundedCurrentMa)
}

function formatRuleCurrent(valueMa: number): string {
  return valueMa >= 1000
    ? `${Number((valueMa / 1000).toFixed(2))} A`
    : `${Math.round(valueMa)} mA`
}

function connectorMinimumForLoad(designCurrentMa: number): number | undefined {
  const required = Math.ceil(designCurrentMa / 0.75)
  return STANDARD_CONNECTOR_RATINGS_MA.find((rating) => rating >= required)
}

function injectionRoles(designCurrentMa: number): PowerInjectionRole[] {
  if (designCurrentMa <= MAX_END_FEED_CURRENT_MA) return ['start']
  if (designCurrentMa <= MAX_END_FEED_CURRENT_MA * 2) return ['start', 'end']
  const centerCount = Math.ceil(
    (designCurrentMa - (MAX_END_FEED_CURRENT_MA * 2)) / MAX_CENTER_FEED_CURRENT_MA,
  )
  return ['start', ...Array.from({ length: centerCount }, () => 'center' as const), 'end']
}

function allocatePixels(pixelCount: number, roles: PowerInjectionRole[]): number[] {
  const capacities = roles.map((role) => role === 'center' ? MAX_CENTER_FEED_CURRENT_MA : MAX_END_FEED_CURRENT_MA)
  const capacityPixels = capacities.map((capacity) => Math.floor(capacity / WS2812_WORST_CASE_MA_PER_PIXEL))
  const totalCapacity = capacityPixels.reduce((sum, value) => sum + value, 0)
  const allocations = capacityPixels.map((capacity) => Math.floor((pixelCount * capacity) / totalCapacity))
  let remaining = pixelCount - allocations.reduce((sum, value) => sum + value, 0)
  while (remaining > 0) {
    const index = allocations.findIndex((value, candidate) => value < capacityPixels[candidate])
    if (index < 0) break
    allocations[index] += 1
    remaining -= 1
  }
  return allocations
}

function calculateInjections(itemId: string, outputTitle: string, pixelCount: number, physicalLengthMm: number, nominalVoltage: number): PowerInjectionPlan[] {
  const roles = injectionRoles(pixelCount * WS2812_WORST_CASE_MA_PER_PIXEL)
  const pixels = allocatePixels(pixelCount, roles)
  return roles.map((role, index) => {
    const designCurrentMa = pixels[index] * WS2812_WORST_CASE_MA_PER_PIXEL
    const connectorMinimumMa = connectorMinimumForLoad(designCurrentMa)
    const conductor = recommendConductor({
      // Size ampacity and voltage drop with the same continuous-load reserve used for fuse selection.
      designCurrentMa: Math.ceil(designCurrentMa / 0.75),
      oneWayLengthMm: DEFAULT_FEED_CABLE_LENGTH_MM,
      circuitVoltage: nominalVoltage,
      allowedVoltageDropPercent: (MAX_VOLTAGE_DROP_V / nominalVoltage) * 100,
      material: 'copper',
      ambientC: 30,
      bundledCircuits: 1,
    })
    const fuse = conductor && connectorMinimumMa
      ? recommendFuse(designCurrentMa, conductor.deratedAmpacityMa, connectorMinimumMa)
      : {
          minimumLoadRatingMa: Math.ceil(designCurrentMa / 0.75),
          maximumProtectiveRatingMa: 0,
          unresolvedReason: 'No reviewed branch conductor and connector combination meets this generated route.',
        }
    return {
      id: `${itemId}:feed-${index + 1}`,
      itemId,
      outputTitle,
      role,
      positionMm: roles.length <= 1 ? 0 : Math.round((physicalLengthMm * index) / (roles.length - 1)),
      pixelCount: pixels[index],
      designCurrentMa,
      maximumCurrentMa: role === 'center' ? MAX_CENTER_FEED_CURRENT_MA : MAX_END_FEED_CURRENT_MA,
      conductor,
      connectorMinimumMa,
      fuse,
    }
  })
}

function groupSupplies(outputs: OutputElectricalPlan[]): SupplyRecommendation[] {
  const supplies: SupplyRecommendation[] = []
  for (const output of outputs) {
    for (const injection of output.injections) {
      const injectionPsuSizingCurrentMa = output.designCurrentMa > 0
        ? (output.psuSizingCurrentMa * injection.designCurrentMa) / output.designCurrentMa
        : 0
      const injectionWithHeadroom = injectionPsuSizingCurrentMa * (1 + (DEFAULT_SUPPLY_HEADROOM_PERCENT / 100))
      let supply = supplies.find((candidate) =>
        (candidate.psuSizingCurrentMa * (1 + (DEFAULT_SUPPLY_HEADROOM_PERCENT / 100))) + injectionWithHeadroom
          <= MAX_RECOMMENDED_SUPPLY_CURRENT_MA)
      if (!supply) {
        supply = {
          id: `supply-${supplies.length + 1}`,
          designCurrentMa: 0,
          psuSizingCurrentMa: 0,
          recommendedCurrentMa: 0,
          recommendedWattage: 0,
          outputIds: [],
          outputTitles: [],
          injectionIds: [],
        }
        supplies.push(supply)
      }
      supply.designCurrentMa += injection.designCurrentMa
      supply.psuSizingCurrentMa += injectionPsuSizingCurrentMa
      supply.recommendedCurrentMa = recommendSupplyCurrent(supply.psuSizingCurrentMa)
      supply.recommendedWattage = Number(((supply.recommendedCurrentMa / 1000) * output.nominalVoltage).toFixed(1))
      if (!supply.outputIds.includes(output.itemId)) supply.outputIds.push(output.itemId)
      if (!supply.outputTitles.includes(output.title)) supply.outputTitles.push(output.title)
      supply.injectionIds.push(injection.id)
      injection.supplyId = supply.id
    }
  }
  return supplies
}

export function calculateElectricalPlan(
  manifest: HardwareManifest,
  _buildProfile: BuildProfile,
  exactBoard?: PhysicalBoardProfile,
): ElectricalPlanSummary {
  const blockers: ElectricalPlanIssue[] = []
  const warnings: ElectricalPlanIssue[] = []

  if (!exactBoard) {
    blockers.push({
      id: 'exact-board',
      severity: 'blocking',
      title: 'Exact board profile',
      detail: 'Confirm the exact physical controller board so GPIO labels and connector positions are trustworthy.',
    })
  }

  for (const item of manifest.unsupportedItems) {
    blockers.push({
      id: `unsupported:${item.id}`,
      severity: 'blocking',
      title: item.title,
      detail: `${item.subtitle}. Select a supported 5 V one-wire chipset or add a reviewed physical profile before exporting a build reference.`,
    })
  }

  const outputItems = manifest.primaryItems.filter((item) => item.kind === 'matrix-output')
  const outputPlans: OutputElectricalPlan[] = []

  for (const item of outputItems) {
    const nominalVoltage = Number(item.facts.nominalVoltage ?? 5) || 5
    if (nominalVoltage !== 5) {
      warnings.push({
        id: `${item.id}:voltage`,
        severity: 'warning',
        title: item.title,
        detail: `${nominalVoltage} V output generation is not supported yet; this route is omitted rather than drawn incorrectly.`,
      })
      continue
    }

    const pixelCount = Math.max(1, Number(item.facts.pixelCount ?? 0))
    const densityPerMeter = DEFAULT_LED_DENSITY_PER_METER
    const pitchMm = 1000 / densityPerMeter
    const physicalLengthMm = Math.round((pixelCount / densityPerMeter) * 1000)
    const designCurrentMa = pixelCount * WS2812_WORST_CASE_MA_PER_PIXEL
    const injections = calculateInjections(item.id, item.title, pixelCount, physicalLengthMm, nominalVoltage)
    const recommendedFeedCount = injections.length
    const pixelsPerFeed = Math.max(...injections.map((injection) => injection.pixelCount))
    const branchDesignCurrentMa = Math.max(...injections.map((injection) => injection.designCurrentMa))
    const largestInjection = [...injections].sort((a, b) => b.designCurrentMa - a.designCurrentMa)[0]
    const connectorMinimumMa = largestInjection.connectorMinimumMa
    const conductor = largestInjection.conductor
    const fuse = largestInjection.fuse
    const operatingCurrentCapSource = item.facts.desiredCurrentCapMa
    const operatingCurrentCapMa = typeof operatingCurrentCapSource === 'number' && Number.isFinite(operatingCurrentCapSource)
      ? Math.max(0, Math.round(operatingCurrentCapSource))
      : undefined
    const psuSizingCurrentMa = operatingCurrentCapMa != null && operatingCurrentCapMa > 0
      ? Math.min(designCurrentMa, operatingCurrentCapMa)
      : designCurrentMa
    const recommendedSupplyCurrentMa = recommendSupplyCurrent(psuSizingCurrentMa)
    const recommendedSupplyWattage = Number(((recommendedSupplyCurrentMa / 1000) * nominalVoltage).toFixed(1))

    outputPlans.push({
      itemId: item.id,
      title: item.title,
      topology: String(item.facts.layout ?? 'matrix'),
      feedLocation: 'distributed',
      pixelCount,
      nominalVoltage,
      physicalLengthMm,
      estimatedDensityPerMeter: Math.round(densityPerMeter),
      estimatedPitchMm: Number(pitchMm.toFixed(1)),
      currentPerMeterMa: Math.round(densityPerMeter * WS2812_WORST_CASE_MA_PER_PIXEL),
      designCurrentMa,
      operatingCurrentCapMa,
      psuSizingCurrentMa,
      recommendedSupplyCurrentMa,
      recommendedSupplyWattage,
      recommendedFeedCount,
      pixelsPerFeed,
      branchDesignCurrentMa,
      conductor,
      connectorMinimumMa,
      fuse,
      injectionPointsMm: injections.map((injection) => injection.positionMm),
      injections,
    })
  }

  const totals = outputPlans.length > 0
    ? (() => {
      const nominalVoltage = outputPlans[0].nominalVoltage
      const designCurrentMa = outputPlans.reduce((sum, plan) => sum + plan.designCurrentMa, 0)
      const psuSizingCurrentMa = outputPlans.reduce((sum, plan) => sum + plan.psuSizingCurrentMa, 0)
      const supplies = groupSupplies(outputPlans)
      const recommendedSupplyCurrentMa = supplies.reduce((sum, supply) => sum + supply.recommendedCurrentMa, 0)
      const recommendedSupplyCount = supplies.length
      const perSupplyCurrentMa = Math.max(...supplies.map((supply) => supply.recommendedCurrentMa))
      const cappedCurrents = outputPlans
        .map((plan) => plan.operatingCurrentCapMa)
        .filter((entry): entry is number => typeof entry === 'number')
      return {
        designCurrentMa,
        operatingCurrentCapMa: cappedCurrents.length > 0 ? cappedCurrents.reduce((sum, value) => sum + value, 0) : undefined,
        psuSizingCurrentMa,
        recommendedSupplyCurrentMa,
        recommendedSupplyWattage: Number(((recommendedSupplyCurrentMa / 1000) * nominalVoltage).toFixed(1)),
        recommendedSupplyCount,
        perSupplyCurrentMa,
        nominalVoltage,
        headroomPercent: DEFAULT_SUPPLY_HEADROOM_PERCENT,
        supplies,
      }
    })()
    : undefined

  const unresolved = outputPlans.flatMap((output) => [
    ...output.injections.flatMap((injection) => [
      injection.conductor ? undefined : `${output.title} ${injection.role} feed: no reviewed conductor size meets the generated branch load.`,
      injection.fuse.unresolvedReason ? `${output.title} ${injection.role} feed: ${injection.fuse.unresolvedReason}` : undefined,
    ]),
  ].filter((entry): entry is string => !!entry))
  const status: ElectricalPlanSummary['status'] = blockers.length > 0 ? 'blocked' : 'calculated'
  const powerReadyPasses = blockers.length === 0 && unresolved.length === 0
  const requirementsCalculatedText = blockers.length > 0
    ? 'waiting for exact-board confirmation'
    : `generated from graph with ${ELECTRICAL_RULESET_VERSION}`
  const powerReadyText = powerReadyPasses
    ? 'recommended supply, protection, distribution, and branch wiring generated'
    : blockers.length > 0
      ? 'waiting for exact-board confirmation'
      : 'generated plan contains an unsupported electrical route'

  const recommendations = [
    'Power the controller through its USB-C connector; do not route LED load through the controller board.',
    'Join controller, microphone, level shifter, supply, and LED grounds at the common distribution ground.',
    'Use one 74AHCT125 channel and one 330 ohm series resistor for each WS2812B data route.',
    'Install one good-quality, correctly polarized 1000 uF, 6.3 V low-ESR electrolytic capacitor across +5 V and GND after every branch fuse, before the matrix feed or power-injection connection.',
    'Reducing global brightness lowers operating power without changing the worst-case wiring recommendation.',
    'FastLED current limiting reduces the recommended PSU operating capacity, but branch wiring and fuses remain sized for the uncapped physical load.',
  ]
  for (const output of outputPlans) {
    recommendations.push(
      `${output.title}: provide ${output.recommendedFeedCount} fused power feeds, no more than about ${output.pixelsPerFeed} pixels per feed.`,
    )
    if (output.operatingCurrentCapMa != null) {
      recommendations.push(
        `${output.title}: configured ${formatRuleCurrent(output.operatingCurrentCapMa)} software limit; PSU sizing uses this operating budget while the ${formatRuleCurrent(output.designCurrentMa)} uncapped full-white ceiling remains visible.`,
      )
    }
    if (output.conductor && output.connectorMinimumMa && output.fuse.ratingMa) {
      recommendations.push(
        `${output.title}: feed sizes vary by location; use the per-feed conductor, connector, and fuse ratings shown in the connection plan.`,
      )
    }
  }

  const assumptionsUsed = [
    'WS2812B uncapped branch wiring and protection are sized at 60 mA per pixel full white; a configured firmware cap may reduce only the recommended PSU operating capacity.',
    `${DEFAULT_LED_DENSITY_PER_METER} LEDs/m and ${DEFAULT_FEED_CABLE_LENGTH_MM} mm one-way copper feeds are used when the graph has no physical product dimensions.`,
    `Start and end feeds are limited to ${formatRuleCurrent(MAX_END_FEED_CURRENT_MA)}; centre feeds may carry up to ${formatRuleCurrent(MAX_CENTER_FEED_CURRENT_MA)} before splitting in both directions.`,
    `Supply groups are packed from the configured operating caps, or uncapped full-white loads when no cap exists, up to approximately ${formatRuleCurrent(MAX_RECOMMENDED_SUPPLY_CURRENT_MA)} continuous each; positive rails from separate PSU zones must not be paralleled.`,
    `Supply sizing targets ${DEFAULT_SUPPLY_HEADROOM_PERCENT}% headroom, then uses whole-amp sizes up to 10 A and 10 A sizes above that; a target less than 2 A above a 10 A boundary rounds down without going below the cap-aware sizing load.`,
    `Conductor voltage drop is limited to ${MAX_VOLTAGE_DROP_V} V over the complete 500 mm one-way feed circuit.`,
  ]

  if (exactBoard?.confidence === 'pinout-verified') {
    warnings.push({
      id: 'board-power-confidence',
      severity: 'warning',
      title: exactBoard.label,
      detail: 'Use USB-C for the controller and keep external LED power off the board because this profile has a verified pinout but an unverified onboard power path.',
    })
  }

  return {
    status,
    requirementsCalculatedText,
    powerReadyText,
    powerReadyPasses,
    blockers,
    warnings,
    outputs: outputPlans,
    totals,
    controllerPowerPath: exactBoard ? 'USB-C power (controller only)' : undefined,
    supplyChecks: [],
    branchChecks: [],
    recommendations,
    unresolved,
    assumptionsUsed,
    ruleSetVersion: ELECTRICAL_RULESET_VERSION,
  }
}

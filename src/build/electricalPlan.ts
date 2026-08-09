import type { PhysicalBoardProfile } from './boardProfiles'
import type { BuildProfile } from './buildProfile'
import type { HardwareManifest } from './hardwareManifest'
import {
  DEFAULT_ALLOWED_VOLTAGE_DROP_PERCENT,
  ELECTRICAL_RULESET_VERSION,
  recommendConductor,
  recommendFuse,
  type ConductorRecommendation,
  type FuseRecommendation,
} from './electricalRules'

const DEFAULT_SUPPLY_HEADROOM_PERCENT = 25
const WS2812_WORST_CASE_MA_PER_PIXEL = 60
const DEFAULT_LED_DENSITY_PER_METER = 60
const DEFAULT_FEED_CABLE_LENGTH_MM = 500
const MAX_BRANCH_DESIGN_CURRENT_MA = 4000
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
  recommendedSupplyCurrentMa: number
  recommendedSupplyWattage: number
  recommendedFeedCount: number
  pixelsPerFeed: number
  branchDesignCurrentMa: number
  conductor?: ConductorRecommendation
  connectorMinimumMa?: number
  fuse: FuseRecommendation
  injectionPointsMm: number[]
  injectionUnresolvedReason?: string
}

export interface ElectricalPlanTotals {
  designCurrentMa: number
  operatingCurrentCapMa?: number
  recommendedSupplyCurrentMa: number
  recommendedSupplyWattage: number
  recommendedSupplyCount: number
  perSupplyCurrentMa: number
  nominalVoltage: number
  headroomPercent: number
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

function formatRuleCurrent(valueMa: number): string {
  return valueMa >= 1000
    ? `${Number((valueMa / 1000).toFixed(2))} A`
    : `${Math.round(valueMa)} mA`
}

function connectorMinimumForLoad(designCurrentMa: number): number | undefined {
  const required = Math.ceil(designCurrentMa / 0.75)
  return STANDARD_CONNECTOR_RATINGS_MA.find((rating) => rating >= required)
}

function evenlySpacedFeedPoints(physicalLengthMm: number, count: number): number[] {
  if (count <= 1) return [0]
  return Array.from({ length: count }, (_, index) =>
    Math.round((physicalLengthMm * index) / (count - 1)))
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
    warnings.push({
      id: `unsupported:${item.id}`,
      severity: 'warning',
      title: item.title,
      detail: `${item.sourceNodeType} is outside the current generated-wiring profile set and is omitted from the assembly drawing.`,
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
    const recommendedFeedCount = Math.max(1, Math.ceil(designCurrentMa / MAX_BRANCH_DESIGN_CURRENT_MA))
    const pixelsPerFeed = Math.ceil(pixelCount / recommendedFeedCount)
    const branchDesignCurrentMa = Math.ceil(designCurrentMa / recommendedFeedCount)
    const headroomPercent = DEFAULT_SUPPLY_HEADROOM_PERCENT
    const recommendedSupplyCurrentMa = roundToStep(designCurrentMa * (1 + (headroomPercent / 100)), 100)
    const recommendedSupplyWattage = Number(((recommendedSupplyCurrentMa / 1000) * nominalVoltage).toFixed(1))
    const connectorMinimumMa = connectorMinimumForLoad(branchDesignCurrentMa)
    const conductor = recommendConductor({
      designCurrentMa: Math.ceil(branchDesignCurrentMa / 0.75),
      oneWayLengthMm: DEFAULT_FEED_CABLE_LENGTH_MM,
      circuitVoltage: nominalVoltage,
      allowedVoltageDropPercent: DEFAULT_ALLOWED_VOLTAGE_DROP_PERCENT,
      material: 'copper',
      ambientC: 30,
      bundledCircuits: 1,
    })
    const fuse = conductor && connectorMinimumMa
      ? recommendFuse(branchDesignCurrentMa, conductor.deratedAmpacityMa, connectorMinimumMa)
      : {
          minimumLoadRatingMa: Math.ceil(branchDesignCurrentMa / 0.75),
          maximumProtectiveRatingMa: 0,
          unresolvedReason: 'No reviewed branch conductor and connector combination meets this generated route.',
        }
    const operatingCurrentCapSource = item.facts.desiredCurrentCapMa
    const operatingCurrentCapMa = typeof operatingCurrentCapSource === 'number' && Number.isFinite(operatingCurrentCapSource)
      ? Math.max(0, Math.round(operatingCurrentCapSource))
      : undefined

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
      recommendedSupplyCurrentMa,
      recommendedSupplyWattage,
      recommendedFeedCount,
      pixelsPerFeed,
      branchDesignCurrentMa,
      conductor,
      connectorMinimumMa,
      fuse,
      injectionPointsMm: evenlySpacedFeedPoints(physicalLengthMm, recommendedFeedCount),
    })
  }

  const totals = outputPlans.length > 0
    ? (() => {
      const nominalVoltage = outputPlans[0].nominalVoltage
      const designCurrentMa = outputPlans.reduce((sum, plan) => sum + plan.designCurrentMa, 0)
      const recommendedSupplyCurrentMa = roundToStep(
        outputPlans.reduce((sum, plan) => sum + plan.designCurrentMa, 0)
          * (1 + (DEFAULT_SUPPLY_HEADROOM_PERCENT / 100)),
        100,
      )
      const recommendedSupplyCount = Math.max(1, Math.ceil(recommendedSupplyCurrentMa / MAX_RECOMMENDED_SUPPLY_CURRENT_MA))
      const perSupplyCurrentMa = roundToStep(recommendedSupplyCurrentMa / recommendedSupplyCount, 1000)
      const cappedCurrents = outputPlans
        .map((plan) => plan.operatingCurrentCapMa)
        .filter((entry): entry is number => typeof entry === 'number')
      return {
        designCurrentMa,
        operatingCurrentCapMa: cappedCurrents.length > 0 ? cappedCurrents.reduce((sum, value) => sum + value, 0) : undefined,
        recommendedSupplyCurrentMa,
        recommendedSupplyWattage: Number(((recommendedSupplyCurrentMa / 1000) * nominalVoltage).toFixed(1)),
        recommendedSupplyCount,
        perSupplyCurrentMa,
        nominalVoltage,
        headroomPercent: DEFAULT_SUPPLY_HEADROOM_PERCENT,
      }
    })()
    : undefined

  const unresolved = outputPlans.flatMap((output) => [
    output.conductor ? undefined : `${output.title}: no reviewed conductor size meets the generated branch load.`,
    output.fuse.unresolvedReason ? `${output.title}: ${output.fuse.unresolvedReason}` : undefined,
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
    'Install a correctly polarized 1000 uF capacitor across +5 V and GND at each LED power entry area.',
  ]
  for (const output of outputPlans) {
    recommendations.push(
      `${output.title}: provide ${output.recommendedFeedCount} fused power feeds, no more than about ${output.pixelsPerFeed} pixels per feed.`,
    )
    if (output.conductor && output.connectorMinimumMa && output.fuse.ratingMa) {
      recommendations.push(
        `${output.title}: each feed uses at least AWG ${output.conductor.awg} / ${output.conductor.crossSectionMm2} mm2 ${output.conductor.material}, a ${formatRuleCurrent(output.connectorMinimumMa)} connector, and a ${formatRuleCurrent(output.fuse.ratingMa)} fuse.`,
      )
    }
  }

  const assumptionsUsed = [
    'WS2812B outputs are sized at 60 mA per pixel full-white design load; a firmware current cap never reduces the physical recommendation.',
    `${DEFAULT_LED_DENSITY_PER_METER} LEDs/m and ${DEFAULT_FEED_CABLE_LENGTH_MM} mm one-way copper feeds are used when the graph has no physical product dimensions.`,
    `Feed branches are limited to approximately ${formatRuleCurrent(MAX_BRANCH_DESIGN_CURRENT_MA)} design load and supplies to approximately ${formatRuleCurrent(MAX_RECOMMENDED_SUPPLY_CURRENT_MA)} continuous each.`,
    `Supply capacity includes ${DEFAULT_SUPPLY_HEADROOM_PERCENT}% headroom; conductor voltage drop is limited to ${DEFAULT_ALLOWED_VOLTAGE_DROP_PERCENT}%.`,
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

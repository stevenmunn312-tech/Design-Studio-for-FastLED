import type { PhysicalBoardProfile } from './boardProfiles'
import type { BuildControllerPowerProfile, BuildProfile, BuildOutputProfile } from './buildProfile'
import type { HardwareManifest, HardwareManifestItem } from './hardwareManifest'
import {
  DEFAULT_ALLOWED_VOLTAGE_DROP_PERCENT,
  ELECTRICAL_RULESET_VERSION,
  recommendConductor,
  recommendFuse,
  wireRuleForOwnedPart,
  type ConductorRecommendation,
  type FuseRecommendation,
} from './electricalRules'

const DEFAULT_SUPPLY_HEADROOM_PERCENT = 25
const WS2812_WORST_CASE_MA_PER_PIXEL = 60
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

function deriveDensityPerMeter(profile: BuildOutputProfile, pixelCount: number): number | undefined {
  if (typeof profile.ledDensityPerMeter === 'number' && Number.isFinite(profile.ledDensityPerMeter) && profile.ledDensityPerMeter > 0) {
    return profile.ledDensityPerMeter
  }
  if (typeof profile.pitchMm === 'number' && Number.isFinite(profile.pitchMm) && profile.pitchMm > 0) {
    return 1000 / profile.pitchMm
  }
  if (typeof profile.physicalLengthMm === 'number' && Number.isFinite(profile.physicalLengthMm) && profile.physicalLengthMm > 0 && pixelCount > 0) {
    return pixelCount / (profile.physicalLengthMm / 1000)
  }
  return undefined
}

function derivePitchMm(profile: BuildOutputProfile, densityPerMeter: number | undefined): number | undefined {
  if (typeof profile.pitchMm === 'number' && Number.isFinite(profile.pitchMm) && profile.pitchMm > 0) {
    return profile.pitchMm
  }
  if (densityPerMeter && densityPerMeter > 0) {
    return 1000 / densityPerMeter
  }
  return undefined
}

function connectorMinimumForLoad(designCurrentMa: number): number | undefined {
  const required = Math.ceil(designCurrentMa / 0.75)
  return STANDARD_CONNECTOR_RATINGS_MA.find((rating) => rating >= required)
}

function parsedInjectionPoints(profile: BuildOutputProfile, physicalLengthMm: number): number[] {
  return (profile.manualInjectionPoints ?? [])
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= physicalLengthMm)
    .sort((a, b) => a - b)
}

function controllerPowerLabel(path: BuildControllerPowerProfile['preferredPath'] | undefined): string | undefined {
  switch (path) {
    case 'usb': return 'USB power'
    case 'vin': return 'VIN input'
    case '5vin': return '5VIN input'
    case 'regulated-5v': return 'External regulated 5 V'
    case 'regulated-3v3': return 'External regulated 3.3 V'
    default: return undefined
  }
}

function outputBlockers(item: HardwareManifestItem, profile: BuildOutputProfile | undefined): ElectricalPlanIssue[] {
  const issues: ElectricalPlanIssue[] = []
  if (profile?.physicalLengthMm == null) {
    issues.push({
      id: `${item.id}:length`,
      severity: 'blocking',
      title: item.title,
      detail: 'Physical length is still missing, so conductor sizing and injection spacing cannot be estimated yet.',
    })
  }
  if (profile?.ledDensityPerMeter == null && profile?.pitchMm == null) {
    issues.push({
      id: `${item.id}:density`,
      severity: 'blocking',
      title: item.title,
      detail: 'LED density or pitch is still missing, so current-per-length and injection planning cannot be estimated yet.',
    })
  }
  if (profile?.feedCableLengthMm == null) {
    issues.push({
      id: `${item.id}:feed`,
      severity: 'blocking',
      title: item.title,
      detail: 'Feed-cable length is still missing, so voltage-drop and cable-size checks cannot be estimated yet.',
    })
  }
  return issues
}

export function calculateElectricalPlan(
  manifest: HardwareManifest,
  buildProfile: BuildProfile,
  exactBoard?: PhysicalBoardProfile,
): ElectricalPlanSummary {
  const blockers: ElectricalPlanIssue[] = []
  const warnings: ElectricalPlanIssue[] = []
  const supplyChecks: OwnedSupplyCheck[] = []
  const branchChecks: OwnedBranchCheck[] = []

  if (!exactBoard) {
    blockers.push({
      id: 'exact-board',
      severity: 'blocking',
      title: 'Exact board profile',
      detail: 'Controller-side wiring and controller-power checks stay blocked until the exact physical board is selected.',
    })
  }
  if (!buildProfile.controllerPower?.preferredPath) {
    blockers.push({
      id: 'controller-power',
      severity: 'blocking',
      title: 'Controller power path',
      detail: 'Controller branch validation stays incomplete until Build Diagram knows whether the controller expects USB, VIN, 5VIN, or an external regulated rail.',
    })
  }
  for (const item of manifest.unsupportedItems) {
    warnings.push({
      id: `unsupported:${item.id}`,
      severity: 'warning',
      title: item.title,
      detail: `${item.sourceNodeType} is still outside the current Build Diagram planner scope.`,
    })
  }

  const outputItems = manifest.primaryItems.filter((item) => item.kind === 'matrix-output')
  const outputPlans: OutputElectricalPlan[] = []

  for (const item of outputItems) {
    const profile = buildProfile.outputs?.[item.id]
    blockers.push(...outputBlockers(item, profile))
    if (!profile?.physicalLengthMm) continue
    const nominalVoltage = Number(item.facts.nominalVoltage ?? 5) || 5
    if (nominalVoltage !== 5) {
      warnings.push({
        id: `${item.id}:voltage`,
        severity: 'warning',
        title: item.title,
        detail: `Nominal voltage ${nominalVoltage} V is not fully modeled yet; calculations currently assume a WS2812-class 5 V branch.`,
      })
      continue
    }

    const pixelCount = Number(item.facts.pixelCount ?? 0)
    const densityPerMeter = deriveDensityPerMeter(profile, pixelCount)
    const pitchMm = derivePitchMm(profile, densityPerMeter)
    const currentPerMeterMa = densityPerMeter ? Math.round(densityPerMeter * WS2812_WORST_CASE_MA_PER_PIXEL) : 0
    const designCurrentMa = pixelCount * WS2812_WORST_CASE_MA_PER_PIXEL
    const operatingCurrentCapSource = typeof profile.desiredCurrentCapMa === 'number' && Number.isFinite(profile.desiredCurrentCapMa)
      ? profile.desiredCurrentCapMa
      : item.facts.desiredCurrentCapMa
    const operatingCurrentCapMa = typeof operatingCurrentCapSource === 'number' && Number.isFinite(operatingCurrentCapSource)
      ? Math.max(0, Math.round(Number(operatingCurrentCapSource)))
      : undefined
    const headroomPercent = buildProfile.assumptions?.supplyHeadroomPercent ?? DEFAULT_SUPPLY_HEADROOM_PERCENT
    const recommendedSupplyCurrentMa = roundToStep(designCurrentMa * (1 + (headroomPercent / 100)), 100)
    const recommendedSupplyWattage = Number(((recommendedSupplyCurrentMa / 1000) * nominalVoltage).toFixed(1))
    const connectorMinimumMa = connectorMinimumForLoad(designCurrentMa)
    const conductor = recommendConductor({
      designCurrentMa: Math.ceil(designCurrentMa / 0.75),
      oneWayLengthMm: profile.feedCableLengthMm ?? 0,
      circuitVoltage: nominalVoltage,
      allowedVoltageDropPercent: buildProfile.assumptions?.allowedVoltageDropPercent ?? DEFAULT_ALLOWED_VOLTAGE_DROP_PERCENT,
      material: buildProfile.assumptions?.conductorMaterial ?? 'copper',
      ambientC: buildProfile.assumptions?.ambientC ?? 30,
      bundledCircuits: buildProfile.assumptions?.bundledCircuits ?? 1,
    })
    const fuse = conductor && connectorMinimumMa
      ? recommendFuse(designCurrentMa, conductor.deratedAmpacityMa, connectorMinimumMa)
      : {
          minimumLoadRatingMa: Math.ceil(designCurrentMa / 0.75),
          maximumProtectiveRatingMa: 0,
          unresolvedReason: conductor
            ? 'No reviewed connector rating is available for this branch load.'
            : 'No conductor in the reviewed table meets this branch load and voltage-drop target.',
        }
    const injectionPointsMm = parsedInjectionPoints(profile, profile.physicalLengthMm)
    const injectionUnresolvedReason = injectionPointsMm.length > 0
      ? undefined
      : 'Exact injection spacing needs the selected LED product copper-path resistance/current limit; add reviewed product data or confirmed manual injection points.'

    outputPlans.push({
      itemId: item.id,
      title: item.title,
      topology: String(profile.topology ?? item.facts.layout ?? 'matrix'),
      feedLocation: String(profile.intendedFeedLocation ?? 'start'),
      pixelCount,
      nominalVoltage,
      physicalLengthMm: profile.physicalLengthMm,
      estimatedDensityPerMeter: densityPerMeter ? Math.round(densityPerMeter) : 0,
      estimatedPitchMm: pitchMm ? Number(pitchMm.toFixed(1)) : 0,
      currentPerMeterMa,
      designCurrentMa,
      operatingCurrentCapMa,
      recommendedSupplyCurrentMa,
      recommendedSupplyWattage,
      conductor,
      connectorMinimumMa,
      fuse,
      injectionPointsMm,
      injectionUnresolvedReason,
    })
  }

  const assumptionsUsed = [
    `WS2812-class outputs use the conservative 60 mA-per-pixel full-white design load already used elsewhere in the app.`,
    `Supply headroom defaults to ${buildProfile.assumptions?.supplyHeadroomPercent ?? DEFAULT_SUPPLY_HEADROOM_PERCENT}% unless overridden in Advanced assumptions.`,
    `Feed conductors use the ${ELECTRICAL_RULESET_VERSION} reviewed GPT-wire subset, ${(buildProfile.assumptions?.allowedVoltageDropPercent ?? DEFAULT_ALLOWED_VOLTAGE_DROP_PERCENT)}% maximum voltage drop, ${(buildProfile.assumptions?.ambientC ?? 30)} C ambient, and ${(buildProfile.assumptions?.bundledCircuits ?? 1)} bundled circuit(s).`,
  ]
  if (buildProfile.assumptions?.allowedVoltageDropPercent != null) {
    assumptionsUsed.push(`Allowed voltage drop is currently recorded as ${buildProfile.assumptions.allowedVoltageDropPercent}%.`)
  }
  if (buildProfile.assumptions?.conductorMaterial) {
    assumptionsUsed.push(`Conductor material assumption is currently ${buildProfile.assumptions.conductorMaterial}.`)
  }

  const recommendations = [
    'Give every LED output its own direct supply branch and keep the controller on a separate low-current power branch.',
    'Add a common ground reference between the controller and every LED supply branch.',
    'Place a data-line resistor at each LED data entry point and a bulk capacitor at each LED power entry point.',
  ]
  if (manifest.targetFamily === 'esp32-s3' && outputPlans.some((plan) => plan.nominalVoltage >= 5)) {
    recommendations.push('Expect a 3.3 V to 5 V logic-conditioning stage for WS2812-class outputs unless the final hardware review proves the chosen branch tolerates direct 3.3 V data safely.')
  }
  if (exactBoard?.confidence === 'pinout-verified') {
    recommendations.push('Keep controller power-path recommendations provisional on this board until its USB/5VIN/regulator behavior is independently reviewed.')
  }
  for (const output of outputPlans) {
    if (output.conductor) {
      recommendations.push(`${output.title}: use at least AWG ${output.conductor.awg} / ${output.conductor.crossSectionMm2} mm2 ${output.conductor.material} feed conductor for ${output.conductor.oneWayLengthMm} mm one-way; calculated drop ${output.conductor.voltageDrop} V (${output.conductor.voltageDropPercent}%).`)
    }
    if (output.connectorMinimumMa) {
      recommendations.push(`${output.title}: connector path must be rated at least ${formatRuleCurrent(output.connectorMinimumMa)} continuous.`)
    }
    if (output.fuse.ratingMa) {
      recommendations.push(`${output.title}: use a ${formatRuleCurrent(output.fuse.ratingMa)} branch fuse; it carries the design load at no more than 75% while remaining below the conductor/connector limit.`)
    }
  }

  const unresolved = outputPlans.flatMap((output) => [
    output.conductor ? undefined : `${output.title}: no reviewed conductor size meets the selected load, distance, derating, and voltage-drop target.`,
    output.fuse.unresolvedReason ? `${output.title}: ${output.fuse.unresolvedReason}` : undefined,
    output.injectionUnresolvedReason ? `${output.title}: ${output.injectionUnresolvedReason}` : undefined,
  ].filter((entry): entry is string => !!entry))

  const totals = outputPlans.length > 0
    ? (() => {
      const nominalVoltage = outputPlans[0].nominalVoltage
      const designCurrentMa = outputPlans.reduce((sum, plan) => sum + plan.designCurrentMa, 0)
      const cappedCurrents = outputPlans
        .map((plan) => plan.operatingCurrentCapMa)
        .filter((entry): entry is number => typeof entry === 'number')
      const operatingCurrentCapMa = cappedCurrents.length > 0
        ? cappedCurrents.reduce((sum, value) => sum + value, 0)
        : undefined
      const headroomPercent = buildProfile.assumptions?.supplyHeadroomPercent ?? DEFAULT_SUPPLY_HEADROOM_PERCENT
      const recommendedSupplyCurrentMa = roundToStep(designCurrentMa * (1 + (headroomPercent / 100)), 100)
      const recommendedSupplyWattage = Number(((recommendedSupplyCurrentMa / 1000) * nominalVoltage).toFixed(1))
      return {
        designCurrentMa,
        operatingCurrentCapMa,
        recommendedSupplyCurrentMa,
        recommendedSupplyWattage,
        nominalVoltage,
        headroomPercent,
      }
    })()
    : undefined

  const status: ElectricalPlanSummary['status'] = blockers.length > 0 ? 'blocked' : 'calculated'
  const requirementsCalculatedText = blockers.length > 0
    ? `blocked by ${blockers.length} missing planner input${blockers.length === 1 ? '' : 's'}`
    : `calculated with ${ELECTRICAL_RULESET_VERSION}`
  const headroomPercent = buildProfile.assumptions?.supplyHeadroomPercent ?? DEFAULT_SUPPLY_HEADROOM_PERCENT
  const supplyEntries = Object.values(buildProfile.ownedParts?.supplies ?? {})
  const supplyAssignments = buildProfile.ownedParts?.supplyAssignments ?? {}
  const wireAssignments = buildProfile.ownedParts?.wireAssignments ?? {}
  const connectorAssignments = buildProfile.ownedParts?.connectorAssignments ?? {}
  const fuseAssignments = buildProfile.ownedParts?.fuseAssignments ?? {}
  let powerReadyText = 'blocked until Requirements calculated passes'
  let powerReadyPasses = false

  if (blockers.length === 0 && outputPlans.length > 0) {
    const issues: ElectricalPlanIssue[] = []
    const assignmentsBySupplyId = new Map<string, OutputElectricalPlan[]>()

    if (supplyEntries.length === 0) {
      issues.push({
        id: 'owned-supply',
        severity: 'blocking',
        title: 'Owned LED supply',
        detail: 'Declare and assign the actual LED supply before Power ready can pass.',
      })
    }

    for (const plan of outputPlans) {
      const assignedSupplyId = supplyAssignments[plan.itemId]
      if (!assignedSupplyId) {
        issues.push({
          id: `${plan.itemId}:assignment`,
          severity: 'blocking',
          title: plan.title,
          detail: 'Assign this output to an owned supply before LED branch validation can pass.',
        })
      } else {
        const list = assignmentsBySupplyId.get(assignedSupplyId) ?? []
        list.push(plan)
        assignmentsBySupplyId.set(assignedSupplyId, list)
      }

      const branchIssues: ElectricalPlanIssue[] = []
      const wireId = wireAssignments[plan.itemId]
      const wire = wireId ? buildProfile.ownedParts?.wires?.[wireId] : undefined
      const wireRule = wire ? wireRuleForOwnedPart(wire.gaugeAwg, wire.crossSectionMm2) : undefined
      if (!wireId || !wire || !wireRule || !plan.conductor) {
        branchIssues.push({
          id: `${plan.itemId}:wire`,
          severity: 'blocking',
          title: plan.title,
          detail: 'Assign a declared wire with a reviewed AWG or cross-section that meets the calculated branch minimum.',
        })
      } else if (wireRule.crossSectionMm2 < plan.conductor.crossSectionMm2) {
        branchIssues.push({
          id: `${plan.itemId}:wire-size`,
          severity: 'blocking',
          title: plan.title,
          detail: `${wire.label ?? wire.id} is ${wireRule.crossSectionMm2} mm2; this branch requires at least ${plan.conductor.crossSectionMm2} mm2.`,
        })
      } else if ((wire.conductorMaterial ?? 'copper') !== plan.conductor.material) {
        branchIssues.push({
          id: `${plan.itemId}:wire-material`,
          severity: 'blocking',
          title: plan.title,
          detail: `${wire.label ?? wire.id} is declared as ${wire.conductorMaterial ?? 'copper'} but this calculation assumes ${plan.conductor.material}; recalculate with the actual conductor material.`,
        })
      }

      const connectorId = connectorAssignments[plan.itemId]
      const connector = connectorId ? buildProfile.ownedParts?.connectors?.[connectorId] : undefined
      if (!connectorId || !connector || !plan.connectorMinimumMa) {
        branchIssues.push({
          id: `${plan.itemId}:connector`,
          severity: 'blocking',
          title: plan.title,
          detail: 'Assign a declared connector that meets the calculated continuous-current minimum.',
        })
      } else if (connector.continuousCurrentMa < plan.connectorMinimumMa) {
        branchIssues.push({
          id: `${plan.itemId}:connector-rating`,
          severity: 'blocking',
          title: plan.title,
          detail: `${connector.label ?? connector.id} is rated ${connector.continuousCurrentMa} mA; this branch requires at least ${plan.connectorMinimumMa} mA continuous.`,
        })
      }

      const fuseId = fuseAssignments[plan.itemId]
      const fuse = fuseId ? buildProfile.ownedParts?.fuses?.[fuseId] : undefined
      if (!fuseId || !fuse || !plan.fuse.ratingMa) {
        branchIssues.push({
          id: `${plan.itemId}:fuse`,
          severity: 'blocking',
          title: plan.title,
          detail: 'Assign a declared branch fuse after the conductor and connector limits are resolved.',
        })
      } else if (fuse.ratingMa < plan.fuse.minimumLoadRatingMa || fuse.ratingMa > plan.fuse.maximumProtectiveRatingMa) {
        branchIssues.push({
          id: `${plan.itemId}:fuse-rating`,
          severity: 'blocking',
          title: plan.title,
          detail: `${fuse.label ?? fuse.id} is ${fuse.ratingMa} mA; the allowed range is ${plan.fuse.minimumLoadRatingMa}-${plan.fuse.maximumProtectiveRatingMa} mA.`,
        })
      }

      if (plan.injectionUnresolvedReason) {
        branchIssues.push({
          id: `${plan.itemId}:injection`,
          severity: 'blocking',
          title: plan.title,
          detail: plan.injectionUnresolvedReason,
        })
      }

      branchChecks.push({ itemId: plan.itemId, title: plan.title, wireId, connectorId, fuseId, issues: branchIssues })
      issues.push(...branchIssues)
    }

    for (const [supplyId, assignedPlans] of assignmentsBySupplyId.entries()) {
      const supply = buildProfile.ownedParts?.supplies?.[supplyId]
      if (!supply) {
        for (const plan of assignedPlans) {
          issues.push({
            id: `${plan.itemId}:missing-supply`,
            severity: 'blocking',
            title: plan.title,
            detail: `Assigned supply "${supplyId}" is missing from Owned supplies.`,
          })
        }
        continue
      }

      const requiredCurrentMa = roundToStep(
        assignedPlans.reduce((sum, plan) => sum + plan.designCurrentMa, 0) * (1 + (headroomPercent / 100)),
        100,
      )
      const requiredWattage = Number(((requiredCurrentMa / 1000) * assignedPlans[0].nominalVoltage).toFixed(1))
      const checkIssues: ElectricalPlanIssue[] = []
      const nominalVoltage = assignedPlans[0].nominalVoltage

      if (Math.abs(supply.voltage - nominalVoltage) > 0.05) checkIssues.push({ id: `${supplyId}:voltage`, severity: 'blocking', title: supply.label ?? supply.id, detail: `Declared ${supply.voltage} V does not match the current ${nominalVoltage} V LED branch requirement.` })
      if (supply.continuousCurrentMa < requiredCurrentMa) checkIssues.push({ id: `${supplyId}:current`, severity: 'blocking', title: supply.label ?? supply.id, detail: `Continuous current ${supply.continuousCurrentMa} mA is below the required ${requiredCurrentMa} mA branch budget.` })
      if (typeof supply.wattage === 'number' && Number.isFinite(supply.wattage) && supply.wattage < requiredWattage) checkIssues.push({ id: `${supplyId}:wattage`, severity: 'blocking', title: supply.label ?? supply.id, detail: `Declared wattage ${supply.wattage} W is below the required ${requiredWattage} W branch budget.` })

      supplyChecks.push({ supplyId, label: supply.label ?? supply.id, assignedOutputIds: assignedPlans.map((plan) => plan.itemId), assignedOutputTitles: assignedPlans.map((plan) => plan.title), requiredVoltage: nominalVoltage, requiredCurrentMa, requiredWattage, declaredVoltage: supply.voltage, declaredCurrentMa: supply.continuousCurrentMa, declaredWattage: supply.wattage, issues: checkIssues })
      issues.push(...checkIssues)
    }

    if (exactBoard?.confidence !== 'manufacturer-verified' || buildProfile.controllerPower?.preferredPath !== 'usb') {
      issues.push({
        id: 'controller-power-validation',
        severity: 'blocking',
        title: 'Controller power branch',
        detail: exactBoard?.confidence !== 'manufacturer-verified'
          ? 'This board power path is not manufacturer-verified, so Power ready cannot pass.'
          : 'Current controller branch validation supports the manufacturer-verified USB path; select USB or add a reviewed converter/power-path profile.',
      })
    }

    powerReadyPasses = issues.length === 0
    powerReadyText = powerReadyPasses
      ? 'ready: declared supply, conductor, connector, fuse, injection, and controller branch all pass'
      : `needs review: ${issues.length} power-path issue${issues.length === 1 ? '' : 's'}`
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
    controllerPowerPath: controllerPowerLabel(buildProfile.controllerPower?.preferredPath),
    supplyChecks,
    branchChecks,
    recommendations,
    unresolved,
    assumptionsUsed,
    ruleSetVersion: ELECTRICAL_RULESET_VERSION,
  }
}

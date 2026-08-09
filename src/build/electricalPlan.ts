import type { PhysicalBoardProfile } from './boardProfiles'
import type { BuildControllerPowerProfile, BuildProfile, BuildOutputProfile } from './buildProfile'
import type { HardwareManifest, HardwareManifestItem } from './hardwareManifest'

const DEFAULT_SUPPLY_HEADROOM_PERCENT = 25
const WS2812_WORST_CASE_MA_PER_PIXEL = 60

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
  status: 'blocked' | 'partial'
  requirementsCalculatedText: string
  powerReadyText: string
  powerReadyPasses: boolean
  blockers: ElectricalPlanIssue[]
  warnings: ElectricalPlanIssue[]
  outputs: OutputElectricalPlan[]
  totals?: ElectricalPlanTotals
  controllerPowerPath?: string
  supplyChecks: OwnedSupplyCheck[]
  recommendations: string[]
  unresolved: string[]
  assumptionsUsed: string[]
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

function roundToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step
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
    })
  }

  const assumptionsUsed = [
    `WS2812-class outputs use the conservative 60 mA-per-pixel full-white design load already used elsewhere in the app.`,
    `Supply headroom defaults to ${buildProfile.assumptions?.supplyHeadroomPercent ?? DEFAULT_SUPPLY_HEADROOM_PERCENT}% unless overridden in Advanced assumptions.`,
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

  const unresolved = [
    'Minimum wire gauge / cross-section still depends on the reviewed conductor ampacity and voltage-drop tables that are not implemented yet.',
    'Branch fuse and connector ratings still stay unresolved until the conductor and connector rule tables land.',
    'Injection spacing still stays unresolved because the planner does not yet have the reviewed conductor/connector and voltage-drop rule tables needed to justify exact feed placement.',
  ]

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

  const status: ElectricalPlanSummary['status'] = blockers.length > 0 ? 'blocked' : 'partial'
  const requirementsCalculatedText = blockers.length > 0
    ? `blocked by ${blockers.length} missing planner input${blockers.length === 1 ? '' : 's'}`
    : 'partial: conservative supply/current summary ready, conductor/fuse tables pending'
  const headroomPercent = buildProfile.assumptions?.supplyHeadroomPercent ?? DEFAULT_SUPPLY_HEADROOM_PERCENT
  const supplyEntries = Object.values(buildProfile.ownedParts?.supplies ?? {})
  const supplyAssignments = buildProfile.ownedParts?.supplyAssignments ?? {}
  let powerReadyText = 'blocked until Requirements calculated passes'
  const powerReadyPasses = false

  if (blockers.length === 0 && outputPlans.length > 0) {
    if (supplyEntries.length === 0) {
      powerReadyText = 'pending owned LED supply declarations'
    } else {
      const issues: ElectricalPlanIssue[] = []
      const assignmentsBySupplyId = new Map<string, OutputElectricalPlan[]>()

      for (const plan of outputPlans) {
        const assignedSupplyId = supplyAssignments[plan.itemId]
        if (!assignedSupplyId) {
          issues.push({
            id: `${plan.itemId}:assignment`,
            severity: 'blocking',
            title: plan.title,
            detail: 'Assign this output to an owned supply before LED branch validation can pass.',
          })
          continue
        }
        const list = assignmentsBySupplyId.get(assignedSupplyId) ?? []
        list.push(plan)
        assignmentsBySupplyId.set(assignedSupplyId, list)
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

        if (Math.abs(supply.voltage - nominalVoltage) > 0.05) {
          checkIssues.push({
            id: `${supplyId}:voltage`,
            severity: 'blocking',
            title: supply.label ?? supply.id,
            detail: `Declared ${supply.voltage} V does not match the current ${nominalVoltage} V LED branch requirement.`,
          })
        }
        if (supply.continuousCurrentMa < requiredCurrentMa) {
          checkIssues.push({
            id: `${supplyId}:current`,
            severity: 'blocking',
            title: supply.label ?? supply.id,
            detail: `Continuous current ${supply.continuousCurrentMa} mA is below the required ${requiredCurrentMa} mA branch budget.`,
          })
        }
        if (typeof supply.wattage === 'number' && Number.isFinite(supply.wattage) && supply.wattage < requiredWattage) {
          checkIssues.push({
            id: `${supplyId}:wattage`,
            severity: 'blocking',
            title: supply.label ?? supply.id,
            detail: `Declared wattage ${supply.wattage} W is below the required ${requiredWattage} W branch budget.`,
          })
        }

        supplyChecks.push({
          supplyId,
          label: supply.label ?? supply.id,
          assignedOutputIds: assignedPlans.map((plan) => plan.itemId),
          assignedOutputTitles: assignedPlans.map((plan) => plan.title),
          requiredVoltage: nominalVoltage,
          requiredCurrentMa,
          requiredWattage,
          declaredVoltage: supply.voltage,
          declaredCurrentMa: supply.continuousCurrentMa,
          declaredWattage: supply.wattage,
          issues: checkIssues,
        })
        issues.push(...checkIssues)
      }

      if (issues.length > 0) {
        powerReadyText = `needs review: ${issues.length} owned supply validation issue${issues.length === 1 ? '' : 's'}`
      } else {
        powerReadyText = 'partial: assigned LED supplies satisfy conservative current/voltage budget; controller branch, wire, fuse, and connector validation still pending'
      }
    }
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
    recommendations,
    unresolved,
    assumptionsUsed,
  }
}

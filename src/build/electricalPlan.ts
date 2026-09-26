import type { PhysicalBoardProfile } from './boardProfiles'
import type { BuildProfile } from './buildProfile'
import type { HardwareManifest } from './hardwareManifest'
import {
  DEFAULT_ALLOWED_VOLTAGE_DROP_PERCENT,
  ELECTRICAL_RULESET_VERSION,
  recommendConductor,
  recommendFuse,
  standardFuseRatingFor,
  type ConductorRecommendation,
  type FuseRecommendation,
} from './electricalRules'
import { powerConverterModuleFor, ratedInputCurrentMa, sourceVoltageIssue } from '../state/powerConverter'
import {
  DEFAULT_SUPPLY_HEADROOM_PERCENT,
  recommendedSupplyCurrentMa,
} from './powerSupplySizing'

const WS2812_WORST_CASE_MA_PER_PIXEL = 60
const DEFAULT_LED_DENSITY_PER_METER = 60
const DEFAULT_FEED_CABLE_LENGTH_MM = 500
const MAX_END_FEED_CURRENT_MA = 5000
const MAX_CENTER_FEED_CURRENT_MA = 10000
const MAX_VOLTAGE_DROP_V = 0.4
/** Supply terminal to fuse block. Kept short: this run carries the whole zone. */
const DEFAULT_TRUNK_LENGTH_MM = 500
/** The trunk's share of the drop, on top of each branch's own allowance. */
const MAX_TRUNK_VOLTAGE_DROP_V = 0.1
// The largest single 5 V supplies in common use for LED installations are
// around 100 A. A supply zone never exceeds this after headroom.
const MAX_RECOMMENDED_SUPPLY_CURRENT_MA = 100000
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
  /** A firmware brightness limit. It lowers running power; it never sizes hardware. */
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
  recommendedCurrentMa: number
  recommendedWattage: number
  outputIds: string[]
  outputTitles: string[]
  injectionIds: string[]
  /**
   * The run from the supply's positive terminal to its fuse blocks. It
   * carries every branch at once at full white, and is protected by one main
   * fuse at the supply.
   */
  trunk: SupplyTrunkPlan
}

export interface SupplyTrunkPlan {
  designCurrentMa: number
  oneWayLengthMm: number
  conductor?: ConductorRecommendation
  mainFuse: FuseRecommendation
}

export interface ElectricalPlanTotals {
  designCurrentMa: number
  /** A firmware brightness limit. It lowers running power; it never sizes hardware. */
  operatingCurrentCapMa?: number
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
  controllerSupply?: ControllerSupplyPlan
  branchChecks: OwnedBranchCheck[]
  recommendations: string[]
  unresolved: string[]
  assumptionsUsed: string[]
  ruleSetVersion: string
}

/**
 * A converter feeding the controller from a 12/24 V source, in place of USB.
 * Its source-side fuse and wire are sized for the converter's full rated
 * output rather than an estimated load, so a 5 V module added to the
 * controller later cannot outgrow them.
 */
export interface ControllerSupplyPlan {
  itemId: string
  partId: string
  label: string
  sourceVoltage: number
  outputVoltage: number
  continuousCurrentMa: number
  adjustable: boolean
  /** The board pin its output lands on (5V, 5VIN or VIN, as the board prints it). */
  powerInPinLabel?: string
  powerInAnchorId?: string
  inputCurrentMa: number
  inputConductor?: ConductorRecommendation
  inputFuse: FuseRecommendation
}

export interface OwnedBranchCheck {
  itemId: string
  title: string
  wireId?: string
  connectorId?: string
  fuseId?: string
  issues: ElectricalPlanIssue[]
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
      // Size the wire to carry the fuse that will protect it, so a standard
      // rating always fits between the load's minimum and the wire's ampacity.
      designCurrentMa: standardFuseRatingFor(designCurrentMa) ?? Math.ceil(designCurrentMa / 0.75),
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
      const headroom = 1 + (DEFAULT_SUPPLY_HEADROOM_PERCENT / 100)
      let supply = supplies.find((candidate) =>
        ((candidate.designCurrentMa + injection.designCurrentMa) * headroom) <= MAX_RECOMMENDED_SUPPLY_CURRENT_MA)
      if (!supply) {
        supply = {
          id: `supply-${supplies.length + 1}`,
          designCurrentMa: 0,
          recommendedCurrentMa: 0,
          recommendedWattage: 0,
          outputIds: [],
          outputTitles: [],
          injectionIds: [],
          trunk: { designCurrentMa: 0, oneWayLengthMm: DEFAULT_TRUNK_LENGTH_MM, mainFuse: { minimumLoadRatingMa: 0, maximumProtectiveRatingMa: 0 } },
        }
        supplies.push(supply)
      }
      supply.designCurrentMa += injection.designCurrentMa
      supply.recommendedCurrentMa = recommendedSupplyCurrentMa(supply.designCurrentMa)
      supply.recommendedWattage = Number(((supply.recommendedCurrentMa / 1000) * output.nominalVoltage).toFixed(1))
      if (!supply.outputIds.includes(output.itemId)) supply.outputIds.push(output.itemId)
      if (!supply.outputTitles.includes(output.title)) supply.outputTitles.push(output.title)
      supply.injectionIds.push(injection.id)
      injection.supplyId = supply.id
    }
  }
  for (const supply of supplies) supply.trunk = planTrunk(supply.designCurrentMa, nominalVoltageOf(outputs))
  return supplies
}

function nominalVoltageOf(outputs: OutputElectricalPlan[]): number {
  return outputs[0]?.nominalVoltage ?? 5
}

function planTrunk(designCurrentMa: number, nominalVoltage: number): SupplyTrunkPlan {
  const conductor = recommendConductor({
    // Coordinated like a branch: the wire carries the main fuse's rating.
    designCurrentMa: standardFuseRatingFor(designCurrentMa) ?? Math.ceil(designCurrentMa / 0.75),
    oneWayLengthMm: DEFAULT_TRUNK_LENGTH_MM,
    circuitVoltage: nominalVoltage,
    allowedVoltageDropPercent: (MAX_TRUNK_VOLTAGE_DROP_V / nominalVoltage) * 100,
    material: 'copper',
    ambientC: 30,
    bundledCircuits: 1,
  })
  const mainFuse = conductor
    // A bolted lug on the trunk is rated with the cable, so the wire is the limit.
    ? recommendFuse(designCurrentMa, conductor.deratedAmpacityMa, conductor.deratedAmpacityMa)
    : {
        minimumLoadRatingMa: Math.ceil(designCurrentMa / 0.75),
        maximumProtectiveRatingMa: 0,
        unresolvedReason: "No conductor in the reviewed table carries this zone's main fuse; split the zone across more supplies.",
      }
  return { designCurrentMa, oneWayLengthMm: DEFAULT_TRUNK_LENGTH_MM, conductor, mainFuse }
}

function planControllerSupply(
  manifest: HardwareManifest,
  exactBoard: PhysicalBoardProfile | undefined,
  blockers: ElectricalPlanIssue[],
): ControllerSupplyPlan | undefined {
  const converters = manifest.primaryItems.filter((item) =>
    item.kind === 'power-converter' && item.facts.role === 'controller')
  if (converters.length === 0) return undefined
  if (converters.length > 1) {
    blockers.push({
      id: 'controller-converter-count',
      severity: 'blocking',
      title: 'Controller power',
      detail: `${converters.length} converters are set to power the controller. A board takes one supply on its 5 V input; remove the extra ones.`,
    })
  }
  const item = converters[0]
  const module = powerConverterModuleFor(item.facts.partId)
  if (!module) return undefined
  const { spec } = module
  const sourceVoltage = Number(item.facts.sourceVoltage)
  const sourceIssue = sourceVoltageIssue(spec, sourceVoltage)
  if (sourceIssue) {
    blockers.push({ id: `${item.id}:source-voltage`, severity: 'blocking', title: module.label, detail: sourceIssue })
  }
  const powerIn = exactBoard?.pins?.find((pin) => pin.role === 'power-in')
  if (exactBoard && !powerIn) {
    blockers.push({
      id: `${item.id}:no-power-input`,
      severity: 'blocking',
      title: module.label,
      detail: `${exactBoard.label} has no 5 V input pin in its profile, so there is nowhere safe to land the converter's output. Power the controller over USB instead.`,
    })
  }
  if (exactBoard?.confidence === 'pinout-verified') {
    blockers.push({
      id: `${item.id}:board-power-path`,
      severity: 'blocking',
      title: exactBoard.label,
      detail: "This profile's pinout is verified but its onboard power path is not, so feeding its 5 V pin from a converter is unconfirmed. Power it over USB instead, or choose a board whose power path is verified.",
    })
  }
  const inputCurrentMa = Number.isFinite(sourceVoltage) && sourceVoltage > 0
    ? ratedInputCurrentMa(spec, sourceVoltage)
    : 0
  const inputConductor = inputCurrentMa > 0
    ? recommendConductor({
        designCurrentMa: standardFuseRatingFor(inputCurrentMa) ?? Math.ceil(inputCurrentMa / 0.75),
        oneWayLengthMm: DEFAULT_FEED_CABLE_LENGTH_MM,
        circuitVoltage: sourceVoltage,
        allowedVoltageDropPercent: DEFAULT_ALLOWED_VOLTAGE_DROP_PERCENT,
        material: 'copper',
        ambientC: 30,
        bundledCircuits: 1,
      })
    : undefined
  const inputFuse = inputConductor
    ? recommendFuse(inputCurrentMa, inputConductor.deratedAmpacityMa, inputConductor.deratedAmpacityMa)
    : { minimumLoadRatingMa: Math.ceil(inputCurrentMa / 0.75), maximumProtectiveRatingMa: 0, unresolvedReason: 'Set a valid source voltage to size the input fuse.' }
  return {
    itemId: item.id,
    partId: module.partId,
    label: module.label,
    sourceVoltage,
    outputVoltage: spec.outputSetV,
    continuousCurrentMa: spec.continuousCurrentMa,
    adjustable: spec.adjustable,
    powerInPinLabel: powerIn?.label,
    powerInAnchorId: powerIn?.anchorId,
    inputCurrentMa,
    inputConductor,
    inputFuse,
  }
}

function controllerSupplyRecommendations(supply: ControllerSupplyPlan): string[] {
  return [
    ...(supply.adjustable
      ? [`Set the ${supply.label} to ${supply.outputVoltage} V with a meter before it is connected to the controller: it ships at an arbitrary output.`]
      : []),
    `Keep the controller and every 5 V module on its pin under the converter's ${formatRuleCurrent(supply.continuousCurrentMa)} continuous rating.`,
    `Fuse the converter's input at the ${supply.sourceVoltage} V source${supply.inputFuse.ratingMa ? ` (${formatRuleCurrent(supply.inputFuse.ratingMa)})` : ''}; its negative joins the common ground.`,
    "Do not plug in USB while the converter powers the board unless the board's documentation says its 5 V pin is diode-isolated from USB; two supplies on one rail can back-feed the computer.",
  ]
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
    // Hardware is sized for full white whatever the firmware limit says: a
    // limit that is changed, cleared or never flashed must not overload the
    // supply, the trunk or its fuse.
    const recommendedSupplyMa = recommendedSupplyCurrentMa(designCurrentMa)
    const recommendedSupplyWattage = Number(((recommendedSupplyMa / 1000) * nominalVoltage).toFixed(1))

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
      recommendedSupplyCurrentMa: recommendedSupplyMa,
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

  const controllerSupply = planControllerSupply(manifest, exactBoard, blockers)

  const unresolved = outputPlans.flatMap((output) => [
    ...output.injections.flatMap((injection) => [
      injection.conductor ? undefined : `${output.title} ${injection.role} feed: no reviewed conductor size meets the generated branch load.`,
      injection.fuse.unresolvedReason ? `${output.title} ${injection.role} feed: ${injection.fuse.unresolvedReason}` : undefined,
    ]),
  ].filter((entry): entry is string => !!entry))
  for (const supply of totals?.supplies ?? []) {
    const zone = supply.id.replace('supply-', 'PSU zone ')
    if (!supply.trunk.conductor) unresolved.push(`${zone} trunk: no reviewed conductor carries the zone's main fuse.`)
    else if (supply.trunk.mainFuse.unresolvedReason) unresolved.push(`${zone} main fuse: ${supply.trunk.mainFuse.unresolvedReason}`)
  }
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
    controllerSupply
      ? `Power the controller from the ${controllerSupply.label} into its ${controllerSupply.powerInPinLabel ?? '5 V input'} pin; do not route LED load through the controller board.`
      : 'Power the controller through its USB-C connector; do not route LED load through the controller board.',
    ...(controllerSupply ? controllerSupplyRecommendations(controllerSupply) : []),
    'Join controller, microphone, level shifter, supply, and LED grounds at the common distribution ground.',
    'Use one 74AHCT125 channel and one 330 ohm series resistor for each WS2812B data route.',
    'Install one good-quality, correctly polarized 1000 uF, 6.3 V low-ESR electrolytic capacitor across +5 V and GND after every branch fuse, before the matrix feed or power-injection connection.',
    "Fit each supply's main fuse on its positive lead, as close to the supply terminal as the fuse holder allows, before the trunk reaches the fuse block.",
    'Reducing global brightness lowers operating power without changing the worst-case wiring recommendation.',
    'Supplies, trunks, fuses and branch wiring are all sized for the uncapped full-white load. A FastLED current limit lowers running power and heat; it does not make smaller hardware safe.',
  ]
  for (const output of outputPlans) {
    recommendations.push(
      `${output.title}: provide ${output.recommendedFeedCount} fused power feeds, no more than about ${output.pixelsPerFeed} pixels per feed.`,
    )
    if (output.operatingCurrentCapMa != null) {
      recommendations.push(
        `${output.title}: configured ${formatRuleCurrent(output.operatingCurrentCapMa)} software limit; the hardware is still sized for its ${formatRuleCurrent(output.designCurrentMa)} full-white load.`,
      )
    }
    if (output.conductor && output.connectorMinimumMa && output.fuse.ratingMa) {
      recommendations.push(
        `${output.title}: feed sizes vary by location; use the per-feed conductor, connector, and fuse ratings shown in the connection plan.`,
      )
    }
  }

  const assumptionsUsed = [
    'WS2812B supplies, wiring and protection are sized at 60 mA per pixel full white; a configured firmware cap does not reduce any recommendation.',
    `${DEFAULT_LED_DENSITY_PER_METER} LEDs/m and ${DEFAULT_FEED_CABLE_LENGTH_MM} mm one-way copper feeds are used when the graph has no physical product dimensions.`,
    `Start and end feeds are limited to ${formatRuleCurrent(MAX_END_FEED_CURRENT_MA)}; centre feeds may carry up to ${formatRuleCurrent(MAX_CENTER_FEED_CURRENT_MA)} before splitting in both directions.`,
    `Supply groups are packed from uncapped full-white loads, up to approximately ${formatRuleCurrent(MAX_RECOMMENDED_SUPPLY_CURRENT_MA)} continuous each; positive rails from separate PSU zones must not be paralleled.`,
    `Supply sizing targets ${DEFAULT_SUPPLY_HEADROOM_PERCENT}% headroom, then uses whole-amp sizes up to 10 A and 10 A sizes above that; a target less than 2 A above a 10 A boundary rounds down without going below the full-white load.`,
    `Conductor voltage drop is limited to ${MAX_VOLTAGE_DROP_V} V over the complete 500 mm one-way feed circuit.`,
    `Each supply's trunk to its fuse block is ${DEFAULT_TRUNK_LENGTH_MM} mm one way, sized for the uncapped sum of its branches and a further ${MAX_TRUNK_VOLTAGE_DROP_V} V of drop.`,
    'Conductor ampacities are NFPA 70 (2023) Table 310.16, 90 C copper, 30 C ambient.',
  ]

  if (exactBoard?.confidence === 'pinout-verified' && !controllerSupply) {
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
    controllerPowerPath: !exactBoard
      ? undefined
      : controllerSupply
        ? `${controllerSupply.label}, ${controllerSupply.sourceVoltage} V to ${controllerSupply.outputVoltage} V, into the board's ${controllerSupply.powerInPinLabel ?? '5 V input'} pin`
        : 'USB-C power (controller only)',
    controllerSupply,
    branchChecks: [],
    recommendations,
    unresolved,
    assumptionsUsed,
    ruleSetVersion: ELECTRICAL_RULESET_VERSION,
  }
}

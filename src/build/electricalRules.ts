import type { BuildConductorMaterial } from './buildProfile'

export const ELECTRICAL_RULESET_VERSION = 'build-rules-2026.09.27-v5'
export const DEFAULT_ALLOWED_VOLTAGE_DROP_PERCENT = 5

export interface WireRule {
  awg: number
  crossSectionMm2: number
  copperResistanceOhmPerKm: number
  continuousAmpacityMa: number
}

export interface ConductorSizingInput {
  designCurrentMa: number
  oneWayLengthMm: number
  circuitVoltage: number
  allowedVoltageDropPercent: number
  material: BuildConductorMaterial
  ambientC: number
  bundledCircuits: number
}

export interface ConductorRecommendation {
  awg: number
  crossSectionMm2: number
  material: BuildConductorMaterial
  deratedAmpacityMa: number
  voltageDrop: number
  voltageDropPercent: number
  oneWayLengthMm: number
  limitingFactor: 'ampacity' | 'voltage-drop'
}

export interface FuseRecommendation {
  ratingMa?: number
  minimumLoadRatingMa: number
  maximumProtectiveRatingMa: number
  unresolvedReason?: string
}

// NFPA 70 (NEC) 2023 Table 310.16, 90 C copper: not more than three
// current-carrying conductors in raceway or cable, 30 C ambient. One standard
// for every gauge, so a trunk and its branches are judged on the same basis;
// the table has no 20 AWG row, so neither does this. Resistance values are
// standard nominal copper at 20 C; voltage drop is calculated over the
// complete out-and-back circuit length.
export const WIRE_RULES: readonly WireRule[] = [
  { awg: 18, crossSectionMm2: 0.8, copperResistanceOhmPerKm: 20.95, continuousAmpacityMa: 14000 },
  { awg: 16, crossSectionMm2: 1.3, copperResistanceOhmPerKm: 13.17, continuousAmpacityMa: 18000 },
  { awg: 14, crossSectionMm2: 2.0, copperResistanceOhmPerKm: 8.286, continuousAmpacityMa: 25000 },
  { awg: 12, crossSectionMm2: 3.3, copperResistanceOhmPerKm: 5.211, continuousAmpacityMa: 30000 },
  { awg: 10, crossSectionMm2: 5.2, copperResistanceOhmPerKm: 3.277, continuousAmpacityMa: 40000 },
  { awg: 8, crossSectionMm2: 8.3, copperResistanceOhmPerKm: 2.061, continuousAmpacityMa: 55000 },
  { awg: 6, crossSectionMm2: 13.3, copperResistanceOhmPerKm: 1.296, continuousAmpacityMa: 75000 },
  { awg: 4, crossSectionMm2: 21.2, copperResistanceOhmPerKm: 0.8152, continuousAmpacityMa: 95000 },
  { awg: 2, crossSectionMm2: 33.6, copperResistanceOhmPerKm: 0.5127, continuousAmpacityMa: 130000 },
] as const

// Branch blade ratings, then the bolt-down (MIDI/ANL-class) ratings a supply's
// main fuse is chosen from.
const STANDARD_FUSE_RATINGS_MA = [
  500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 25000, 30000, 40000, 50000,
  60000, 70000, 80000, 100000, 125000, 150000,
] as const

function ambientDerating(ambientC: number): number {
  if (ambientC <= 30) return 1
  if (ambientC <= 40) return 0.91
  if (ambientC <= 50) return 0.82
  if (ambientC <= 60) return 0.71
  return 0.58
}

function bundleDerating(circuits: number): number {
  if (circuits <= 2) return 1
  if (circuits <= 4) return 0.8
  if (circuits <= 6) return 0.7
  // NEC 310.15(C)(1) goes to 50% from ten conductors; below that this keeps
  // the older, stricter steps rather than loosening them.
  if (circuits <= 9) return 0.6
  return 0.5
}

function materialResistanceMultiplier(material: BuildConductorMaterial): number {
  return material === 'cca' ? 1.55 : 1
}

export function conductorVoltageDrop(
  rule: WireRule,
  designCurrentMa: number,
  oneWayLengthMm: number,
  material: BuildConductorMaterial,
): number {
  const currentA = designCurrentMa / 1000
  const circuitLengthKm = (oneWayLengthMm * 2) / 1_000_000
  return currentA * rule.copperResistanceOhmPerKm * materialResistanceMultiplier(material) * circuitLengthKm
}

export function recommendConductor(input: ConductorSizingInput): ConductorRecommendation | undefined {
  const allowedDropV = input.circuitVoltage * (input.allowedVoltageDropPercent / 100)
  const ambientFactor = ambientDerating(input.ambientC)
  const bundledFactor = bundleDerating(input.bundledCircuits)

  for (const rule of WIRE_RULES) {
    const deratedAmpacityMa = Math.floor(rule.continuousAmpacityMa * ambientFactor * bundledFactor)
    const voltageDrop = conductorVoltageDrop(rule, input.designCurrentMa, input.oneWayLengthMm, input.material)
    if (deratedAmpacityMa < input.designCurrentMa || voltageDrop > allowedDropV) continue

    const previous = WIRE_RULES[WIRE_RULES.indexOf(rule) - 1]
    const previousAmpacity = previous
      ? Math.floor(previous.continuousAmpacityMa * ambientFactor * bundledFactor)
      : 0
    const previousDrop = previous
      ? conductorVoltageDrop(previous, input.designCurrentMa, input.oneWayLengthMm, input.material)
      : Number.POSITIVE_INFINITY

    return {
      awg: rule.awg,
      crossSectionMm2: rule.crossSectionMm2,
      material: input.material,
      deratedAmpacityMa,
      voltageDrop: Number(voltageDrop.toFixed(3)),
      voltageDropPercent: Number(((voltageDrop / input.circuitVoltage) * 100).toFixed(2)),
      oneWayLengthMm: input.oneWayLengthMm,
      limitingFactor: previousAmpacity < input.designCurrentMa ? 'ampacity' : previousDrop > allowedDropV ? 'voltage-drop' : 'ampacity',
    }
  }
  return undefined
}

/**
 * The smallest standard fuse that carries a load at the 75% continuous
 * loading limit. A conductor is then sized to carry *this* rating, not the
 * load: sizing the wire to the load alone can leave no standard fuse between
 * the load's minimum and the wire's ampacity.
 */
export function standardFuseRatingFor(designCurrentMa: number): number | undefined {
  const minimumLoadRatingMa = Math.ceil(designCurrentMa / 0.75)
  return STANDARD_FUSE_RATINGS_MA.find((rating) => rating >= minimumLoadRatingMa)
}

export function recommendFuse(
  designCurrentMa: number,
  conductorAmpacityMa: number,
  connectorRatingMa: number,
): FuseRecommendation {
  // Littelfuse recommends no more than 75% continuous loading for common fuses.
  const minimumLoadRatingMa = Math.ceil(designCurrentMa / 0.75)
  const maximumProtectiveRatingMa = Math.min(conductorAmpacityMa, connectorRatingMa)
  const ratingMa = STANDARD_FUSE_RATINGS_MA.find((rating) =>
    rating >= minimumLoadRatingMa && rating <= maximumProtectiveRatingMa)
  if (ratingMa == null) {
    return {
      minimumLoadRatingMa,
      maximumProtectiveRatingMa,
      unresolvedReason: `No standard fuse rating fits between the ${minimumLoadRatingMa} mA continuous-load minimum and ${maximumProtectiveRatingMa} mA protected-path limit.`,
    }
  }
  return { ratingMa, minimumLoadRatingMa, maximumProtectiveRatingMa }
}

export function wireRuleForOwnedPart(gaugeAwg?: number, crossSectionMm2?: number): WireRule | undefined {
  if (gaugeAwg != null) return WIRE_RULES.find((rule) => rule.awg === gaugeAwg)
  if (crossSectionMm2 != null) {
    return [...WIRE_RULES].reverse().find((rule) => rule.crossSectionMm2 <= crossSectionMm2)
  }
  return undefined
}

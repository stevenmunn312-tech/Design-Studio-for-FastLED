import type { BuildConductorMaterial } from '../buildProfile'

export const ELECTRICAL_RULESET_VERSION = 'build-rules-2026.09.27-v7'
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

export interface FuseClassRule {
  id: 'ato-atc' | 'midi' | 'anl' | 'mrbf' | 'class-t'
  label: string
  minimumRatingMa: number
  maximumRatingMa: number
  maximumVoltageV: number
  interruptRatingA: number
  sourceUrl: string
}

// Manufacturer figures, using the lower value when product revisions differ:
// Littelfuse ATO 287: 1-40 A, 32 V DC, 1 kA interrupting rating.
// https://www.littelfuse.com/products/fuses-overcurrent-protection/fuses/automotive-aftermarket-products-fuses/blade-fuses-shunts-automotive-aftermarket/ato
// Littelfuse MIDI 498 (2024): 30-200 A, 32 V DC, 2 kA.
// https://www.littelfuse.com/assetdocs/midi-32v-bolt-down-series-data-sheet?assetguid=b55e8034-180d-40f6-a0a7-bebc2d4a94f5
// Blue Sea ANL: 35-750 A, 32 V DC, 6 kA.
// https://catalog2015.bluesea.com/files/common/downloads/page0043.pdf
// Eaton MRBF: 30-300 A, 58 V DC, 2 kA at 58 V DC.
// https://www.eaton.com/sg/en-us/catalog/emobility/marine-rated-battery-fuse.html
// Littelfuse JLLN Class T: 1-1200 A, at least 125 V DC, at least 20 kA.
// https://www.littelfuse.com/assetdocs/jlln-datasheet?assetguid=3a7bc9bf-d932-4401-bdc7-b39f302195cf
export const FUSE_CLASSES: readonly FuseClassRule[] = [
  { id: 'ato-atc', label: 'ATO/ATC blade', minimumRatingMa: 1000, maximumRatingMa: 40000, maximumVoltageV: 32, interruptRatingA: 1000, sourceUrl: 'https://www.littelfuse.com/products/fuses-overcurrent-protection/fuses/automotive-aftermarket-products-fuses/blade-fuses-shunts-automotive-aftermarket/ato' },
  { id: 'midi', label: 'MIDI', minimumRatingMa: 30000, maximumRatingMa: 200000, maximumVoltageV: 32, interruptRatingA: 2000, sourceUrl: 'https://www.littelfuse.com/assetdocs/midi-32v-bolt-down-series-data-sheet?assetguid=b55e8034-180d-40f6-a0a7-bebc2d4a94f5' },
  { id: 'anl', label: 'ANL', minimumRatingMa: 35000, maximumRatingMa: 750000, maximumVoltageV: 32, interruptRatingA: 6000, sourceUrl: 'https://catalog2015.bluesea.com/files/common/downloads/page0043.pdf' },
  { id: 'mrbf', label: 'MRBF', minimumRatingMa: 30000, maximumRatingMa: 300000, maximumVoltageV: 58, interruptRatingA: 2000, sourceUrl: 'https://www.eaton.com/sg/en-us/catalog/emobility/marine-rated-battery-fuse.html' },
  { id: 'class-t', label: 'Class T', minimumRatingMa: 1000, maximumRatingMa: 1200000, maximumVoltageV: 125, interruptRatingA: 20000, sourceUrl: 'https://www.littelfuse.com/assetdocs/jlln-datasheet?assetguid=3a7bc9bf-d932-4401-bdc7-b39f302195cf' },
] as const

export function recommendFuseClass(
  ratingMa: number,
  maximumVoltageV: number,
  prospectiveCurrentA: number,
): FuseClassRule | undefined {
  return FUSE_CLASSES.find((rule) =>
    ratingMa >= rule.minimumRatingMa
    && ratingMa <= rule.maximumRatingMa
    && maximumVoltageV <= rule.maximumVoltageV
    && prospectiveCurrentA <= rule.interruptRatingA)
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

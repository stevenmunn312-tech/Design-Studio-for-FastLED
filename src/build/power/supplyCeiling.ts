import type { PartPowerConverterSpec } from '../parts/partCatalogue'

/** What powers a zone, as far as its hard current ceiling goes. */
export interface SupplyCeilingZone {
  /** The user's own supply, rated off its label. */
  ownedSupply?: { ratedCurrentMa: number }
  /** A converter that makes the zone's LED rail. It is the zone's ceiling, not a supply upstream of it. */
  converter?: { ratedCurrentMa: number; outputCurrentLimit: PartPowerConverterSpec['outputCurrentLimit'] }
}

/**
 * The most current a zone's source can deliver, or null when nothing limits
 * it. A supply the user entered is held to its rating; a converter with a
 * stated output limit is held to its rating. A converter with no output limit
 * (a plain boost, a pack output) cannot stop an output short, and an
 * adjustable one has no setting yet, so neither sets a ceiling; nor does a
 * zone with no supply entered.
 */
export function supplyCeilingMa(zone: SupplyCeilingZone): number | null {
  if (zone.converter) {
    return zone.converter.outputCurrentLimit === 'fixed' ? zone.converter.ratedCurrentMa : null
  }
  return zone.ownedSupply ? zone.ownedSupply.ratedCurrentMa : null
}

/**
 * The current hardware is sized for: the most that can flow. That is the
 * full-white load, or the ceiling when the source cannot deliver that much.
 * A firmware cap never enters it.
 */
export function sizingCurrentMa(fullWhiteMa: number, ceilingMa: number | null): number {
  return ceilingMa == null ? fullWhiteMa : Math.min(fullWhiteMa, ceilingMa)
}

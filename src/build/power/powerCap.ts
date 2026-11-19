import type { StudioNode } from '../../state/graphStore'
import { powerSupplies, powerSupplyName, powerSupplyRating, supplyForLoad } from '../../state/peripherals/powerSupply'
import { outputForm, outputLedTotal } from '../../state/output/ledOutputForm'
import { stereoVuTotalLeds } from '../../state/audio/stereoVuSizing'
import { CONTROLLER_DRAW_MA, targetFamilyFromFqbn, type BuildTargetFamily } from '../buildProfile'
import { selectedPhysicalBoardProfile } from '../boards/boardProfiles'
import { controllerSettings } from '../controllerSettings'
import { ledFullWhiteDraw } from './ledDraw'
import { recommendedSupplyCurrentMa } from './powerSupplySizing'

/** The share of the supplies' rating the default cap leaves the LEDs. */
export const SUPPLY_CAP_FRACTION = 0.85
/** The Board's milliamps field bounds; the default cap stays inside them. */
export const POWER_CAP_MA = { min: 100, max: 100000, step: 50 } as const

/**
 * A board's family for its controller draw: the chosen board profile's, else
 * the selected FQBN's, else unknown (the largest draw).
 */
export function boardFamily(nodes: readonly StudioNode[], fqbn?: string): BuildTargetFamily {
  const profileFqbn = selectedPhysicalBoardProfile(nodes as StudioNode[])?.compatibleFqbns[0]
  return targetFamilyFromFqbn(profileFqbn ?? fqbn ?? '')
}

/**
 * The LED loads, each with its full-white power in mW at its own chipset's
 * voltage: every LED output, and every enabled Stereo VU Meter (two physical
 * runs). The one per-load figure the Board, Checks and the supply segments
 * read.
 */
export function ledLoads(nodes: readonly StudioNode[]): Array<{ node: StudioNode; leds: number; fullWhiteMw: number }> {
  return nodes.flatMap((node) => {
    const props = node.data.properties as Record<string, unknown>
    if (node.data.nodeType === 'MatrixOutput') {
      const leds = outputLedTotal(props)
      const draw = ledFullWhiteDraw(props.chipset ?? 'WS2812B', outputForm(props), props.partId)
      return [{ node, leds, fullWhiteMw: leds * draw.maPerLed * draw.volts }]
    }
    if (node.data.nodeType === 'StereoVuMeter' && props.enabled !== false) {
      const leds = stereoVuTotalLeds(props)
      const draw = ledFullWhiteDraw(props.chipset ?? 'WS2812B')
      return [{ node, leds, fullWhiteMw: leds * draw.maPerLed * draw.volts }]
    }
    return []
  })
}

/** One of the user's supplies with the full-white load of the LEDs it feeds. */
export interface SupplySegment {
  nodeId: string
  name: string
  voltage: number
  ratingMa: number
  /** Full white of the LEDs on this supply, in mA at its voltage. */
  fullWhiteMa: number
}

/**
 * The supplies that feed this board's LEDs directly, each with its segment's
 * full-white load. A supply at another voltage than the LEDs sits upstream of
 * a converter (or is a blocked mismatch) and does not bound the LED rail, so
 * it is left out.
 */
export function supplySegments(nodes: readonly StudioNode[]): SupplySegment[] {
  if (powerSupplies(nodes).length === 0) return []
  const volts = controllerSettings(nodes as StudioNode[]).volts
  const segments = new Map<string, SupplySegment>()
  for (const load of ledLoads(nodes)) {
    const supply = supplyForLoad(nodes, load.node.data.properties as Record<string, unknown>)
    if (!supply) continue
    const rating = powerSupplyRating(supply.data.properties as Record<string, unknown>)
    if (rating.voltage !== volts) continue
    const segment = segments.get(supply.id) ?? {
      nodeId: supply.id,
      name: powerSupplyName(nodes, supply),
      voltage: rating.voltage,
      ratingMa: Math.round(rating.ratedCurrentA * 1000),
      fullWhiteMa: 0,
    }
    segment.fullWhiteMa += load.fullWhiteMw / rating.voltage
    segments.set(supply.id, segment)
  }
  return [...segments.values()]
}

/**
 * The same segments read off the electrical plan's zones: one zone per supply
 * the user entered, carrying that supply and its full-white load.
 */
export function zoneSupplySegments(zones: ReadonlyArray<{
  designCurrentMa: number
  ownedSupply?: { itemId: string; title: string; voltage: number; ratedCurrentMa: number }
}>): SupplySegment[] {
  return zones.flatMap((zone) => zone.ownedSupply
    ? [{
        nodeId: zone.ownedSupply.itemId,
        name: zone.ownedSupply.title,
        voltage: zone.ownedSupply.voltage,
        ratingMa: zone.ownedSupply.ratedCurrentMa,
        fullWhiteMa: zone.designCurrentMa,
      }]
    : [])
}

/** The combined rating of the supplies that feed the LEDs directly, or null when none does. */
export function ledSupplyRatingMa(nodes: readonly StudioNode[]): number | null {
  const segments = supplySegments(nodes)
  return segments.length > 0 ? segments.reduce((sum, segment) => sum + segment.ratingMa, 0) : null
}

/**
 * The cap a supply allows: 85% of its rating, less the controller's own
 * draw, rounded down to 50 mA and held inside the Board's field bounds.
 */
export function supplyPowerCapMa(supplyRatingMa: number, family: BuildTargetFamily): number {
  const capMa = Math.floor(((SUPPLY_CAP_FRACTION * supplyRatingMa) - CONTROLLER_DRAW_MA[family]) / POWER_CAP_MA.step) * POWER_CAP_MA.step
  return Math.max(POWER_CAP_MA.min, Math.min(POWER_CAP_MA.max, capMa))
}

/**
 * The cap the Board starts at when it is ticked, and that a starter sets. With
 * the user's supplies on the bench it follows them (one global figure over
 * their combined rating, which is FastLED's model); otherwise, and whenever
 * the supply allows more, it is the full-white draw, which never dims.
 */
export function defaultPowerCapMa(
  nodes: readonly StudioNode[],
  family: BuildTargetFamily,
  fullWhiteCapMa: number,
): number {
  const ratingMa = ledSupplyRatingMa(nodes)
  return ratingMa == null ? fullWhiteCapMa : Math.min(fullWhiteCapMa, supplyPowerCapMa(ratingMa, family))
}

/** What the user's supplies allow, against the LEDs' full-white draw. */
export interface SupplyCoverage {
  segments: SupplySegment[]
  volts: number
  ratingMa: number
  fullWhiteMa: number
  /** 85% of the rating less the controller: the cap the supplies allow. */
  capMa: number
  /** About how bright the whole fixture can run, in 5% steps; 100 when it covers full white. */
  brightnessPercent: number
  /** The supplies' cap reaches full white, so no cap is needed. */
  coversFullWhite: boolean
  /** Supplies below their own segment's full white: the wiring there is sized to the supply. */
  limitingSegments: SupplySegment[]
}

export function supplyCoverage(
  segments: readonly SupplySegment[],
  fullWhiteMa: number,
  family: BuildTargetFamily,
): SupplyCoverage | null {
  if (segments.length === 0) return null
  const ratingMa = segments.reduce((sum, segment) => sum + segment.ratingMa, 0)
  const capMa = supplyPowerCapMa(ratingMa, family)
  const coversFullWhite = capMa >= fullWhiteMa
  return {
    segments: [...segments],
    volts: segments[0].voltage,
    ratingMa,
    fullWhiteMa,
    capMa,
    brightnessPercent: coversFullWhite ? 100 : Math.max(0, Math.floor((capMa / fullWhiteMa) * 20) * 5),
    coversFullWhite,
    limitingSegments: segments.filter((segment) => segment.ratingMa < segment.fullWhiteMa),
  }
}

/** The supplies on the bench below their own segment's full white, when there are several. */
export function undersizedSegments(coverage: SupplyCoverage | null): Array<SupplySegment & { neededMa: number }> {
  if (!coverage || coverage.segments.length < 2) return []
  return coverage.limitingSegments.map((segment) => ({ ...segment, neededMa: recommendedSupplyCurrentMa(segment.fullWhiteMa) }))
}

export function formatAmps(valueMa: number): string {
  const amps = valueMa / 1000
  return `${Number(amps.toFixed(amps < 10 ? 2 : 1))} A`
}

/**
 * The three sentences every power surface says: what full white needs, what
 * the supply allows, and what the wiring was sized for.
 */
export function supplyCoverageSentences(coverage: SupplyCoverage): { needs: string; allows: string; wired: string } {
  const several = coverage.segments.length > 1
  const yours = several
    ? `Your ${coverage.segments.length} supplies (${formatAmps(coverage.ratingMa)} together)`
    : `Your ${formatAmps(coverage.ratingMa)} supply`
  const limiting = coverage.limitingSegments
  return {
    needs: `Full white needs ${formatAmps(coverage.fullWhiteMa)}.`,
    allows: coverage.coversFullWhite
      ? `${yours} ${several ? 'cover' : 'covers'} full white.`
      : `${yours} ${several ? 'allow' : 'allows'} about ${coverage.brightnessPercent}% brightness.`,
    wired: limiting.length === 0
      ? 'Wired for full white.'
      : limiting.length === 1 && !several
        ? `Wired for a ${limiting[0].voltage} V ${formatAmps(limiting[0].ratingMa)} supply.`
        : `Wired for ${limiting.map((segment) => `${segment.name} (${segment.voltage} V ${formatAmps(segment.ratingMa)})`).join(', ')}.`,
  }
}

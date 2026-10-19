/**
 * Data lanes: one LED output fed from several data pins.
 *
 * A long fixture keeps one LED output, one `leds` array and one render, but
 * its chain is cut into equal lanes, each driven from its own GPIO by
 * `addLeds<...>(leds, offset, count)`. FastLED then sends the lanes at once
 * where the board's driver can (`parallelOutputs` in src/build/ledDrivers.ts)
 * and one after another where it cannot, so the wire time of a frame drops to
 * one lane's on a parallel board.
 *
 * The contract, shared by every reader (firmware, pin claims, the Build
 * Diagram, the wiring diagnostic and the Split across pins fix):
 *
 * - `dataLanes` is a whole number of lanes, 1 by default;
 * - `lanePins` holds the data pins of lanes 2..N in order; lane 1 keeps
 *   `dataPin`;
 * - lanes are equal, and every lane boundary falls on a whole row (a matrix or
 *   custom layout), a whole panel (a panels layout) or anywhere on a single
 *   chain, so the existing XY map, preview, RAM and power figures are untouched;
 * - only one-wire clockless chipsets split. A clocked chipset would need a
 *   clock line per lane, and HUB75 has its own ribbon.
 *
 * Documented in docs/architecture/multi-output-routing.md ("Data lanes").
 */
import { HUB75_CHIPSET, SPI_CHIPSETS } from '../nodeLibrary'
import { isLinearForm, outputForm, outputGridDims, outputLedTotal } from './ledOutputForm'

/** The most lanes one output offers: the classic ESP32's eight RMT channels. */
export const MAX_DATA_LANES = 8

/**
 * A lane pin's key in pin claims: `lanePins.0` is lane 2's pin. Not a property
 * of its own, so per-property repairs (a pin picker's "move to a free pin")
 * leave it alone and the lane control owns it.
 */
export const LANE_PIN_KEY_PREFIX = 'lanePins.'

/** The `lanePins` index a pin-claim key names, or null for any other key. */
export function lanePinIndex(propertyKey: string): number | null {
  if (!propertyKey.startsWith(LANE_PIN_KEY_PREFIX)) return null
  const index = Number(propertyKey.slice(LANE_PIN_KEY_PREFIX.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function whole(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

/** Whether this output's chipset and form can be split at all. */
export function outputCanSplitLanes(props: Record<string, unknown>): boolean {
  if (outputForm(props) === 'hub75') return false
  const chipset = String(props.chipset ?? 'WS2812B')
  return chipset !== HUB75_CHIPSET && !SPI_CHIPSETS.has(chipset)
}

/**
 * The run of LEDs a lane must be a whole number of: one LED on a single
 * chain, a row on a matrix or custom map, a panel on a panels layout. Null
 * when the output cannot be split.
 */
export function dataLaneUnit(props: Record<string, unknown>): number | null {
  if (!outputCanSplitLanes(props)) return null
  if (isLinearForm(outputForm(props))) return 1
  const { width, height } = outputGridDims(props)
  if (props.layout === 'panels') {
    const tilesX = whole(props.tilesX, 1, 1, 16)
    const tilesY = whole(props.tilesY, 1, 1, 16)
    if (width % tilesX === 0 && height % tilesY === 0) return (width / tilesX) * (height / tilesY)
  }
  return width
}

/**
 * The lane counts this output offers, always starting with 1: every count up
 * to `maxLanes` that cuts the chain into equal lanes on whole rows or panels.
 */
export function offeredDataLaneCounts(props: Record<string, unknown>, maxLanes = MAX_DATA_LANES): number[] {
  const unit = dataLaneUnit(props)
  if (unit === null) return [1]
  const total = outputLedTotal(props)
  const counts = [1]
  for (let lanes = 2; lanes <= Math.min(maxLanes, MAX_DATA_LANES); lanes += 1) {
    if (total % lanes === 0 && (total / lanes) % unit === 0) counts.push(lanes)
  }
  return counts
}

/** The lane count the output asks for, whether or not it is offered. */
export function requestedDataLanes(props: Record<string, unknown>): number {
  return whole(props.dataLanes, 1, 1, 64)
}

/** The stored lane pins, as whole numbers; anything else reads as missing. */
export function storedLanePins(props: Record<string, unknown>): Array<number | null> {
  const raw = Array.isArray(props.lanePins) ? props.lanePins : []
  return raw.map((pin) => (typeof pin === 'number' && Number.isInteger(pin) && pin >= 0 ? pin : null))
}

/**
 * The pins lanes 2..N claim: every one the request names, so a lane pin is a
 * claim the moment it is chosen, even while another fault keeps the build
 * from using it. Empty for an output that cannot split.
 */
export function claimedLanePins(props: Record<string, unknown>): Array<{ lane: number; index: number; pin: number }> {
  if (!outputCanSplitLanes(props)) return []
  const lanes = requestedDataLanes(props)
  return storedLanePins(props)
    .slice(0, Math.max(0, lanes - 1))
    .flatMap((pin, index) => (pin === null ? [] : [{ lane: index + 2, index, pin }]))
}

export interface DataLanePlan {
  /** Lanes the firmware drives; 1 means the plain single-pin output. */
  lanes: number
  /** LEDs in each lane. */
  perLane: number
  /** The pins of lanes 2..N, in order; empty for one lane. */
  lanePins: number[]
}

/**
 * The lanes the firmware drives. A request that is not offered, or that is
 * missing a lane pin, falls back to one lane; `findDataLaneIssues` reports it,
 * and deploy validation blocks the build until it is fixed.
 */
export function dataLanePlan(props: Record<string, unknown>): DataLanePlan {
  const total = outputLedTotal(props)
  const lanes = requestedDataLanes(props)
  const single = { lanes: 1, perLane: total, lanePins: [] }
  if (lanes <= 1 || !offeredDataLaneCounts(props).includes(lanes)) return single
  const pins = storedLanePins(props).slice(0, lanes - 1)
  if (pins.length < lanes - 1 || pins.some((pin) => pin === null)) return single
  return { lanes, perLane: total / lanes, lanePins: pins as number[] }
}

/** Every pin a lane plan drives, lane 1 first. */
export function lanePinsWithDataPin(props: Record<string, unknown>): number[] {
  const plan = dataLanePlan(props)
  return [Number(props.dataPin ?? 5), ...plan.lanePins]
}

/** What is wrong with an output's lane settings, in user copy. Empty when fine. */
export function findDataLaneIssues(props: Record<string, unknown>, label = 'LED output'): string[] {
  const lanes = requestedDataLanes(props)
  if (lanes <= 1) return []
  if (outputForm(props) === 'hub75') {
    return [`${label} is split across ${lanes} data pins, but a HUB75 panel is driven over its own ribbon. Set Data lanes to 1.`]
  }
  if (!outputCanSplitLanes(props)) {
    return [`${label} is split across ${lanes} data pins, but ${String(props.chipset)} is a clocked chipset that needs a clock line for each lane. Set Data lanes to 1, or choose a one-wire clockless chipset.`]
  }
  const offered = offeredDataLaneCounts(props)
  if (!offered.includes(lanes)) {
    const unit = dataLaneUnit(props) === 1 ? 'equal lanes' : props.layout === 'panels' ? 'whole panels' : 'whole rows'
    const choices = offered.filter((count) => count > 1)
    return [`${label} cannot split ${outputLedTotal(props)} LEDs into ${lanes} ${unit}. ${choices.length > 0 ? `Choose ${choices.join(', ')} lanes, or 1.` : 'Set Data lanes to 1.'}`]
  }
  const pins = storedLanePins(props).slice(0, lanes - 1)
  const missing = lanes - 1 - pins.filter((pin) => pin !== null).length
  if (missing > 0) {
    return [`${label} is split across ${lanes} data pins but ${missing === 1 ? 'one lane has' : `${missing} lanes have`} no pin yet. Pick a pin for each lane in its hardware panel.`]
  }
  return []
}

export interface SplitAcrossPinsFix {
  /** The lane count to set as `dataLanes`. */
  lanes: number
  /** The pins to set as `lanePins`, for lanes 2..N. */
  lanePins: number[]
}

/**
 * The **Split across pins** fix for an output whose wire time is the limit.
 *
 * `boardPins` are the board's output-capable GPIOs in preference order, and
 * `claimedPins` every pin already claimed in the graph; the output's own
 * `dataPin` and current `lanePins` are handled here, so either set may include
 * them. `wantLanes` asks for at least that many lanes (the smallest offered
 * count that reaches it wins); without it the most lanes that fit win.
 * `maxLanes` caps the count, such as the board's `parallelOutputs`.
 *
 * Returns null when no split into two or more lanes is possible: the output
 * cannot split, no count is offered, or the board has too few free pins.
 */
export function splitAcrossPinsFix(
  output: Record<string, unknown>,
  boardPins: readonly number[],
  claimedPins: Iterable<number>,
  opts: { maxLanes?: number; wantLanes?: number } = {},
): SplitAcrossPinsFix | null {
  const dataPin = Number(output.dataPin ?? 5)
  const own = new Set(storedLanePins(output).filter((pin): pin is number => pin !== null))
  const claimed = new Set([...claimedPins].filter((pin) => !own.has(pin) || pin === dataPin))
  claimed.add(dataPin)
  const free = [...new Set(boardPins)].filter((pin) => !claimed.has(pin))
  const counts = offeredDataLaneCounts(output, opts.maxLanes ?? MAX_DATA_LANES)
    .filter((count) => count > 1 && count - 1 <= free.length)
  if (counts.length === 0) return null
  const want = opts.wantLanes
  const lanes = want === undefined
    ? counts[counts.length - 1]
    : counts.find((count) => count >= want) ?? counts[counts.length - 1]
  return { lanes, lanePins: free.slice(0, lanes - 1) }
}

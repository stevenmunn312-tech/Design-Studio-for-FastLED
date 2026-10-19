/**
 * The graph-side **Split across pins** fix: choose a lane count for an LED
 * output and free pins for lanes 2..N on the selected board.
 *
 * Pins come from `assignPartPins`, the allocator a newly added part uses, so
 * the lanes follow the board's own safe list, skip every pin in use and keep
 * the output-capable role a data line needs. The output's current lane pins
 * are released first, so re-splitting can reuse them. The lane counts offered
 * are `offeredDataLaneCounts`', the pure rule in src/state/output/dataLanes.ts;
 * `splitAcrossPinsFix` there is the same choice made from a plain pin list.
 */
import type { StudioNode } from '../../state/graphStore'
import type { PhysicalBoardProfile } from '../boards/boardProfiles'
import { assignPartPins } from '../parts/partPinAssignment'
import {
  LANE_PIN_KEY_PREFIX,
  MAX_DATA_LANES,
  offeredDataLaneCounts,
  type SplitAcrossPinsFix,
} from '../../state/output/dataLanes'

export type SplitAcrossPinsResult = ({ ok: true } & SplitAcrossPinsFix) | { ok: false; reason: string }

/**
 * Lanes and pins for `nodeId`. `lanes` asks for exactly that count; otherwise
 * `wantLanes` asks for at least that many and `maxLanes` (such as the board's
 * `parallelOutputs`) caps the count, falling back to fewer lanes when the board
 * has too few free pins for more.
 */
export function splitAcrossPinsForGraph(
  profile: PhysicalBoardProfile | undefined,
  fqbn: string,
  nodes: StudioNode[],
  nodeId: string,
  opts: { lanes?: number; wantLanes?: number; maxLanes?: number } = {},
): SplitAcrossPinsResult {
  const node = nodes.find((entry) => entry.id === nodeId && entry.data.nodeType === 'MatrixOutput')
  if (!node) return { ok: false, reason: 'That LED output is no longer in the graph.' }
  const props = node.data.properties as Record<string, unknown>
  const offered = offeredDataLaneCounts(props, opts.maxLanes ?? MAX_DATA_LANES).filter((count) => count > 1)
  const candidates = opts.lanes !== undefined
    ? offered.filter((count) => count === opts.lanes)
    : opts.wantLanes !== undefined
      ? [...offered.filter((count) => count >= opts.wantLanes!), ...offered.filter((count) => count < opts.wantLanes!).reverse()]
      : [...offered].reverse()
  if (candidates.length === 0) {
    return { ok: false, reason: 'This output cannot be split into equal lanes on whole rows or panels.' }
  }
  // Release this output's own lane pins, so they are free to be chosen again.
  const released = nodes.map((entry) => entry.id === nodeId
    ? { ...entry, data: { ...entry.data, properties: { ...entry.data.properties, dataLanes: 1, lanePins: [] } } }
    : entry)
  let reason = ''
  for (const lanes of candidates) {
    const requests = Array.from({ length: lanes - 1 }, (_, index) => ({
      key: `${LANE_PIN_KEY_PREFIX}${index}`, capability: 'digitalOutput' as const,
    }))
    const assigned = assignPartPins(profile, fqbn, released, requests)
    if (assigned.ok) {
      return { ok: true, lanes, lanePins: requests.map((request) => assigned.pins[request.key]) }
    }
    reason = assigned.reason
  }
  return { ok: false, reason }
}

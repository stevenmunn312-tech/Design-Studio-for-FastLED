import type { NodePort } from '../../types'
import { buzzerInputs } from '../../state/peripherals/buzzer'
import { powerSwitchInputs } from '../../state/peripherals/powerSwitch'
import { relayInputs } from '../../state/peripherals/relayModule'
import { unknownPartId } from './partResolution'

/**
 * Inputs that follow the selected board rather than the node type: a relay
 * module's channels, a MOSFET switch's On/Level pairs, a passive buzzer's
 * Pitch. Null for every other node, whose inputs are its library definition's.
 *
 * Every place that draws, normalises or creates one of these nodes asks here,
 * so a board with more channels cannot gain ports in one view and not another.
 * Pass the node's properties where it has them: a MOSFET switch carrying an
 * RGB strip trades its first three channels' ports for the strip's.
 *
 * Null as well for a part this version does not have: its channel count is
 * unknown, and deriving one (a single relay channel) dropped the real ports and
 * their wires on load. Callers then keep the node's saved ports, which are the
 * only truth there is (`keepsSavedPorts`).
 */
export function partDerivedInputs(nodeType: string, partId: unknown, properties?: Record<string, unknown>): NodePort[] | null {
  if (unknownPartId(nodeType, { partId }) !== null) return null
  if (nodeType === 'RelayOutput') return relayInputs(partId)
  if (nodeType === 'PowerSwitchOutput') return powerSwitchInputs(partId, properties)
  if (nodeType === 'BuzzerOutput') return buzzerInputs(partId)
  return null
}

/**
 * True when a part-backed node names a part this version does not have, so its
 * ports are whatever the file saved rather than anything derived or looked up.
 */
export function keepsSavedPorts(nodeType: string, properties: Record<string, unknown> | undefined): boolean {
  return PART_BACKED_PORT_TYPES.has(nodeType) && unknownPartId(nodeType, properties) !== null
}

const PART_BACKED_PORT_TYPES: ReadonlySet<string> = new Set(['RelayOutput', 'PowerSwitchOutput', 'BuzzerOutput'])

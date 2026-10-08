import type { NodePort } from '../../types'
import { buzzerInputs } from '../../state/peripherals/buzzer'
import { powerSwitchInputs } from '../../state/peripherals/powerSwitch'
import { relayInputs } from '../../state/peripherals/relayModule'

/**
 * Inputs that follow the selected board rather than the node type: a relay
 * module's channels, a MOSFET switch's On/Level pairs, a passive buzzer's
 * Pitch. Null for every other node, whose inputs are its library definition's.
 *
 * Every place that draws, normalises or creates one of these nodes asks here,
 * so a board with more channels cannot gain ports in one view and not another.
 */
export function partDerivedInputs(nodeType: string, partId: unknown): NodePort[] | null {
  if (nodeType === 'RelayOutput') return relayInputs(partId)
  if (nodeType === 'PowerSwitchOutput') return powerSwitchInputs(partId)
  if (nodeType === 'BuzzerOutput') return buzzerInputs(partId)
  return null
}

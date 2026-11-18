// Which demodulating IR receiver an IRRemoteInput is.
//
// The modules are catalogue entries, not a list here: what differs between two
// receivers (the pin order a render carries into the Build Diagram, the supply
// it is specified for) is the part's own data, and a receiver earns a place on
// the shelf by being a part whose types include IRRemoteInput. The pin order is
// why these are separate parts at all: a TSOP382x puts ground on its centre pin
// and a VS1838B-class module puts the supply there. A render carries its pad
// names into the Build Diagram, so a module earns a part only once its order
// comes from something better than a marketplace photograph.
//
// The clones of the KY-022 are documented as swapping their two outer pins,
// which makes "a KY-022" a design rather than a guarantee; that caveat is the
// part's wiring note rather than being silently averaged away.

import { partById } from '../../build/parts/partCatalogue'
import type { PartIrReceiverSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

/** The module an IRRemoteInput carrying no choice resolves to. */
export const DEFAULT_IR_RECEIVER_PART_ID = 'ky-022-ir-receiver-module'

/**
 * The part's receiver block. A missing id is the default receiver; an unknown
 * one is `null`, never another module's facts (`partResolution` holds such a node).
 */
export function irReceiverSpec(partId: unknown): PartIrReceiverSpec | null {
  return partById(partIdOrDefault(partId, DEFAULT_IR_RECEIVER_PART_ID))?.irReceiver ?? null
}

/**
 * Whether the module swings its output to a 5 V rail, so a straight wire to a
 * 3.3 V logic input needs the Build Diagram's divider: it is powered from 4.5 V
 * or more. False for an unknown part, which is held and never wired.
 */
export function irReceiverNeedsDivider(partId: unknown): boolean {
  return (irReceiverSpec(partId)?.supplyVolts ?? 0) >= 4.5
}

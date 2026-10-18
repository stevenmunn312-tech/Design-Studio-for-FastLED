import type { StudioNode } from '../../state/graphStore'
import { collectPinUses } from '../hardwareManifest'
import type { PhysicalBoardProfile } from '../boards/boardProfiles'
import { profileI2cDefault } from '../boards/boardI2cDefaults'
import { boardOffersPins } from '../boards/boardPinPolicy'
import { assignPartPins, type PartPinAssignment, type PartPinRequest } from '../parts/partPinAssignment'
import { busAssignmentFor } from './busTopology'

/** Use the collector's transport rules, including RTC mode and OLED module. */
export function i2cPinUses(nodes: StudioNode[], fqbn = '') {
  return collectPinUses(nodes, fqbn).filter((use) =>
    (use.bus ?? busAssignmentFor(use.nodeType, use.propertyKey)).kind === 'i2c')
}

/** Board SDA/SCL are shared by I2C devices, but never by unrelated hardware. */
export function assignBoardI2cPins(
  profile: PhysicalBoardProfile | undefined,
  fqbn: string,
  nodes: StudioNode[],
  movingBus = false,
): PartPinAssignment {
  const defaults = profileI2cDefault(profile)
  if (!defaults) return { ok: false, reason: 'Choose SDA and SCL pins in the board settings first.' }
  const pins = { sdaPin: defaults.sda.arduinoPin, sclPin: defaults.scl.arduinoPin }
  if (pins.sdaPin === pins.sclPin || !boardOffersPins(profile, pins)) {
    return { ok: false, reason: 'Choose two different, enabled SDA and SCL pins in the board settings.' }
  }
  const conflict = collectPinUses(nodes, fqbn).find((use) => {
    if (use.pin !== pins.sdaPin && use.pin !== pins.sclPin) return false
    const bus = use.bus ?? busAssignmentFor(use.nodeType, use.propertyKey)
    return bus.kind !== 'i2c' || (!movingBus && bus.role !== (use.pin === pins.sdaPin ? 'sda' : 'scl'))
  })
  if (conflict) return {
    ok: false,
    reason: `GPIO ${conflict.pin} is needed for I2C but is used by ${conflict.label}. Move that hardware pin first.`,
  }
  return { ok: true, pins }
}

/** Shared assignment for shelf availability and creation of inputs and fixtures. */
export function assignHardwarePartPins(
  profile: PhysicalBoardProfile | undefined,
  fqbn: string,
  nodes: StudioNode[],
  requests: readonly PartPinRequest[],
  nodeType: string,
  properties: Record<string, unknown>,
): PartPinAssignment {
  const probe: StudioNode = {
    id: '__new-part', position: { x: 0, y: 0 },
    data: {
      nodeType, label: nodeType, category: 'hardware', inputs: [], outputs: [],
      properties: { ...properties, sdaPin: 0, sclPin: 1 },
    },
  }
  if (i2cPinUses([probe], fqbn).length === 0) return assignPartPins(profile, fqbn, nodes, requests)
  const bus = assignBoardI2cPins(profile, fqbn, nodes)
  if (!bus.ok) return bus
  const remaining = requests.filter((request) => !(request.key in bus.pins))
  const assigned = assignPartPins(profile, fqbn, [
    ...nodes, { ...probe, data: { ...probe.data, properties: { ...properties, ...bus.pins } } },
  ], remaining)
  return assigned.ok ? { ok: true, pins: { ...assigned.pins, ...bus.pins } } : assigned
}

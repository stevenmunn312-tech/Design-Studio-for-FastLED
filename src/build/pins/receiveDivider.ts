import { irReceiverModuleFor } from '../../state/peripherals/irModules'
import { distanceSensorTransport } from '../../state/peripherals/distanceSensor'

/** Shared by the Build Diagram and Hardware pin captions. */
const SOURCES: Record<string, { propertyKey: string; pads: readonly string[] }> = {
  'dmx-input': { propertyKey: 'dmxRxPin', pads: ['RO'] },
  'distance-input': { propertyKey: 'echoPin', pads: ['Echo', 'ECHO'] },
  'ir-input': { propertyKey: 'pin', pads: ['S'] },
}

export function receiveDividerSource(kind: string, partId: unknown, transport?: unknown) {
  if (kind === 'ir-input' && irReceiverModuleFor(partId).supplyVoltage !== 5) return null
  if (transport === 'i2c') return null
  return SOURCES[kind] ?? null
}

/** Identify the assigned GPIO that must not be wired straight to a 5 V output. */
export function dividedInputPinKey(nodeType: string, properties: Record<string, unknown>): string | null {
  const kind = ({
    DMXInput: 'dmx-input',
    DistanceInput: 'distance-input',
    IRRemoteInput: 'ir-input',
  } as Record<string, string>)[nodeType]
  if (!kind) return null
  const transport = nodeType === 'DistanceInput'
    ? distanceSensorTransport(properties.partId)
    : undefined
  return receiveDividerSource(kind, properties.partId, transport)?.propertyKey ?? null
}

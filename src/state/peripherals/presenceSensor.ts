import { partById } from '../../build/parts/partCatalogue'
import type { PartPresenceSensorSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

/**
 * A radar presence sensor: a module that streams what it sees over UART and
 * publishes it to the graph. Unlike a PIR it reports someone sitting still, and
 * how far away they are. Every protocol number (baud, gate width, range) comes
 * from the catalogue's `presenceSensor` block, so the firmware and the preview
 * slider cannot disagree with the module.
 */
export const DEFAULT_PRESENCE_PART_ID = 'hlk-ld2410c-presence-sensor'

/** The readings, in the order the node's outputs declare them. */
export const PRESENCE_OUTPUTS = ['presence', 'moving', 'still', 'distance', 'connected'] as const

/** The board pin wired to the sensor's TX, the one line Studio needs. */
export const PRESENCE_RX_PIN_KEY = 'rxPin'

/**
 * The ESP32 UART the generated sketch reads the sensor on. UART1 exists on
 * every ESP32 and remaps to any pin, where UART2 is absent on the C3 and S2.
 * The DMX512 receiver takes a UART too, so validation refuses a DMX512 input left on this
 * one.
 */
export const PRESENCE_UART_PORT = 1

/** The part's presence block; `null` for an unknown part (a missing id is the default part). */
export function presenceSensorSpec(partId: unknown): PartPresenceSensorSpec | null {
  return partById(partIdOrDefault(partId, DEFAULT_PRESENCE_PART_ID))?.presenceSensor ?? null
}

/** Whether a board can build the sensor: the reader needs a remappable ESP32 UART. */
export function presenceSupportedForFqbn(fqbn: string): boolean {
  return !fqbn || fqbn.startsWith('esp32:')
}

export interface PresenceReading {
  presence: boolean
  moving: boolean
  still: boolean
  /** Millimetres to the target, like the Distance Sensor; 0 when nobody is there. */
  distance: number
}

/**
 * The browser preview's reading. There is no radar in the browser, so the node
 * body offers two latches (someone moving, someone still) and a distance slider
 * across the module's own range. Presence is either latch, as it is on the
 * module, and distance reads 0 with nobody there, as the module reports it.
 */
export function presencePreviewReading(
  partId: unknown,
  moving: boolean,
  still: boolean,
  distanceFraction: number,
): PresenceReading {
  const spec = presenceSensorSpec(partId)
  if (!spec) return { presence: false, moving: false, still: false, distance: 0 }
  const presence = moving || still
  const fraction = Number.isFinite(distanceFraction) ? Math.max(0, Math.min(1, distanceFraction)) : 0
  return { presence, moving, still, distance: presence ? Math.round(fraction * spec.maxRangeMeters * 1000) : 0 }
}

/** Preview run-state keys: two latches and one slider per node. */
export const presencePreviewKey = (nodeId: string, control: 'moving' | 'still' | 'distance') => `${nodeId}:${control}`

/** Where the distance slider starts: someone a metre and a half away. */
export function presencePreviewDefaultDistance(partId: unknown): number {
  const range = presenceSensorSpec(partId)?.maxRangeMeters
  return range ? 1.5 / range : 0.5
}

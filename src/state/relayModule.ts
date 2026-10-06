import type { NodePort } from '../types'
import { partById } from './partCatalogue'

export const DEFAULT_RELAY_PART_ID = 'relay-module-1ch-5v'
export const MAX_RELAY_CHANNELS = 8

export function relayChannelCountForPart(partId: unknown): number {
  const declared = Number(partById(String(partId ?? ''))?.relay?.channels ?? 1)
  return Number.isInteger(declared)
    ? Math.max(1, Math.min(MAX_RELAY_CHANNELS, declared))
    : 1
}

export function relayInputs(partId: unknown): NodePort[] {
  return Array.from({ length: relayChannelCountForPart(partId) }, (_, index) => ({
    id: `channel${index + 1}`,
    label: `Channel ${index + 1}`,
    dataType: 'bool',
  }))
}

/**
 * Where the preview publishes whether channel `channel`'s coil is energised.
 * Not a port: the bench reads it back to light that channel's status LED.
 */
export function relayEnergisedKey(channel: number): string {
  return `energised${channel}`
}

export function relayPinKeys(partId: unknown): string[] {
  return Array.from(
    { length: relayChannelCountForPart(partId) },
    (_, index) => `in${index + 1}Pin`,
  )
}

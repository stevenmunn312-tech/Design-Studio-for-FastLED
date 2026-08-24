import type { StudioNode } from './graphStore'
import { selectedPhysicalBoardProfile } from '../build/boardProfiles'
import { resolvePartIdentity } from './partOptions'

export type StorageCapabilityKind = 'sd' | 'flash' | 'usb'

export interface StorageCapabilitySource {
  id: string
  label: string
  kind: StorageCapabilityKind
  node: StudioNode
}

/** Discover storage providers from the root hardware graph. */
export function storageCapabilitySources(nodes: readonly StudioNode[]): StorageCapabilitySource[] {
  const sources: StorageCapabilitySource[] = []
  const sdCard = nodes.find((node) => node.data.nodeType === 'SDCard')
  if (sdCard) {
    const part = resolvePartIdentity('SDCard', sdCard.data.properties)?.option.label ?? 'microSD card'
    sources.push({ id: `sd:${sdCard.id}`, label: part, kind: 'sd', node: sdCard })
  }

  const board = nodes.find((node) => node.data.nodeType === 'Board')
  if (!board) return sources

  const profile = selectedPhysicalBoardProfile(nodes)
  const flashMb = profile?.memory?.flashMb
  sources.push({
    id: `flash:${board.id}`,
    label: flashMb ? `Onboard flash (${flashMb} MB)` : 'Onboard flash',
    kind: 'flash',
    node: board,
  })
  sources.push({ id: `usb:${board.id}`, label: 'USB transfer', kind: 'usb', node: board })
  return sources
}

/** Resolve an authored provider, defaulting only when there is one choice. */
export function resolveStorageCapabilitySource(
  nodes: readonly StudioNode[],
  sourceId: unknown,
): StorageCapabilitySource | null {
  const sources = storageCapabilitySources(nodes)
  const requested = typeof sourceId === 'string' ? sourceId : ''
  return sources.find((source) => source.id === requested)
    ?? (sources.length === 1 ? sources[0] : null)
}

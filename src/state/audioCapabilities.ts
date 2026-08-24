import type { StudioNode } from './graphStore'
import { resolvePartIdentity } from './partOptions'

/** A board-attached source that can provide PCM or analysed audio to the signal
 * graph. The decoder tap is software hosted by the SD-player workflow. */
export interface AudioCapabilitySource {
  id: string
  label: string
  kind: 'microphone' | 'line-in' | 'decoder'
  node: StudioNode
}

/** Discover audio sources from root hardware rather than maintaining a second
 * capability list on the graph node. */
export function audioCapabilitySources(nodes: readonly StudioNode[]): AudioCapabilitySource[] {
  const microphones = nodes
    .filter((node) => node.data.nodeType === 'MicInput')
    .map((node) => {
      const properties = node.data.properties as Record<string, unknown>
      const part = resolvePartIdentity('MicInput', properties)?.option.label ?? 'Microphone'
      return {
        id: node.id,
        label: /microphone/i.test(part) ? part : `${part} microphone`,
        kind: 'microphone' as const,
        node,
      }
    })

  const lineInputs = nodes
    .filter((node) => node.data.nodeType === 'LineInput')
    .map((node) => ({
      id: node.id,
      label: resolvePartIdentity('LineInput', node.data.properties as Record<string, unknown>)?.option.label
        ?? 'Line in',
      kind: 'line-in' as const,
      node,
    }))

  // The software decoder is a real on-device source only in the SD-player
  // workflow. An SD card by itself is ordinary storage; a Performance
  // Generator is what says the board will decode music from it. Tie the stable
  // capability id to the card, which is the physical part that persists on the
  // bench, while the player sketch taps the decoded PCM before I2S/DAC output.
  const sdCard = nodes.find((node) => node.data.nodeType === 'SDCard')
  const hasPlayer = nodes.some((node) => node.data.nodeType === 'PerformanceGenerator')
  const decoder: AudioCapabilitySource[] = sdCard && hasPlayer
    ? [{
        id: `decoder:${sdCard.id}`,
        label: 'On-board playback (decoder tap)',
        kind: 'decoder',
        node: sdCard,
      }]
    : []

  return [...microphones, ...lineInputs, ...decoder]
}

/** Resolve an authored source id. A lone attached source is the useful default
 * for a newly created node; multiple sources require an explicit choice. */
export function resolveAudioCapabilitySource(
  nodes: readonly StudioNode[],
  sourceId: unknown,
): AudioCapabilitySource | null {
  const sources = audioCapabilitySources(nodes)
  const requested = typeof sourceId === 'string' ? sourceId : ''
  return sources.find((source) => source.id === requested)
    ?? (sources.length === 1 ? sources[0] : null)
}

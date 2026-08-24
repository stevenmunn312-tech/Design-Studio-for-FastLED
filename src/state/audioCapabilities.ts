import type { StudioNode } from './graphStore'
import { resolvePartIdentity } from './partOptions'

/** A physical source attached to the selected board that can provide PCM or
 * analysed audio to the signal graph. Decoder taps and line inputs join this
 * catalogue when their hardware paths are implemented. */
export interface AudioCapabilitySource {
  id: string
  label: string
  kind: 'microphone'
  node: StudioNode
}

/** Discover audio sources from root hardware rather than maintaining a second
 * capability list on the graph node. */
export function audioCapabilitySources(nodes: readonly StudioNode[]): AudioCapabilitySource[] {
  return nodes
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

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

export type AudioCapabilityKind = AudioCapabilitySource['kind']

export interface AudioCapabilityOption {
  kind: AudioCapabilityKind
  value: string
  label: string
  source: AudioCapabilitySource | null
  unavailableHint: string
}

const AUDIO_CAPABILITY_INTENT_PREFIX = 'kind:'

/** A stable authored value that records which source class the user wants,
 * even before the corresponding Hardware provider exists. */
export function audioCapabilityIntent(kind: AudioCapabilityKind): string {
  return `${AUDIO_CAPABILITY_INTENT_PREFIX}${kind}`
}

/** Discover audio sources from root hardware rather than maintaining a second
 * capability list on the graph node. */
export function audioCapabilitySources(nodes: readonly StudioNode[]): AudioCapabilitySource[] {
  const microphones = nodes
    .filter((node) => node.data.nodeType === 'MicInput')
    .map((node) => {
      const properties = node.data.properties as Record<string, unknown>
      const part = resolvePartIdentity('MicInput', properties)?.option.label ?? 'INMP441'
      return {
        id: node.id,
        label: part,
        kind: 'microphone' as const,
        node,
      }
    })

  const lineInputs = nodes
    .filter((node) => node.data.nodeType === 'LineInput')
    .map((node) => ({
      id: node.id,
      label: resolvePartIdentity('LineInput', node.data.properties as Record<string, unknown>)?.option.label
        ?? 'PCM1802',
      kind: 'line-in' as const,
      node,
    }))

  // The software decoder is a real on-device source only in the Music Player
  // workflow. Storage and an output device are both required: the card tells
  // us where the music comes from and the amplifier tells us that this build
  // is an audio player. Performance Generator remains a separate pre-baked
  // show workflow and does not expose a live decoder source.
  const sdCard = nodes.find((node) => node.data.nodeType === 'SDCard')
  const hasAmplifier = nodes.some((node) => node.data.nodeType === 'Amplifier')
  const hasPlayer = nodes.some((node) => node.data.nodeType === 'PatternMaster')
  const decoder: AudioCapabilitySource[] = sdCard && hasAmplifier && hasPlayer
    ? [{
        id: `decoder:${sdCard.id}`,
        label: 'Music Player',
        kind: 'decoder',
        node: sdCard,
      }]
    : []

  return [...microphones, ...lineInputs, ...decoder]
}

/** Return the selected source class for either a stable intent or a concrete
 * provider id. Empty always means Disabled. */
export function selectedAudioCapabilityKind(
  nodes: readonly StudioNode[],
  sourceId: unknown,
): AudioCapabilityKind | null {
  const requested = typeof sourceId === 'string' ? sourceId : ''
  // Microphone is the first and default menu choice. With no provider it is a
  // discoverable disabled intent; adding the hardware resolves it immediately.
  if (requested === '') return 'microphone'
  if (requested.startsWith(AUDIO_CAPABILITY_INTENT_PREFIX)) {
    const kind = requested.slice(AUDIO_CAPABILITY_INTENT_PREFIX.length)
    if (kind === 'microphone' || kind === 'line-in' || kind === 'decoder') return kind
  }
  return audioCapabilitySources(nodes).find((source) => source.id === requested)?.kind ?? null
}

/** Resolve an authored source intent to the attached Hardware provider. */
export function resolveAudioCapabilitySource(
  nodes: readonly StudioNode[],
  sourceId: unknown,
): AudioCapabilitySource | null {
  const sources = audioCapabilitySources(nodes)
  const requested = typeof sourceId === 'string' ? sourceId : ''
  const exact = sources.find((source) => source.id === requested)
  if (exact) return exact
  const kind = selectedAudioCapabilityKind(nodes, requested)
  return kind ? sources.find((source) => source.kind === kind) ?? null : null
}

/** Resolve the root graph's one Audio capability. Older in-memory fixtures
 * that still expose a concrete microphone/line-input node directly fall back
 * to that provider, keeping preview controls useful while they are normalized. */
export function graphAudioCapabilitySource(
  nodes: readonly StudioNode[],
): AudioCapabilitySource | null {
  const capability = nodes.find((node) => node.data.nodeType === 'Audio')
  if (capability) {
    return resolveAudioCapabilitySource(
      nodes,
      (capability.data.properties as Record<string, unknown>).sourceId,
    )
  }
  return audioCapabilitySources(nodes).find((source) => source.kind !== 'decoder') ?? null
}

/** The authored source intent, even when its external provider has not been
 * added yet. This prevents UI from turning on the computer mic while the user
 * has explicitly chosen the in-app decoder path. */
export function graphAudioCapabilityKind(
  nodes: readonly StudioNode[],
): AudioCapabilityKind | null {
  const capability = nodes.find((node) => node.data.nodeType === 'Audio')
  if (capability) {
    return selectedAudioCapabilityKind(
      nodes,
      (capability.data.properties as Record<string, unknown>).sourceId,
    )
  }
  return graphAudioCapabilitySource(nodes)?.kind ?? null
}

/** Stable source menu: unavailable providers stay visible so the Audio node
 * also teaches where each source is configured. */
export function audioCapabilityOptions(nodes: readonly StudioNode[]): AudioCapabilityOption[] {
  const sources = audioCapabilitySources(nodes)
  const source = (kind: AudioCapabilityKind) => sources.find((entry) => entry.kind === kind) ?? null
  return [
    {
      kind: 'microphone',
      value: audioCapabilityIntent('microphone'),
      label: 'Microphone',
      source: source('microphone'),
      unavailableHint: 'Add a microphone in the Hardware bench below to enable.',
    },
    {
      kind: 'line-in',
      value: audioCapabilityIntent('line-in'),
      label: 'Line Input',
      source: source('line-in'),
      unavailableHint: 'Add a PCM1802 line input in the Hardware bench below to enable.',
    },
    {
      kind: 'decoder',
      value: audioCapabilityIntent('decoder'),
      label: 'Audio Decoder',
      source: source('decoder'),
      unavailableHint: 'Add an SD card and amplifier in Hardware, then configure the Music Player to enable.',
    },
  ]
}

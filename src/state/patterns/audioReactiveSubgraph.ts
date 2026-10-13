// Whether a pattern subgraph is meant to react to audio. One pure answer shared
// by pattern rating, the Music Player preview and the SD player firmware, so
// the pattern the preview fades on silence is the pattern the device fades.
import type { StudioNode } from '../graphStore'
import { NODE_LIBRARY } from '../nodeLibrary'

export const AUDIO_ROLES = new Set(['bass', 'mids', 'treble', 'kick', 'snare', 'hihat', 'vocals', 'energy', 'beat', 'silence'])

const NODE_DEF = new Map(NODE_LIBRARY.map((def) => [def.type, def]))

export function nodeType(node: StudioNode): string {
  return String((node.data as { nodeType?: unknown }).nodeType ?? '')
}
export function nodeCategory(node: StudioNode): string {
  return String((node.data as { category?: unknown }).category ?? '')
}
export function nodeSubcategory(node: StudioNode): string {
  const own = (node.data as { subcategory?: unknown }).subcategory
  if (typeof own === 'string') return own
  return NODE_DEF.get(nodeType(node))?.subcategory ?? ''
}
export function groupInputRole(node: StudioNode): string {
  return String((node.data.properties as { paramId?: unknown }).paramId ?? '')
}
/** A GroupInput whose exposed port is the whole raw audio signal (as opposed to
 *  a single named band/role) is just as much a real audio source as one tagged
 *  with a band role — its `paramId` is often just "audio"/"param0". */
export function groupInputIsAudioTyped(node: StudioNode): boolean {
  const outputs = (node.data as { outputs?: { dataType?: unknown }[] }).outputs
  return (outputs ?? []).some((p) => p.dataType === 'audio')
}

/** True when the subgraph is meant to react to audio: it contains an audio
 *  analyzer, an Audio-Reactive pattern node, or an audio-role GroupInput. */
export function isAudioReactiveSubgraph(nodes: readonly StudioNode[]): boolean {
  return nodes.some((n) =>
    nodeCategory(n) === 'audio' ||
    nodeSubcategory(n) === 'Audio-Reactive' ||
    (nodeType(n) === 'GroupInput' && (AUDIO_ROLES.has(groupInputRole(n)) || groupInputIsAudioTyped(n))),
  )
}

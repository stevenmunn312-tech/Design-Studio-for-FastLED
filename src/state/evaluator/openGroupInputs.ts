import type { StudioNode } from '../graphStore'
import type { PortValue } from './types'
import { graphAudioCapabilityKind, graphAudioCapabilitySource, type AudioCapabilityKind } from '../audio/audioCapabilities'
import { liveAudioSignal } from '../audio/liveAudioSignal'

/** The `paramId`s of a subgraph's audio-typed GroupInput nodes — the ports an
 *  audio signal enters the group through. */
export function audioGroupInputParamIds(nodes: readonly StudioNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (String(node.data.nodeType ?? '') !== 'GroupInput') continue
    const paramId = String((node.data.properties as { paramId?: string } | undefined)?.paramId ?? '')
    const outputType = ((node.data.outputs as { dataType?: string }[] | undefined)?.[0]?.dataType) ?? ''
    if (paramId && outputType === 'audio') ids.push(paramId)
  }
  return ids
}

/** The live source a group opened on the canvas binds its audio inputs to:
 *  the root graph's Audio capability, the microphone when it has none. */
export function openGroupAudioKind(rootNodes: readonly StudioNode[]): AudioCapabilityKind {
  return graphAudioCapabilitySource(rootNodes)?.kind ?? graphAudioCapabilityKind(rootNodes) ?? 'microphone'
}

/**
 * Inputs for a group subgraph opened on the canvas, where no enclosing Group
 * node binds them. Audio inputs get the live signal of `kind`
 * (`openGroupAudioKind`), so the analyzers inside keep reacting while the
 * pattern is edited. Other exposed parameters stay unbound and their
 * consumers fall back to their own properties. The preview worker calls this
 * with the kind the main thread resolved, since it holds no root graph.
 */
export function openGroupInputsFor(
  subgraphNodes: readonly StudioNode[],
  kind: AudioCapabilityKind,
): Record<string, PortValue> {
  const audioParams = audioGroupInputParamIds(subgraphNodes)
  if (audioParams.length === 0) return {}
  const signal = liveAudioSignal(kind)
  return Object.fromEntries(audioParams.map((paramId) => [paramId, signal]))
}

export function openGroupInputs(
  subgraphNodes: readonly StudioNode[],
  rootNodes: readonly StudioNode[],
): Record<string, PortValue> {
  return openGroupInputsFor(subgraphNodes, openGroupAudioKind(rootNodes))
}

import type { StudioNode } from '../graphStore'
import type { PortValue } from './types'
import { graphAudioCapabilityKind, graphAudioCapabilitySource } from '../audio/audioCapabilities'
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

/**
 * Inputs for a group subgraph opened on the canvas, where no enclosing Group
 * node binds them. Audio inputs get the live signal of the project's Audio
 * capability (the root graph's choice of microphone, line-in or decoder;
 * microphone when the project has none yet), so the analyzers inside keep
 * reacting while the pattern is edited. Other exposed parameters stay
 * unbound and their consumers fall back to their own properties.
 */
export function openGroupInputs(
  subgraphNodes: readonly StudioNode[],
  rootNodes: readonly StudioNode[],
): Record<string, PortValue> {
  const audioParams = audioGroupInputParamIds(subgraphNodes)
  if (audioParams.length === 0) return {}
  const kind = graphAudioCapabilitySource(rootNodes)?.kind ?? graphAudioCapabilityKind(rootNodes) ?? 'microphone'
  const signal = liveAudioSignal(kind)
  return Object.fromEntries(audioParams.map((paramId) => [paramId, signal]))
}

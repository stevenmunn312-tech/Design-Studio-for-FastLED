import { useDisplayRuntimeStore } from '../displayRuntimeStore'
import { toggleWidgetSource } from '../designControlBundle'
import type { ButtonEdgeState } from '../transportBridge'
import { type StudioNode, useGraphStore } from '../graphStore'
import type { PatternSelectionState } from '../patternSelection'
import { clamp01 } from './frames'
import type { PlayerControls, PortValue, AudioSignal, PlayerParticles } from './types'
import { instanceState } from './memory'

interface PlayerControlsState {
  lastT: number
  buttons: Record<string, ButtonEdgeState>
  /**
   * Detent accumulation for the pattern encoder.
   *
   * The running count becomes whole steps here, where the encoder is read, so
   * the player downstream receives a decision rather than a raw reading and
   * cannot form its own opinion about what a click was.
   */
  patternEncoder?: PatternSelectionState
}
export const playerControlsState = instanceState('playerControlsState', new Map<string, PlayerControlsState>())

/** Per consuming input: the screen Toggle tap count it last saw. */
export const toggleTapState = instanceState('toggleTapState', new Map<string, number>())

/** A bundle with nothing happening on it. */
export function blankPlayerControls(): PlayerControls {
  return {
    playPause: false, previous: false, next: false,
    volumeDelta: 0, ledToggle: false, brightnessDelta: 0,
    patternSteps: 0, patternConfirm: false,
  }
}

/**
 * A press read from a screen Toggle: true once each time a finger taps it.
 *
 * Null when the wire's source is not a Toggle, so the caller keeps its own
 * edge rule. A Toggle's value also follows its Set feedback, so watching the
 * value would turn every transport change into a command; see
 * `toggleWidgetSource`. The first reading only seeds the count.
 */
export function toggleTapPress(
  consumerKey: string,
  wire: { srcId: string; srcPort: string } | undefined,
  nodeMap: ReadonlyMap<string, StudioNode>,
): boolean | null {
  if (!wire) return null
  const toggle = toggleWidgetSource(nodeMap.get(wire.srcId), wire.srcPort, nodeMap,
    useGraphStore.getState().displayDocuments)
  if (!toggle) return null
  const count = useDisplayRuntimeStore.getState().readDisplayWidget(toggle.documentId, toggle.widgetId)?.touchCount ?? 0
  const before = toggleTapState.get(consumerKey)
  toggleTapState.set(consumerKey, count)
  return before !== undefined && count !== before
}

export function resampleSpectrumBins(source: readonly number[], count: number): number[] {
  if (!source.length) return Array(count).fill(0)
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor(i * source.length / count)
    const end = Math.max(start + 1, Math.ceil((i + 1) * source.length / count))
    let sum = 0
    for (let j = start; j < end; j++) sum += clamp01(source[j])
    return clamp01(sum / (end - start))
  })
}

export function isAudioSignal(value: PortValue): value is AudioSignal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<AudioSignal>
  return typeof candidate.active === 'boolean'
    && typeof candidate.micActive === 'boolean'
    && Array.isArray(candidate.spectrum)
    && Array.isArray(candidate.detectorSpectrum)
}

export function isPlayerControls(value: PortValue): value is PlayerControls {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<PlayerControls>
  return typeof candidate.playPause === 'boolean'
    && typeof candidate.previous === 'boolean'
    && typeof candidate.next === 'boolean'
    && typeof candidate.volumeDelta === 'number'
    && typeof candidate.ledToggle === 'boolean'
    && typeof candidate.brightnessDelta === 'number'
}

export function isPlayerParticles(value: PortValue): value is PlayerParticles {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<PlayerParticles>
  return typeof candidate.enabled === 'boolean'
    && typeof candidate.style === 'number'
    && candidate.color != null
    && typeof candidate.intensity === 'number'
}

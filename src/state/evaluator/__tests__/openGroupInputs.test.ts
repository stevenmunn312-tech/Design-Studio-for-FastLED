import { beforeEach, describe, expect, it } from 'vitest'
import { audioGroupInputParamIds, openGroupInputs } from '../openGroupInputs'
import { evaluateGraphFull } from '../../graphEvaluator'
import { useAudioStore } from '../../audio/audioStore'
import { useDecoderAudioStore } from '../../audio/decoderAudioStore'
import { AUDIO_CAPABILITY_INTENT_PREFIX } from '../../audio/audioCapabilities'
import type { StudioEdge, StudioNode } from '../../graphStore'

function node(
  id: string, nodeType: string, properties: Record<string, unknown> = {},
  outputs: { id: string; dataType: string }[] = [], inputs: { id: string; dataType: string }[] = [],
): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: id, nodeType, category: 'composite', properties, inputs, outputs },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

// The subgraph of a bundled audio pattern as it sits open on the canvas: an
// audio GroupInput feeding an FFT Analyzer, with no Group node around it.
const audioIn = node('audio', 'GroupInput', { paramId: 'param0' }, [{ id: 'out', dataType: 'audio' }])
const knob = node('knob', 'GroupInput', { paramId: 'param1' }, [{ id: 'out', dataType: 'float' }])
const fft = node('fft', 'FFTAnalyzer', { bands: 24, gain: 1, smoothing: 0, tilt: 0 }, [], [{ id: 'audio', dataType: 'audio' }])
const subgraph = [audioIn, knob, fft]
const subgraphEdges = [edge('e0', 'audio', 'out', 'fft', 'audio')]

const liveSpectrum = Array.from({ length: 32 }, (_, i) => (i < 6 ? 0.9 : 0.05))

beforeEach(() => {
  useAudioStore.setState({ active: true, micActive: true, bass: 0.9, mids: 0.2, treble: 0.1, spectrum: liveSpectrum, detectorSpectrum: liveSpectrum })
  useDecoderAudioStore.setState({ active: true, bass: 0.1, mids: 0.1, treble: 0.1 })
})

describe('openGroupInputs', () => {
  it('names only the audio-typed group inputs', () => {
    expect(audioGroupInputParamIds(subgraph)).toEqual(['param0'])
  })

  it('binds the live microphone to audio inputs and leaves the other parameters unbound', () => {
    const root = [node('board', 'Board', {}), node('mic', 'MicInput', {}), node('src', 'Audio', { sourceId: 'mic' })]
    const bound = openGroupInputs(subgraph, root)
    expect(Object.keys(bound)).toEqual(['param0'])
    expect(bound.param0).toBe(useAudioStore.getState())
  })

  it('follows the project to the decoder when that is its authored audio source', () => {
    const root = [node('src', 'Audio', { sourceId: `${AUDIO_CAPABILITY_INTENT_PREFIX}decoder` })]
    expect(openGroupInputs(subgraph, root).param0).toBe(useDecoderAudioStore.getState())
  })

  it('still binds the microphone when the project has no audio capability yet', () => {
    expect(openGroupInputs(subgraph, []).param0).toBe(useAudioStore.getState())
  })

  it('returns nothing for a subgraph without audio inputs', () => {
    expect(openGroupInputs([knob], [])).toEqual({})
  })

  it('lets an open subgraph analyse the live signal through evaluateGraphFull', () => {
    const silent = evaluateGraphFull(subgraph, subgraphEdges, 0, 8, 8, {}, true, true, '__t_silent/')
    const live = evaluateGraphFull(subgraph, subgraphEdges, 0, 8, 8, {}, true, true, '__t_live/', null, 0, openGroupInputs(subgraph, []))
    expect(Number(silent.outputs.get('fft')?.bass ?? 0)).toBe(0)
    expect(Number(live.outputs.get('fft')?.bass ?? 0)).toBeGreaterThan(0.1)
  })
})

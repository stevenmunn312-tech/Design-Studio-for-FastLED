import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../graphStore'
import {
  audioCapabilityIntent,
  audioCapabilityOptions,
  audioCapabilitySources,
  resolveAudioCapabilitySource,
  selectedAudioCapabilityKind,
} from '../audioCapabilities'

function hardware(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: 'hardware',
      properties,
      inputs: [],
      outputs: [],
    },
  } as StudioNode
}

describe('audio capability sources', () => {
  it('discovers attached microphones and names the concrete module', () => {
    const mic = hardware('mic-1', 'MicInput', { partId: 'inmp441-i2s-microphone' })
    expect(audioCapabilitySources([hardware('board', 'Board'), mic])).toMatchObject([
      { id: 'mic-1', label: 'INMP441', kind: 'microphone' },
    ])
  })

  it('uses microphone as the default source intent', () => {
    const mic = hardware('mic-1', 'MicInput')
    expect(selectedAudioCapabilityKind([], '')).toBe('microphone')
    expect(resolveAudioCapabilitySource([mic], '')?.id).toBe('mic-1')
    expect(resolveAudioCapabilitySource([mic], 'mic-1')?.id).toBe('mic-1')
    expect(resolveAudioCapabilitySource([mic], audioCapabilityIntent('microphone'))?.id).toBe('mic-1')
    expect(resolveAudioCapabilitySource([], '')).toBeNull()
  })

  it('offers the audio decoder only for an SD player with an amplifier', () => {
    const sd = hardware('sd-1', 'SDCard')
    const amp = hardware('amp-1', 'Amplifier', { model: 'MAX98357A' })
    const player = hardware('player-1', 'PatternMaster')
    expect(audioCapabilitySources([sd])).toEqual([])
    expect(audioCapabilitySources([player])).toEqual([])
    expect(audioCapabilitySources([sd, player])).toEqual([])
    expect(audioCapabilitySources([sd, amp, player])).toMatchObject([
      {
        id: 'decoder:sd-1',
        label: 'Music Player',
        kind: 'decoder',
      },
    ])
    expect(resolveAudioCapabilitySource([sd, amp, player], 'decoder:sd-1')?.id).toBe('decoder:sd-1')
  })

  it('offers a concrete PCM1802 line-in capability', () => {
    const lineIn = hardware('line-1', 'LineInput', { partId: 'pcm1802-line-in-adc' })
    expect(audioCapabilitySources([lineIn])).toMatchObject([
      {
        id: 'line-1',
        label: 'PCM1802 line-in ADC',
        kind: 'line-in',
      },
    ])
    expect(resolveAudioCapabilitySource([lineIn], 'line-1')?.node).toBe(lineIn)
  })

  it('keeps every source kind discoverable when hardware is absent', () => {
    expect(audioCapabilityOptions([])).toMatchObject([
      { kind: 'microphone', value: 'kind:microphone', label: 'Microphone', source: null },
      { kind: 'line-in', value: 'kind:line-in', label: 'Line Input', source: null },
      { kind: 'decoder', value: 'kind:decoder', label: 'Audio Decoder', source: null },
    ])
  })

  it('preserves an unavailable selection intent and resolves it when hardware is added', () => {
    const intent = audioCapabilityIntent('microphone')
    expect(selectedAudioCapabilityKind([], intent)).toBe('microphone')
    expect(resolveAudioCapabilitySource([], intent)).toBeNull()

    const mic = hardware('mic-1', 'MicInput', { partId: 'inmp441-i2s-microphone' })
    expect(resolveAudioCapabilitySource([mic], intent)).toMatchObject({ id: 'mic-1', label: 'INMP441' })
  })

  it('uses the first provider for a kind intent when more than one is present', () => {
    const first = hardware('mic-1', 'MicInput')
    const second = hardware('mic-2', 'MicInput')
    expect(resolveAudioCapabilitySource([first, second], '')?.id).toBe('mic-1')
    expect(resolveAudioCapabilitySource([first, second], 'mic-2')?.id).toBe('mic-2')
  })
})

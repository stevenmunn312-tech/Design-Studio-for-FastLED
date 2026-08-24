import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../graphStore'
import { audioCapabilitySources, resolveAudioCapabilitySource } from '../audioCapabilities'

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
      { id: 'mic-1', label: 'INMP441 microphone', kind: 'microphone' },
    ])
  })

  it('uses a lone source as the default and keeps an empty board disconnected', () => {
    const mic = hardware('mic-1', 'MicInput')
    expect(resolveAudioCapabilitySource([mic], '')?.id).toBe('mic-1')
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
        label: 'Audio Decoder',
        kind: 'decoder',
      },
    ])
    expect(resolveAudioCapabilitySource([sd, amp, player], '')?.id).toBe('decoder:sd-1')
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
    expect(resolveAudioCapabilitySource([lineIn], '')?.node).toBe(lineIn)
  })

  it('requires an explicit id when more than one source is available', () => {
    const first = hardware('mic-1', 'MicInput')
    const second = hardware('mic-2', 'MicInput')
    expect(resolveAudioCapabilitySource([first, second], '')).toBeNull()
    expect(resolveAudioCapabilitySource([first, second], 'mic-2')?.id).toBe('mic-2')
  })
})

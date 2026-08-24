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

  it('requires an explicit id when more than one source is available', () => {
    const first = hardware('mic-1', 'MicInput')
    const second = hardware('mic-2', 'MicInput')
    expect(resolveAudioCapabilitySource([first, second], '')).toBeNull()
    expect(resolveAudioCapabilitySource([first, second], 'mic-2')?.id).toBe('mic-2')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { graphInteractionSfxAllowed } from '../interactionSfx'
import { usePlayerTransport } from '../../state/playerTransport'

describe('interactionSfx gating', () => {
  const originalAudioContext = window.AudioContext

  beforeEach(() => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: originalAudioContext,
    })
    usePlayerTransport.setState({ playing: false, volume: 0.9 })
  })

  it('stays enabled when the player is idle', () => {
    usePlayerTransport.setState({ playing: false, volume: 0.9 })
    expect(graphInteractionSfxAllowed()).toBe(true)
  })

  it('mutes itself while player playback is active', () => {
    usePlayerTransport.setState({ playing: true, volume: 0.9 })
    expect(graphInteractionSfxAllowed()).toBe(false)
  })

  it('respects the shared transport mute slider', () => {
    usePlayerTransport.setState({ playing: false, volume: 0 })
    expect(graphInteractionSfxAllowed()).toBe(false)
  })
})

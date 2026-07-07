import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { graphInteractionSfxAllowed } from '../interactionSfx'
import { useAudioStore } from '../../state/audioStore'
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
    useAudioStore.setState({ active: false, mode: null })
    usePlayerTransport.setState({ playing: false, volume: 0.9 })
  })

  it('stays enabled when the player is idle', () => {
    useAudioStore.setState({ active: false, mode: null })
    usePlayerTransport.setState({ playing: false, volume: 0.9 })
    expect(graphInteractionSfxAllowed()).toBe(true)
  })

  it('mutes itself while media playback is active', () => {
    useAudioStore.setState({ active: true, mode: 'media' })
    usePlayerTransport.setState({ playing: false, volume: 0.9 })
    expect(graphInteractionSfxAllowed()).toBe(false)
  })

  it('mutes itself while a show transport owns playback', () => {
    useAudioStore.setState({ active: false, mode: null })
    usePlayerTransport.setState({ playing: true, volume: 0.9 })
    expect(graphInteractionSfxAllowed()).toBe(false)
  })

  it('respects the shared transport mute slider', () => {
    useAudioStore.setState({ active: false, mode: null })
    usePlayerTransport.setState({ playing: false, volume: 0 })
    expect(graphInteractionSfxAllowed()).toBe(false)
  })
})

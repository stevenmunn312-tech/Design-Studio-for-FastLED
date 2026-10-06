import { beforeEach, describe, expect, it } from 'vitest'
import { useAudioStore } from '../audioStore'

describe('audioStore lifecycle', () => {
  beforeEach(() => {
    useAudioStore.setState({
      active: true,
      micActive: true,
      leftLevel: 0.8,
      rightLevel: 0.25,
      channelCount: 2,
      bass: 0.7,
      mids: 0.5,
      treble: 0.3,
    })
  })

  it('resets stereo levels and analysis state when capture stops', () => {
    useAudioStore.getState().stopAudio()

    expect(useAudioStore.getState()).toMatchObject({
      active: false,
      micActive: false,
      leftLevel: 0,
      rightLevel: 0,
      channelCount: 1,
      bass: 0,
      mids: 0,
      treble: 0,
      beat: false,
    })
  })
})

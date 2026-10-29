import { describe, expect, it } from 'vitest'
import { MUSIC_PLAYER_MIN_HOLD_SEC, musicPlayerTiming } from '../musicPlayerTiming'
import { PROPERTY_META } from '../../nodeLibrary'

describe('musicPlayerTiming hold floor', () => {
  it('floors a 0 s Min and Max Time so transitions cannot chain back to back', () => {
    const timing = musicPlayerTiming({ minTime: 0, maxTime: 0 })
    expect(timing.minTime).toBe(MUSIC_PLAYER_MIN_HOLD_SEC)
    expect(timing.maxTime).toBe(MUSIC_PLAYER_MIN_HOLD_SEC)
  })

  it('keeps Max Time at or above a floored Min Time', () => {
    const timing = musicPlayerTiming({ minTime: 0.25, maxTime: 0.5 })
    expect(timing.minTime).toBe(MUSIC_PLAYER_MIN_HOLD_SEC)
    expect(timing.maxTime).toBeGreaterThanOrEqual(timing.minTime)
  })

  it('leaves a 0 s transition alone — that is a cut, not a hold', () => {
    expect(musicPlayerTiming({ transitionSec: 0 }).transitionSec).toBe(0)
  })

  it('gives the Music Player sliders the same floor', () => {
    expect(PROPERTY_META.minTime).toMatchObject({ min: MUSIC_PLAYER_MIN_HOLD_SEC })
    expect(PROPERTY_META.maxTime).toMatchObject({ min: MUSIC_PLAYER_MIN_HOLD_SEC })
  })
})

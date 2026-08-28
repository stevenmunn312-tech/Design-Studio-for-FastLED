import { describe, expect, it } from 'vitest'
import {
  levelsFromSampleChannels,
  normalizedRmsLevel,
  resolveStereoLevels,
  VU_RMS_NOISE_GATE,
  VU_RMS_REFERENCE,
} from '../stereoLevels'

describe('stereo VU levels', () => {
  it('maps the documented RMS reference to full scale', () => {
    expect(normalizedRmsLevel(new Float32Array(64).fill(VU_RMS_REFERENCE))).toBe(1)
  })

  it('gates silence and non-finite samples safely', () => {
    expect(normalizedRmsLevel(new Float32Array(64).fill(VU_RMS_NOISE_GATE / 2))).toBe(0)
    expect(normalizedRmsLevel([Number.NaN, Number.POSITIVE_INFINITY])).toBe(0)
    expect(normalizedRmsLevel([])).toBe(0)
  })

  it('keeps true stereo channels independent', () => {
    const levels = levelsFromSampleChannels(
      new Float32Array(64).fill(0.2),
      new Float32Array(64).fill(0.02),
      2,
    )
    expect(levels.channelCount).toBe(2)
    expect(levels.left).toBeGreaterThan(levels.right)
    expect(levels.left).toBeGreaterThan(0.7)
  })

  it('mirrors a mono capture even if the unused right buffer contains data', () => {
    const levels = levelsFromSampleChannels(
      new Float32Array(64).fill(0.1),
      new Float32Array(64).fill(0.9),
      1,
    )
    expect(levels).toEqual({ left: levels.left, right: levels.left, channelCount: 1 })
  })

  it('resolves a complete stereo Audio payload', () => {
    expect(resolveStereoLevels({ leftLevel: 0.8, rightLevel: 0.2, channelCount: 2 }))
      .toEqual({ left: 0.8, right: 0.2, channelCount: 2 })
  })

  it('mirrors partial and legacy mono Audio payloads', () => {
    expect(resolveStereoLevels({ leftLevel: 0.6, channelCount: 2 }))
      .toEqual({ left: 0.6, right: 0.6, channelCount: 1 })
    expect(resolveStereoLevels({ micBass: 0.3, micMids: 0.6, micTreble: 0.9 }))
      .toEqual({ left: 0.6, right: 0.6, channelCount: 1 })
  })

  it('uses adaptive microphone bands instead of the quieter raw capture RMS', () => {
    expect(resolveStereoLevels({
      micActive: true,
      nativeFastLed: true,
      leftLevel: 0.45,
      rightLevel: 0.45,
      channelCount: 1,
      micBass: 1,
      micMids: 0.9,
      micTreble: 0.8,
    })).toEqual({ left: 1, right: 1, channelCount: 1 })
  })

  it('clamps invalid and out-of-range payload levels', () => {
    expect(resolveStereoLevels({ leftLevel: -1, rightLevel: 4, channelCount: 2 }))
      .toEqual({ left: 0, right: 1, channelCount: 2 })
    expect(resolveStereoLevels({ leftLevel: Number.NaN, rightLevel: Number.NaN }))
      .toEqual({ left: 0, right: 0, channelCount: 1 })
  })
})

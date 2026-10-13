import { describe, expect, it } from 'vitest'
import { beatDetectThreshold, gateNativeBeat, nativeBeatCooldownMs } from '../beatDetection'

describe('native beat gate', () => {
  it('derives the cooldown from the beat period, inside its bounds', () => {
    expect(nativeBeatCooldownMs(120)).toBe(300)
    expect(nativeBeatCooldownMs(240)).toBe(250)
    expect(nativeBeatCooldownMs(40)).toBe(600)
    expect(nativeBeatCooldownMs(0)).toBe(300)
    expect(nativeBeatCooldownMs(Number.NaN)).toBe(300)
  })

  it('passes only beats at or above Threshold', () => {
    expect(gateNativeBeat(true, 0.39, 120, 0.4, 1000, -1).beat).toBe(false)
    expect(gateNativeBeat(true, 0.4, 120, 0.4, 1000, -1).beat).toBe(true)
    expect(gateNativeBeat(false, 1, 120, 0, 1000, -1).beat).toBe(false)
  })

  it('holds a second beat inside one beat period', () => {
    const first = gateNativeBeat(true, 1, 120, 0.4, 1000, -1)
    expect(first.lastBeatMs).toBe(1000)
    // The offbeat, half a period later, is refused and keeps the last beat.
    const offbeat = gateNativeBeat(true, 1, 120, 0.4, 1250, first.lastBeatMs)
    expect(offbeat.beat).toBe(false)
    expect(offbeat.lastBeatMs).toBe(1000)
    expect(gateNativeBeat(true, 1, 120, 0.4, 1500, offbeat.lastBeatMs).beat).toBe(true)
  })

  it('forgets the last beat when the clock goes backward', () => {
    expect(gateNativeBeat(true, 1, 120, 0.4, 100, 5000)).toMatchObject({ beat: true, lastBeatMs: 100 })
  })

  it('reads a stored Threshold as 0-1, defaulting when not finite', () => {
    expect(beatDetectThreshold(1.4)).toBe(1)
    expect(beatDetectThreshold(-1)).toBe(0)
    expect(beatDetectThreshold('x')).toBe(0.4)
    expect(beatDetectThreshold(undefined)).toBe(0.4)
  })
})

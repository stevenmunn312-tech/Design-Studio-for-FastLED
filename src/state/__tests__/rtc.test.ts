import { describe, it, expect, afterEach } from 'vitest'
import { readRtcSnapshot, rtcPreviewSnapshot, setRtcClockSource } from '../rtc'

afterEach(() => {
  setRtcClockSource()   // hand the real wall clock back to everything else
})

describe('setRtcClockSource', () => {
  // Local components on purpose: readRtcSnapshot reports local-time fields, so
  // a UTC instant would read differently depending on the runner's timezone.
  const PINNED = () => new Date(2026, 0, 2, 10, 4, 5)

  it('pins the fallback clock so repeated reads agree', () => {
    setRtcClockSource(PINNED)

    const first = readRtcSnapshot()
    expect(first).toMatchObject({
      year: 2026, month: 1, day: 2, hour: 10, minute: 4, second: 5,
      weekday: 5, weekend: false, valid: true,
    })
    // The whole point: a second read at a later real instant is identical.
    expect(readRtcSnapshot()).toEqual(first)
  })

  it('reaches rtcPreviewSnapshot, which is what the clock nodes render', () => {
    setRtcClockSource(PINNED)
    const a = rtcPreviewSnapshot({ timeSource: 'Compile Time' })
    const b = rtcPreviewSnapshot({ timeSource: 'Compile Time' })
    expect(b).toEqual(a)
    expect(a).toMatchObject({ hour: 10, minute: 4, second: 5, synced: true })
  })

  it('still lets an explicit now win over the pinned source', () => {
    setRtcClockSource(PINNED)
    expect(readRtcSnapshot(new Date(2030, 5, 6, 7, 8, 9))).toMatchObject({
      year: 2030, month: 6, day: 6, hour: 7, minute: 8, second: 9,
    })
  })

  it('restores the real clock when called with no argument', () => {
    setRtcClockSource(() => new Date(2026, 0, 2, 10, 4, 5))
    expect(readRtcSnapshot().year).toBe(2026)

    setRtcClockSource()
    const now = new Date()
    expect(readRtcSnapshot().year).toBe(now.getFullYear())
  })
})

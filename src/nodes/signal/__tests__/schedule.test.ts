import { describe, expect, it } from 'vitest'
import { formatScheduleTime, parseScheduleTime, scheduleTimeSeconds, scheduleWindowProgress } from '../schedule'

describe('Schedule Trigger times', () => {
  it('reads 24-hour times with optional seconds and a one-digit hour', () => {
    expect(parseScheduleTime('18:00')).toBe(64800)
    expect(parseScheduleTime('09:05:30')).toBe(32730)
    expect(parseScheduleTime(' 7:15 ')).toBe(26100)
    expect(parseScheduleTime('23:59:59')).toBe(86399)
  })

  it('refuses anything that is not a time of day', () => {
    for (const value of ['24:00', '12:60', '12:00:60', '1800', '6pm', '', '12:5', 18, null]) {
      expect(parseScheduleTime(value), String(value)).toBeNull()
    }
  })

  it('falls back to the default for an unreadable field', () => {
    expect(scheduleTimeSeconds('nope', '18:00')).toBe(64800)
    expect(scheduleTimeSeconds('06:30', '18:00')).toBe(23400)
  })

  it('formats back to what the time picker holds', () => {
    expect(formatScheduleTime(64800)).toBe('18:00')
    expect(formatScheduleTime(32730)).toBe('09:05:30')
    expect(formatScheduleTime(parseScheduleTime('7:15')!)).toBe('07:15')
  })

  it('measures progress across a window that wraps past midnight', () => {
    expect(scheduleWindowProgress(23 * 3600, 22 * 3600, 2 * 3600)).toBeCloseTo(0.25, 9)
    expect(scheduleWindowProgress(3600, 22 * 3600, 2 * 3600)).toBeCloseTo(0.75, 9)
    expect(scheduleWindowProgress(100, 100, 100)).toBe(0)
  })
})

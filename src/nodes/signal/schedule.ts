// Schedule Trigger's time-of-day rules, shared by the preview, the normal
// sketch, the control graph and Graph Health so all four read a start or end
// field the same way.

/** The library defaults, also what an unreadable field falls back to. */
export const SCHEDULE_DEFAULT_START = '18:00'
export const SCHEDULE_DEFAULT_END = '23:00'

/**
 * A 24-hour "HH:MM" or "HH:MM:SS" time (a one-digit hour is accepted) as
 * seconds since midnight, or null when the text is not a time of day.
 */
export function parseScheduleTime(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(value)
  if (!match) return null
  const hour = Number(match[1]), minute = Number(match[2]), second = Number(match[3] ?? 0)
  if (hour > 23 || minute > 59 || second > 59) return null
  return hour * 3600 + minute * 60 + second
}

/** The instant a start or end field names, or its default when it names none. */
export function scheduleTimeSeconds(value: unknown, fallback: string): number {
  return parseScheduleTime(value) ?? parseScheduleTime(fallback) ?? 0
}

/** Seconds since midnight as a time field holds it: HH:MM, or HH:MM:SS when
 *  the seconds are not zero. */
export function formatScheduleTime(seconds: number): string {
  const total = Math.max(0, Math.min(86399, Math.round(seconds)))
  const pad = (n: number) => String(n).padStart(2, '0')
  const hhmm = `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}`
  return total % 60 ? `${hhmm}:${pad(total % 60)}` : hhmm
}

/** How far through an active window `seconds` sits, 0→1. Windows that wrap past
 *  midnight (start > end) measure across the wrap. Shared shape with the C++
 *  generator, which bakes the constants at generation time. */
export function scheduleWindowProgress(seconds: number, startSec: number, endSec: number): number {
  const span = endSec >= startSec ? endSec - startSec : 86400 - startSec + endSec
  if (span <= 0) return 0
  const elapsed = seconds >= startSec ? seconds - startSec : 86400 - startSec + seconds
  return Math.max(0, Math.min(1, elapsed / span))
}

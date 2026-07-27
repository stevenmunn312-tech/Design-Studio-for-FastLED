export interface RtcSnapshot {
  hour: number
  minute: number
  second: number
  weekday: number
  day: number
  month: number
  year: number
  secondsOfDay: number
  weekend: boolean
  valid: boolean
}

export interface RtcDateTimeFields {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function isRtcLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function rtcDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 2: return isRtcLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

export function isValidRtcDateTime(fields: RtcDateTimeFields): boolean {
  const year = Math.round(Number(fields.year))
  const month = Math.round(Number(fields.month))
  const day = Math.round(Number(fields.day))
  const hour = Math.round(Number(fields.hour))
  const minute = Math.round(Number(fields.minute))
  const second = Math.round(Number(fields.second))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return false
  if (year < 1970 || year > 9999) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > rtcDaysInMonth(year, month)) return false
  if (hour < 0 || hour > 23) return false
  if (minute < 0 || minute > 59) return false
  if (second < 0 || second > 59) return false
  return true
}

export function readRtcSnapshot(now: Date = new Date()): RtcSnapshot {
  const hour = now.getHours()
  const minute = now.getMinutes()
  const second = now.getSeconds()
  const weekday = now.getDay()
  const day = now.getDate()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return {
    hour,
    minute,
    second,
    weekday,
    day,
    month,
    year,
    secondsOfDay: hour * 3600 + minute * 60 + second + now.getMilliseconds() / 1000,
    weekend: weekday === 0 || weekday === 6,
    valid: true,
  }
}

export function formatRtcTime(snapshot: RtcSnapshot): string {
  return [snapshot.hour, snapshot.minute, snapshot.second]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

export function formatRtcDate(snapshot: RtcSnapshot): string {
  return `${WEEKDAY_LABELS[snapshot.weekday] ?? '???'} ${snapshot.year}-${String(snapshot.month).padStart(2, '0')}-${String(snapshot.day).padStart(2, '0')}`
}

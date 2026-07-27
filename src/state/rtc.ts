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

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

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

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

// Where "now" comes from when a caller doesn't supply one. The live preview
// wants the real wall clock; an offline renderer capturing reference images
// needs a fixed instant, or every capture of a clock node differs. Callers that
// already thread an explicit `now` are unaffected.
let rtcClockSource: () => Date = () => new Date()

/** Pin the wall clock these helpers fall back to. Pass no argument to restore
 * the real clock. Intended for offline/deterministic rendering and tests — the
 * app never calls this. */
export function setRtcClockSource(source?: () => Date): void {
  rtcClockSource = source ?? (() => new Date())
}

export function readRtcSnapshot(now: Date = rtcClockSource()): RtcSnapshot {
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

// ── Source-aware preview clock ───────────────────────────────────────────────
// The generated firmware picks its wall clock from RTCInput's `timeSource`, so
// the preview has to do the same or the designer sees a different time than the
// board will show. Manual runs a seeded software clock forward from boot (and
// reports invalid for an impossible seed, exactly like `_rtcValidDateTime`);
// NTP shows UTC shifted by the configured offset, which is the wall clock
// `configTime(offset, 0, server)` produces on-device. Compile Time seeds from
// the build stamp on hardware, so the browser's local clock is its closest
// preview. A physical DS3231 cannot be read by the browser, so preview models a
// healthy chip with the browser clock; firmware performs the real I2C read.

export type RtcTimeSource = 'Compile Time' | 'Manual' | 'NTP' | 'DS3231'

/** An RTC snapshot plus the sync flags RTCInput exposes alongside the fields. */
export interface RtcPreview extends RtcSnapshot {
  synced: boolean
  stale: boolean
}

/** All fields dark — mirrors the firmware's "seed invalid" state, where every
 *  RTCInput output stays at its zero initialiser. */
const RTC_INVALID: RtcPreview = {
  hour: 0, minute: 0, second: 0, weekday: 0, day: 0, month: 0, year: 0,
  secondsOfDay: 0, weekend: false, valid: false, synced: false, stale: false,
}

export function rtcTimeSource(properties: Record<string, unknown> | undefined): RtcTimeSource {
  const source = String(properties?.timeSource ?? 'Compile Time')
  return source === 'Manual' || source === 'NTP' || source === 'DS3231' ? source : 'Compile Time'
}

/** Read a UTC instant into the same shape `readRtcSnapshot` produces for local
 *  time — used by the sources whose wall clock is offset-defined, not local. */
function snapshotFromUtc(date: Date): RtcSnapshot {
  const hour = date.getUTCHours()
  const minute = date.getUTCMinutes()
  const second = date.getUTCSeconds()
  const weekday = date.getUTCDay()
  return {
    hour,
    minute,
    second,
    weekday,
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
    secondsOfDay: hour * 3600 + minute * 60 + second + date.getUTCMilliseconds() / 1000,
    weekend: weekday === 0 || weekday === 6,
    valid: true,
  }
}

/**
 * The clock the preview should show for an RTCInput node's configured source.
 * `elapsedSeconds` is preview time since the render loop started — the browser
 * stand-in for the firmware's `millis()`, so a Manual seed advances the same
 * way it will on the board.
 */
export function rtcPreviewSnapshot(
  properties: Record<string, unknown> | undefined,
  elapsedSeconds = 0,
  now: Date = rtcClockSource(),
): RtcPreview {
  const props = properties ?? {}
  switch (rtcTimeSource(props)) {
    case 'Manual': {
      const fields: RtcDateTimeFields = {
        year: Number(props.startYear ?? 0),
        month: Number(props.startMonth ?? 0),
        day: Number(props.startDay ?? 0),
        hour: Number(props.startHour ?? 0),
        minute: Number(props.startMinute ?? 0),
        second: Number(props.startSecond ?? 0),
      }
      if (!isValidRtcDateTime(fields)) return RTC_INVALID
      const seed = Date.UTC(
        Math.round(fields.year), Math.round(fields.month) - 1, Math.round(fields.day),
        Math.round(fields.hour), Math.round(fields.minute), Math.round(fields.second),
      )
      const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0
      return { ...snapshotFromUtc(new Date(seed + elapsed * 1000)), synced: true, stale: false }
    }
    case 'NTP': {
      const offsetMinutes = Number(props.timezoneOffsetMinutes ?? 0)
      const offset = Number.isFinite(offsetMinutes) ? offsetMinutes : 0
      return { ...snapshotFromUtc(new Date(now.getTime() + offset * 60_000)), synced: true, stale: false }
    }
    case 'DS3231':
      // Browser-side simulation of a connected, trustworthy module. The
      // generated sketch replaces this with the real I2C fields and OSF flag.
      return { ...readRtcSnapshot(now), synced: true, stale: false }
    default:
      return { ...readRtcSnapshot(now), synced: true, stale: false }
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

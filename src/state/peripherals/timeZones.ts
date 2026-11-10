/**
 * The Clock's time zones, for NTP time.
 *
 * A zone is stored by id and resolved here to a POSIX TZ string, the form the
 * board takes it in: `configTzTime` on the ESP32, `configTime(tz, server)` on
 * the ESP8266, and a generated rule on the UNO R4 WiFi, which keeps its own
 * clock (codegen/peripherals/rtcInputCpp.ts). The preview reads the same
 * string through `posixUtcOffsetSeconds`, so both follow one rule.
 *
 * The curated zones are IANA names, so a test can hold each rule to `Intl`
 * over real transitions; every city a label names is checked too. Anyone
 * outside the list picks a fixed offset (`UTC+05:30`), which never changes
 * its clocks. The rules use only the `Mm.w.d/time` form with times inside
 * 0-24 h, which every newlib the cores ship parses; zones whose tzdata rule
 * needs more (Israel's /26, Chile's /24, Egypt, Morocco) are left to a fixed
 * offset rather than given a rule that is wrong part of the year.
 */

export interface TimeZoneEntry {
  /** The stored value: an IANA name, so `Intl` can check the rule. */
  id: string
  label: string
  posix: string
  /** Other IANA zones the label names, held to the same rule in tests. */
  alsoZones?: readonly string[]
}

/** West to east. Each rule is tzdata's (2026b) from 2027 on. */
export const CURATED_TIME_ZONES: readonly TimeZoneEntry[] = [
  { id: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)', posix: 'HST10' },
  { id: 'America/Anchorage', label: 'Alaska (Anchorage)', posix: 'AKST9AKDT,M3.2.0,M11.1.0' },
  { id: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles, Seattle)', posix: 'PST8PDT,M3.2.0,M11.1.0' },
  // British Columbia has kept daylight time all year since November 2026.
  { id: 'America/Vancouver', label: 'British Columbia (Vancouver)', posix: 'MST7' },
  { id: 'America/Phoenix', label: 'Arizona (Phoenix)', posix: 'MST7' },
  { id: 'America/Denver', label: 'Mountain Time (Denver, Calgary)', posix: 'MST7MDT,M3.2.0,M11.1.0', alsoZones: ['America/Edmonton'] },
  { id: 'America/Chicago', label: 'Central Time (Chicago, Winnipeg)', posix: 'CST6CDT,M3.2.0,M11.1.0', alsoZones: ['America/Winnipeg'] },
  { id: 'America/Mexico_City', label: 'Mexico City', posix: 'CST6' },
  { id: 'America/Regina', label: 'Saskatchewan (Regina)', posix: 'CST6' },
  { id: 'America/New_York', label: 'Eastern Time (New York, Toronto)', posix: 'EST5EDT,M3.2.0,M11.1.0', alsoZones: ['America/Toronto'] },
  { id: 'America/Bogota', label: 'Bogotá, Lima', posix: '<-05>5', alsoZones: ['America/Lima'] },
  { id: 'America/Halifax', label: 'Atlantic Time (Halifax)', posix: 'AST4ADT,M3.2.0,M11.1.0' },
  { id: 'America/St_Johns', label: 'Newfoundland (St. John’s)', posix: 'NST3:30NDT,M3.2.0,M11.1.0' },
  { id: 'America/Sao_Paulo', label: 'São Paulo, Buenos Aires', posix: '<-03>3', alsoZones: ['America/Argentina/Buenos_Aires'] },
  { id: 'Atlantic/Reykjavik', label: 'Reykjavík', posix: 'GMT0' },
  { id: 'Europe/London', label: 'London, Dublin, Lisbon', posix: 'GMT0BST,M3.5.0/1,M10.5.0', alsoZones: ['Europe/Dublin', 'Europe/Lisbon'] },
  { id: 'Europe/Paris', label: 'Central Europe (Paris, Berlin, Madrid, Rome)', posix: 'CET-1CEST,M3.5.0,M10.5.0/3', alsoZones: ['Europe/Berlin', 'Europe/Madrid', 'Europe/Rome'] },
  { id: 'Africa/Lagos', label: 'West Africa (Lagos)', posix: 'WAT-1' },
  { id: 'Europe/Athens', label: 'Eastern Europe (Athens, Helsinki, Bucharest)', posix: 'EET-2EEST,M3.5.0/3,M10.5.0/4', alsoZones: ['Europe/Helsinki', 'Europe/Bucharest'] },
  { id: 'Africa/Johannesburg', label: 'Johannesburg', posix: 'SAST-2' },
  { id: 'Europe/Istanbul', label: 'Istanbul', posix: '<+03>-3' },
  { id: 'Europe/Moscow', label: 'Moscow', posix: 'MSK-3' },
  { id: 'Asia/Riyadh', label: 'Riyadh, Nairobi', posix: '<+03>-3', alsoZones: ['Africa/Nairobi'] },
  { id: 'Asia/Tehran', label: 'Tehran', posix: '<+0330>-3:30' },
  { id: 'Asia/Dubai', label: 'Dubai', posix: '<+04>-4' },
  { id: 'Asia/Karachi', label: 'Karachi', posix: 'PKT-5' },
  { id: 'Asia/Kolkata', label: 'India (Kolkata, Mumbai, Delhi)', posix: 'IST-5:30' },
  { id: 'Asia/Kathmandu', label: 'Kathmandu', posix: '<+0545>-5:45' },
  { id: 'Asia/Dhaka', label: 'Dhaka', posix: '<+06>-6' },
  { id: 'Asia/Bangkok', label: 'Bangkok, Jakarta, Ho Chi Minh City', posix: '<+07>-7', alsoZones: ['Asia/Jakarta', 'Asia/Ho_Chi_Minh'] },
  { id: 'Asia/Shanghai', label: 'China (Beijing, Shanghai), Hong Kong, Taipei', posix: 'CST-8', alsoZones: ['Asia/Hong_Kong', 'Asia/Taipei'] },
  { id: 'Asia/Singapore', label: 'Singapore, Kuala Lumpur, Manila', posix: '<+08>-8', alsoZones: ['Asia/Kuala_Lumpur', 'Asia/Manila'] },
  { id: 'Australia/Perth', label: 'Perth', posix: 'AWST-8' },
  { id: 'Asia/Tokyo', label: 'Tokyo, Seoul', posix: 'JST-9', alsoZones: ['Asia/Seoul'] },
  { id: 'Australia/Darwin', label: 'Darwin', posix: 'ACST-9:30' },
  { id: 'Australia/Adelaide', label: 'Adelaide', posix: 'ACST-9:30ACDT,M10.1.0,M4.1.0/3' },
  { id: 'Australia/Brisbane', label: 'Brisbane', posix: 'AEST-10' },
  { id: 'Australia/Sydney', label: 'Sydney, Melbourne, Hobart', posix: 'AEST-10AEDT,M10.1.0,M4.1.0/3', alsoZones: ['Australia/Melbourne', 'Australia/Hobart'] },
  { id: 'Pacific/Auckland', label: 'New Zealand (Auckland)', posix: 'NZST-12NZDT,M9.5.0,M4.1.0/3' },
]

/** The id a new Clock starts on, and what an unreadable one runs as. */
export const DEFAULT_TIME_ZONE = 'UTC'

/** Every standard offset in use somewhere, in minutes east of UTC. */
export const FIXED_OFFSET_MINUTES: readonly number[] = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60,
  0, 60, 120, 180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 525, 540, 570,
  600, 630, 660, 720, 765, 780, 825, 840,
]

/** The range the old minute slider covered, which a saved offset may hold. */
const FIXED_OFFSET_MIN = -720
const FIXED_OFFSET_MAX = 840

const two = (value: number) => String(value).padStart(2, '0')

/** `UTC` for zero, otherwise `UTC+05:30` style; any minute count is rounded. */
export function fixedOffsetZoneId(minutes: number): string {
  const whole = Number.isFinite(minutes)
    ? Math.min(FIXED_OFFSET_MAX, Math.max(FIXED_OFFSET_MIN, Math.round(minutes)))
    : 0
  if (whole === 0) return 'UTC'
  const size = Math.abs(whole)
  return `UTC${whole < 0 ? '-' : '+'}${two(Math.floor(size / 60))}:${two(size % 60)}`
}

/** Minutes east of UTC for a fixed-offset id, or null for anything else. */
export function fixedOffsetMinutes(id: string): number | null {
  if (id === 'UTC') return 0
  const match = /^UTC([+-])(\d{2}):(\d{2})$/.exec(id)
  if (!match) return null
  const hours = Number(match[2])
  const minutes = Number(match[3])
  if (minutes > 59) return null
  const total = (hours * 60 + minutes) * (match[1] === '-' ? -1 : 1)
  return total === 0 || total < FIXED_OFFSET_MIN || total > FIXED_OFFSET_MAX ? null : total
}

/** POSIX for a fixed offset: the sign is west-positive, the name quoted. */
function fixedOffsetPosix(minutes: number): string {
  if (minutes === 0) return 'UTC0'
  const size = Math.abs(minutes)
  const hours = Math.floor(size / 60)
  const rest = size % 60
  const name = `<${minutes < 0 ? '-' : '+'}${two(hours)}${rest ? two(rest) : ''}>`
  return `${name}${minutes < 0 ? '' : '-'}${hours}${rest ? `:${two(rest)}` : ''}`
}

const CURATED_BY_ID = new Map(CURATED_TIME_ZONES.map((zone) => [zone.id, zone]))

/** The picker: the curated zones, then UTC and the fixed offsets. */
export const TIME_ZONE_OPTIONS: readonly string[] = [
  ...CURATED_TIME_ZONES.map((zone) => zone.id),
  ...FIXED_OFFSET_MINUTES.map(fixedOffsetZoneId),
]

/** What each option reads as in the picker. */
export const TIME_ZONE_LABELS: Readonly<Record<string, string>> = Object.fromEntries([
  ...CURATED_TIME_ZONES.map((zone) => [zone.id, zone.label]),
  ...FIXED_OFFSET_MINUTES.map((minutes) => {
    const id = fixedOffsetZoneId(minutes)
    return [id, minutes === 0 ? 'UTC' : `${id}, fixed`]
  }),
])

/** Whether `id` names a zone this module can resolve. */
export function isKnownTimeZone(id: unknown): boolean {
  return typeof id === 'string' && (CURATED_BY_ID.has(id) || fixedOffsetMinutes(id) !== null)
}

/** A Clock's zone id: its own when readable, otherwise UTC. */
export function clockTimeZone(properties: Record<string, unknown> | undefined): string {
  const id = properties?.timeZone
  return isKnownTimeZone(id) ? String(id) : DEFAULT_TIME_ZONE
}

/** The POSIX TZ string for a zone id, or null for an id nothing names. */
export function posixTimeZoneFor(id: string): string | null {
  const curated = CURATED_BY_ID.get(id)
  if (curated) return curated.posix
  const minutes = fixedOffsetMinutes(id)
  return minutes === null ? null : fixedOffsetPosix(minutes)
}

// ── POSIX TZ rules ───────────────────────────────────────────────────────────

/** `Mm.w.d/time`: weekday `weekday` (0 = Sunday) of week `week` (5 = the
 *  last) of `month`, at `seconds` of the local time in force before it. */
export interface PosixSwitchRule {
  month: number
  week: number
  weekday: number
  seconds: number
}

/** Offsets are seconds east of UTC, the opposite sign of the POSIX text. */
export interface PosixTimeZone {
  standardOffset: number
  daylight: { offset: number; start: PosixSwitchRule; end: PosixSwitchRule } | null
}

// A name is three or more letters, or anything sign-and-digit in <>; an offset
// or a time is [+-]hh[:mm[:ss]].
const NAME = '(?:[A-Za-z]{3,}|<[A-Za-z0-9+-]{3,}>)'
const CLOCK = '[+-]?\\d{1,2}(?::\\d{2}){0,2}'
const RULE = `M\\d{1,2}\\.\\d\\.\\d(?:/${CLOCK})?`
const POSIX_TZ = new RegExp(`^${NAME}(${CLOCK})(?:(${NAME})(${CLOCK})?(?:,(${RULE}),(${RULE}))?)?$`)

function clockSeconds(text: string): number | null {
  const match = /^([+-])?(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/.exec(text)
  if (!match) return null
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? 0)
  const seconds = Number(match[4] ?? 0)
  if (hours > 24 || minutes > 59 || seconds > 59) return null
  const total = hours * 3600 + minutes * 60 + seconds
  if (total > 24 * 3600) return null
  return match[1] === '-' ? -total : total
}

function switchRule(text: string): PosixSwitchRule | null {
  const match = /^M(\d{1,2})\.(\d)\.(\d)(?:\/(.+))?$/.exec(text)
  if (!match) return null
  const month = Number(match[1])
  const week = Number(match[2])
  const weekday = Number(match[3])
  const seconds = match[4] === undefined ? 2 * 3600 : clockSeconds(match[4])
  if (month < 1 || month > 12 || week < 1 || week > 5 || weekday > 6) return null
  // Times outside a day (Israel's /26, Greenland's /-1) are the newlib
  // extension the cores may not parse; refuse them rather than guess.
  if (seconds === null || seconds < 0) return null
  return { month, week, weekday, seconds }
}

/**
 * Parse the subset of POSIX TZ this app emits: a standard name and offset,
 * and optionally a daylight name, offset and a pair of `Mm.w.d/time` rules.
 * Null for anything else, which is also the check a string passes before it
 * is written into C++.
 */
export function parsePosixTimeZone(text: string): PosixTimeZone | null {
  const match = POSIX_TZ.exec(text)
  if (!match) return null
  const standardWest = clockSeconds(match[1])
  if (standardWest === null) return null
  const standardOffset = 0 - standardWest
  if (match[2] === undefined) return { standardOffset, daylight: null }
  // A daylight zone needs its rules: without them the cores fall back to a
  // US default that is wrong almost everywhere.
  if (match[4] === undefined || match[5] === undefined) return null
  const daylightWest = match[3] === undefined ? standardWest - 3600 : clockSeconds(match[3])
  const start = switchRule(match[4])
  const end = switchRule(match[5])
  if (daylightWest === null || !start || !end) return null
  return { standardOffset, daylight: { offset: 0 - daylightWest, start, end } }
}

function daysFromCivil(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * The UTC second a switch happens in `year`, from the local time in force
 * before it (`offsetBefore`, seconds east). The same arithmetic as the
 * sketch's `_rtcTzSwitchUtc`.
 */
export function posixSwitchUtcSeconds(year: number, rule: PosixSwitchRule, offsetBefore: number): number {
  const first = daysFromCivil(year, rule.month, 1)
  const firstWeekday = (((first + 4) % 7) + 7) % 7
  let day = first + ((rule.weekday + 7 - firstWeekday) % 7) + (rule.week - 1) * 7
  if (day > first + daysInMonth(year, rule.month) - 1) day -= 7
  return day * 86_400 + rule.seconds - offsetBefore
}

/**
 * Seconds east of UTC at a UTC instant. Daylight time runs from the start
 * switch (read on standard time) to the end switch (read on daylight time),
 * and wraps the new year south of the equator. The sketch's `_rtcTzOffset`
 * is this function.
 */
export function posixUtcOffsetSeconds(zone: PosixTimeZone, utcSeconds: number): number {
  if (!zone.daylight) return zone.standardOffset
  const year = new Date(Math.floor((utcSeconds + zone.standardOffset) / 86_400) * 86_400_000).getUTCFullYear()
  const start = posixSwitchUtcSeconds(year, zone.daylight.start, zone.standardOffset)
  const end = posixSwitchUtcSeconds(year, zone.daylight.end, zone.daylight.offset)
  const daylight = start < end
    ? utcSeconds >= start && utcSeconds < end
    : utcSeconds < end || utcSeconds >= start
  return daylight ? zone.daylight.offset : zone.standardOffset
}

const UTC_ZONE: PosixTimeZone = { standardOffset: 0, daylight: null }

/** A zone id's parsed rule; UTC for an id nothing names. */
export function posixZoneFor(id: string): PosixTimeZone {
  const posix = posixTimeZoneFor(id)
  return (posix && parsePosixTimeZone(posix)) || UTC_ZONE
}

/** Seconds east of UTC in zone `id` at a UTC instant in milliseconds. */
export function timeZoneOffsetSeconds(id: string, utcMs: number): number {
  return posixUtcOffsetSeconds(posixZoneFor(id), Math.floor(utcMs / 1000))
}

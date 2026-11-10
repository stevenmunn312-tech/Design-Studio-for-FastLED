import { describe, expect, it } from 'vitest'
import {
  CURATED_TIME_ZONES, DEFAULT_TIME_ZONE, FIXED_OFFSET_MINUTES, TIME_ZONE_LABELS, TIME_ZONE_OPTIONS,
  clockTimeZone, fixedOffsetMinutes, fixedOffsetZoneId, isKnownTimeZone, parsePosixTimeZone,
  posixTimeZoneFor, posixUtcOffsetSeconds, posixZoneFor, timeZoneOffsetSeconds,
} from '../timeZones'

// Seconds east of UTC that the host's tz database gives `zone` at an instant.
const formatters = new Map<string, Intl.DateTimeFormat>()
function intlOffsetSeconds(zone: string, utcSeconds: number): number {
  let format = formatters.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
    formatters.set(zone, format)
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(utcSeconds * 1000))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]))
  const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) / 1000
  return local - utcSeconds
}

const FROM = Date.UTC(2027, 0, 1) / 1000
const TO = Date.UTC(2029, 0, 1) / 1000

describe('curated time zones', () => {
  it('each parses, and every zone a label names is one Intl knows', () => {
    for (const zone of CURATED_TIME_ZONES) {
      expect(parsePosixTimeZone(zone.posix), zone.id).not.toBeNull()
      for (const name of [zone.id, ...(zone.alsoZones ?? [])]) {
        expect(() => intlOffsetSeconds(name, FROM), name).not.toThrow()
      }
    }
  })

  // Every day at noon UTC catches a season the rule gets wrong; each switch
  // the rule makes is then checked a second either side, which catches a
  // wrong day or time of day.
  it.each(CURATED_TIME_ZONES.flatMap((zone) => [zone.id, ...(zone.alsoZones ?? [])].map((name) => [name, zone.posix] as const)))(
    '%s follows %s through 2027-2028',
    (name, posix) => {
      const zone = parsePosixTimeZone(posix)!
      let switches = 0
      let previous = posixUtcOffsetSeconds(zone, FROM)
      for (let day = FROM + 12 * 3600; day < TO; day += 86_400) {
        expect(posixUtcOffsetSeconds(zone, day), `${name} at ${new Date(day * 1000).toISOString()}`)
          .toBe(intlOffsetSeconds(name, day))
      }
      for (let hour = FROM; hour < TO; hour += 3600) {
        const offset = posixUtcOffsetSeconds(zone, hour)
        if (offset === previous) continue
        switches += 1
        previous = offset
        // The switch happened somewhere in the hour before: find the second.
        let at = hour - 3600
        while (posixUtcOffsetSeconds(zone, at) !== offset) at += 60
        for (const sample of [at - 1, at, at + 1]) {
          expect(posixUtcOffsetSeconds(zone, sample), `${name} at ${new Date(sample * 1000).toISOString()}`)
            .toBe(intlOffsetSeconds(name, sample))
        }
      }
      // Two years of a daylight zone switch twice a year.
      expect(switches).toBe(zone.daylight ? 4 : 0)
    },
  )
})

describe('fixed offsets', () => {
  it('round-trips each id and keeps the old slider range', () => {
    for (const minutes of FIXED_OFFSET_MINUTES) {
      expect(fixedOffsetMinutes(fixedOffsetZoneId(minutes))).toBe(minutes)
    }
    expect(fixedOffsetZoneId(0)).toBe('UTC')
    expect(fixedOffsetZoneId(330)).toBe('UTC+05:30')
    expect(fixedOffsetZoneId(-210)).toBe('UTC-03:30')
    // A saved offset the list does not name still reads, as itself.
    expect(fixedOffsetZoneId(135)).toBe('UTC+02:15')
    expect(isKnownTimeZone('UTC+02:15')).toBe(true)
    expect(fixedOffsetZoneId(5000)).toBe('UTC+14:00')
    expect(fixedOffsetMinutes('UTC+15:00')).toBeNull()
    expect(fixedOffsetMinutes('UTC+00:00')).toBeNull()
    expect(fixedOffsetMinutes('UTC+5:30')).toBeNull()
  })

  it('writes POSIX with the west-positive sign and a quoted name', () => {
    expect(posixTimeZoneFor('UTC')).toBe('UTC0')
    expect(posixTimeZoneFor('UTC+05:30')).toBe('<+0530>-5:30')
    expect(posixTimeZoneFor('UTC-03:00')).toBe('<-03>3')
    expect(posixTimeZoneFor('UTC-09:30')).toBe('<-0930>9:30')
    for (const minutes of FIXED_OFFSET_MINUTES) {
      const zone = parsePosixTimeZone(posixTimeZoneFor(fixedOffsetZoneId(minutes))!)
      expect(zone).toEqual({ standardOffset: minutes * 60, daylight: null })
    }
  })
})

describe('the picker', () => {
  it('lists the curated zones, then UTC and the fixed offsets, each labelled', () => {
    expect(TIME_ZONE_OPTIONS.slice(0, CURATED_TIME_ZONES.length)).toEqual(CURATED_TIME_ZONES.map((zone) => zone.id))
    expect(TIME_ZONE_OPTIONS).toContain(DEFAULT_TIME_ZONE)
    expect(new Set(TIME_ZONE_OPTIONS).size).toBe(TIME_ZONE_OPTIONS.length)
    for (const option of TIME_ZONE_OPTIONS) expect(TIME_ZONE_LABELS[option], option).toBeTruthy()
    expect(TIME_ZONE_LABELS['UTC+05:45']).toBe('UTC+05:45, fixed')
  })

  it('reads an unknown or missing zone as UTC', () => {
    expect(clockTimeZone({})).toBe('UTC')
    expect(clockTimeZone({ timeZone: 'Mars/Olympus_Mons' })).toBe('UTC')
    expect(clockTimeZone({ timeZone: 'Europe/London' })).toBe('Europe/London')
    expect(posixTimeZoneFor('Mars/Olympus_Mons')).toBeNull()
    expect(posixZoneFor('Mars/Olympus_Mons')).toEqual({ standardOffset: 0, daylight: null })
  })
})

describe('parsePosixTimeZone', () => {
  it('reads names, offsets and rules', () => {
    expect(parsePosixTimeZone('EST5EDT,M3.2.0,M11.1.0')).toEqual({
      standardOffset: -5 * 3600,
      daylight: {
        offset: -4 * 3600,
        start: { month: 3, week: 2, weekday: 0, seconds: 7200 },
        end: { month: 11, week: 1, weekday: 0, seconds: 7200 },
      },
    })
    expect(parsePosixTimeZone('NST3:30NDT,M3.2.0,M11.1.0')?.standardOffset).toBe(-(3 * 3600 + 1800))
    expect(parsePosixTimeZone('<+0545>-5:45')).toEqual({ standardOffset: 5 * 3600 + 45 * 60, daylight: null })
  })

  it('refuses what it cannot evaluate or what should not reach C++', () => {
    expect(parsePosixTimeZone('')).toBeNull()
    expect(parsePosixTimeZone('EST')).toBeNull()
    // A daylight name with no rules: the cores would guess US dates.
    expect(parsePosixTimeZone('EST5EDT')).toBeNull()
    // Julian-day rules and times outside the day are not in the subset.
    expect(parsePosixTimeZone('EST5EDT,J60,J300')).toBeNull()
    expect(parsePosixTimeZone('IST-2IDT,M3.4.4/26,M10.5.0')).toBeNull()
    expect(parsePosixTimeZone('<-02>2<-01>,M3.5.0/-1,M10.5.0/0')).toBeNull()
    expect(parsePosixTimeZone('UTC0"); evil();//')).toBeNull()
    expect(parsePosixTimeZone('EST5EDT,M13.2.0,M11.1.0')).toBeNull()
  })
})

describe('timeZoneOffsetSeconds', () => {
  it('follows London across its spring switch at 01:00 UTC', () => {
    expect(timeZoneOffsetSeconds('Europe/London', Date.UTC(2026, 2, 29, 0, 59, 59))).toBe(0)
    expect(timeZoneOffsetSeconds('Europe/London', Date.UTC(2026, 2, 29, 1, 0, 0))).toBe(3600)
  })

  it('wraps the new year south of the equator', () => {
    expect(timeZoneOffsetSeconds('Australia/Sydney', Date.UTC(2026, 0, 15))).toBe(11 * 3600)
    expect(timeZoneOffsetSeconds('Australia/Sydney', Date.UTC(2026, 6, 15))).toBe(10 * 3600)
  })
})

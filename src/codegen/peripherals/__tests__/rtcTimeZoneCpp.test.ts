import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { rtcInputLoopCpp, rtcTimeZoneCpp } from '../rtcInputCpp'
import { rtcHelperCpp } from '../rtcCpp'
import { CURATED_TIME_ZONES, parsePosixTimeZone, posixUtcOffsetSeconds } from '../../../state/peripherals/timeZones'

const v = (port: string) => `n_rtc_${port}`
const loop = (props: Record<string, unknown>) => rtcInputLoopCpp('rtc', { timeSource: 'NTP', ...props }, v).join('\n')

describe('an NTP Clock\'s time zone in the sketch', () => {
  it('hands the ESP cores the zone\'s POSIX string', () => {
    const cpp = loop({ timeZone: 'Europe/Paris', ntpServer: 'pool.ntp.org' })
    expect(cpp).toContain([
      '#if defined(ESP32)',
      '    configTzTime("CET-1CEST,M3.5.0,M10.5.0/3", "pool.ntp.org");',
      '#else',
      '    configTime("CET-1CEST,M3.5.0,M10.5.0/3", "pool.ntp.org");',
      '#endif',
    ].join('\n'))
  })

  it('applies the rule itself on the UNO R4 WiFi branch', () => {
    const cpp = loop({ timeZone: 'Europe/Paris' })
    expect(cpp).toContain('int64_t _rtcNtpUtc_rtc = (int64_t)_rtcNtpEpoch_rtc + (int64_t)((uint32_t)(millis() - _rtcNtpAtMs_rtc) / 1000u);')
    // Standard +1 h, daylight +2 h, from the last Sunday of March at 02:00
    // to the last Sunday of October at 03:00.
    expect(cpp).toContain('int64_t _rtcNtpLocal_rtc = _rtcNtpUtc_rtc + _rtcTzOffset(_rtcNtpUtc_rtc, 3600, 7200, 3, 5, 0, 7200, 10, 5, 0, 10800);')
    // A fixed offset is a constant, as the old minute offset was.
    expect(loop({ timeZone: 'UTC+05:30' })).toContain('int64_t _rtcNtpLocal_rtc = _rtcNtpUtc_rtc + 19800;')
    expect(loop({ timeZone: 'UTC+05:30' })).toContain('configTzTime("<+0530>-5:30", ')
  })

  it('runs an unknown or hostile zone as UTC, never as its text', () => {
    expect(rtcTimeZoneCpp({ timeZone: 'Mars/Olympus_Mons' }).posix).toBe('UTC0')
    const cpp = loop({ timeZone: 'UTC0"); evil(); //' })
    expect(cpp).toContain('configTzTime("UTC0", ')
    expect(cpp).not.toContain('evil')
    expect(cpp).toContain('int64_t _rtcNtpLocal_rtc = _rtcNtpUtc_rtc + 0;')
  })

  it('emits nothing about zones for the other sources', () => {
    for (const timeSource of ['Compile Time', 'Manual', 'DS3231']) {
      const cpp = rtcInputLoopCpp('rtc', { timeSource, timeZone: 'Europe/Paris' }, v).join('\n')
      expect(cpp).not.toMatch(/configT|_rtcTzOffset/)
    }
  })
})

/*
 * `_rtcTzOffset` compiled on the PC and run over the same instants as the
 * preview's `posixUtcOffsetSeconds`: every six hours through 2027-2028 and a
 * second either side of each switch. Needs a host g++ (WSL's on Windows) and
 * skips without one.
 */
const nativeGpp = spawnSync('g++', ['--version']).status === 0
const wslGpp = !nativeGpp && process.platform === 'win32'
  && spawnSync('wsl', ['--exec', 'g++', '--version']).status === 0
const compilerPath = (value: string) => wslGpp
  ? value.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
  : value

describe.skipIf(!nativeGpp && !wslGpp)('the R4 zone rule on the host', () => {
  it('gives the same offset as the preview for every daylight zone', () => {
    const FROM = Date.UTC(2027, 0, 1) / 1000
    const TO = Date.UTC(2029, 0, 1) / 1000
    const zones = CURATED_TIME_ZONES.map((zone) => parsePosixTimeZone(zone.posix)!).filter((zone) => zone.daylight)
    const instants: number[] = []
    for (let t = FROM; t < TO; t += 6 * 3600) instants.push(t)
    for (const zone of zones) {
      let previous = posixUtcOffsetSeconds(zone, FROM)
      for (let t = FROM; t < TO; t += 60) {
        const offset = posixUtcOffsetSeconds(zone, t)
        if (offset !== previous) instants.push(t - 1, t, t + 1)
        previous = offset
      }
    }
    const calls = zones.map((zone) => {
      const { offset, start, end } = zone.daylight!
      return `_rtcTzOffset(t[i], ${zone.standardOffset}, ${offset}, ${start.month}, ${start.week}, ${start.weekday}, ${start.seconds}, ${end.month}, ${end.week}, ${end.weekday}, ${end.seconds})`
    })
    const expected = zones.map((zone) => instants.map((t) => posixUtcOffsetSeconds(zone, t)).join(' ')).join('\n')

    const dir = path.resolve(mkdtempSync(path.join(tmpdir(), 'rtc-zone-')))
    try {
      const source = path.join(dir, 'zone.cpp')
      const exe = path.join(dir, nativeGpp && process.platform === 'win32' ? 'zone.exe' : 'zone')
      writeFileSync(source, `#include <cstdint>
#include <cstdio>
#include <cstring>
${rtcHelperCpp().join('\n')}
static const int64_t t[] = { ${instants.join(', ')} };
int main() {
  const unsigned n = sizeof(t) / sizeof(t[0]);
${calls.map((call, index) => `  for (unsigned i = 0; i < n; i++) printf(i ? " %ld" : "${index ? '\\n' : ''}%ld", (long)${call});`).join('\n')}
  return 0;
}
`)
      const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function', source, '-o', exe]
      execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
      const out = execFileSync(wslGpp ? 'wsl' : exe, wslGpp ? ['--exec', compilerPath(exe)] : [], { maxBuffer: 64 * 1024 * 1024 }).toString().trim()
      expect(out).toBe(expected)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})

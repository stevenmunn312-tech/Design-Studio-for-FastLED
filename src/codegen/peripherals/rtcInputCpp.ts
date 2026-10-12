// One RTC node's loop, shared by the normal sketch and template control graphs.
// Compile Time, Manual and DS3231 are local. NTP needs the sketch's network:
// the normal sketch starts it beside Art-Net, and a control graph carries the
// same bootstrap with the clock, so a show or SD player keeps real time too.
import type { StudioNode } from '../../state/graphStore'
import { cppStringLiteral } from '../cppLiterals'
import { sanitizePin } from '../hardwarePins'
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'
import { rtcI2cPinsForProfile } from '../../build/pins/rtcPins'
import { ds3231HelperCpp, rtcHelperCpp } from './rtcCpp'
import { networkSketchCpp, networkSourceIn } from './networkCpp'
import type { ControlInputEmission } from '../controlInputCpp'

export const RTC_CONTROL_OUTPUTS: Record<string, 'bool' | 'float'> = {
  valid: 'bool', synced: 'bool', stale: 'bool', weekend: 'bool',
  hour: 'float', minute: 'float', second: 'float', weekday: 'float',
  day: 'float', month: 'float', year: 'float', secondsOfDay: 'float',
}

export function rtcTimeSource(properties: Record<string, unknown>): string {
  return String(properties.timeSource ?? 'Compile Time')
}

/** The struct a display reads. Scalar ports stay on `RTC_CONTROL_OUTPUTS`. */
export function rtcDateTimeSymbol(id: string): string {
  return `n_${id}_dateTime`
}

export function rtcInputLoopCpp(id: string, p: Record<string, unknown>, v: (port: string) => string): string[] {
  const rawInt = (value: unknown, def: number) => {
    const n = Math.round(Number(value))
    return Number.isFinite(n) ? n : def
  }
  const source = rtcTimeSource(p)
  const startYear = rawInt(p.startYear, 2026)
  const startMonth = rawInt(p.startMonth, 1)
  const startDay = rawInt(p.startDay, 1)
  const startHour = rawInt(p.startHour, 12)
  const startMinute = rawInt(p.startMinute, 0)
  const startSecond = rawInt(p.startSecond, 0)
  const timezoneOffsetMinutes = rawInt(p.timezoneOffsetMinutes, 0)
  const ntpServer = cppStringLiteral(p.ntpServer ?? 'pool.ntp.org')
  const ntp = source === 'NTP'
  const ds3231 = source === 'DS3231'
  const lines: string[] = []
  const ln = (line: string) => { lines.push(line) }
  ln(`  static bool _rtcInit_${id} = false, _rtcSeedValid_${id} = false;`)
  if (ntp) ln(`  static bool _rtcNtpConfigured_${id} = false;`)
  ln(`  static int32_t _rtcBaseDays_${id} = 0;`)
  ln(`  static uint32_t _rtcBaseSeconds_${id} = 0, _rtcLastMillis_${id} = 0;`)
  ln(`  static uint64_t _rtcElapsedMillis_${id} = 0;`)
  ln(`  if (!_rtcInit_${id}) {`)
  if (source === 'Manual') {
    ln(`    _rtcSeedValid_${id} = _rtcValidDateTime(${startYear}, ${startMonth}, ${startDay}, ${startHour}, ${startMinute}, ${startSecond});`)
    ln(`    if (_rtcSeedValid_${id}) {`)
    ln(`      _rtcBaseDays_${id} = _rtcDaysFromCivil(${startYear}, ${startMonth}, ${startDay});`)
    ln(`      _rtcBaseSeconds_${id} = (uint32_t)(${startHour}) * 3600u + (uint32_t)(${startMinute}) * 60u + (uint32_t)(${startSecond});`)
    ln(`    }`)
  } else if (!ds3231) {
    ln(`    _RtcDateTime _rtcBuild_${id};`)
    ln(`    _rtcSeedValid_${id} = _rtcParseBuildStamp(__DATE__, __TIME__, _rtcBuild_${id});`)
    ln(`    if (_rtcSeedValid_${id}) {`)
    ln(`      _rtcBaseDays_${id} = _rtcDaysFromCivil(_rtcBuild_${id}.year, _rtcBuild_${id}.month, _rtcBuild_${id}.day);`)
    ln(`      _rtcBaseSeconds_${id} = (uint32_t)_rtcBuild_${id}.hour * 3600u + (uint32_t)_rtcBuild_${id}.minute * 60u + (uint32_t)_rtcBuild_${id}.second;`)
    ln(`    }`)
  }
  ln(`    _rtcLastMillis_${id} = millis();`)
  ln(`    _rtcInit_${id} = true;`)
  ln(`  }`)
  ln(`  bool ${v('valid')} = false, ${v('synced')} = false, ${v('stale')} = false, ${v('weekend')} = false;`)
  ln(`  float ${v('hour')} = 0.0f, ${v('minute')} = 0.0f, ${v('second')} = 0.0f;`)
  ln(`  float ${v('weekday')} = 0.0f, ${v('day')} = 0.0f, ${v('month')} = 0.0f, ${v('year')} = 0.0f;`)
  ln(`  float ${v('secondsOfDay')} = 0.0f;`)
  ln(`  if (_rtcSeedValid_${id}) {`)
  ln(`    uint32_t _rtcNowMs_${id} = millis();`)
  ln(`    _rtcElapsedMillis_${id} += (uint32_t)(_rtcNowMs_${id} - _rtcLastMillis_${id});`)
  ln(`    _rtcLastMillis_${id} = _rtcNowMs_${id};`)
  ln(`    uint64_t _rtcWholeSeconds_${id} = _rtcElapsedMillis_${id} / 1000ull;`)
  ln(`    uint32_t _rtcMillisRema_${id} = (uint32_t)(_rtcElapsedMillis_${id} % 1000ull);`)
  ln(`    uint64_t _rtcTotalSeconds_${id} = (uint64_t)_rtcBaseSeconds_${id} + _rtcWholeSeconds_${id};`)
  ln(`    int32_t _rtcDays_${id} = _rtcBaseDays_${id} + (int32_t)(_rtcTotalSeconds_${id} / 86400ull);`)
  ln(`    uint32_t _rtcSecondsOfDay_${id} = (uint32_t)(_rtcTotalSeconds_${id} % 86400ull);`)
  ln(`    int16_t _rtcYear_${id}; uint8_t _rtcMonth_${id}, _rtcDay_${id};`)
  ln(`    _rtcCivilFromDays(_rtcDays_${id}, _rtcYear_${id}, _rtcMonth_${id}, _rtcDay_${id});`)
  ln(`    uint8_t _rtcWeekday_${id} = _rtcWeekdayFromDays(_rtcDays_${id});`)
  ln(`    ${v('valid')} = true;`)
  ln(`    ${v('synced')} = false;`)
  ln(`    ${v('stale')} = true;`)
  ln(`    ${v('hour')} = (float)(_rtcSecondsOfDay_${id} / 3600u);`)
  ln(`    ${v('minute')} = (float)((_rtcSecondsOfDay_${id} / 60u) % 60u);`)
  ln(`    ${v('second')} = (float)(_rtcSecondsOfDay_${id} % 60u);`)
  ln(`    ${v('weekday')} = (float)_rtcWeekday_${id};`)
  ln(`    ${v('day')} = (float)_rtcDay_${id};`)
  ln(`    ${v('month')} = (float)_rtcMonth_${id};`)
  ln(`    ${v('year')} = (float)_rtcYear_${id};`)
  ln(`    ${v('secondsOfDay')} = (float)_rtcSecondsOfDay_${id} + _rtcMillisRema_${id} / 1000.0f;`)
  ln(`    ${v('weekend')} = _rtcWeekday_${id} == 0 || _rtcWeekday_${id} == 6;`)
  ln(`  }`)
  if (ntp) {
    ln(`  _netEnsureConnected();`)
    ln(`#if FLS_NET_SUPPORTED`)
    ln(`  if (_netConnected() && !_rtcNtpConfigured_${id}) {`)
    ln(`    configTime(${timezoneOffsetMinutes * 60}, 0, ${ntpServer});`)
    ln(`    _rtcNtpConfigured_${id} = true;`)
    ln(`  }`)
    ln(`  time_t _rtcEpoch_${id} = time(nullptr);`)
    ln(`  if (_rtcEpoch_${id} >= 946684800) {`)
    ln(`    struct tm _rtcTm_${id};`)
    ln(`    localtime_r(&_rtcEpoch_${id}, &_rtcTm_${id});`)
    ln(`    ${v('valid')} = true;`)
    ln(`    ${v('synced')} = _netConnected();`)
    ln(`    ${v('stale')} = !_netConnected();`)
    ln(`    ${v('hour')} = (float)_rtcTm_${id}.tm_hour;`)
    ln(`    ${v('minute')} = (float)_rtcTm_${id}.tm_min;`)
    ln(`    ${v('second')} = (float)_rtcTm_${id}.tm_sec;`)
    ln(`    ${v('weekday')} = (float)_rtcTm_${id}.tm_wday;`)
    ln(`    ${v('day')} = (float)_rtcTm_${id}.tm_mday;`)
    ln(`    ${v('month')} = (float)(_rtcTm_${id}.tm_mon + 1);`)
    ln(`    ${v('year')} = (float)(_rtcTm_${id}.tm_year + 1900);`)
    ln(`    ${v('secondsOfDay')} = (float)(_rtcTm_${id}.tm_hour * 3600 + _rtcTm_${id}.tm_min * 60 + _rtcTm_${id}.tm_sec);`)
    ln(`    ${v('weekend')} = _rtcTm_${id}.tm_wday == 0 || _rtcTm_${id}.tm_wday == 6;`)
    ln(`  }`)
    ln(`#endif`)
  }
  if (ds3231) {
    ln(`  static _RtcDateTime _rtcChip_${id};`)
    ln(`  static bool _rtcChipValid_${id} = false, _rtcChipStale_${id} = true, _rtcChipAttempted_${id} = false;`)
    ln(`  static uint32_t _rtcChipLastRead_${id} = 0;`)
    ln(`  uint32_t _rtcChipNow_${id} = millis();`)
    ln(`  if (!_rtcChipAttempted_${id} || (uint32_t)(_rtcChipNow_${id} - _rtcChipLastRead_${id}) >= 250u) {`)
    ln(`    _RtcDateTime _rtcCandidate_${id}; bool _rtcOscillatorStopped_${id} = true;`)
    ln(`    if (_rtcReadDs3231(_rtcCandidate_${id}, _rtcOscillatorStopped_${id})) {`)
    ln(`      _rtcChip_${id} = _rtcCandidate_${id};`)
    ln(`      _rtcChipValid_${id} = true;`)
    ln(`      _rtcChipStale_${id} = _rtcOscillatorStopped_${id};`)
    ln(`    } else if (_rtcChipValid_${id}) {`)
    ln(`      _rtcChipStale_${id} = true;  // retain the last good sample through a transient bus failure`)
    ln(`    }`)
    ln(`    _rtcChipAttempted_${id} = true;`)
    ln(`    _rtcChipLastRead_${id} = _rtcChipNow_${id};`)
    ln(`  }`)
    ln(`  if (_rtcChipValid_${id}) {`)
    ln(`    ${v('valid')} = true;`)
    ln(`    ${v('synced')} = !_rtcChipStale_${id};`)
    ln(`    ${v('stale')} = _rtcChipStale_${id};`)
    ln(`    ${v('hour')} = (float)_rtcChip_${id}.hour;`)
    ln(`    ${v('minute')} = (float)_rtcChip_${id}.minute;`)
    ln(`    ${v('second')} = (float)_rtcChip_${id}.second;`)
    ln(`    ${v('weekday')} = (float)_rtcChip_${id}.weekday;`)
    ln(`    ${v('day')} = (float)_rtcChip_${id}.day;`)
    ln(`    ${v('month')} = (float)_rtcChip_${id}.month;`)
    ln(`    ${v('year')} = (float)_rtcChip_${id}.year;`)
    ln(`    ${v('secondsOfDay')} = (float)((uint32_t)_rtcChip_${id}.hour * 3600u + (uint32_t)_rtcChip_${id}.minute * 60u + _rtcChip_${id}.second);`)
    ln(`    ${v('weekend')} = _rtcChip_${id}.weekday == 0 || _rtcChip_${id}.weekday == 6;`)
    ln(`  }`)
  }
  ln(`  _RtcDateTimeValue ${v('dateTime')} = { ${v('valid')}, ${v('synced')}, ${v('stale')}, ${v('hour')}, ${v('minute')}, ${v('second')}, ${v('weekday')}, ${v('day')}, ${v('month')}, ${v('year')}, ${v('secondsOfDay')}, ${v('weekend')} };`)
  return lines
}

/**
 * An RTC as a control-graph producer.
 *
 * An NTP clock carries the sketch's network with it: the same headers,
 * bootstrap and setup line the normal sketch emits, built from the whole graph
 * so a wired link on the bench is found, and from the first network user's
 * settings so two NTP clocks share one connection. The caller dedupes those
 * blocks, which is why every NTP clock in a graph emits identical ones.
 */
export function rtcControlEmission(
  id: string,
  properties: Record<string, unknown>,
  nodes: readonly StudioNode[],
  serialSet: boolean,
): ControlInputEmission {
  const source = rtcTimeSource(properties)
  const ds3231 = source === 'DS3231'
  const v = (port: string) => `n_${id}_${port}`
  const loop = rtcInputLoopCpp(id, properties, v)
  if (ds3231 && serialSet) loop.push('  _rtcHandleSerialSet();')
  const setup: string[] = []
  const includes: string[] = []
  const helpers = [rtcHelperCpp().join('\n'), ...(ds3231 ? [ds3231HelperCpp().join('\n')] : [])]
  // This clock is itself a network user, so the source is never missing.
  const networkSource = source === 'NTP' ? networkSourceIn(nodes) : null
  if (networkSource) {
    const network = networkSketchCpp(nodes, networkSource)
    includes.push(network.include)
    helpers.push(network.bootstrap)
    setup.push(...network.setup)
  }
  if (ds3231) {
    const board = selectedPhysicalBoardProfile(nodes)
    const boardPins = rtcI2cPinsForProfile(board ?? undefined)
    const sda = sanitizePin(properties.sdaPin, boardPins?.sda.arduinoPin ?? 21)
    const scl = sanitizePin(properties.sclPin, boardPins?.scl.arduinoPin ?? 22)
    const explicit = !board || board.targetFamilies.some((family) => family === 'esp8266' || family.startsWith('esp32'))
    setup.push(explicit
      ? `  Wire.begin(${sda}, ${scl});  // I2C pins from the parts on the bus`
      : '  Wire.begin();  // I2C parts on the board\'s default SDA/SCL pins')
    includes.push('#include <Wire.h>')
  }
  return { setup, loop, outputs: { ...RTC_CONTROL_OUTPUTS }, helpers, includes }
}

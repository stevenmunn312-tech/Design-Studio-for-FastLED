import { controlInputCpp } from '../../codegen/controlInputCpp'
import { powerMonitorLoopCpp } from '../../codegen/powerMonitorCpp'
import { presenceSensorLoopCpp } from '../../codegen/presenceSensorCpp'
import { lightSensorLoopCpp } from '../../codegen/lightSensorCpp'
import { sanitizePin } from '../../codegen/hardwarePins'
import type { NodeEmitters, NodeEmitter } from '../../codegen/emitContext'
import { cppStringLiteral } from '../../codegen/cppLiterals'

const controlInput: NodeEmitter = ({ node, id, p, ln, pinSetupLines }) => {
  const emit = controlInputCpp(node.data.nodeType, id, p)!
  for (const line of emit.setup) pinSetupLines.add(line)
  for (const line of emit.loop) ln(line)
}

export const INPUT_EMITTERS: NodeEmitters = {
  Audio({ ln }) {
    ln(`  // Audio capability — the selected hardware source is hosted once by the sketch.`)
  },
  ButtonInput: controlInput,
  ButtonBank: controlInput,
  PotInput: controlInput,
  EncoderInput: controlInput,
  IRRemoteInput({ id, p, opts, irNodes }) {
    if (opts.aliasTerminalBuffer !== false) irNodes.push({ id, pin: sanitizePin(p.pin, 13), buttons: p.buttons })
  },
  MotionInput({ p, ln, v, pinSetupLines }) {
    // HC-SR501's OUT idles low and goes high on movement — the opposite
    // sense to ButtonInput above, which reads a pulled-up contact. Plain
    // INPUT: the module drives the line both ways, so a pull-up would only
    // fight it.
    const pin = sanitizePin(p.pin, 5)
    pinSetupLines.add(`  pinMode(${pin}, INPUT);`)
    ln(`  bool ${v('motion')} = digitalRead(${pin}) == HIGH;`)
  },
  LightInput({ id, p, ln, v }) {
    for (const line of lightSensorLoopCpp(p, id, v)) ln(line)
  },
  PowerMonitorInput({ p, ln, v }) {
    for (const line of powerMonitorLoopCpp(p, v)) ln(line)
  },
  PresenceInput({ ln, v }) {
    for (const line of presenceSensorLoopCpp(v)) ln(line)
  },
  DMXInput({ id, p, ln, intProp, setupLines, globalLines }) {
    const inputMode = String(p.inputMode ?? 'Art-Net')
    const universe = intProp(p.universe, 0, 0, 32767)
    globalLines.push(`uint8_t _dmxData_${id}[512] = {0};`)
    globalLines.push(`bool _dmxValid_${id} = false, _dmxLive_${id} = false;`)
    globalLines.push(`float _dmxPacketRate_${id} = 0.0f;`)
    globalLines.push(`uint32_t _dmxLastPacketMs_${id} = 0;`)

    if (inputMode === 'DMX512') {
      const dmxPort = intProp(p.dmxPort, 1, 1, 2)
      const txPin = sanitizePin(p.dmxTxPin, 17)
      const rxPin = sanitizePin(p.dmxRxPin, 16)
      const enPin = sanitizePin(p.dmxEnablePin, 21)
      globalLines.push(`#if defined(ESP32)`)
      globalLines.push(`static dmx_port_t _dmxPort_${id} = (dmx_port_t)${dmxPort};`)
      globalLines.push(`#endif`)
      setupLines.push(`#if defined(ESP32)`)
      setupLines.push(`  dmx_config_t _dmxConfig_${id} = DMX_CONFIG_DEFAULT;`)
      setupLines.push(`  dmx_personality_t _dmxPersonality_${id}[] = { {1, "Studio"} };`)
      setupLines.push(`  dmx_driver_install(_dmxPort_${id}, &_dmxConfig_${id}, _dmxPersonality_${id}, 1);`)
      setupLines.push(`  dmx_set_pin(_dmxPort_${id}, ${txPin}, ${rxPin}, ${enPin});`)
      setupLines.push(`#endif`)
      ln(`#if defined(ESP32)`)
      ln(`  dmx_packet_t _dmxPacket_${id};`)
      ln(`  if (dmx_receive(_dmxPort_${id}, &_dmxPacket_${id}, DMX_TIMEOUT_TICK)) {`)
      ln(`    if (!_dmxPacket_${id}.err) {`)
      ln(`      uint8_t _dmxRaw_${id}[DMX_PACKET_SIZE] = {0};`)
      ln(`      dmx_read(_dmxPort_${id}, _dmxRaw_${id}, _dmxPacket_${id}.size);`)
      ln(`      uint16_t _dmxSlots_${id} = (uint16_t)min<int>(max(0, (int)_dmxPacket_${id}.size - 1), 512);`)
      ln(`      memset(_dmxData_${id}, 0, 512);`)
      ln(`      if (_dmxSlots_${id} > 0) memcpy(_dmxData_${id}, _dmxRaw_${id} + 1, _dmxSlots_${id});`)
      ln(`      uint32_t _dmxNow_${id} = millis();`)
      ln(`      if (_dmxLastPacketMs_${id}) _dmxPacketRate_${id} = 1000.0f / max(1u, _dmxNow_${id} - _dmxLastPacketMs_${id});`)
      ln(`      _dmxLastPacketMs_${id} = _dmxNow_${id};`)
      ln(`      _dmxValid_${id} = true;`)
      ln(`      _dmxLive_${id} = true;`)
      ln(`    }`)
      ln(`  } else if (_dmxLastPacketMs_${id} && millis() - _dmxLastPacketMs_${id} > 1000u) {`)
      ln(`    _dmxLive_${id} = false;`)
      ln(`  }`)
      ln(`#else`)
      ln(`  _dmxValid_${id} = false;`)
      ln(`  _dmxLive_${id} = false;`)
      ln(`  _dmxPacketRate_${id} = 0.0f;`)
      ln(`#endif`)
    } else {
      const port = intProp(p.previewPort, 6454, 1, 65535)
      globalLines.push(`#if FLS_NET_SUPPORTED`)
      globalLines.push(`WiFiUDP _artnetUdp_${id};`)
      globalLines.push(`#endif`)
      setupLines.push(`#if FLS_NET_SUPPORTED`)
      setupLines.push(`  _artnetUdp_${id}.begin(${port});`)
      setupLines.push(`#endif`)
      ln(`  _netEnsureConnected();`)
      ln(`#if FLS_NET_SUPPORTED`)
      ln(`  if (_netConnected()) {`)
      ln(`    int _artPkt_${id} = _artnetUdp_${id}.parsePacket();`)
      ln(`    while (_artPkt_${id} > 0) {`)
      ln(`      uint8_t _artBuf_${id}[530] = {0};`)
      ln(`      int _artLen_${id} = _artnetUdp_${id}.read(_artBuf_${id}, sizeof(_artBuf_${id}));`)
      ln(`      if (_artLen_${id} >= 18 && memcmp(_artBuf_${id}, "Art-Net\\0", 8) == 0) {`)
      ln(`        uint16_t _artOp_${id} = (uint16_t)_artBuf_${id}[8] | ((uint16_t)_artBuf_${id}[9] << 8);`)
      ln(`        uint16_t _artUni_${id} = (uint16_t)_artBuf_${id}[14] | ((uint16_t)_artBuf_${id}[15] << 8);`)
      ln(`        uint16_t _artCount_${id} = ((uint16_t)_artBuf_${id}[16] << 8) | (uint16_t)_artBuf_${id}[17];`)
      ln(`        if (_artOp_${id} == 0x5000u && _artUni_${id} == ${universe}) {`)
      ln(`          uint16_t _artSlots_${id} = min<uint16_t>(_artCount_${id}, 512u);`)
      ln(`          if (18 + (int)_artSlots_${id} <= _artLen_${id}) {`)
      ln(`            memset(_dmxData_${id}, 0, 512);`)
      ln(`            memcpy(_dmxData_${id}, _artBuf_${id} + 18, _artSlots_${id});`)
      ln(`            uint32_t _artNow_${id} = millis();`)
      ln(`            if (_dmxLastPacketMs_${id}) _dmxPacketRate_${id} = 1000.0f / max(1u, _artNow_${id} - _dmxLastPacketMs_${id});`)
      ln(`            _dmxLastPacketMs_${id} = _artNow_${id};`)
      ln(`            _dmxValid_${id} = true;`)
      ln(`            _dmxLive_${id} = true;`)
      ln(`          }`)
      ln(`        }`)
      ln(`      }`)
      ln(`      _artPkt_${id} = _artnetUdp_${id}.parsePacket();`)
      ln(`    }`)
      ln(`  }`)
      ln(`  if (_dmxLastPacketMs_${id} && millis() - _dmxLastPacketMs_${id} > 2000u) _dmxLive_${id} = false;`)
      ln(`#else`)
      ln(`  _dmxValid_${id} = false;`)
      ln(`  _dmxLive_${id} = false;`)
      ln(`  _dmxPacketRate_${id} = 0.0f;`)
      ln(`#endif`)
    }
  },
  RTCInput({ id, p, ln, v }) {
    const rawInt = (value: unknown, def: number) => {
      const n = Math.round(Number(value))
      return Number.isFinite(n) ? n : def
    }
    const source = String(p.timeSource ?? 'Compile Time')
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
      // NTP seeds from the build stamp too, so the clock runs (flagged
      // stale, not synced) before the first successful sync instead of
      // leaving every output dark until Wi-Fi comes up.
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
    // Free-running software clock. Compile Time, Manual, and pre-sync NTP
    // are useful field sources, but none is a persistent time authority;
    // they remain stale until NTP or a physical RTC supplies real time.
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
  },
  // Web MIDI has no embedded-hardware equivalent — preview-only, so
  // firmware just sees the idle default.
  MidiInput({ ln, v }) {
    ln(`  float ${v('note')} = 0.0f; bool ${v('gate')} = false; float ${v('cc')} = 0.0f;`)
  },
}

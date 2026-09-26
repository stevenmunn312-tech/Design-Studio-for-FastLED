import type { NodeEmitters } from '../../codegen/emitContext'
import { safeId, seedProp, floatLit } from '../../codegen/cppLiterals'
import { scheduleTimeOfDay } from './evaluate'

export const SIGNAL_EMITTERS: NodeEmitters = {
  TimeNode({ ln, v, needsT }) {
    needsT.v = true
    ln(`  float ${v('time')} = t;`)
    ln(`  float ${v('dt')} = 1.0f / 60.0f;`)
  },
  Wave({ p, ln, v, f, needsT }) {
    needsT.v = true
    const amp = f('amplitude', 'amplitude', 1), freq = f('frequency', 'frequency', 1), phase = f('phase', 'phase', 0)
    const wf = String(p.waveform ?? 'sine')
    const arg = `((${freq}) * t + (${phase}))`
    let wave: string
    switch (wf) {
      case 'square':   wave = `((_ph < 0.5f) ? (${amp}) : -(${amp}))`; break
      case 'sawtooth': wave = `((${amp}) * (2.0f * _ph - 1.0f))`; break
      case 'triangle': wave = `((${amp}) * (4.0f * fabsf(_ph - 0.5f) - 1.0f))`; break
      default:         wave = `((${amp}) * sinf(6.2831853f * _arg))` // sine
    }
    ln(`  float ${v('result')};`)
    ln(`  { float _arg = ${arg}, _ph = fmodf(fmodf(_arg, 1.0f) + 1.0f, 1.0f); ${v('result')} = ${wave}; }`)
  },
  ComplexWave({ p, ln, v, f }) {
    const a = f('a', 'a', 0), b = f('b', 'b', 0)
    const op = String(p.operation ?? 'add')
    let expr: string
    switch (op) {
      case 'multiply':   expr = `(${a}) * (${b})`; break
      case 'average':    expr = `((${a}) + (${b})) * 0.5f`; break
      case 'min':        expr = `min((float)(${a}), (float)(${b}))`; break
      case 'max':        expr = `max((float)(${a}), (float)(${b}))`; break
      case 'difference': expr = `(${a}) - (${b})`; break
      default:           expr = `(${a}) + (${b})` // add
    }
    ln(`  float ${v('result')} = ${expr};`)
  },
  // Metronome — a boolean pulse every `interval` seconds, via a millis timer.
  // Mirrors the stateful `Interval` case in graphEvaluator.ts.
  Interval({ id, ln, v, f }) {
    ln(`  static uint32_t _iv_${id} = 0; bool ${v('pulse')} = false;`)
    ln(`  uint32_t _ivMs_${id} = (uint32_t)fmaxf(50.0f, (${f('interval', 'interval', 0.5)})*1000.0f);`)
    ln(`  if (millis() - _iv_${id} >= _ivMs_${id}) { _iv_${id} = millis(); ${v('pulse')} = true; }`)
  },
  DMXChannel({ node, id, p, ln, v, f, incoming, nodeMap, intProp }) {
    const channel = intProp(p.channel, 1, 1, 512)
    const threshold = `_dmxThr_${id}`
    const thresholdDecl = `  uint8_t ${threshold} = (uint8_t)constrain(${f('activeThreshold', 'activeThreshold', 1)},0.0f,255.0f);`
    const up = incoming.get(`${node.id}:dmx`)
    const src = up ? nodeMap.get(up.srcId) : null
    const srcId = src?.data.nodeType === 'DMXInput' ? safeId(up!.srcId) : ''
    ln(thresholdDecl)
    ln(`  uint8_t _dmxByte_${id} = ${srcId ? `_dmxData_${srcId}[${channel - 1}]` : '0'};`)
    ln(`  static bool _dmxSeen_${id} = false;`)
    ln(`  static uint8_t _dmxPrev_${id} = 0;`)
    ln(`  float ${v('value')} = _dmxByte_${id} / 255.0f;`)
    ln(`  float ${v('byte')} = (float)_dmxByte_${id};`)
    ln(`  bool ${v('active')} = _dmxByte_${id} >= ${threshold};`)
    ln(`  bool ${v('changed')} = _dmxSeen_${id} && _dmxByte_${id} != _dmxPrev_${id};`)
    ln(`  _dmxSeen_${id} = true;`)
    ln(`  _dmxPrev_${id} = _dmxByte_${id};`)
  },
  ScheduleTrigger({ node, id, p, ln, v, incoming, floatExpr, boolExpr }) {
    const mode = String(p.scheduleMode ?? 'Window')
    const dayMode = String(p.dayMode ?? 'Every day')
    const requireSync = p.requireSync === true
    const enabledDefault = p.enable !== false
    // Same per-field clamping the evaluator applies, via the shared helper,
    // so preview and firmware resolve the same instant.
    const startSec = scheduleTimeOfDay(p.startHour, p.startMinute, p.startSecond)
    const endSec = scheduleTimeOfDay(p.endHour, p.endMinute, p.endSecond)
    const sunday = p.sunday !== false
    const monday = p.monday !== false
    const tuesday = p.tuesday !== false
    const wednesday = p.wednesday !== false
    const thursday = p.thursday !== false
    const friday = p.friday !== false
    const saturday = p.saturday !== false
    ln(`  static bool _schedulePrevActive_${id} = false;`)
    ln(`  static int32_t _scheduleLastPulseDay_${id} = -1;`)
    // Previous usable seconds-of-day sample (negative = none), so Trigger
    // mode fires on the crossing of its instant instead of only while
    // inside a one-second window — see the evaluator's ScheduleState.
    ln(`  static float _schedulePrevSeconds_${id} = -1.0f;`)
    ln(`  static int32_t _schedulePrevDay_${id} = -1;`)
    ln(`  bool _scheduleValid_${id} = ${boolExpr(node.id, 'valid')};`)
    ln(`  bool _scheduleSynced_${id} = ${boolExpr(node.id, 'synced')};`)
    ln(`  bool _scheduleEnabled_${id} = ${incoming.has(`${node.id}:enable`) ? boolExpr(node.id, 'enable') : enabledDefault ? 'true' : 'false'};`)
    ln(`  int _scheduleWeekday_${id} = constrain((int)roundf(${floatExpr(node.id, 'weekday', p, 'weekday', 0)}), 0, 6);`)
    ln(`  float _scheduleSeconds_${id} = constrain(${floatExpr(node.id, 'secondsOfDay', p, 'secondsOfDay', 0)}, 0.0f, 86399.999f);`)
    ln(`  int _scheduleDay_${id} = constrain((int)roundf(${floatExpr(node.id, 'day', p, 'day', 1)}), 1, 31);`)
    ln(`  int _scheduleMonth_${id} = constrain((int)roundf(${floatExpr(node.id, 'month', p, 'month', 1)}), 1, 12);`)
    ln(`  int _scheduleYear_${id} = max(1970, (int)roundf(${floatExpr(node.id, 'year', p, 'year', 1970)}));`)
    ln(`  bool _scheduleDayAllowed_${id} = true;`)
    if (dayMode === 'Weekdays') {
      ln(`  _scheduleDayAllowed_${id} = _scheduleWeekday_${id} >= 1 && _scheduleWeekday_${id} <= 5;`)
    } else if (dayMode === 'Weekends') {
      ln(`  _scheduleDayAllowed_${id} = _scheduleWeekday_${id} == 0 || _scheduleWeekday_${id} == 6;`)
    } else if (dayMode === 'Custom') {
      ln(`  switch (_scheduleWeekday_${id}) {`)
      ln(`    case 0: _scheduleDayAllowed_${id} = ${sunday ? 'true' : 'false'}; break;`)
      ln(`    case 1: _scheduleDayAllowed_${id} = ${monday ? 'true' : 'false'}; break;`)
      ln(`    case 2: _scheduleDayAllowed_${id} = ${tuesday ? 'true' : 'false'}; break;`)
      ln(`    case 3: _scheduleDayAllowed_${id} = ${wednesday ? 'true' : 'false'}; break;`)
      ln(`    case 4: _scheduleDayAllowed_${id} = ${thursday ? 'true' : 'false'}; break;`)
      ln(`    case 5: _scheduleDayAllowed_${id} = ${friday ? 'true' : 'false'}; break;`)
      ln(`    default: _scheduleDayAllowed_${id} = ${saturday ? 'true' : 'false'}; break;`)
      ln(`  }`)
    }
    ln(`  bool _scheduleTimeReady_${id} = _scheduleValid_${id} && ${requireSync ? '_scheduleSynced_' + id : 'true'};`)
    ln(`  int32_t _scheduleDayKey_${id} = _scheduleYear_${id} * 10000 + _scheduleMonth_${id} * 100 + _scheduleDay_${id};`)
    ln(`  bool ${v('active')} = false;`)
    ln(`  bool ${v('start')} = false;`)
    ln(`  bool ${v('end')} = false;`)
    ln(`  float ${v('progress')} = 0.0f;`)
    ln(`  if (_scheduleEnabled_${id} && _scheduleTimeReady_${id} && _scheduleDayAllowed_${id}) {`)
    if (mode === 'Trigger') {
      // A new calendar day puts the whole day ahead of us; no previous
      // sample at all never fires, so a board booting after the instant
      // does not back-fire.
      ln(`    float _scheduleSince_${id} = _schedulePrevDay_${id} < 0 ? -2.0f`)
      ln(`      : (_schedulePrevDay_${id} == _scheduleDayKey_${id} ? _schedulePrevSeconds_${id} : -1.0f);`)
      ln(`    if (_scheduleSince_${id} > -2.0f && _scheduleSince_${id} < ${startSec}.0f && _scheduleSeconds_${id} >= ${startSec}.0f`)
      ln(`        && _scheduleLastPulseDay_${id} != _scheduleDayKey_${id}) {`)
      ln(`      ${v('start')} = true;`)
      ln(`      _scheduleLastPulseDay_${id} = _scheduleDayKey_${id};`)
      ln(`    }`)
    } else {
      if (startSec <= endSec) {
        ln(`    ${v('active')} = _scheduleSeconds_${id} >= ${startSec}.0f && _scheduleSeconds_${id} <= ${endSec}.0f;`)
      } else {
        ln(`    ${v('active')} = _scheduleSeconds_${id} >= ${startSec}.0f || _scheduleSeconds_${id} <= ${endSec}.0f;`)
      }
      // Mirrors scheduleWindowProgress: elapsed / span, both measured
      // across the wrap when the window crosses midnight.
      const span = endSec >= startSec ? endSec - startSec : 86400 - startSec + endSec
      if (span > 0) {
        ln(`    if (${v('active')}) {`)
        ln(`      float _scheduleElapsed_${id} = _scheduleSeconds_${id} >= ${startSec}.0f`)
        ln(`        ? _scheduleSeconds_${id} - ${startSec}.0f : ${86400 - startSec}.0f + _scheduleSeconds_${id};`)
        ln(`      ${v('progress')} = constrain(_scheduleElapsed_${id} / ${span}.0f, 0.0f, 1.0f);`)
        ln(`    }`)
      }
    }
    ln(`  }`)
    ln(`  if (${v('active')} && !_schedulePrevActive_${id}) ${v('start')} = true;`)
    ln(`  if (!${v('active')} && _schedulePrevActive_${id}) ${v('end')} = true;`)
    ln(`  _schedulePrevActive_${id} = ${v('active')};`)
    // Only remember a sample the clock vouched for, so the first frame
    // after a sync is a fresh start rather than one giant jump.
    ln(`  _schedulePrevSeconds_${id} = _scheduleTimeReady_${id} ? _scheduleSeconds_${id} : -1.0f;`)
    ln(`  _schedulePrevDay_${id} = _scheduleTimeReady_${id} ? _scheduleDayKey_${id} : -1;`)
  },
  Random({ id, p, ln, v }) {
    const lo = Number(p.min ?? 0), hi = Number(p.max ?? 1)
    const seed = seedProp(p)
    const loLit = floatLit(lo)
    const spanLit = floatLit(hi - lo)
    if (seed) {
      ln(`  static uint32_t _rng_${id} = ${seed}u; _rng_${id} = _rng_${id} * 1664525u + 1013904223u;`)
      ln(`  float ${v('value')} = ${loLit} + (((_rng_${id} >> 16) & 0xFFFFu) / 65535.0f) * ${spanLit};`)
    } else {
      ln(`  float ${v('value')} = ${loLit} + (random16() / 65535.0f) * ${spanLit};`)
    }
  },
  Counter({ ln, v, f }) {
    const rate = f('rate', 'rate', 0.5)
    ln(`  static float ${v('value')} = 0;`)
    ln(`  ${v('value')} = fmod(${v('value')} + (${rate}) / 60.0f, 1.0f);`)
  },
  // Trigger envelope — optional linear attack to 1 on a rising edge, then
  // linear decay to 0; outputs 0 until the first trigger.
  Envelope({ node, id, p, ln, v, f, incoming, boolExpr }) {
    const trig = boolExpr(node.id, 'trigger')
    const attackProp = Number(p.attack ?? 0)
    const decayProp = Number(p.decay ?? 0.5)
    const attackMs = Number.isFinite(attackProp) ? Math.max(0, Math.round(attackProp * 1000)) : 0
    const decayMs = Number.isFinite(decayProp) ? Math.max(50, Math.round(decayProp * 1000)) : 500
    const attackWired = incoming.has(`${node.id}:attack`)
    const atkE = `_envAtk_${id}`
    const decE = `_envDec_${id}`
    const envKnobs = [
      `  float ${atkE} = fmaxf(0.0f, (${f('attack', 'attack', attackMs / 1000)})*1000.0f);`,
      `  float ${decE} = fmaxf(50.0f, (${f('decay', 'decay', decayMs / 1000)})*1000.0f);`,
    ]
    for (const line of envKnobs) ln(line)
    ln(`  static uint32_t _envT_${id} = 0; static bool _envF_${id} = false, _envP_${id} = false;`)
    ln(`  { bool _t = (${trig}); if (_t && !_envP_${id}) { _envT_${id} = millis(); _envF_${id} = true; } _envP_${id} = _t; }`)
    ln(`  float ${v('result')} = 0.0f;`)
    ln(`  if (_envF_${id}) { uint32_t _envAge_${id} = millis() - _envT_${id};`)
    if (attackMs > 0 || attackWired) ln(`    ${v('result')} = ${atkE} > 0.0f && _envAge_${id} < (uint32_t)${atkE} ? constrain(_envAge_${id} / ${atkE}, 0.0f, 1.0f) : constrain(1.0f - (_envAge_${id} - (${atkE} > 0.0f ? (uint32_t)${atkE} : 0u)) / ${decE}, 0.0f, 1.0f);`)
    else ln(`    ${v('result')} = constrain(1.0f - _envAge_${id} / ${decE}, 0.0f, 1.0f);`)
    ln(`  }`)
  },
  BeatSin({ p, ln, v, f }) {
    const bpmProp = Number(p.bpm ?? 60)
    // `f` would emit NaN for a non-numeric stored bpm, so the sanitised
    // value is what it falls back to.
    const bpm = `fmaxf(1.0f,${f('bpm', 'bpm', Number.isFinite(bpmProp) ? bpmProp : 60)})`
    const lo = Number(p.low ?? 0), hi = Number(p.high ?? 1)
    ln(`  float ${v('value')} = ${lo.toFixed(3)}f + ((sinf(((millis() / 1000.0f) * ${bpm} / 60.0f) * 6.2831853f) + 1.0f) * 0.5f) * (${hi.toFixed(3)}f - ${lo.toFixed(3)}f);`)
  },
  // Free-running BPM clock/transport — millis()-based, mirroring the
  // stateful `Clock` case in graphEvaluator.ts (same tap/sync EMA and
  // beat/bar/subdivision edge semantics) so preview and firmware timing
  // match.
  Clock({ node, id, ln, v, f, boolExpr }) {
    const bpmProp = `_clkBpmP_${id}`
    const beatsPerBar = `_clkBar_${id}`
    const subdivision = `_clkSub_${id}`
    const clockKnobs = [
      `  float ${bpmProp} = fmaxf(1.0f,${f('bpm', 'bpm', 120)});`,
      `  int ${beatsPerBar} = (int)fmaxf(1.0f,${f('beatsPerBar', 'beatsPerBar', 4)});`,
      `  int ${subdivision} = (int)fmaxf(1.0f,${f('subdivision', 'subdivision', 2)});`,
    ]
    const tap = boolExpr(node.id, 'tap')
    const sync = boolExpr(node.id, 'sync')
    const reset = boolExpr(node.id, 'reset')
    for (const line of clockKnobs) ln(line)
    ln(`  static uint32_t _clkOrigin_${id} = 0; static bool _clkInit_${id} = false;`)
    ln(`  static uint32_t _clkLastPulse_${id} = 0; static bool _clkHasPulse_${id} = false;`)
    ln(`  static float _clkTapBpm_${id} = 0; static bool _clkHasTap_${id} = false;`)
    ln(`  static bool _clkPTap_${id} = false, _clkPSync_${id} = false, _clkPReset_${id} = false;`)
    ln(`  static uint32_t _clkLastBeat_${id} = 0, _clkLastSub_${id} = 0;`)
    ln(`  { if (!_clkInit_${id}) { _clkOrigin_${id} = millis(); _clkInit_${id} = true; }`)
    ln(`    bool _tapNow = (${tap}); bool _syncNow = (${sync}); bool _resetNow = (${reset});`)
    ln(`    bool _pulseNow = (_tapNow && !_clkPTap_${id}) || (_syncNow && !_clkPSync_${id});`)
    ln(`    if (_pulseNow) { uint32_t _now = millis();`)
    ln(`      if (_clkHasPulse_${id}) { uint32_t _iv = _now - _clkLastPulse_${id};`)
    ln(`        if (_iv > 200 && _iv < 3000) { float _sample = 60000.0f / _iv; _clkTapBpm_${id} = _clkHasTap_${id} ? (_clkTapBpm_${id} * 0.5f + _sample * 0.5f) : _sample; _clkHasTap_${id} = true; }`)
    ln(`        else { _clkHasTap_${id} = false; } }`)
    ln(`      _clkLastPulse_${id} = _now; _clkHasPulse_${id} = true; _clkOrigin_${id} = _now; }`)
    ln(`    if (_resetNow && !_clkPReset_${id}) { _clkOrigin_${id} = millis(); _clkHasPulse_${id} = false; _clkHasTap_${id} = false; _clkLastBeat_${id} = 0; _clkLastSub_${id} = 0; }`)
    ln(`    _clkPTap_${id} = _tapNow; _clkPSync_${id} = _syncNow; _clkPReset_${id} = _resetNow; }`)
    ln(`  float ${v('bpm')} = _clkHasTap_${id} ? _clkTapBpm_${id} : ${bpmProp};`)
    ln(`  float _clkElapsed_${id} = ((millis() - _clkOrigin_${id}) / 60000.0f) * ${v('bpm')};`)
    ln(`  float ${v('phase')} = _clkElapsed_${id} - (uint32_t)_clkElapsed_${id};`)
    ln(`  uint32_t _clkBeatCount_${id} = (uint32_t)_clkElapsed_${id};`)
    ln(`  bool ${v('beat')} = _clkBeatCount_${id} > _clkLastBeat_${id};`)
    ln(`  bool ${v('bar')} = ${v('beat')} && (_clkBeatCount_${id} % (uint32_t)${beatsPerBar} == 0u);`)
    ln(`  uint32_t _clkSubCount_${id} = (uint32_t)(_clkElapsed_${id} * (float)${subdivision});`)
    ln(`  bool ${v('sub')} = _clkSubCount_${id} > _clkLastSub_${id};`)
    ln(`  _clkLastBeat_${id} = _clkBeatCount_${id}; _clkLastSub_${id} = _clkSubCount_${id};`)
  },
}

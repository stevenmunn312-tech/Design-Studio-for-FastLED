// Time-dependent signal nodes shared by normal sketches and template control
// graphs. Each one keeps the clock, reset and state the normal emitter already
// had: wall-clock millis(), a rising-edge reset where the node has one, and
// static locals keyed by the node id. They do not read the animation clock, so
// Master Speed does not scale them and a player's track position stays its own
// clock.
import { seedProp, floatLit } from './cppLiterals'
import { scheduleTimeOfDay } from '../nodes/signal/evaluate'
import { rateCpp, SPEED_MAX } from '../nodes/shared/speedRange'
import { phaseTag, speedPhaseCpp } from '../nodes/shared/speedClockCpp'
import { seedOffset } from '../state/evaluator/random'
import type { ControlDataType } from './scalarControlCpp'

export interface TimedControlInput {
  type: 'float' | 'bool'
  /** Property fallback. Bool ports ignore it and read false, except Enable. */
  fallback: number
}

export interface TimedControlSpec {
  outputs: Record<string, ControlDataType>
  inputs: Record<string, TimedControlInput>
}

export const TIMED_CONTROL_NODES: Record<string, TimedControlSpec> = {
  Envelope: {
    outputs: { result: 'float' },
    inputs: { trigger: { type: 'bool', fallback: 0 }, attack: { type: 'float', fallback: 0 }, decay: { type: 'float', fallback: 0.5 } },
  },
  NoiseSignal: {
    outputs: { value: 'float' },
    inputs: { speed: { type: 'float', fallback: 0.25 }, min: { type: 'float', fallback: 0 }, max: { type: 'float', fallback: 1 } },
  },
  ScheduleTrigger: {
    outputs: { active: 'bool', start: 'bool', end: 'bool', progress: 'float' },
    inputs: {
      valid: { type: 'bool', fallback: 0 },
      synced: { type: 'bool', fallback: 0 },
      secondsOfDay: { type: 'float', fallback: 0 },
      weekday: { type: 'float', fallback: 0 },
      day: { type: 'float', fallback: 1 },
      month: { type: 'float', fallback: 1 },
      year: { type: 'float', fallback: 1970 },
      enable: { type: 'bool', fallback: 1 },
    },
  },
  Clock: {
    outputs: { bpm: 'float', phase: 'float', beat: 'bool', bar: 'bool', sub: 'bool' },
    inputs: {
      tap: { type: 'bool', fallback: 0 },
      sync: { type: 'bool', fallback: 0 },
      reset: { type: 'bool', fallback: 0 },
      bpm: { type: 'float', fallback: 120 },
      beatsPerBar: { type: 'float', fallback: 4 },
      subdivision: { type: 'float', fallback: 2 },
    },
  },
}

type Expr = Record<string, string>
type Value = (port: string) => string

export function envelopeCpp(
  id: string, v: Value, expr: Expr, props: Record<string, unknown>, attackWired: boolean,
): string[] {
  const attackProp = Number(props.attack ?? 0)
  const attackMs = Number.isFinite(attackProp) ? Math.max(0, Math.round(attackProp * 1000)) : 0
  const atkE = `_envAtk_${id}`
  const decE = `_envDec_${id}`
  const lines = [
    `  float ${atkE} = fmaxf(0.0f, (${expr.attack})*1000.0f);`,
    `  float ${decE} = fmaxf(50.0f, (${expr.decay})*1000.0f);`,
    `  static uint32_t _envT_${id} = 0; static bool _envF_${id} = false, _envP_${id} = false;`,
    `  { bool _t = (${expr.trigger}); if (_t && !_envP_${id}) { _envT_${id} = millis(); _envF_${id} = true; } _envP_${id} = _t; }`,
    `  float ${v('result')} = 0.0f;`,
    `  if (_envF_${id}) { uint32_t _envAge_${id} = millis() - _envT_${id};`,
  ]
  if (attackMs > 0 || attackWired) {
    lines.push(`    ${v('result')} = ${atkE} > 0.0f && _envAge_${id} < (uint32_t)${atkE} ? constrain(_envAge_${id} / ${atkE}, 0.0f, 1.0f) : constrain(1.0f - (_envAge_${id} - (${atkE} > 0.0f ? (uint32_t)${atkE} : 0u)) / ${decE}, 0.0f, 1.0f);`)
  } else {
    lines.push(`    ${v('result')} = constrain(1.0f - _envAge_${id} / ${decE}, 0.0f, 1.0f);`)
  }
  lines.push(`  }`)
  return lines
}

export function noiseSignalCpp(id: string, v: Value, expr: Expr, props: Record<string, unknown>): string[] {
  const speed = rateCpp(expr.speed, SPEED_MAX.NoiseSignal)
  const lo = `_nsLo_${id}`
  const octaves = Math.max(1, Math.min(3, Math.floor(Number(props.octaves ?? 1))))
  const seed = seedProp(props)
  const zOff = floatLit(seedOffset(seed, 0) % 256)
  const yOff = floatLit(seedOffset(seed, 1) % 256)
  const lines = [
    `  float ${lo} = ${expr.min};`,
    `  float ${v('value')};`,
    // Wall clock, bound as `t` so the integrated phase seeds the same way.
    `  { float t = millis() / 1000.0f;`,
  ]
  const ph = speedPhaseCpp((line) => lines.push(line), phaseTag(id), speed)
  lines.push(
    `    float _z = ${ph} + ${zOff}, _v = 0.0f, _amp = 0.5f, _norm = 0.0f, _freq = 1.0f;`,
    `    for (int _o = 0; _o < ${octaves}; _o++) {`,
    `      uint32_t _x = (uint32_t)(fmodf(_z * _freq, 256.0f) * 65536.0f);`,
    `      uint32_t _y = (uint32_t)(fmodf(${yOff} + _o * 17.0f, 256.0f) * 65536.0f);`,
    `      _v += _amp * (inoise16(_x, _y) / 65535.0f);`,
    `      _norm += _amp; _amp *= 0.5f; _freq *= 2.0f; }`,
    `    ${v('value')} = ${lo} + constrain(_v / _norm, 0.0f, 1.0f) * (${expr.max} - ${lo}); }`,
  )
  return lines
}

/** A 0→1 ramp at `rate` cycles a second, integrated over `time` as the
 *  preview's `speedPhase` is. The control graph passes the wall clock. */
export function scheduleTriggerCpp(id: string, v: Value, expr: Expr, props: Record<string, unknown>): string[] {
  const mode = String(props.scheduleMode ?? 'Window')
  const dayMode = String(props.dayMode ?? 'Every day')
  const requireSync = props.requireSync === true
  const startSec = scheduleTimeOfDay(props.startHour, props.startMinute, props.startSecond)
  const endSec = scheduleTimeOfDay(props.endHour, props.endMinute, props.endSecond)
  const sunday = props.sunday !== false
  const monday = props.monday !== false
  const tuesday = props.tuesday !== false
  const wednesday = props.wednesday !== false
  const thursday = props.thursday !== false
  const friday = props.friday !== false
  const saturday = props.saturday !== false
  const lines = [
    `  static bool _schedulePrevActive_${id} = false;`,
    `  static int32_t _scheduleLastPulseDay_${id} = -1;`,
    `  static float _schedulePrevSeconds_${id} = -1.0f;`,
    `  static int32_t _schedulePrevDay_${id} = -1;`,
    `  bool _scheduleValid_${id} = ${expr.valid};`,
    `  bool _scheduleSynced_${id} = ${expr.synced};`,
    `  bool _scheduleEnabled_${id} = ${expr.enable};`,
    `  int _scheduleWeekday_${id} = constrain((int)roundf(${expr.weekday}), 0, 6);`,
    `  float _scheduleSeconds_${id} = constrain(${expr.secondsOfDay}, 0.0f, 86399.999f);`,
    `  int _scheduleDay_${id} = constrain((int)roundf(${expr.day}), 1, 31);`,
    `  int _scheduleMonth_${id} = constrain((int)roundf(${expr.month}), 1, 12);`,
    `  int _scheduleYear_${id} = max(1970, (int)roundf(${expr.year}));`,
    `  bool _scheduleDayAllowed_${id} = true;`,
  ]
  if (dayMode === 'Weekdays') {
    lines.push(`  _scheduleDayAllowed_${id} = _scheduleWeekday_${id} >= 1 && _scheduleWeekday_${id} <= 5;`)
  } else if (dayMode === 'Weekends') {
    lines.push(`  _scheduleDayAllowed_${id} = _scheduleWeekday_${id} == 0 || _scheduleWeekday_${id} == 6;`)
  } else if (dayMode === 'Custom') {
    lines.push(
      `  switch (_scheduleWeekday_${id}) {`,
      `    case 0: _scheduleDayAllowed_${id} = ${sunday ? 'true' : 'false'}; break;`,
      `    case 1: _scheduleDayAllowed_${id} = ${monday ? 'true' : 'false'}; break;`,
      `    case 2: _scheduleDayAllowed_${id} = ${tuesday ? 'true' : 'false'}; break;`,
      `    case 3: _scheduleDayAllowed_${id} = ${wednesday ? 'true' : 'false'}; break;`,
      `    case 4: _scheduleDayAllowed_${id} = ${thursday ? 'true' : 'false'}; break;`,
      `    case 5: _scheduleDayAllowed_${id} = ${friday ? 'true' : 'false'}; break;`,
      `    default: _scheduleDayAllowed_${id} = ${saturday ? 'true' : 'false'}; break;`,
      `  }`,
    )
  }
  lines.push(
    `  bool _scheduleTimeReady_${id} = _scheduleValid_${id} && ${requireSync ? '_scheduleSynced_' + id : 'true'};`,
    `  int32_t _scheduleDayKey_${id} = _scheduleYear_${id} * 10000 + _scheduleMonth_${id} * 100 + _scheduleDay_${id};`,
    `  bool ${v('active')} = false;`,
    `  bool ${v('start')} = false;`,
    `  bool ${v('end')} = false;`,
    `  float ${v('progress')} = 0.0f;`,
    `  if (_scheduleEnabled_${id} && _scheduleTimeReady_${id} && _scheduleDayAllowed_${id}) {`,
  )
  if (mode === 'Trigger') {
    lines.push(
      `    float _scheduleSince_${id} = _schedulePrevDay_${id} < 0 ? -2.0f`,
      `      : (_schedulePrevDay_${id} == _scheduleDayKey_${id} ? _schedulePrevSeconds_${id} : -1.0f);`,
      `    if (_scheduleSince_${id} > -2.0f && _scheduleSince_${id} < ${startSec}.0f && _scheduleSeconds_${id} >= ${startSec}.0f`,
      `        && _scheduleLastPulseDay_${id} != _scheduleDayKey_${id}) {`,
      `      ${v('start')} = true;`,
      `      _scheduleLastPulseDay_${id} = _scheduleDayKey_${id};`,
      `    }`,
    )
  } else {
    if (startSec <= endSec) {
      lines.push(`    ${v('active')} = _scheduleSeconds_${id} >= ${startSec}.0f && _scheduleSeconds_${id} <= ${endSec}.0f;`)
    } else {
      lines.push(`    ${v('active')} = _scheduleSeconds_${id} >= ${startSec}.0f || _scheduleSeconds_${id} <= ${endSec}.0f;`)
    }
    const span = endSec >= startSec ? endSec - startSec : 86400 - startSec + endSec
    if (span > 0) {
      lines.push(
        `    if (${v('active')}) {`,
        `      float _scheduleElapsed_${id} = _scheduleSeconds_${id} >= ${startSec}.0f`,
        `        ? _scheduleSeconds_${id} - ${startSec}.0f : ${86400 - startSec}.0f + _scheduleSeconds_${id};`,
        `      ${v('progress')} = constrain(_scheduleElapsed_${id} / ${span}.0f, 0.0f, 1.0f);`,
        `    }`,
      )
    }
  }
  lines.push(
    `  }`,
    `  if (${v('active')} && !_schedulePrevActive_${id}) ${v('start')} = true;`,
    `  if (!${v('active')} && _schedulePrevActive_${id}) ${v('end')} = true;`,
    `  _schedulePrevActive_${id} = ${v('active')};`,
    `  _schedulePrevSeconds_${id} = _scheduleTimeReady_${id} ? _scheduleSeconds_${id} : -1.0f;`,
    `  _schedulePrevDay_${id} = _scheduleTimeReady_${id} ? _scheduleDayKey_${id} : -1;`,
  )
  return lines
}

export function clockCpp(id: string, v: Value, expr: Expr): string[] {
  const bpmProp = `_clkBpmP_${id}`
  const beatsPerBar = `_clkBar_${id}`
  const subdivision = `_clkSub_${id}`
  const active = (value: string) => value !== 'false' && value !== '0'
  const tap = active(expr.tap), sync = active(expr.sync), reset = active(expr.reset)
  const pulse = tap || sync
  return [
    `  float ${bpmProp} = fmaxf(1.0f,${expr.bpm});`,
    `  int ${beatsPerBar} = (int)fmaxf(1.0f,${expr.beatsPerBar});`,
    `  int ${subdivision} = (int)fmaxf(1.0f,${expr.subdivision});`,
    `  static uint32_t _clkOrigin_${id} = 0; static bool _clkInit_${id} = false;`,
    ...(pulse ? [`  static uint32_t _clkLastPulse_${id} = 0; static bool _clkHasPulse_${id} = false;`,
      `  static float _clkTapBpm_${id} = 0; static bool _clkHasTap_${id} = false;`] : []),
    ...(tap ? [`  static bool _clkPTap_${id} = false;`] : []),
    ...(sync ? [`  static bool _clkPSync_${id} = false;`] : []),
    ...(reset ? [`  static bool _clkPReset_${id} = false;`] : []),
    `  static uint32_t _clkLastBeat_${id} = 0, _clkLastSub_${id} = 0;`,
    `  { if (!_clkInit_${id}) { _clkOrigin_${id} = millis(); _clkInit_${id} = true; }`,
    ...(tap ? [`    bool _tapNow = (${expr.tap});`] : []),
    ...(sync ? [`    bool _syncNow = (${expr.sync});`] : []),
    ...(reset ? [`    bool _resetNow = (${expr.reset});`] : []),
    ...(pulse ? [
    `    bool _pulseNow = ${[...(tap ? [`(_tapNow && !_clkPTap_${id})`] : []), ...(sync ? [`(_syncNow && !_clkPSync_${id})`] : [])].join(' || ')};`,
    `    if (_pulseNow) { uint32_t _now = millis();`,
    `      if (_clkHasPulse_${id}) { uint32_t _iv = _now - _clkLastPulse_${id};`,
    `        if (_iv > 200 && _iv < 3000) { float _sample = 60000.0f / _iv; _clkTapBpm_${id} = _clkHasTap_${id} ? (_clkTapBpm_${id} * 0.5f + _sample * 0.5f) : _sample; _clkHasTap_${id} = true; }`,
    `        else { _clkHasTap_${id} = false; } }`,
    `      _clkLastPulse_${id} = _now; _clkHasPulse_${id} = true; _clkOrigin_${id} = _now; }`,
    ] : []),
    ...(reset ? [`    if (_resetNow && !_clkPReset_${id}) { _clkOrigin_${id} = millis(); ${pulse ? `_clkHasPulse_${id} = false; _clkHasTap_${id} = false; ` : ''}_clkLastBeat_${id} = 0; _clkLastSub_${id} = 0; }`] : []),
    ...(tap ? [`    _clkPTap_${id} = _tapNow;`] : []),
    ...(sync ? [`    _clkPSync_${id} = _syncNow;`] : []),
    ...(reset ? [`    _clkPReset_${id} = _resetNow;`] : []),
    `  }`,
    `  float ${v('bpm')} = ${pulse ? `_clkHasTap_${id} ? _clkTapBpm_${id} : ` : ''}${bpmProp};`,
    `  float _clkElapsed_${id} = ((millis() - _clkOrigin_${id}) / 60000.0f) * ${v('bpm')};`,
    `  float ${v('phase')} = _clkElapsed_${id} - (uint32_t)_clkElapsed_${id};`,
    `  uint32_t _clkBeatCount_${id} = (uint32_t)_clkElapsed_${id};`,
    `  bool ${v('beat')} = _clkBeatCount_${id} > _clkLastBeat_${id};`,
    `  bool ${v('bar')} = ${v('beat')} && (_clkBeatCount_${id} % (uint32_t)${beatsPerBar} == 0u);`,
    `  uint32_t _clkSubCount_${id} = (uint32_t)(_clkElapsed_${id} * (float)${subdivision});`,
    `  bool ${v('sub')} = _clkSubCount_${id} > _clkLastSub_${id};`,
    `  _clkLastBeat_${id} = _clkBeatCount_${id}; _clkLastSub_${id} = _clkSubCount_${id};`,
  ]
}

/** Emit one timed node. `attackWired` selects the envelope's attack branch. */
export function timedControlCpp(
  nodeType: string, id: string, props: Record<string, unknown>, inputs: Expr, attackWired = false,
): string[] | null {
  if (!Object.hasOwn(TIMED_CONTROL_NODES, nodeType)) return null
  const v = (port: string) => `n_${id}_${port}`
  switch (nodeType) {
    case 'Envelope': return envelopeCpp(id, v, inputs, props, attackWired)
    case 'NoiseSignal': return noiseSignalCpp(id, v, inputs, props)
    case 'ScheduleTrigger': return scheduleTriggerCpp(id, v, inputs, props)
    case 'Clock': return clockCpp(id, v, inputs)
    default: return null
  }
}

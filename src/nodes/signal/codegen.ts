import type { NodeEmitters } from '../../codegen/emitContext'
import { floatLit, safeId, seedProp } from '../../codegen/cppLiterals'
import { intervalCpp } from '../../codegen/intervalCpp'
import { timeNodeCpp, waveCpp } from '../../codegen/signalTimeCpp'
import { beatSinCpp, clockCpp, counterCpp, envelopeCpp, noiseSignalCpp, scheduleTriggerCpp } from '../../codegen/signalControlCpp'

export const SIGNAL_EMITTERS: NodeEmitters = {
  TimeNode({ id, ln, needsT }) {
    needsT.v = true
    timeNodeCpp(id, 't').forEach(ln)
  },
  Wave({ p, ln, v, f, needsT }) {
    needsT.v = true
    waveCpp(v('result'), String(p.waveform ?? 'sine'), f('amplitude', 'amplitude', 1),
      f('frequency', 'frequency', 1), f('phase', 'phase', 0), 't').forEach(ln)
  },
  // Metronome — a boolean pulse every `interval` seconds, via a millis timer.
  // Mirrors the stateful `Interval` case in graphEvaluator.ts.
  Interval({ id, ln, v, f }) {
    intervalCpp(id, v('pulse'), f('interval', 'interval', 0.5)).forEach(ln)
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
    const enabledDefault = p.enable !== false
    scheduleTriggerCpp(id, v, {
      valid: boolExpr(node.id, 'valid'),
      synced: boolExpr(node.id, 'synced'),
      enable: incoming.has(`${node.id}:enable`) ? boolExpr(node.id, 'enable') : enabledDefault ? 'true' : 'false',
      weekday: floatExpr(node.id, 'weekday', p, 'weekday', 0),
      secondsOfDay: floatExpr(node.id, 'secondsOfDay', p, 'secondsOfDay', 0),
      day: floatExpr(node.id, 'day', p, 'day', 1),
      month: floatExpr(node.id, 'month', p, 'month', 1),
      year: floatExpr(node.id, 'year', p, 'year', 1970),
    }, p).forEach(ln)
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
  // Mirrors the evaluator's fBm over time with inoise16 (period 256 cells, so
  // fmodf wraps without a jump). Octaves clamp at 3, as in the evaluator.
  NoiseSignal({ id, p, ln, v, f }) {
    noiseSignalCpp(id, v, {
      speed: f('speed', 'speed', 0.25),
      min: f('min', 'min', 0),
      max: f('max', 'max', 1),
    }, p).forEach(ln)
  },
  Counter({ id, ln, v, f, needsT }) {
    needsT.v = true
    counterCpp(id, v, f('rate', 'rate', 0.5), 't').forEach(ln)
  },
  // Trigger envelope — optional linear attack to 1 on a rising edge, then
  // linear decay to 0; outputs 0 until the first trigger.
  Envelope({ node, id, p, ln, v, f, incoming, boolExpr }) {
    const attackProp = Number(p.attack ?? 0)
    const decayProp = Number(p.decay ?? 0.5)
    const attackMs = Number.isFinite(attackProp) ? Math.max(0, Math.round(attackProp * 1000)) : 0
    const decayMs = Number.isFinite(decayProp) ? Math.max(50, Math.round(decayProp * 1000)) : 500
    envelopeCpp(id, v, {
      trigger: boolExpr(node.id, 'trigger'),
      attack: f('attack', 'attack', attackMs / 1000),
      decay: f('decay', 'decay', decayMs / 1000),
    }, p, incoming.has(`${node.id}:attack`)).forEach(ln)
  },
  BeatSin({ id, p, ln, v, f }) {
    const bpmProp = Number(p.bpm ?? 60)
    // `f` would emit NaN for a non-numeric stored bpm, so the sanitised
    // value is what it falls back to.
    beatSinCpp(id, v, { bpm: f('bpm', 'bpm', Number.isFinite(bpmProp) ? bpmProp : 60) }, p).forEach(ln)
  },
  // Free-running BPM clock/transport — millis()-based, mirroring the
  // stateful `Clock` case in graphEvaluator.ts (same tap/sync EMA and
  // beat/bar/subdivision edge semantics) so preview and firmware timing
  // match. Reset is the reset wire. A backward jump of the animation
  // clock resets the preview only, because this node does not read it.
  Clock({ node, id, ln, v, f, boolExpr }) {
    clockCpp(id, v, {
      bpm: f('bpm', 'bpm', 120),
      beatsPerBar: f('beatsPerBar', 'beatsPerBar', 4),
      subdivision: f('subdivision', 'subdivision', 2),
      tap: boolExpr(node.id, 'tap'),
      sync: boolExpr(node.id, 'sync'),
      reset: boolExpr(node.id, 'reset'),
    }).forEach(ln)
  },
}

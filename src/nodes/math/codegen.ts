import { formatDateTimeCpp } from '../../codegen/displayTextCpp'
import { asDateTimeTextMode } from '../../state/displayText'
import type { NodeEmitters } from '../../codegen/emitContext'
import { safeId } from '../../codegen/cppLiterals'

export const MATH_EMITTERS: NodeEmitters = {
  // Easing curve on a 0–1 value via legacy lib8tion or FastLED's accurate
  // fl::ease* functions. Existing ids keep their historical calls.
  Ease({ p, ln, v, f }) {
    const type = String(p.easeType ?? 'inOutCubic')
    const fn = type === 'inOutQuad' ? 'ease8InOutQuad'
      : type === 'linear' ? ''
      : type === 'inOutApprox' ? 'ease8InOutApprox'
      : type === 'inQuad' ? 'fl::easeInQuad8'
      : type === 'outQuad' ? 'fl::easeOutQuad8'
      : type === 'inCubic' ? 'fl::easeInCubic8'
      : type === 'outCubic' ? 'fl::easeOutCubic8'
      : type === 'inSine' ? 'fl::easeInSine8'
      : type === 'outSine' ? 'fl::easeOutSine8'
      : type === 'inOutSine' ? 'fl::easeInOutSine8'
      : type === 'triwave' ? 'triwave8'
      : type === 'quadwave' ? 'quadwave8'
      : type === 'cubicwave' ? 'cubicwave8'
      : 'ease8InOutCubic'
    const input = `(uint8_t)(constrain(${f('t', 't', 0)}, 0.0f, 1.0f) * 255)`
    ln(`  float ${v('result')} = ${fn ? `${fn}(${input})` : input} / 255.0f;`)
  },
  Abs({ ln, v, f }) {
    ln(`  float ${v('result')} = fabs(${f('x', 'x', 0)});`)
  },
  Mod({ ln, v, f }) {
    const mx = f('x', 'x', 0), mm = f('m', 'm', 1)
    ln(`  float ${v('result')} = fmod(fmod(${mx}, ${mm}) + (${mm}), ${mm});`)
  },
  Gate({ node, p, ln, v, f, boolExpr }) {
    const val = f('value', 'value', 0), gate = boolExpr(node.id, 'gate')
    ln(`  float ${v('result')} = (${gate}) ? (${val}) : ${Number(p.fallback ?? 0)};`)
  },
  // Low-pass smoothing — millis()-based EMA with time constant `response`
  // seconds, seeded from the first sample. Mirrors the evaluator's Smooth.
  Smooth({ node, id, p, ln, v, f, incoming }) {
    const resp = Math.max(0, Number(p.response ?? 0.25))
    const respWired = incoming.has(`${node.id}:response`)
    const respE = `fmaxf(0.0f,${f('response', 'response', resp)})`
    const val = f('value', 'value', 0)
    // A response at rest is a passthrough, and the generator can only pick
    // that arm while the knob cannot move.
    if (resp <= 0.01 && !respWired) { ln(`  float ${v('result')} = ${val};`); return }
    ln(`  static float ${v('result')} = 0; static uint32_t _smT_${id} = 0; static bool _smI_${id} = false;`)
    ln(`  { float _in = ${val}; uint32_t _now = millis();`)
    ln(`    if (!_smI_${id}) { ${v('result')} = _in; _smI_${id} = true; }`)
    ln(`    float _smResp = fmaxf(0.0001f, ${respE});`)
    ln(`    else ${v('result')} += (_in - ${v('result')}) * (1.0f - expf(-(float)(_now - _smT_${id}) / 1000.0f / _smResp));`)
    ln(`    _smT_${id} = _now; }`)
  },
  // Sample & hold — latch `value` on a rising edge of `trigger` (seeded
  // from the first sample, matching the evaluator).
  SampleHold({ node, id, ln, v, f, boolExpr }) {
    const val = f('value', 'value', 0), trig = boolExpr(node.id, 'trigger')
    ln(`  static float ${v('result')} = 0; static bool _shP_${id} = false, _shI_${id} = false;`)
    ln(`  { bool _t = (${trig}); if (!_shI_${id} || (_t && !_shP_${id})) { ${v('result')} = ${val}; _shI_${id} = true; } _shP_${id} = _t; }`)
  },
  Switch({ node, ln, v, f, boolExpr }) {
    const a = f('a', 'a', 0), b2 = f('b', 'b', 1), sel = boolExpr(node.id, 'sel')
    ln(`  float ${v('result')} = (${sel}) ? (${b2}) : (${a});`)
  },
  Not({ node, ln, v, boolExpr }) {
    const x = boolExpr(node.id, 'x')
    ln(`  bool ${v('result')} = !(${x});`)
  },
  FormatDateTime({ node, p, ln, v, incoming, needsDisplayText }) {
    needsDisplayText.dateTime = true
    const dtUp = incoming.get(`${node.id}:dateTime`)
    const dtExpr = dtUp ? `n_${safeId(dtUp.srcId)}_${safeId(dtUp.srcPort)}` : null
    for (const line of formatDateTimeCpp(v('text'), dtExpr, asDateTimeTextMode(p.dateTimeFormat))) ln(line)
  },
  // Bundled trigger/edge utility — `triggerOp` picks the variant. Every
  // branch is a millis()-based static, mirroring the stateful `Trigger`
  // case in graphEvaluator.ts so preview and firmware timing match.
  Trigger({ node, id, p, ln, v, f, boolExpr }) {
    const op = String(p.triggerOp ?? 'debounce')
    const trig = boolExpr(node.id, 'trigger')
    const outVar = v('out')
    if (op === 'toggle') {
      ln(`  static bool ${outVar} = ${p.initialState === true ? 'true' : 'false'}; static bool _trP_${id} = false;`)
      ln(`  { bool _t = (${trig}); if (_t && !_trP_${id}) ${outVar} = !${outVar}; _trP_${id} = _t; }`)
    } else if (op === 'changed') {
      ln(`  static bool _trP_${id} = false, _trInit_${id} = false; bool ${outVar} = false;`)
      ln(`  { bool _t = (${trig}); if (!_trInit_${id}) { _trP_${id} = _t; _trInit_${id} = true; } else { ${outVar} = (_t != _trP_${id}); _trP_${id} = _t; } }`)
    } else if (op === 'oneShot') {
      ln(`  uint32_t _trMs_${id} = (uint32_t)fmaxf(20.0f, (${f('holdTime', 'holdTime', 0.1)})*1000.0f);`)
      ln(`  static uint32_t _trT_${id} = 0xFFFFFFFFu; static bool _trP_${id} = false;`)
      ln(`  { bool _t = (${trig}); if (_t && !_trP_${id}) _trT_${id} = millis(); _trP_${id} = _t; }`)
      ln(`  bool ${outVar} = (millis() - _trT_${id}) < _trMs_${id};`)
    } else if (op === 'pulseDivider') {
      ln(`  uint8_t _trN_${id} = (uint8_t)constrain(${f('divideBy', 'divideBy', 2)},2.0f,255.0f);`)
      ln(`  static uint8_t _trC_${id} = 0; static bool _trP_${id} = false; bool ${outVar} = false;`)
      ln(`  { bool _t = (${trig}); if (_t && !_trP_${id}) { _trC_${id}++; if (_trC_${id} >= _trN_${id}) { _trC_${id} = 0; ${outVar} = true; } } _trP_${id} = _t; }`)
    } else if (op === 'delay') {
      ln(`  uint32_t _trMs_${id} = (uint32_t)fmaxf(10.0f, (${f('delayTime', 'delayTime', 0.5)})*1000.0f);`)
      ln(`  static uint32_t _trS_${id} = 0; static bool _trA_${id} = false, _trP_${id} = false; bool ${outVar} = false;`)
      ln(`  { bool _t = (${trig}); if (_t && !_trP_${id}) { _trS_${id} = millis() + _trMs_${id}; _trA_${id} = true; } _trP_${id} = _t; }`)
      ln(`  if (_trA_${id} && millis() >= _trS_${id}) { ${outVar} = true; _trA_${id} = false; }`)
    } else { // debounce
      ln(`  uint32_t _trMs_${id} = (uint32_t)fmaxf(5.0f, (${f('stableTime', 'stableTime', 0.05)})*1000.0f);`)
      ln(`  static bool _trC_${id} = false, _trCommit_${id} = false, _trInit_${id} = false; static uint32_t _trSince_${id} = 0;`)
      ln(`  { bool _t = (${trig});`)
      ln(`    if (!_trInit_${id}) { _trC_${id} = _t; _trCommit_${id} = _t; _trSince_${id} = millis(); _trInit_${id} = true; }`)
      ln(`    else { if (_t != _trC_${id}) { _trC_${id} = _t; _trSince_${id} = millis(); }`)
      ln(`      if (_t == _trC_${id} && (millis() - _trSince_${id}) >= _trMs_${id}) _trCommit_${id} = _t; } }`)
      ln(`  bool ${outVar} = _trCommit_${id};`)
    }
  },
  XYMapper({ ln, v, f }) {
    const xx = f('x', 'x', 0), yy = f('y', 'y', 0)
    ln(`  uint16_t ${v('index')} = (uint16_t)(${xx}) + (uint16_t)(${yy}) * WIDTH;`)
  },
}

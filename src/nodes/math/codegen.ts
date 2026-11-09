import { formatDateTimeCpp } from '../../codegen/displays/displayTextCpp'
import { asDateTimeTextMode } from '../../state/displays/displayText'
import type { NodeEmitters } from '../../codegen/emitContext'
import { safeId } from '../../codegen/cppLiterals'
import { logicCpp } from './logic'
import { usesShims } from '../shared/fastledShims'
import { scalarFormulaCpp } from '../shared/formulaLang'
import { easeByteCpp } from './easing'

export const MATH_EMITTERS: NodeEmitters = {
  Constant({ ln, v, f }) {
    ln(`  float ${v('value')} = ${f('value', 'value', 1)};`)
  },
  // Same fail-closed validation as Formula Pattern: a formula the sandboxed
  // parser rejects emits 0 rather than its text, so a shared graph cannot
  // inject into the sketch. validateGraph blocks export on the same check.
  Expression({ p, ln, v, f, needsT, needsShims, needsPhi }) {
    needsT.v = true
    const raw = String(p.formula ?? '')
    const cpp = scalarFormulaCpp(raw)
    const safe = cpp !== null
    if (safe && usesShims(raw)) needsShims.v = true
    if (safe && /\bPHI\b/.test(raw)) needsPhi.v = true
    const formula = cpp ?? '0.0f'
    ln(`  float ${v('result')};`)
    ln(`  { /* Expression: ${safe ? raw.replace(/\*\//g, '* /') : 'invalid formula — outputs 0'} */`)
    ln(`    float a=${f('a', 'a', 0)}, b=${f('b', 'b', 0)}; (void)a; (void)b;`)
    ln(`    float W=WIDTH, H=HEIGHT; (void)W; (void)H;`)
    ln(`    ${v('result')} = ${formula}; }`)
  },
  Logic({ node, p, ln, v, boolExpr }) {
    ln(`  bool ${v('result')} = ${logicCpp(p.logicOp, boolExpr(node.id, 'a'), boolExpr(node.id, 'b'))};`)
  },
  // Easing curve on a 0–1 value via legacy lib8tion or FastLED's accurate
  // fl::ease* functions. Existing ids keep their historical calls.
  Ease({ p, ln, v, f }) {
    const type = String(p.easeType ?? 'inOutCubic')
    const input = `(uint8_t)(constrain(${f('t', 't', 0)}, 0.0f, 1.0f) * 255)`
    ln(`  float ${v('result')} = ${easeByteCpp(type, input)} / 255.0f;`)
  },
  // Low-pass smoothing — millis()-based EMA with time constant `response`
  // seconds (or `fall` while the value drops, when Fall is above 0), seeded
  // from the first sample. Mirrors the evaluator's Smooth, passthrough at
  // 0.01 s or less included.
  Smooth({ node, id, p, ln, v, f, incoming }) {
    const resp = Math.max(0, Number(p.response ?? 0.25))
    const fall = Math.max(0, Number(p.fall ?? 0))
    const respWired = incoming.has(`${node.id}:response`)
    const fallWired = incoming.has(`${node.id}:fall`)
    const val = f('value', 'value', 0)
    // Both directions at rest are a passthrough (a Fall of 0 is Response),
    // and the generator can only pick that arm while neither knob can move.
    if (resp <= 0.01 && !respWired && fall <= 0.01 && !fallWired) { ln(`  float ${v('result')} = ${val};`); return }
    const usesFall = fallWired || fall > 0
    ln(`  static float ${v('result')} = 0; static uint32_t _smT_${id} = 0; static bool _smI_${id} = false;`)
    ln(`  { float _in = ${val}; uint32_t _now = millis();`)
    ln(`    float _smResp = fmaxf(0.0f, ${f('response', 'response', resp)});`)
    if (usesFall) {
      ln(`    float _smFall = fmaxf(0.0f, ${f('fall', 'fall', 0)});`)
      ln(`    if (_smI_${id} && _in < ${v('result')} && _smFall > 0.0f) _smResp = _smFall;`)
    }
    ln(`    if (!_smI_${id}) { ${v('result')} = _in; _smI_${id} = true; }`)
    ln(`    else if (_smResp > 0.01f) ${v('result')} += (_in - ${v('result')}) * (1.0f - expf(-(float)(_now - _smT_${id}) / 1000.0f / _smResp));`)
    ln(`    else ${v('result')} = _in;`)
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
}

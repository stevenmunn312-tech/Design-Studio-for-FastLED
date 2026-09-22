// Pure scalar operations shared by the normal graph and template control graphs.
import { displayString, normalizeNumberFormat } from '../state/displayText'
import { normalizeStepValueSettings, STEP_VALUE_SCALE } from '../state/stepValue'
import { formatNumberCpp, textValueCpp } from './displayTextCpp'

export type ControlDataType = 'float' | 'bool' | 'string'

export const SCALAR_CONTROL_NODES: Record<string, { port: string; type: ControlDataType }> = {
  Math: { port: 'result', type: 'float' },
  Lerp: { port: 'result', type: 'float' },
  Clamp: { port: 'result', type: 'float' },
  MapRange: { port: 'result', type: 'float' },
  StepValue: { port: 'value', type: 'float' },
  Sin: { port: 'result', type: 'float' },
  Cos: { port: 'result', type: 'float' },
  Compare: { port: 'result', type: 'bool' },
  Trigger: { port: 'out', type: 'bool' },
  TextValue: { port: 'text', type: 'string' },
  FormatNumber: { port: 'text', type: 'string' },
}

/** Input defaults are also the dependency inventory for the control IR. */
export function scalarControlInputDefaults(type: string, props: Record<string, unknown>): Record<string, number> {
  switch (type) {
    case 'Math': {
      const identity = props.mathOp === 'multiply' || props.mathOp === 'divide' ? 1 : 0
      return { a: identity, b: identity }
    }
    case 'Lerp': return { a: 0, b: 1, t: 0.5 }
    case 'Clamp': return { value: 0, min: 0, max: 1 }
    case 'MapRange': return { value: 0, inMin: 0, inMax: 1, outMin: 0, outMax: 1 }
    case 'StepValue': return { increase: 0, decrease: 0, reset: 0 }
    case 'Sin': case 'Cos': return { x: 0 }
    case 'Compare': return { a: 0, b: 0.5 }
    case 'Trigger': return { trigger: 0 }
    case 'FormatNumber': return { value: 0 }
    default: return {}
  }
}

export function scalarControlInputType(type: string, port: string): ControlDataType {
  if ((type === 'Trigger' && port === 'trigger')
    || (type === 'StepValue' && ['increase', 'decrease', 'reset'].includes(port))) return 'bool'
  return 'float'
}

export const MAP_FLOAT_CPP = `float mapFloat(float x, float inMin, float inMax, float outMin, float outMax) {
  if (inMax == inMin) return outMin;
  return outMin + (x - inMin) * (outMax - outMin) / (inMax - inMin);
}`

/** The caller owns input resolution, clamping and identifier sanitization. */
export function scalarControlCpp(
  type: string, id: string, props: Record<string, unknown>,
  input: (port: string, fallback: number) => string,
): { loop: string[]; needsMapFloat: boolean; needsDisplayText: boolean } | null {
  if (!Object.hasOwn(SCALAR_CONTROL_NODES, type)) return null
  const f = Object.fromEntries(Object.entries(scalarControlInputDefaults(type, props))
    .map(([port, fallback]) => [port, input(port, fallback)]))
  const output = `n_${id}_${SCALAR_CONTROL_NODES[type].port}`
  let expression = ''
  let loop: string[] | undefined
  switch (type) {
    case 'Math':
      switch (props.mathOp) {
        case 'subtract': expression = `(${f.a}) - (${f.b})`; break
        case 'multiply': expression = `(${f.a}) * (${f.b})`; break
        case 'divide': expression = `((${f.b}) == 0.0f ? 0.0f : (${f.a}) / (${f.b}))`; break
        case 'min': expression = `min((float)(${f.a}), (float)(${f.b}))`; break
        case 'max': expression = `max((float)(${f.a}), (float)(${f.b}))`; break
        default: expression = `(${f.a}) + (${f.b})`
      }
      break
    case 'Lerp': expression = `(${f.a}) + ((${f.b}) - (${f.a})) * (${f.t})`; break
    case 'Clamp': expression = `constrain(${f.value}, ${f.min}, ${f.max})`; break
    case 'MapRange': expression = `mapFloat(${f.value}, ${f.inMin}, ${f.inMax}, ${f.outMin}, ${f.outMax})`; break
    case 'StepValue': {
      const settings = normalizeStepValueSettings(props)
      const lit = (value: number) => `${Number.isInteger(value) ? value.toFixed(1) : String(value)}f`
      const initial = lit(settings.initial), minimum = lit(settings.minimum)
      const maximum = lit(settings.maximum), step = lit(settings.step)
      loop = [
        `  static float ${output} = ${initial};`,
        `  static bool _svIncPrev_${id} = false, _svDecPrev_${id} = false, _svResetPrev_${id} = false;`,
        `  { bool _svInc_${id} = (${f.increase}), _svDec_${id} = (${f.decrease}), _svReset_${id} = (${f.reset});`,
        `    bool _svIncEdge_${id} = _svInc_${id} && !_svIncPrev_${id};`,
        `    bool _svDecEdge_${id} = _svDec_${id} && !_svDecPrev_${id};`,
        `    bool _svResetEdge_${id} = _svReset_${id} && !_svResetPrev_${id};`,
        `    ${output} = constrain(${output}, ${minimum}, ${maximum});`,
        `    if (_svResetEdge_${id}) ${output} = ${initial};`,
        `    else if (_svIncEdge_${id} != _svDecEdge_${id}) {`,
        `      float _svNext_${id} = roundf((${output} + (_svIncEdge_${id} ? ${step} : -${step})) * ${STEP_VALUE_SCALE}.0f) / ${STEP_VALUE_SCALE}.0f;`,
        `      if (_svNext_${id} > ${maximum}) ${output} = ${settings.wrap ? minimum : maximum};`,
        `      else if (_svNext_${id} < ${minimum}) ${output} = ${settings.wrap ? maximum : minimum};`,
        `      else ${output} = _svNext_${id};`,
        `    }`,
        `    ${output} = roundf(constrain(${output}, ${minimum}, ${maximum}) * ${STEP_VALUE_SCALE}.0f) / ${STEP_VALUE_SCALE}.0f;`,
        `    _svIncPrev_${id} = _svInc_${id}; _svDecPrev_${id} = _svDec_${id}; _svResetPrev_${id} = _svReset_${id}; }`,
      ]
      break
    }
    case 'Sin': expression = `sin((${f.x}) * TWO_PI)`; break
    case 'Cos': expression = `cos((${f.x}) * TWO_PI)`; break
    case 'Compare': expression = `(${f.a}) > (${f.b})`; break
    case 'Trigger': {
      const op = String(props.triggerOp ?? 'debounce')
      if (op === 'toggle') {
        loop = [
          `  static bool ${output} = ${props.initialState === true ? 'true' : 'false'}; static bool _trP_${id} = false;`,
          `  { bool _t = (${f.trigger}); if (_t && !_trP_${id}) ${output} = !${output}; _trP_${id} = _t; }`,
        ]
      } else if (op === 'changed') {
        loop = [
          `  static bool _trP_${id} = false, _trInit_${id} = false; bool ${output} = false;`,
          `  { bool _t = (${f.trigger}); if (!_trInit_${id}) { _trP_${id} = _t; _trInit_${id} = true; } else { ${output} = (_t != _trP_${id}); _trP_${id} = _t; } }`,
        ]
      } else if (op === 'oneShot') {
        const ms = Math.max(20, Math.round(Number(props.holdTime ?? 0.1) * 1000))
        loop = [
          `  static uint32_t _trT_${id} = 0xFFFFFFFFu; static bool _trP_${id} = false;`,
          `  { bool _t = (${f.trigger}); if (_t && !_trP_${id}) _trT_${id} = millis(); _trP_${id} = _t; }`,
          `  bool ${output} = (millis() - _trT_${id}) < ${ms}u;`,
        ]
      } else if (op === 'pulseDivider') {
        const n = Math.max(2, Math.round(Number(props.divideBy ?? 2)))
        loop = [
          `  static uint8_t _trC_${id} = 0; static bool _trP_${id} = false; bool ${output} = false;`,
          `  { bool _t = (${f.trigger}); if (_t && !_trP_${id}) { _trC_${id}++; if (_trC_${id} >= ${n}) { _trC_${id} = 0; ${output} = true; } } _trP_${id} = _t; }`,
        ]
      } else if (op === 'delay') {
        const ms = Math.max(10, Math.round(Number(props.delayTime ?? 0.5) * 1000))
        loop = [
          `  static uint32_t _trS_${id} = 0; static bool _trA_${id} = false, _trP_${id} = false; bool ${output} = false;`,
          `  { bool _t = (${f.trigger}); if (_t && !_trP_${id}) { _trS_${id} = millis() + ${ms}u; _trA_${id} = true; } _trP_${id} = _t; }`,
          `  if (_trA_${id} && millis() >= _trS_${id}) { ${output} = true; _trA_${id} = false; }`,
        ]
      } else {
        const ms = Math.max(5, Math.round(Number(props.stableTime ?? 0.05) * 1000))
        loop = [
          `  static bool _trC_${id} = false, _trCommit_${id} = false, _trInit_${id} = false; static uint32_t _trSince_${id} = 0;`,
          `  { bool _t = (${f.trigger});`,
          `    if (!_trInit_${id}) { _trC_${id} = _t; _trCommit_${id} = _t; _trSince_${id} = millis(); _trInit_${id} = true; }`,
          `    else { if (_t != _trC_${id}) { _trC_${id} = _t; _trSince_${id} = millis(); }`,
          `      if (_t == _trC_${id} && (millis() - _trSince_${id}) >= ${ms}u) _trCommit_${id} = _t; } }`,
          `  bool ${output} = _trCommit_${id};`,
        ]
      }
      break
    }
    case 'TextValue': loop = [textValueCpp(output, displayString(props.text ?? ''))]; break
    case 'FormatNumber': loop = formatNumberCpp(output, f.value, normalizeNumberFormat(props)); break
  }
  return {
    loop: loop ?? [`  ${SCALAR_CONTROL_NODES[type].type} ${output} = ${expression};`],
    needsMapFloat: type === 'MapRange',
    // TextValue is already a baked C string. Only runtime number formatting
    // calls the generated display-number helper.
    needsDisplayText: type === 'FormatNumber',
  }
}

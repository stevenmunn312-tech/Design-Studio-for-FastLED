// Pure scalar operations shared by the normal graph and template control graphs.
import { displayString, normalizeNumberFormat } from '../state/displayText'
import { formatNumberCpp, textValueCpp } from './displayTextCpp'

export type ControlDataType = 'float' | 'bool' | 'string'

export const SCALAR_CONTROL_NODES: Record<string, { port: string; type: ControlDataType }> = {
  Math: { port: 'result', type: 'float' },
  Lerp: { port: 'result', type: 'float' },
  Clamp: { port: 'result', type: 'float' },
  MapRange: { port: 'result', type: 'float' },
  Sin: { port: 'result', type: 'float' },
  Cos: { port: 'result', type: 'float' },
  Compare: { port: 'result', type: 'bool' },
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
    case 'Sin': case 'Cos': return { x: 0 }
    case 'Compare': return { a: 0, b: 0.5 }
    case 'FormatNumber': return { value: 0 }
    default: return {}
  }
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
    case 'Sin': expression = `sin((${f.x}) * TWO_PI)`; break
    case 'Cos': expression = `cos((${f.x}) * TWO_PI)`; break
    case 'Compare': expression = `(${f.a}) > (${f.b})`; break
    case 'TextValue': loop = [textValueCpp(output, displayString(props.text ?? ''))]; break
    case 'FormatNumber': loop = formatNumberCpp(output, f.value, normalizeNumberFormat(props)); break
  }
  return {
    loop: loop ?? [`  ${SCALAR_CONTROL_NODES[type].type} ${output} = ${expression};`],
    needsMapFloat: type === 'MapRange',
    needsDisplayText: type === 'TextValue' || type === 'FormatNumber',
  }
}

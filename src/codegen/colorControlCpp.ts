// Self-contained colour nodes for the template control graph.
//
// The formulas are the normal sketch's (`src/nodes/color/codegen.ts`). A
// palette or an image stays out: those need a palette table or a bitmap this
// graph does not carry, and the resolver reports that rather than inventing a
// colour. Packing into the uint32 a Colour Swatch stores happens at the
// binding, so a later colour node can still read the CRGB.

import { gradientMixMode, hueUnits } from '../state/palettes/hueMix'
import { hexToRgb } from '../state/palettes/polinePalette'

/** HSV → RGB's Hue in degrees for `_hsv`, which wraps it, from the node's units. */
export function hsvDegreesCpp(units: unknown, hue: string): string {
  return hueUnits(units) === 'bytes' ? `(${hue})*(360.0f/255.0f)` : `(${hue})`
}
/**
 * HSV → RGB through `_hsv` (helpers/hsvHelperCpp.ts), the preview's wheel.
 * CHSV is FastLED's rainbow wheel, which put 60 degrees at orange.
 */
export function hsvColorCpp(units: unknown, h: string, s: string, v: string): string {
  return `_hsv(${hsvDegreesCpp(units, h)}, ${s}, ${v})`
}
/**
 * A hex colour property as a CRGB literal, read as the preview reads it:
 * `fallback` (0xRRGGBB) only when the property is missing, otherwise
 * `hexToRgb`, which takes a missing `#` and surrounding spaces and gives black
 * for anything that is not a colour.
 */
export function hexCrgbCpp(hex: unknown, fallback: number): string {
  const { r, g, b } = hex === undefined || hex === null
    ? { r: (fallback >> 16) & 255, g: (fallback >> 8) & 255, b: fallback & 255 }
    : hexToRgb(String(hex))
  return `CRGB(${r}, ${g}, ${b})`
}

export interface ColorControlSpec {
  outputs: Readonly<Record<string, 'color' | 'float'>>
  floats: Readonly<Record<string, number>>
  colors: readonly {
    port: string
    channels: readonly [string, string, string]
    defaults: readonly [number, number, number]
  }[]
  needsTime?: boolean
}

/** Colour nodes whose whole result is one CRGB, or three floats from one CRGB. */
export const COLOR_CONTROL_NODES: Readonly<Record<string, ColorControlSpec>> = {
  Color: { outputs: { color: 'color' }, floats: {}, colors: [] },
  HSVToRGB: { outputs: { color: 'color' }, floats: { h: 0, s: 1, v: 1 }, colors: [] },
  Temperature: { outputs: { color: 'color' }, floats: { warmth: 0.27 }, colors: [] },
  HeatColor: { outputs: { color: 'color' }, floats: { heat: 0.5 }, colors: [] },
  HueCycle: { outputs: { color: 'color' }, floats: { rate: 0.1, s: 1, v: 1 }, colors: [], needsTime: true },
  GradientSampler: {
    outputs: { color: 'color' }, floats: { t: 0 },
    colors: [
      { port: 'colorA', channels: ['rA', 'gA', 'bA'], defaults: [0, 200, 255] },
      { port: 'colorB', channels: ['rB', 'gB', 'bB'], defaults: [255, 0, 255] },
    ],
  },
  RGBToHSV: {
    outputs: { h: 'float', s: 'float', v: 'float' }, floats: {},
    colors: [{ port: 'rgb', channels: ['r', 'g', 'b'], defaults: [0, 0, 0] }],
  },
}

/** The uint32 Colour Swatch widgets store: RGB packed the way a normal sketch packs it. */
export function packedColorCpp(symbol: string): string {
  return `(((uint32_t)(${symbol}).r << 16) | ((uint32_t)(${symbol}).g << 8) | (uint32_t)(${symbol}).b)`
}

/** Emit one colour node's locals. `id` is already a C identifier. */
export function colorControlCpp(
  type: string,
  id: string,
  props: Record<string, unknown>,
  floats: Readonly<Record<string, string>>,
  colors: Readonly<Record<string, string>>,
  time: string,
): { loop: string[]; needsMapFloat: boolean; needsKelvin: boolean; needsHueMix: boolean; needsHsv: boolean; needsTime: boolean } | null {
  const spec = COLOR_CONTROL_NODES[type]
  if (!spec) return null
  const colorPort = Object.entries(spec.outputs).find(([, kind]) => kind === 'color')?.[0]
  const color = colorPort ? `n_${id}_${colorPort}` : ''
  let loop: string[] = []
  let needsMapFloat = false
  let needsKelvin = false
  let needsHueMix = false
  let needsHsv = false
  switch (type) {
    case 'Color':
      loop = [`  CRGB ${color} = ${hexCrgbCpp(props.color, 0xff3080)};`]
      break
    case 'HSVToRGB':
      needsHsv = true
      loop = [`  CRGB ${color} = ${hsvColorCpp(props.hueUnits, floats.h, floats.s, floats.v)};`]
      break
    case 'Temperature':
      needsKelvin = true
      needsMapFloat = true
      loop = [`  CRGB ${color} = kelvinToRGB(mapFloat(constrain(${floats.warmth}, 0.0f, 1.0f), 0.0f, 1.0f, 1000.0f, 12000.0f));`]
      break
    case 'HeatColor':
      loop = [`  CRGB ${color} = HeatColor((uint8_t)(constrain(${floats.heat}, 0.0f, 1.0f) * 255));`]
      break
    case 'HueCycle':
      loop = [
        `  CRGB ${color};`,
        `  { float _huePhase = fmodf(fmodf(${time} * (${floats.rate}), 1.0f) + 1.0f, 1.0f); ${color} = _hsv(_huePhase * 360.0f, ${floats.s}, ${floats.v}); }`,
      ]
      needsHsv = true
      break
    case 'GradientSampler': {
      const tt = `(${floats.t})`
      const cA = `_gsA_${id}`, cB = `_gsB_${id}`
      const mode = gradientMixMode(props.mixMode)
      loop = [`  CRGB ${cA}=${colors.colorA},${cB}=${colors.colorB};`]
      if (mode === 'rgb') {
        const channel = (name: string) => `(uint8_t)(${cA}.${name}*(1-${tt})+${cB}.${name}*${tt}+0.5f)`
        loop.push(`  CRGB ${color} = CRGB(${channel('r')},${channel('g')},${channel('b')});`)
      } else {
        needsHueMix = true
        loop.push(`  CRGB ${color} = _hueMix(${cA}, ${cB}, ${tt}, ${mode === 'hsvLong'});`)
      }
      break
    }
    case 'RGBToHSV':
      loop = [
        `  CRGB _hsv_${id} = ${colors.rgb};`,
        `  float n_${id}_h = _rgbHue(_hsv_${id});`,
        `  float n_${id}_s = _rgbSat(_hsv_${id});`,
        `  float n_${id}_v = _rgbVal(_hsv_${id});`,
      ]
      needsHsv = true
      break
    default:
      return null
  }
  return { loop, needsMapFloat, needsKelvin, needsHueMix, needsHsv, needsTime: spec.needsTime === true }
}

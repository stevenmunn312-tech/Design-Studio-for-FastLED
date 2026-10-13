// Self-contained colour nodes for the template control graph.
//
// The formulas are the normal sketch's (`src/nodes/color/codegen.ts`). A
// palette or an image stays out: those need a palette table or a bitmap this
// graph does not carry, and the resolver reports that rather than inventing a
// colour. Packing into the uint32 a Colour Swatch stores happens at the
// binding, so a later colour node can still read the CRGB.

import { gradientMixMode } from '../state/palettes/hueMix'

/*
 * Colour bytes from wireable floats. A bare `(uint8_t)(x * 255)` wraps a wired
 * 1.1 round to 25 and is undefined for a negative, where the preview's `hsv()`
 * clamps a level and wraps a hue. Both generators build CHSV bytes through
 * these so the board does what the preview does once a wire leaves the
 * slider's range; inside it they emit the same truncated byte as before.
 */
/** A 0–1 level as a 0–255 byte. */
export function levelByteCpp(level: string): string {
  return `(uint8_t)(constrain(${level}, 0.0f, 1.0f) * 255.0f)`
}
/** Degrees as a CHSV hue, wrapped round the wheel. */
export function degreesHueCpp(degrees: string): string {
  return `(uint8_t)(fmodf(fmodf(${degrees}, 360.0f) + 360.0f, 360.0f) / 360.0f * 255.0f)`
}
/** A FastLED 0–255 hue, wrapped round the wheel. */
export function hueByteCpp(hue: string): string {
  return `(uint8_t)fmodf(fmodf(${hue}, 256.0f) + 256.0f, 256.0f)`
}
/** A FastLED 0–255 saturation or value, clamped. */
export function channelByteCpp(channel: string): string {
  return `(uint8_t)constrain(${channel}, 0.0f, 255.0f)`
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
  HSVToRGB: { outputs: { color: 'color' }, floats: { h: 0, s: 1, v: 1 }, colors: [] },
  CHSV: { outputs: { rgb: 'color' }, floats: { hue: 128, sat: 255, val: 255 }, colors: [] },
  Temperature: { outputs: { color: 'color' }, floats: { kelvin: 0.27 }, colors: [] },
  HeatColor: { outputs: { color: 'color' }, floats: { heat: 0.5 }, colors: [] },
  HueCycle: { outputs: { color: 'color' }, floats: { rate: 0.1, s: 1, v: 1 }, colors: [], needsTime: true },
  BlendColors: {
    outputs: { color: 'color' }, floats: { t: 0.5 },
    colors: [
      { port: 'a', channels: ['rA', 'gA', 'bA'], defaults: [255, 0, 0] },
      { port: 'b', channels: ['rB', 'gB', 'bB'], defaults: [0, 0, 255] },
    ],
  },
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
): { loop: string[]; needsMapFloat: boolean; needsKelvin: boolean; needsHueMix: boolean; needsTime: boolean } | null {
  const spec = COLOR_CONTROL_NODES[type]
  if (!spec) return null
  const colorPort = Object.entries(spec.outputs).find(([, kind]) => kind === 'color')?.[0]
  const color = colorPort ? `n_${id}_${colorPort}` : ''
  let loop: string[] = []
  let needsMapFloat = false
  let needsKelvin = false
  let needsHueMix = false
  switch (type) {
    case 'HSVToRGB':
      loop = [`  CRGB ${color} = CHSV(${degreesHueCpp(floats.h)}, ${levelByteCpp(floats.s)}, ${levelByteCpp(floats.v)});`]
      break
    case 'CHSV':
      loop = [`  CRGB ${color} = CHSV(${hueByteCpp(floats.hue)}, ${channelByteCpp(floats.sat)}, ${channelByteCpp(floats.val)});`]
      break
    case 'Temperature':
      needsKelvin = true
      needsMapFloat = true
      loop = [`  CRGB ${color} = kelvinToRGB(mapFloat(constrain(${floats.kelvin}, 0.0f, 1.0f), 0.0f, 1.0f, 1000.0f, 12000.0f));`]
      break
    case 'HeatColor':
      loop = [`  CRGB ${color} = HeatColor((uint8_t)(constrain(${floats.heat}, 0.0f, 1.0f) * 255));`]
      break
    case 'HueCycle':
      loop = [
        `  CRGB ${color};`,
        `  { float _huePhase = fmodf(fmodf(${time} * (${floats.rate}), 1.0f) + 1.0f, 1.0f); ${color} = CHSV((uint8_t)(_huePhase * 256.0f), ${levelByteCpp(floats.s)}, ${levelByteCpp(floats.v)}); }`,
      ]
      break
    case 'BlendColors':
      loop = [`  CRGB ${color} = blend(${colors.a}, ${colors.b}, ${levelByteCpp(floats.t)});`]
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
        `  CHSV _hsv_${id} = rgb2hsv_approximate(${colors.rgb});`,
        `  float n_${id}_h = _hsv_${id}.hue / 255.0f * 360.0f;`,
        `  float n_${id}_s = _hsv_${id}.sat / 255.0f;`,
        `  float n_${id}_v = _hsv_${id}.val / 255.0f;`,
      ]
      break
    default:
      return null
  }
  return { loop, needsMapFloat, needsKelvin, needsHueMix, needsTime: spec.needsTime === true }
}

import { describe, it, expect } from 'vitest'
import { HSV_HELPER_CPP } from '../hsvHelperCpp'
import { hsv, type RGB } from '../../../state/palettes/ledColor'
import { COLOR_EVALUATORS } from '../../../nodes/color/evaluate'
import { COMPOSITE_EVALUATORS } from '../../../nodes/composite/evaluate'
import type { EvalContext } from '../../../state/evaluator/types'
import type { StudioNode } from '../../../state/graphStore'

interface Helpers {
  _hsv(h: number, s: number, v: number): RGB
  _rgbHue(c: RGB): number
  _rgbSat(c: RGB): number
  _rgbVal(c: RGB): number
  _hsvAdjust(c: RGB, dh: number, satMul: number): RGB
}

/**
 * The emitted helper as JavaScript, statement for statement, so the test runs
 * the sketch's own arithmetic. Bytes truncate as C's casts do.
 */
function sketchHelpers(): Helpers {
  const js = HSV_HELPER_CPP
    .replace(/^\/\/.*$/gm, '')
    .replace(/static inline /g, '')
    .replace(/^(?:uint8_t|CRGB|float) (_\w+)\(([^)]*)\) \{/gm, (_, name: string, params: string) =>
      `function ${name}(${params.split(',').map((p) => p.trim().split(' ').pop()).join(', ')}) {`)
    .replace(/\b(?:float|uint8_t) (?=\w+ =)/g, 'let ')
    .replace(/\(uint8_t\)constrain\(/g, 'Math.trunc(constrain(')
    .replace(/_hsvByte\(x\) \{ return Math\.trunc\(constrain\(([^;]*)\);/, '_hsvByte(x) { return Math.trunc(constrain($1));')
    .replace(/\(float\)/g, '')
    .replace(/(\d)f\b/g, '$1')
  const runtime = {
    CRGB: (r: number, g: number, b: number) => ({ r, g, b }),
    constrain: (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x)),
    fmodf: (a: number, b: number) => a % b, fabsf: Math.abs, floorf: Math.floor,
    fmaxf: Math.max, fminf: Math.min, max: Math.max, min: Math.min,
  }
  return new Function(...Object.keys(runtime), `${js}\nreturn { _hsv, _rgbHue, _rgbSat, _rgbVal, _hsvAdjust }`)(...Object.values(runtime)) as Helpers
}

const node = {} as StudioNode
const colors: RGB[] = []
for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) colors.push({ r, g, b })
colors.push({ r: 255, g: 128, b: 0 }, { r: 12, g: 200, b: 199 }, { r: 3, g: 2, b: 1 })

describe('the sketch HSV helper', () => {
  const sketch = sketchHelpers()

  it('draws the preview wheel', () => {
    for (let h = -400; h <= 760; h += 7.5) {
      for (const [s, v] of [[1, 1], [0.5, 0.8], [0, 0.3], [0.9, 0.05]]) {
        expect(sketch._hsv(h, s, v), `h=${h} s=${s} v=${v}`).toEqual(hsv(h, s, v))
      }
    }
    // 60 degrees is yellow, where CHSV's rainbow wheel put orange.
    expect(sketch._hsv(60, 1, 1)).toEqual({ r: 255, g: 255, b: 0 })
  })

  it('reads hue, saturation and value as RGB → HSV does', () => {
    for (const rgb of colors) {
      const out = COLOR_EVALUATORS.RGBToHSV!({ input: () => rgb, num: () => 0 } as unknown as EvalContext, 'n', {}, node, 'RGBToHSV')
      expect(sketch._rgbHue(rgb)).toBeCloseTo(out.h as number, 9)
      expect(sketch._rgbSat(rgb)).toBeCloseTo(out.s as number, 9)
      expect(sketch._rgbVal(rgb)).toBeCloseTo(out.v as number, 9)
    }
  })

  it('shifts hue and scales saturation as Hue Shift and Saturation do', () => {
    const frame = [colors]
    for (const shift of [-1.25, -0.3, 0, 0.1, 0.5, 1.7]) {
      const ctx = { input: () => frame, num: () => shift } as unknown as EvalContext
      const out = COMPOSITE_EVALUATORS.HueShift!(ctx, 'n', {}, node, 'HueShift').frame as RGB[][]
      colors.forEach((c, i) => expect(sketch._hsvAdjust(c, shift * 360, 1), `shift ${shift}`).toEqual(out[0][i]))
    }
    for (const amount of [0, 0.4, 1, 2.5]) {
      const ctx = { input: () => frame, num: () => amount } as unknown as EvalContext
      const out = COMPOSITE_EVALUATORS.Saturation!(ctx, 'n', {}, node, 'Saturation').frame as RGB[][]
      colors.forEach((c, i) => expect(sketch._hsvAdjust(c, 0, amount), `amount ${amount}`).toEqual(out[0][i]))
    }
  })
})

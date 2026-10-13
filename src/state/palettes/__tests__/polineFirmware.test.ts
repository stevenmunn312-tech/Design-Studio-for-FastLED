/*
 * The board builds a wired Poline palette with `_polineStops16`
 * (`codegen/helpers/polineHelperCpp.ts`); the preview asks the poline library.
 * `firmwareStops16` below is that C++ copied line for line, so holding it to
 * `polineStops16` holds the sketch to the library: change one, change both.
 */
import { describe, expect, it } from 'vitest'
import { POLINE_POSITIONS, polineStops16, type RGB } from '../polinePalette'
import { polinePositionId } from '../../../codegen/helpers/polineHelperCpp'

function polPos(t: number, rev: boolean, fn: number): number {
  switch (fn) {
    case 0: return t
    case 2: return rev ? 1 - (1 - t) ** 3 : t ** 3
    case 3: return rev ? 1 - (1 - t) ** 4 : t ** 4
    case 4: return rev ? 1 - Math.sqrt(1 - t * t) : 1 - Math.sqrt(1 - t)
    case 5: return t * t * (3 - 2 * t)
    case 6: return rev ? 1 - (1 - t) * (1 - t) : t * t
    default: return rev ? 1 - Math.sin((1 - t) * 1.5707963) : Math.sin(t * 1.5707963)
  }
}

function polPoint(c: RGB): number[] {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) * 0.5
  let h = 0, s = 0
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  const a = h * 0.017453293
  return [0.5 + l * 0.5 * Math.cos(a), 0.5 + l * 0.5 * Math.sin(a), s]
}

function polColor(p: number[]): RGB {
  const h = (Math.atan2(p[1] - 0.5, p[0] - 0.5) * 57.29578 + 360) % 360
  const s = p[2], l = Math.sqrt((p[0] - 0.5) ** 2 + (p[1] - 0.5) ** 2) / 0.5
  const byte = (v: number) => Math.floor(v * 255 + 0.5)
  if (s === 0) return { r: byte(l), g: byte(l), b: byte(l) }
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c * 0.5
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return { r: byte(r + m), g: byte(g + m), b: byte(b + m) }
}

function firmwareStops16(a: RGB, b: RGB, c: RGB, points: number, fn: number): RGB[] {
  const anchors = [polPoint(a), polPoint(b), polPoint(c)]
  const n = Math.max(1, Math.min(16, points)) + 2, len = 2 * n - 1
  const out: RGB[] = []
  for (let i = 0; i < 16; i++) {
    const k = Math.floor(i / 15 * (len - 1) + 0.5), seg = k < n ? 0 : 1, j = seg === 0 ? k : k - n + 1
    const e = polPos(j / (n - 1), seg === 1, fn)
    out.push(polColor([0, 1, 2].map((ax) => (1 - e) * anchors[seg][ax] + e * anchors[seg + 1][ax])))
  }
  return out
}

const ANCHOR_SETS: [RGB, RGB, RGB][] = [
  [{ r: 16, g: 32, b: 255 }, { r: 255, g: 32, b: 160 }, { r: 32, g: 255, b: 208 }],
  [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }],
  [{ r: 0, g: 0, b: 0 }, { r: 128, g: 128, b: 128 }, { r: 255, g: 255, b: 255 }],
  [{ r: 250, g: 180, b: 20 }, { r: 40, g: 10, b: 90 }, { r: 200, g: 255, b: 240 }],
]

describe('firmware Poline palette', () => {
  it('builds the palette the library builds, for every position function', () => {
    let compared = 0
    for (const position of POLINE_POSITIONS) {
      for (const [a, b, c] of ANCHOR_SETS) {
        for (const points of [1, 2, 4, 7, 12, 16]) {
          const expected = polineStops16([a, b, c], points, position)
          const actual = firmwareStops16(a, b, c, points, polinePositionId(position))
          for (let i = 0; i < 16; i++) {
            // One count for float rounding on either side of a .5.
            for (const ch of ['r', 'g', 'b'] as const) {
              expect(Math.abs(actual[i][ch] - expected[i][ch]), `${position} ${points} stop ${i}.${ch}`).toBeLessThanOrEqual(1)
            }
          }
          compared++
        }
      }
    }
    expect(compared).toBe(POLINE_POSITIONS.length * ANCHOR_SETS.length * 6)
  })

  it('numbers the position functions by their place in the shared list', () => {
    expect(POLINE_POSITIONS.map(polinePositionId)).toEqual(POLINE_POSITIONS.map((_, i) => i))
    expect(polinePositionId('nonsense')).toBe(POLINE_POSITIONS.indexOf('sinusoidal'))
  })
})

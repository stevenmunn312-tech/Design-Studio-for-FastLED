import { type RGB, hsv } from './ledColor'

/** How a two-colour gradient travels between its ends: straight through RGB,
 *  or round the hue wheel the short or the long way, FastLED's
 *  `SHORTEST_HUES` and `LONGEST_HUES`. `rgb` is the historical mix. */
export const GRADIENT_MIX_MODES = ['rgb', 'hsvShort', 'hsvLong'] as const
export type GradientMixMode = typeof GRADIENT_MIX_MODES[number]

export function gradientMixMode(value: unknown): GradientMixMode {
  return (GRADIENT_MIX_MODES as readonly string[]).includes(String(value)) ? String(value) as GradientMixMode : 'rgb'
}

function rgbToHsv(c: RGB): { h: number; s: number; v: number } {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = (((g - b) / d) % 6 + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return { h: h * 60, s: max === 0 ? 0 : d / max, v: max }
}

/** Mix `a` to `b` at `t`. `rgb` rounds per channel and leaves `t` unclamped,
 *  exactly as both gradient nodes always did; the hue modes clamp `t` to 0–1.
 *  The sketch mirrors the hue modes with `blend(CHSV, CHSV, amount, dir)`
 *  (see `codegen/helpers/hueMixHelperCpp.ts`), so the two agree to a count or two. */
export function mixGradientColors(a: RGB, b: RGB, t: number, mode: GradientMixMode): RGB {
  if (mode === 'rgb') {
    return { r: Math.round(a.r * (1 - t) + b.r * t), g: Math.round(a.g * (1 - t) + b.g * t), b: Math.round(a.b * (1 - t) + b.b * t) }
  }
  const u = Math.max(0, Math.min(1, t))
  const ha = rgbToHsv(a), hb = rgbToHsv(b)
  const shortWay = (((hb.h - ha.h) + 540) % 360) - 180
  const shortest = shortWay === -180 ? 180 : shortWay
  let delta = shortest
  if (mode === 'hsvLong') delta = shortest === 0 ? 0 : (shortest > 0 ? shortest - 360 : shortest + 360)
  return hsv(ha.h + delta * u, ha.s + (hb.s - ha.s) * u, ha.v + (hb.v - ha.v) * u)
}

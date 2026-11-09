/**
 * Adjust Color on both sides: one colour taken apart on the preview's HSV
 * wheel, its hue turned, its saturation and brightness scaled, and put back
 * together. The C++ runs the same steps through the `_rgbHue`/`_rgbSat`/
 * `_rgbVal` and `_hsv` helpers (codegen/helpers/hsvHelperCpp.ts), which
 * mirror `rgbToHsv` here and `hsv` in ledColor.ts. It replaces the
 * RGB → HSV, Math, HSV → RGB chain that dimming or hue-rotating one colour
 * used to take.
 */
import { type RGB, hsv } from '../../state/palettes/ledColor'

/** The colour the node adjusts while nothing is wired into Color: #ff3080. */
export const ADJUST_COLOR_DEFAULT: Readonly<RGB> = { r: 255, g: 48, b: 128 }

/** Hue in degrees, saturation and value of a colour, as `_rgbHue`/`_rgbSat`/`_rgbVal` read it. */
export function rgbToHsv(c: RGB): { h: number; s: number; v: number } {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h: (h + 360) % 360, s: max > 0 ? d / max : 0, v: max }
}

const unit = (x: number) => Math.max(0, Math.min(1, x))

/** `c` with its hue turned by `hueShift` degrees and its saturation and brightness scaled, each held to 0–1. */
export function adjustColor(c: RGB, hueShift: number, saturation: number, brightness: number): RGB {
  const { h, s, v } = rgbToHsv(c)
  return hsv(h + hueShift, unit(s * saturation), unit(v * brightness))
}

/**
 * The same as C++ lines: `source` is the colour's CRGB expression, `out` the
 * output variable. Shared by the normal sketch and the control graph so both
 * emit the identical text.
 */
export function adjustColorCpp(id: string, out: string, source: string, hueShift: string, saturation: string, brightness: string): string[] {
  const c = `_adj_${id}`
  return [
    `  CRGB ${c} = ${source};`,
    `  CRGB ${out} = _hsv(_rgbHue(${c}) + (${hueShift}), constrain(_rgbSat(${c}) * (${saturation}), 0.0f, 1.0f), constrain(_rgbVal(${c}) * (${brightness}), 0.0f, 1.0f));`,
  ]
}

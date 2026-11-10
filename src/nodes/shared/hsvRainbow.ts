import type { RGB } from '../../state/palettes/ledColor'
import { scale8, scale8Video } from './lib8tion'

/*
 * FastLED's `hsv2rgb_rainbow`, the conversion a `CHSV` assigned to a `CRGB`
 * and `fill_rainbow` use, ported byte for byte from FastLED 3.10.9
 * (src/hsv2rgb.cpp.hpp, with its defaults Y1 = 1, Y2 = 0, G2 = 0, Gscale = 0
 * and FASTLED_SCALE8_FIXED). Its wheel is not the preview's `hsv()`: it widens
 * yellow (hue 64 is a deep yellow, not the spectrum's 90°), so a node whose
 * firmware look is FastLED's own rainbow draws through this in the preview.
 * Nodes that want the preview's wheel on the controller emit `_hsv` instead
 * (codegen/helpers/hsvHelperCpp.ts).
 */
export function hsv2rgbRainbow(hue: number, sat: number, val: number): RGB {
  const h = hue & 0xff, s = sat & 0xff
  let v = val & 0xff
  const offset8 = ((h & 0x1f) << 3) & 0xff
  const third = scale8(offset8, 85)
  const twothirds = scale8(offset8, 170)
  let r: number, g: number, b: number
  if (!(h & 0x80)) {
    if (!(h & 0x40)) {
      if (!(h & 0x20)) { r = 255 - third; g = third; b = 0 }
      else { r = 171; g = 85 + third; b = 0 }
    } else if (!(h & 0x20)) { r = 171 - twothirds; g = 170 + third; b = 0 }
    else { r = 0; g = 255 - third; b = third }
  } else if (!(h & 0x40)) {
    if (!(h & 0x20)) { r = 0; g = 171 - twothirds; b = 85 + twothirds }
    else { r = third; g = 0; b = 255 - third }
  } else if (!(h & 0x20)) { r = 85 + third; g = 0; b = 171 - third }
  else { r = 170 + third; g = 0; b = 85 - third }

  if (s !== 255) {
    if (s === 0) { r = 255; g = 255; b = 255 }
    else {
      const desat = scale8Video(255 - s, 255 - s)
      const satscale = 255 - desat
      r = (scale8(r, satscale) + desat) & 0xff
      g = (scale8(g, satscale) + desat) & 0xff
      b = (scale8(b, satscale) + desat) & 0xff
    }
  }
  if (v !== 255) {
    v = scale8Video(v, v)
    if (v === 0) { r = 0; g = 0; b = 0 }
    else { r = scale8(r, v); g = scale8(g, v); b = scale8(b, v) }
  }
  return { r, g, b }
}

/** `fill_rainbow`'s saturation: FastLED fills at 240, not full. */
export const FILL_RAINBOW_SAT = 240

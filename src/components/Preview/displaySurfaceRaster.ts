// Turning an evaluated display surface into RGBA pixels.
//
// The node bodies and the Hardware bench both draw what a panel shows, and
// they have to agree on what a lit OLED pixel looks like and how RGB565
// unpacks. One painter each, here, rather than a copy per view.

import { getPixel, type OledSurface } from '../../state/displays/oledSurface'
import { rgb565Components, type TftSurface } from '../../state/displays/tftSurface'

type Rgba = readonly [number, number, number, number]

/** The cold white a monochrome OLED pixel emits. */
export const OLED_LIT_RGBA: Rgba = [205, 238, 255, 255]

export function isOledSurface(value: unknown): value is OledSurface {
  if (!value || typeof value !== 'object') return false
  const surface = value as Partial<OledSurface>
  return Number.isInteger(surface.width) && Number.isInteger(surface.height)
    && surface.data instanceof Uint8Array
}

export function isTftSurface(value: unknown): value is TftSurface {
  if (!value || typeof value !== 'object') return false
  const surface = value as Partial<TftSurface>
  return Number.isInteger(surface.width) && Number.isInteger(surface.height)
    && surface.data instanceof Uint16Array
}

/**
 * Paint a 1-bit OLED surface into `image`, which must be its size. `off` is
 * what an unlit pixel shows: the node body paints the panel's own black, the
 * bench leaves it transparent so the rendered glass shows through.
 */
export function paintOledSurface(image: ImageData, surface: OledSurface, off: Rgba): void {
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const at = ((y * surface.width) + x) * 4
      const colour = getPixel(surface, x, y) ? OLED_LIT_RGBA : off
      image.data[at] = colour[0]
      image.data[at + 1] = colour[1]
      image.data[at + 2] = colour[2]
      image.data[at + 3] = colour[3]
    }
  }
}

/** Paint an RGB565 TFT surface into `image`, which must be its size. */
export function paintTftSurface(image: ImageData, surface: TftSurface): void {
  for (let i = 0; i < surface.data.length; i++) {
    const { r, g, b } = rgb565Components(surface.data[i])
    const at = i * 4
    image.data[at] = r
    image.data[at + 1] = g
    image.data[at + 2] = b
    image.data[at + 3] = 255
  }
}

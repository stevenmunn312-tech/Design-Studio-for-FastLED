export type RecordRasterStyle = 'leds' | 'pixels'

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

/**
 * Expand packed logical RGB LEDs into an opaque RGBA GIF frame without using
 * Canvas. The LED style is deliberately lightweight: a dark substrate, soft
 * colour spill, emitter disc, and hot white centre, all evaluated in one
 * linear output-pixel pass. This avoids thousands of drawImage/arc calls per
 * frame on large matrices while retaining the recognisable preview look.
 */
export function rasterizeRecordedFrame(
  rgb: Uint8ClampedArray,
  gridW: number,
  gridH: number,
  scale: number,
  style: RecordRasterStyle,
): Uint8ClampedArray {
  const outW = gridW * scale
  const outH = gridH * scale
  const rgba = new Uint8ClampedArray(outW * outH * 4)

  for (let y = 0; y < outH; y++) {
    const ledY = Math.floor(y / scale)
    const localY = ((y % scale) + 0.5) / scale - 0.5
    for (let x = 0; x < outW; x++) {
      const ledX = Math.floor(x / scale)
      const src = (ledY * gridW + ledX) * 3
      const r = rgb[src] ?? 0
      const g = rgb[src + 1] ?? 0
      const b = rgb[src + 2] ?? 0
      const dst = (y * outW + x) * 4

      if (style === 'pixels') {
        rgba[dst] = r
        rgba[dst + 1] = g
        rgba[dst + 2] = b
        rgba[dst + 3] = 255
        continue
      }

      const localX = ((x % scale) + 0.5) / scale - 0.5
      const distance = Math.hypot(localX, localY)
      const brightness = Math.max(r, g, b) / 255
      // Slightly brighter at the matrix centre, matching frameCanvas's radial
      // substrate without allocating a CanvasGradient for every frame.
      const nx = x / Math.max(1, outW - 1) - 0.5
      const ny = y / Math.max(1, outH - 1) - 0.46
      const substrate = Math.max(0, 1 - Math.hypot(nx, ny) / 0.72)
      let outR = 2 + substrate * 6
      let outG = 4 + substrate * 8
      let outB = 5 + substrate * 11

      if (brightness >= 0.012) {
        const spillRadius = 0.7 + brightness * 0.9
        const spill = Math.max(0, 1 - distance / spillRadius) ** 2 * (0.18 + brightness * 0.3)
        outR += r * spill
        outG += g * spill
        outB += b * spill

        const coreRadius = 0.26 + brightness * 0.21
        const core = Math.max(0, 1 - distance / coreRadius) ** 0.55 * (0.72 + brightness * 0.28)
        outR += r * core
        outG += g * core
        outB += b * core

        if (brightness > 0.66 && distance < 0.075) {
          const hot = (brightness - 0.66) * 1.5
          outR += (255 - outR) * hot
          outG += (255 - outG) * hot
          outB += (255 - outB) * hot
        }
      }

      rgba[dst] = clampByte(outR)
      rgba[dst + 1] = clampByte(outG)
      rgba[dst + 2] = clampByte(outB)
      rgba[dst + 3] = 255
    }
  }

  return rgba
}

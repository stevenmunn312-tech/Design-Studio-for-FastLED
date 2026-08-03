/**
 * Expand packed logical RGB LEDs into an opaque RGBA export frame: one flat
 * scale×scale block of the exact LED colour per pixel, no substrate and no
 * glow. This is the recorder's "Flat pixels" style — the honest one for
 * documentation and bug reports, where an added bloom would misrepresent what
 * the graph actually produced.
 *
 * The LED / diffused looks deliberately do *not* live here: they are rendered
 * by the preview's own renderers via recordRenderer.ts, so an export cannot
 * drift from what the on-screen matrix shows.
 */
export function expandFlatFrame(
  rgb: Uint8ClampedArray,
  gridW: number,
  gridH: number,
  scale: number,
): Uint8ClampedArray {
  const outW = gridW * scale
  const outH = gridH * scale
  const rgba = new Uint8ClampedArray(outW * outH * 4)

  for (let y = 0; y < outH; y++) {
    const ledY = Math.floor(y / scale)
    for (let x = 0; x < outW; x++) {
      const src = (ledY * gridW + Math.floor(x / scale)) * 3
      const dst = (y * outW + x) * 4
      rgba[dst] = rgb[src] ?? 0
      rgba[dst + 1] = rgb[src + 1] ?? 0
      rgba[dst + 2] = rgb[src + 2] ?? 0
      rgba[dst + 3] = 255
    }
  }

  return rgba
}

// The firmware half of `src/state/renderScale.ts`: bilinear upscale of a
// half-resolution render buffer into the physical LED array. Same tap rule as
// the preview's `routeFrame` (pixel centres aligned, edges clamped), so both
// sample the same source pixels with the same weights.

export interface UpscaleEmit {
  /** The render buffer, `srcW` x `srcH`, row-major. */
  src: string
  /** C++ expressions for the render and panel sizes (macros or literals). */
  srcW: string
  srcH: string
  dstW: string
  dstH: string
  /** The destination array and the index of pixel (_x, _y) within it. */
  leds: string
  dstIndex: string
  /** Statement run on the finished `_c` before it is stored, or null. */
  post?: string | null
  indent?: string
}

export function renderScaleUpscaleCpp(e: UpscaleEmit): string[] {
  const i = e.indent ?? '  '
  const mix = (ch: 'r' | 'g' | 'b') =>
    `(uint8_t)lroundf((_a.${ch} * (1.0f - _fx) + _b.${ch} * _fx) * (1.0f - _fy) + (_c0.${ch} * (1.0f - _fx) + _d.${ch} * _fx) * _fy)`
  return [
    `${i}for (int _y = 0; _y < ${e.dstH}; _y++) {`,
    `${i}  float _sy = constrain((_y + 0.5f) * ${e.srcH} / ${e.dstH} - 0.5f, 0.0f, (float)(${e.srcH} - 1));`,
    `${i}  int _y0 = (int)_sy, _y1 = min(_y0 + 1, (int)(${e.srcH}) - 1); float _fy = _sy - _y0;`,
    `${i}  for (int _x = 0; _x < ${e.dstW}; _x++) {`,
    `${i}    float _sx = constrain((_x + 0.5f) * ${e.srcW} / ${e.dstW} - 0.5f, 0.0f, (float)(${e.srcW} - 1));`,
    `${i}    int _x0 = (int)_sx, _x1 = min(_x0 + 1, (int)(${e.srcW}) - 1); float _fx = _sx - _x0;`,
    `${i}    CRGB _a = ${e.src}[_y0 * ${e.srcW} + _x0], _b = ${e.src}[_y0 * ${e.srcW} + _x1];`,
    `${i}    CRGB _c0 = ${e.src}[_y1 * ${e.srcW} + _x0], _d = ${e.src}[_y1 * ${e.srcW} + _x1];`,
    `${i}    CRGB _c(${mix('r')}, ${mix('g')}, ${mix('b')});`,
    ...(e.post ? [`${i}    ${e.post}`] : []),
    `${i}    ${e.leds}[${e.dstIndex}] = _c;`,
    `${i}  }`,
    `${i}}`,
  ]
}

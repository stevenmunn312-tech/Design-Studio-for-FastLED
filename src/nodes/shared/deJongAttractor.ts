// Formula Points' de Jong attractor presets, shared by the preview and the
// sketch so the two cannot draw a preset differently.
//
// x' = sin(a·y) − cos(b·x), y' = sin(c·x) − cos(d·y) stays inside [-2, 2] for
// any coefficients, but a preset need not use all of it. Swirl's b of −0.09
// keeps cos(b·x) near 1, so x never passes 0 and y never drops below −1:
// mapped over the full ±2 it filled the left half of the frame and the lower
// three quarters. Each preset therefore carries the extent its own orbit
// covers (measured over two million iterations from the seed point), and
// the drawing spans that extent with a small margin on every side.

export interface DeJongPreset {
  coeffs: readonly [number, number, number, number]
  x: readonly [number, number]
  y: readonly [number, number]
}

export const DE_JONG_PRESETS: Readonly<Record<string, DeJongPreset>> = {
  classic: { coeffs: [1.4, -2.3, 2.4, -2.1], x: [-2, 2], y: [-2, 2] },
  swirl: { coeffs: [-2.7, -0.09, -0.86, -2.2], x: [-2, 0.015], y: [-1, 1.985] },
  web: { coeffs: [-0.827, -1.637, 1.659, -0.943], x: [-1.609, 1.499], y: [-1.998, 1.097] },
}

/** Share of the frame left clear at each edge, so a splat at the extent is not clipped. */
export const DE_JONG_MARGIN = 0.03

/** A known preset name, or `classic` for anything else (the property travels in shared graphs). */
export function deJongPresetName(name: unknown): string {
  const key = String(name ?? 'classic')
  return Object.prototype.hasOwnProperty.call(DE_JONG_PRESETS, key) ? key : 'classic'
}

/** `unit = v * scale + offset` maps the axis extent onto [margin, 1 − margin]. */
export function deJongAxis([min, max]: readonly [number, number]): { scale: number; offset: number } {
  const scale = (1 - 2 * DE_JONG_MARGIN) / (max - min)
  return { scale, offset: DE_JONG_MARGIN - min * scale }
}

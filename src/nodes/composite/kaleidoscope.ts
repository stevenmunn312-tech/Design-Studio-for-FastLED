import { type Frame } from '../../state/palettes/ledColor'
import { DEFAULT_W, DEFAULT_H, buildFrame } from '../../state/evaluator/frames'
import { kaleidoSource } from '../shared/integerPatterns'

/** Kaleidoscope wedge count; fewer than two has nothing to mirror. */
export const KALEIDOSCOPE_SEGMENTS = { min: 2, max: 16 } as const

export function evalKaleidoscope(src: Frame, segments: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  // The sketch's integer kernel (shared/integerPatterns.ts).
  const wedge = Math.trunc(65536 / Math.max(KALEIDOSCOPE_SEGMENTS.min, Math.min(KALEIDOSCOPE_SEGMENTS.max, segments)))
  return buildFrame(W, H, (x, y) => {
      const i = kaleidoSource(x, y, W, H, wedge)
      return i < 0 ? { r: 0, g: 0, b: 0 } : { ...src[Math.trunc(i / W)][i % W] }
    })
}

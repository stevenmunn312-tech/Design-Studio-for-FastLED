import { type Frame } from '../../state/palettes/ledColor'
import { DEFAULT_W, DEFAULT_H, buildFrame } from '../../state/evaluator/frames'

/** Kaleidoscope wedge count; fewer than two has nothing to mirror. */
export const KALEIDOSCOPE_SEGMENTS = { min: 2, max: 16 } as const

export function evalKaleidoscope(src: Frame, segments: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const segAngle = (Math.PI * 2) / Math.max(KALEIDOSCOPE_SEGMENTS.min, Math.min(KALEIDOSCOPE_SEGMENTS.max, segments))
  return buildFrame(W, H, (x, y) => {
      const dx = x - cx, dy = y - cy
      const dist = Math.hypot(dx, dy)
      let angle = ((Math.atan2(dy, dx) % segAngle) + segAngle) % segAngle
      if (angle > segAngle / 2) angle = segAngle - angle
      const sx = Math.round(cx + dist * Math.cos(angle))
      const sy = Math.round(cy + dist * Math.sin(angle))
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) return { r: 0, g: 0, b: 0 }
      return { ...src[sy][sx] }
    })
}

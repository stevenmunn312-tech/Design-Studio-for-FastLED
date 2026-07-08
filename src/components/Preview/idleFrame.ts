import type { Frame } from '../../state/graphEvaluator'

// Reused output buffer — this runs every animation frame while the canvas has
// no signal, and it's consumed synchronously by the renderer, so one
// persistent buffer avoids reallocating gridW×gridH pixel objects per frame.
let buffer: Frame = []

// Diagnostic standby animation shown until a terminal receives a frame.
// Deliberately mostly-dark: it says "the matrix is alive" without competing
// with the user's actual pattern once a signal arrives.
export function idleFrame(tick: number, gridW: number, gridH: number): Frame {
  const t = tick / 60
  const sweepX = (t * 2.2) % (gridW + 6) - 3
  const probeY = Math.round((Math.sin(t * 0.7) * 0.38 + 0.5) * Math.max(0, gridH - 1))
  if (buffer.length !== gridH || (buffer[0]?.length ?? 0) !== gridW) {
    buffer = Array.from({ length: gridH }, () => Array.from({ length: gridW }, () => ({ r: 0, g: 0, b: 0 })))
  }
  for (let y = 0; y < gridH; y++) {
    const row = buffer[y]
    for (let x = 0; x < gridW; x++) {
      const distance = Math.abs(x - sweepX)
      const beam = Math.exp(-distance * 1.45)
      const wake = x < sweepX ? Math.exp(-(sweepX - x) * 0.34) : 0
      const guide = (x % Math.max(1, Math.round(gridW / 4)) === 0 || y % Math.max(1, Math.round(gridH / 4)) === 0) ? 1 : 0
      const probe = Math.abs(x - sweepX) < 0.65 && y === probeY ? 1 : 0
      const px = row[x]
      px.r = Math.min(255, Math.round(2 + guide * 2 + wake * 16 + probe * 176))
      px.g = Math.min(255, Math.round(4 + guide * 3 + beam * 62 + probe * 193))
      px.b = Math.min(255, Math.round(8 + guide * 5 + beam * 108 + wake * 34 + probe * 255))
    }
  }
  return buffer
}

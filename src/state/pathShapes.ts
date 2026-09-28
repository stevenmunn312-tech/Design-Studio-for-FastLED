/**
 * The closed curves Path traces, as a unit-scale point for a turn fraction
 * `t` (wrapped to 0..1). Fourier Epicycles samples the same curves, so the
 * two nodes draw the same heart. y points up.
 */
export function pathPoint(shape: string, t: number): { x: number; y: number } {
  const TAU = Math.PI * 2
  const ang = (((t % 1) + 1) % 1) * TAU
  switch (shape) {
    case 'heart': {
      const x = 16 * Math.sin(ang) ** 3 / 18
      const y = (13 * Math.cos(ang) - 5 * Math.cos(ang * 2) - 2 * Math.cos(ang * 3) - Math.cos(ang * 4)) / 18
      return { x, y }
    }
    case 'lissajous':
      return { x: Math.sin(ang + Math.PI / 2), y: Math.sin(ang * 2) }
    case 'rose': {
      const r = Math.cos(ang * 4)
      return { x: r * Math.cos(ang), y: r * Math.sin(ang) }
    }
    case 'circle':
    default:
      return { x: Math.cos(ang), y: Math.sin(ang) }
  }
}

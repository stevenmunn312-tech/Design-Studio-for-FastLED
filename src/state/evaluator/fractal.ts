// Fractal Field: escape-time and Newton fractals, one value per pixel. The
// preview calls `fractalSampler`; the C++ twin in nodes/field/codegen.ts
// repeats the same loop, so both use the constants below.

export const FRACTAL_TYPES = ['julia', 'mandelbrot', 'newton', 'burningShip'] as const
export type FractalType = typeof FRACTAL_TYPES[number]
export const fractalType = (v: unknown): FractalType =>
  (FRACTAL_TYPES as readonly string[]).includes(String(v)) ? (v as FractalType) : 'julia'

export const FRACTAL_ITERATIONS_MIN = 8
export const FRACTAL_ITERATIONS_MAX = 64
export const FRACTAL_ZOOM_MIN = 0.25
export const FRACTAL_ZOOM_MAX = 64
/** Half the shorter canvas side spans this many units of the complex plane at zoom 1. */
export const FRACTAL_VIEW = 1.5
/** An orbit has escaped once |z|² passes this. */
export const FRACTAL_BAILOUT2 = 16
/** Newton stops once z is this close (squared) to a root of z³ − 1. */
export const NEWTON_TOLERANCE2 = 1e-6
export const NEWTON_ROOT_Y = 0.8660254037844386

/** Where zoom 1 is centred, so the interesting part of each set is in view at 0, 0. */
export const FRACTAL_ORIGIN: Record<FractalType, readonly [number, number]> = {
  julia: [0, 0],
  mandelbrot: [-0.5, 0],
  newton: [0, 0],
  burningShip: [-0.5, -0.5],
}

export const fractalIterations = (v: unknown) =>
  Math.max(FRACTAL_ITERATIONS_MIN, Math.min(FRACTAL_ITERATIONS_MAX, Math.floor(Number(v) || FRACTAL_ITERATIONS_MIN)))
export const fractalZoom = (v: number) =>
  Math.max(FRACTAL_ZOOM_MIN, Math.min(FRACTAL_ZOOM_MAX, Number.isFinite(v) ? v : 1))

export interface FractalParams {
  type: FractalType
  cRe: number
  cIm: number
  zoom: number
  centerX: number
  centerY: number
  /** Degrees. */
  spin: number
  iterations: number
  smooth: boolean
}

/** Value 0–1 for pixel (x, y) of a W×H canvas; 0 is inside the set. */
export function fractalSampler(p: FractalParams, W: number, H: number): (x: number, y: number) => number {
  const half = Math.min(W, H) / 2
  const scale = FRACTAL_VIEW / fractalZoom(p.zoom) / half
  const a = (p.spin * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a)
  const [ox, oy] = FRACTAL_ORIGIN[p.type]
  const cx = ox + p.centerX, cy = oy + p.centerY
  const iters = fractalIterations(p.iterations)
  return (x, y) => {
    const u = (x + 0.5 - W / 2) * scale, v = (y + 0.5 - H / 2) * scale
    const zr0 = cx + u * co - v * si, zi0 = cy + u * si + v * co
    if (p.type === 'newton') return newton(zr0, zi0, iters)
    const julia = p.type === 'julia'
    let zr = julia ? zr0 : 0, zi = julia ? zi0 : 0
    const cr = julia ? p.cRe : zr0, ci = julia ? p.cIm : zi0
    const ship = p.type === 'burningShip'
    for (let n = 1; n <= iters; n++) {
      if (ship) { zr = Math.abs(zr); zi = Math.abs(zi) }
      const t = zr * zr - zi * zi + cr
      zi = 2 * zr * zi + ci
      zr = t
      const m2 = zr * zr + zi * zi
      if (m2 > FRACTAL_BAILOUT2) {
        const mu = p.smooth ? n + 1 - Math.log2(Math.log2(Math.sqrt(m2))) : n
        return Math.max(0, Math.min(1, mu / iters))
      }
    }
    return 0
  }
}

/** Newton's method on z³ − 1: which root it settles on, and how quickly. */
function newton(zr0: number, zi0: number, iters: number): number {
  let zr = zr0, zi = zi0
  for (let n = 1; n <= iters; n++) {
    const z2r = zr * zr - zi * zi, z2i = 2 * zr * zi
    const z3r = z2r * zr - z2i * zi, z3i = z2r * zi + z2i * zr
    const nr = z3r - 1, ni = z3i, dr = 3 * z2r, di = 3 * z2i
    const den = dr * dr + di * di
    if (den < 1e-12) return 0
    zr -= (nr * dr + ni * di) / den
    zi -= (ni * dr - nr * di) / den
    const d0 = (zr - 1) * (zr - 1) + zi * zi
    const d1 = (zr + 0.5) * (zr + 0.5) + (zi - NEWTON_ROOT_Y) * (zi - NEWTON_ROOT_Y)
    const d2 = (zr + 0.5) * (zr + 0.5) + (zi + NEWTON_ROOT_Y) * (zi + NEWTON_ROOT_Y)
    const root = d0 < NEWTON_TOLERANCE2 ? 0 : d1 < NEWTON_TOLERANCE2 ? 1 : d2 < NEWTON_TOLERANCE2 ? 2 : -1
    if (root >= 0) return (root + 1 - n / iters) / 3
  }
  return 0
}

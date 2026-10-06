// Stam's stable fluids at LED resolution, on a periodic (wrapping) canvas: no
// walls, so a plume that leaves one edge comes back in at the other, which suits
// a ring or a cylinder. The C++ twin in codegen/helpers/fluidHelperCpp.ts repeats the
// same passes in the same order; keep them together.

export const FLUID_ITERATIONS_MIN = 4
export const FLUID_ITERATIONS_MAX = 20
/** Velocity is cells per frame; anything faster is clamped so the solver stays finite. */
export const FLUID_VMAX = 4
/** Dye is clamped here after each step; the output field clamps to 1. */
export const FLUID_DYE_MAX = 4
/** Cells per frame of velocity a force field adds at its extremes. */
export const FLUID_FORCE_GAIN = 0.3
/** Upward velocity per unit of dye, per frame: the plume's buoyancy. */
export const FLUID_BUOYANCY_GAIN = 0.1
/** Upward kick an injection gives the flow, per unit of amount. */
export const FLUID_INJECT_VY = 0.3
/** Outward speed of a puff. */
export const FLUID_PUFF_SPEED = 0.6
/** Velocity maps to a 0–1 field as 0.5 + v * this, so 0.5 is still air. */
export const FLUID_VEL_OUT = 0.25

export const fluidIterations = (v: unknown) =>
  Math.max(FLUID_ITERATIONS_MIN, Math.min(FLUID_ITERATIONS_MAX, Math.floor(Number(v) || FLUID_ITERATIONS_MIN)))

export interface FluidState {
  w: number; h: number
  u: Float32Array; v: Float32Array; u0: Float32Array; v0: Float32Array
  d: Float32Array; d0: Float32Array
  prevTrigger: boolean
}

export function makeFluid(w: number, h: number): FluidState {
  const n = w * h
  return {
    w, h, u: new Float32Array(n), v: new Float32Array(n), u0: new Float32Array(n), v0: new Float32Array(n),
    d: new Float32Array(n), d0: new Float32Array(n), prevTrigger: false,
  }
}

/** Gauss–Seidel relaxation of x = (x0 + a·(four neighbours)) / c, in place, wrapping. */
function solve(x: Float32Array, x0: Float32Array, W: number, H: number, a: number, c: number, iters: number) {
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < H; y++) {
      const up = ((y - 1 + H) % H) * W, dn = ((y + 1) % H) * W, row = y * W
      for (let xx = 0; xx < W; xx++) {
        const l = (xx - 1 + W) % W, r = (xx + 1) % W
        x[row + xx] = (x0[row + xx] + a * (x[row + l] + x[row + r] + x[up + xx] + x[dn + xx])) / c
      }
    }
  }
}

/** Make the velocity divergence-free: subtract the gradient of the pressure that would cancel it. */
function project(u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array, W: number, H: number, iters: number) {
  for (let y = 0; y < H; y++) {
    const up = ((y - 1 + H) % H) * W, dn = ((y + 1) % H) * W, row = y * W
    for (let x = 0; x < W; x++) {
      const l = (x - 1 + W) % W, r = (x + 1) % W
      div[row + x] = -0.5 * (u[row + r] - u[row + l] + v[dn + x] - v[up + x])
      p[row + x] = 0
    }
  }
  solve(p, div, W, H, 1, 4, iters)
  for (let y = 0; y < H; y++) {
    const up = ((y - 1 + H) % H) * W, dn = ((y + 1) % H) * W, row = y * W
    for (let x = 0; x < W; x++) {
      const l = (x - 1 + W) % W, r = (x + 1) % W
      u[row + x] -= 0.5 * (p[row + r] - p[row + l])
      v[row + x] -= 0.5 * (p[dn + x] - p[up + x])
    }
  }
}

/** Semi-Lagrangian advection: each cell takes the value found one step upstream, bilinear, wrapping. */
function advect(dst: Float32Array, src: Float32Array, u: Float32Array, v: Float32Array, W: number, H: number) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      let px = x - u[i], py = y - v[i]
      px -= Math.floor(px / W) * W
      py -= Math.floor(py / H) * H
      const x0 = Math.min(W - 1, Math.floor(px)), y0 = Math.min(H - 1, Math.floor(py))
      const sx = px - x0, sy = py - y0
      const x1 = (x0 + 1) % W, y1 = (y0 + 1) % H
      dst[i] = (1 - sx) * ((1 - sy) * src[y0 * W + x0] + sy * src[y1 * W + x0]) + sx * ((1 - sy) * src[y0 * W + x1] + sy * src[y1 * W + x1])
    }
  }
}

/** One frame of the solver, after the sources are in. */
export function fluidStep(s: FluidState, iters: number, viscosity: number, diffusion: number, dissipation: number): void {
  const { w: W, h: H, u, v, u0, v0, d, d0 } = s
  const n = W * H, visc = Math.max(0, Math.min(1, viscosity)), diff = Math.max(0, Math.min(1, diffusion))
  const keep = 1 - Math.max(0, Math.min(1, dissipation))
  if (visc > 0) {
    u0.set(u); v0.set(v)
    solve(u, u0, W, H, visc, 1 + 4 * visc, iters)
    solve(v, v0, W, H, visc, 1 + 4 * visc, iters)
  }
  project(u, v, u0, v0, W, H, iters)
  u0.set(u); v0.set(v)
  advect(u, u0, u0, v0, W, H)
  advect(v, v0, u0, v0, W, H)
  project(u, v, u0, v0, W, H, iters)
  for (let i = 0; i < n; i++) {
    u[i] = Math.max(-FLUID_VMAX, Math.min(FLUID_VMAX, u[i]))
    v[i] = Math.max(-FLUID_VMAX, Math.min(FLUID_VMAX, v[i]))
  }
  if (diff > 0) {
    d0.set(d)
    solve(d, d0, W, H, diff, 1 + 4 * diff, iters)
  }
  d0.set(d)
  advect(d, d0, u, v, W, H)
  for (let i = 0; i < n; i++) d[i] = Math.min(FLUID_DYE_MAX, d[i] * keep)
}

/** Half-width of the injection blob, in cells. */
export const fluidRadius = (W: number, H: number) => Math.max(1.5, Math.min(W, H) * 0.08)

/** Add `amount` of dye with a Gaussian blob at normalised (px, py), pushing the flow upward. */
export function fluidInject(s: FluidState, px: number, py: number, amount: number): void {
  const { w: W, h: H } = s
  const cx = Math.max(0, Math.min(1, px)) * (W - 1), cy = Math.max(0, Math.min(1, py)) * (H - 1)
  const R = fluidRadius(W, H), a = Math.max(0, amount)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy, g = Math.exp(-(dx * dx + dy * dy) / (R * R))
      const i = y * W + x
      s.d[i] += a * g
      s.v[i] -= FLUID_INJECT_VY * a * g
    }
  }
}

/** A puff: a burst of dye and an outward kick, double the radius of a steady injection. */
export function fluidPuff(s: FluidState, px: number, py: number): void {
  const { w: W, h: H } = s
  const cx = Math.max(0, Math.min(1, px)) * (W - 1), cy = Math.max(0, Math.min(1, py)) * (H - 1)
  const R = fluidRadius(W, H) * 2
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy), g = Math.exp(-(dist * dist) / (R * R))
      const i = y * W + x, k = dist > 1e-6 ? FLUID_PUFF_SPEED * g / dist : 0
      s.d[i] += g
      s.u[i] += dx * k
      s.v[i] += dy * k
    }
  }
}

/** Stir with per-pixel force fields centred on 0.5, and lift dye by `buoyancy`. */
export function fluidForces(s: FluidState, fx: Float32Array | null, fy: Float32Array | null, buoyancy: number): void {
  const n = s.w * s.h, b = Math.max(0, Math.min(1, buoyancy)) * FLUID_BUOYANCY_GAIN
  for (let i = 0; i < n; i++) {
    if (fx) s.u[i] += (fx[i] - 0.5) * 2 * FLUID_FORCE_GAIN
    if (fy) s.v[i] += (fy[i] - 0.5) * 2 * FLUID_FORCE_GAIN
    s.v[i] -= b * s.d[i]
  }
}

/** Total dye, for conservation tests. */
export function fluidDye(s: FluidState): number {
  let sum = 0
  for (let i = 0; i < s.d.length; i++) sum += s.d[i]
  return sum
}

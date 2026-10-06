import { worleyHash } from './random'

/**
 * Jonathan McCabe's multi-scale Turing patterns, shared by the Turing Field
 * preview and read by its emitter. `src/codegen/helpers/turingHelperCpp.ts` is the
 * firmware twin of `turingStep`; keep the two in the same order of operations.
 *
 * Each scale compares an activator (box mean at radius r) with an inhibitor
 * (box mean at 2r). Every pixel follows the scale where the two agree most
 * closely, stepping toward the activator's side of it, and the whole state is
 * then stretched back to -1..1. Box means come from one toroidal summed-area
 * table, so a scale costs the same at radius 1 as at radius 64.
 */

export const TURING_SCALES_MIN = 2
export const TURING_SCALES_MAX = 5
export const TURING_BASE_RADIUS_MIN = 1
export const TURING_BASE_RADIUS_MAX = 8
export const TURING_STEP_MIN = 0.01
export const TURING_STEP_MAX = 0.2
export const TURING_ITERATIONS_MAX = 4
/** A pixel whose closest scale differs by less than this does not move. */
export const TURING_DEAD_ZONE = 1e-6
/** Renormalisation is skipped for a state flatter than this. */
export const TURING_FLAT_RANGE = 1e-6

export function turingScaleCount(value: unknown): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(TURING_SCALES_MIN, Math.min(TURING_SCALES_MAX, n)) : 3
}

export function turingBaseRadius(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(TURING_BASE_RADIUS_MIN, Math.min(TURING_BASE_RADIUS_MAX, n)) : 1
}

export function turingIterations(value: number): number {
  return Math.max(1, Math.min(TURING_ITERATIONS_MAX, Math.floor(value)))
}

export function turingStepSize(value: number): number {
  return Math.max(TURING_STEP_MIN, Math.min(TURING_STEP_MAX, value))
}

/**
 * Activator radius per scale, finest first: `baseRadius * 2^k`, rounded.
 * Both properties are baked, so the emitter writes this list as integers.
 */
export function turingRadii(scalesValue: unknown, baseRadiusValue: unknown): number[] {
  const scales = turingScaleCount(scalesValue)
  const base = turingBaseRadius(baseRadiusValue)
  return Array.from({ length: scales }, (_, k) => Math.max(1, Math.round(base * 2 ** k)))
}

/**
 * The step a pixel takes when scale `k` of `scales` wins. Coarser scales take
 * larger steps, as in McCabe's own settings, so large structure forms first
 * and finer scales refine it.
 */
export function turingScaleStep(stepSize: number, k: number, scales: number): number {
  return f32(f32(f32(stepSize) * (k + 1)) / scales)
}

/** Starting state for one pixel, -1..1, exact in float32 on both sides. */
export function turingSeedValue(x: number, y: number, epoch: number, seed: number): number {
  return worleyHash(x + epoch * 31, y - epoch * 17, seed) * 2 - 1
}

export function turingSeed(a: Float32Array, W: number, H: number, epoch: number, seed: number): void {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = turingSeedValue(x, y, epoch, seed)
}

/** Entries in the summed-area table `turingStep` needs as scratch. */
export function turingPrefixLength(W: number, H: number): number {
  return (W + 1) * (H + 1)
}

// The step rounds to float32 after every operation, in the C++ helper's
// order. Scale choice turns on near-ties, and a double-precision preview
// picked differently from the sketch within ten frames on a 64×64 panel.
const f32 = Math.fround

/**
 * Sum of the periodic extension of the canvas over [0, X) × [0, Y). Radii are
 * clamped below half the canvas, so X and Y stay inside (-size, 2·size) and a
 * box wraps at most once per side. Each `q` is -1, 0 or 1, so the products
 * are exact and only the sums round.
 */
function periodicPrefix(P: Float32Array, W: number, H: number, X: number, Y: number): number {
  const S = W + 1
  const qx = X < 0 ? -1 : X >= W ? 1 : 0
  const qy = Y < 0 ? -1 : Y >= H ? 1 : 0
  const rx = X - qx * W, ry = Y - qy * H
  return f32(f32(f32(qx * qy * P[H * S + W] + qx * P[ry * S + W]) + qy * P[H * S + rx]) + P[ry * S + rx])
}

/** Mean of the box of half-widths `rx`, `ry` round (x, y), from `turingPrefix`'s table. */
export function turingBoxMean(P: Float32Array, W: number, H: number, x: number, y: number, rx: number, ry: number): number {
  const sum = f32(f32(f32(periodicPrefix(P, W, H, x + rx + 1, y + ry + 1)
    - periodicPrefix(P, W, H, x - rx, y + ry + 1))
    - periodicPrefix(P, W, H, x + rx + 1, y - ry))
    + periodicPrefix(P, W, H, x - rx, y - ry))
  return f32(sum / ((2 * rx + 1) * (2 * ry + 1)))
}

/**
 * Fill `P` with the summed-area table of `a - mean` and return the mean. Box
 * differences ignore a constant, and centred sums stay small, so float
 * rounding stays small on a 64×64 panel too and a flat state gives an exact
 * zero instead of rounding noise for the renormalisation to amplify.
 */
export function turingPrefix(a: Float32Array, P: Float32Array, W: number, H: number): number {
  const S = W + 1, N = W * H
  let mean = 0
  for (let i = 0; i < N; i++) mean = f32(mean + a[i])
  mean = f32(mean / N)
  for (let x = 0; x <= W; x++) P[x] = 0
  for (let y = 0; y < H; y++) {
    let row = 0
    P[(y + 1) * S] = 0
    for (let x = 0; x < W; x++) {
      row = f32(row + f32(a[y * W + x] - mean))
      P[(y + 1) * S + x + 1] = P[y * S + x + 1] + row
    }
  }
  return mean
}

/**
 * One multi-scale iteration of `a` in place. `P` is scratch of
 * `turingPrefixLength(W, H)` entries. A scale whose activator and inhibitor
 * clamp to the same box on a small canvas compares a box with itself, which
 * would always win and freeze the pixel, so it is skipped.
 */
export function turingStep(
  a: Float32Array,
  P: Float32Array,
  W: number,
  H: number,
  radii: readonly number[],
  stepSize: number,
): void {
  const N = W * H
  const deadZone = f32(TURING_DEAD_ZONE)
  turingPrefix(a, P, W, H)

  const maxRx = (W - 1) >> 1, maxRy = (H - 1) >> 1
  const scales = radii.length
  let lo = Infinity, hi = -Infinity
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = Infinity, delta = 0
    for (let k = 0; k < scales; k++) {
      const r = radii[k]
      const arx = Math.min(r, maxRx), ary = Math.min(r, maxRy)
      const irx = Math.min(2 * r, maxRx), iry = Math.min(2 * r, maxRy)
      if (arx === irx && ary === iry) continue
      const d = f32(turingBoxMean(P, W, H, x, y, arx, ary) - turingBoxMean(P, W, H, x, y, irx, iry))
      const variation = Math.abs(d)
      if (variation < best) {
        best = variation
        const amount = turingScaleStep(stepSize, k, scales)
        delta = d > deadZone ? amount : d < -deadZone ? -amount : 0
      }
    }
    const i = y * W + x
    a[i] += delta
    if (a[i] < lo) lo = a[i]
    if (a[i] > hi) hi = a[i]
  }

  // (a - mid) * scale is (a - lo) * scale - 1 with no add after the multiply,
  // so a compiler that fuses multiply-adds (-ffp-contract=fast, GCC's default
  // for the Arduino cores) cannot round it differently from the preview.
  // range * 0.5 is exact, so a fused lo + range * 0.5 rounds the same too.
  const range = f32(hi - lo)
  if (range > f32(TURING_FLAT_RANGE)) {
    const scale = f32(2 / range), mid = f32(lo + range * 0.5)
    for (let i = 0; i < N; i++) a[i] = f32(a[i] - mid) * scale
  }
}

/** The node's output for one state value: -1..1 onto 0..1. */
export function turingFieldValue(value: number): number {
  return Math.max(0, Math.min(1, (value + 1) * 0.5))
}

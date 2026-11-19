/**
 * The Noise node's scalar fields, one per `noiseType`, shared by the Noise
 * pattern node and Field Noise's non-default types so a type draws the same
 * field wherever it is chosen. The sketch's twin is `noiseFieldCpp.ts`; keep
 * the two in step.
 */
import { speedPhase } from '../shared/speedClock'
import { clamp01, DEFAULT_W, DEFAULT_H } from '../../state/evaluator/frames'
import { allocField } from '../../state/evaluator/memory'
import { wrapXBlend } from '../../state/evaluator/wrapX'
import { worleyValue, type WorleyMode } from '../../state/evaluator/noiseShape'
import { _snoise2, seedOffset, worleyHash } from '../../state/evaluator/random'
import type { Field } from '../../state/evaluator/types'
import type { NoiseType } from './noiseTypes'

// Dispatch for the bundled `Noise` node — `noiseType` picks the algorithm.
// All variants share the (speed, scale)→field signature, then the node maps
// that field through a palette for its normal `frame` output. Keep the cases
// in sync with NOISE_TYPES (noiseTypes.ts) and the `Noise` emitter. Every
// type holds its value at 0 and 1 rather than wrapping it round, which cut
// seams through palettes that do not join end to end, such as lava.
/** The knobs only some noise types read. */
export interface NoiseVariantOpts { worley: WorleyMode; octaves: number; frequency: number; orientation: number }

export function evalNoiseFieldByType(key: string, noiseType: NoiseType, speed: number, scale: number, t: number, W: number, H: number, seed: number, wrapX: boolean, opts: NoiseVariantOpts): Field {
  if (!wrapX) return evalNoiseFieldVariant(key, noiseType, speed, scale, t, W, H, seed, 0, opts)
  // Seamless left/right join: the plain field blended with itself shifted a
  // canvas width (see state/evaluator/wrapX.ts).
  const plain = evalNoiseFieldVariant(key, noiseType, speed, scale, t, W, H, seed, 0, opts)
  return wrapXBlend(plain, evalNoiseFieldVariant(key, noiseType, speed, scale, t, W, H, seed, W, opts), W, H)
}

function evalNoiseFieldVariant(key: string, noiseType: NoiseType, speed: number, scale: number, t: number, W: number, H: number, seed: number, xo: number, opts: NoiseVariantOpts): Field {
  const ts = t + seedOffset(seed, 0)
  switch (noiseType) {
    // Gabor's seed reshuffles its cells rather than shifting time.
    case 'gabor':   return evalGaborField(key, speed, scale, opts.frequency, opts.orientation, t, W, H, seed, xo)
    case 'noise4d': return evalNoise4DField(key, speed, scale, ts, W, H, xo)
    case 'worley':  return evalWorleyField(key, speed, scale, ts, W, H, xo, opts.worley)
    case 'plasma':  return evalPlasmaFractalField(key, speed, scale, ts, W, H, xo)
    case 'fbm':     return evalFbmField(key, speed, scale, opts.octaves, ts, W, H, xo)
  }
}

// Looping "4D" noise: animate around a circle in two hidden dimensions so the
// pattern returns to its starting point every cycle. The sketch runs the same
// octaves through its `_snoise2` twin (codegen/helpers/simplexHelperCpp.ts).
function evalNoise4DField(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, xo = 0): Field {
  const ang = speedPhase(key, t, speed) * Math.PI * 2
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        const ox = Math.cos(ang + oct * 0.9) * 0.8
        const oy = Math.sin(ang + oct * 1.1) * 0.8
        const a = _snoise2(x * freq + ox, y * freq + oy)
        const b = _snoise2(x * freq + oy * 0.7 + 11.3, y * freq + ox * 0.7 - 7.1)
        v += amp * (a * 0.65 + b * 0.35)
        amp *= 0.5; freq *= 2
      }
      out[y * W + x - xo] = clamp01(v * 0.5 + 0.5)
    }
  }
  return out
}

// Worley (cellular) noise: distance to the nearest animated feature point,
// coloured through a palette. Feature points jitter on a circle over time.
function evalWorleyField(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, xo = 0, mode: WorleyMode = 'f1'): Field {
  const ph = speedPhase(key, t, speed)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      const px = x * scale, py = y * scale
      const xi = Math.floor(px), yi = Math.floor(py)
      let f1 = Infinity, f2 = Infinity
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const cx = xi + di, cy = yi + dj
          const hh = worleyHash(cx, cy)
          const fx = cx + 0.5 + 0.45 * Math.sin(ph + hh * 6.2831)
          const fy = cy + 0.5 + 0.45 * Math.cos(ph * 1.1 + hh * 6.2831)
          const d = Math.hypot(px - fx, py - fy)
          if (d < f1) { f2 = f1; f1 = d } else if (d < f2) f2 = d
        }
      out[y * W + x - xo] = worleyValue(mode, f1, f2)
    }
  }
  return out
}

/**
 * A Gabor cell's two hashes: its kernel phase and position come from the
 * first, its sign and position from the second. The seed reshuffles both
 * through the hash, the same `_worleyHash(_cx,_cy,seed)` calls the sketch
 * makes; the preview once used `seededHash`, which the sketch cannot compute.
 */
export function gaborCellHashes(cx: number, cy: number, seed: number): [number, number] {
  return [worleyHash(cx, cy, seed), worleyHash(cx + 31, cy - 17, seed)]
}

// Gabor noise: sparse-convolution noise summing one Gaussian-windowed cosine
// (Gabor) kernel per grid cell. `orientation` fixes the band direction (the
// anisotropic variant) and `frequency` the band spacing; phase animates over
// time. The summed kernels can overshoot 0–1, so the field holds its ends.
function evalGaborField(key: string, speed: number, scale: number, frequency: number, orientation: number, t: number, W: number, H: number, seed: number, xo: number): Field {
  const omega = (orientation * Math.PI) / 180
  const cosO = Math.cos(omega), sinO = Math.sin(omega)
  const TAU = Math.PI * 2
  const ph = speedPhase(key, t, speed)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      const px = x * scale, py = y * scale
      const xi = Math.floor(px), yi = Math.floor(py)
      let v = 0
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const cx = xi + di, cy = yi + dj
          const [h, h2] = gaborCellHashes(cx, cy, seed)
          const fx = cx + 0.5 + (h - 0.5)
          const fy = cy + 0.5 + (h2 - 0.5)
          const dx = px - fx, dy = py - fy
          const gauss = Math.exp(-2.5 * (dx * dx + dy * dy))
          const proj = dx * cosO + dy * sinO
          const w = h2 < 0.5 ? 1 : -1
          v += w * gauss * Math.cos(TAU * frequency * proj + ph + h * TAU)
        }
      out[y * W + x - xo] = clamp01(v * 0.5 + 0.5)
    }
  }
  return out
}

// Fractal (fBm) noise: sum simplex octaves at doubling frequency / halving
// amplitude for a detailed, cloud-like field.
function evalFbmField(key: string, speed: number, scale: number, octaves: number, t: number, W: number, H: number, xo: number): Field {
  const z = speedPhase(key, t, speed) * 0.15
  const oct = Math.max(1, Math.min(6, Math.floor(octaves)))
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      let v = 0, amp = 0.5, freq = scale, norm = 0
      for (let o = 0; o < oct; o++) {
        v += amp * _snoise2(x * freq + z, y * freq - z * 0.5)
        norm += amp; amp *= 0.5; freq *= 2
      }
      out[y * W + x - xo] = clamp01((v / norm) * 0.5 + 0.5)
    }
  }
  return out
}


// Plasma blended with fractal (simplex) noise for an organic flowing field.
// The sum averages 0, so it is centred on the palette's middle and held at
// its ends: wrapped from 0, as it once was, every zero crossing cut a seam.
function evalPlasmaFractalField(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, xo = 0): Field {
  const ph = speedPhase(key, t, speed)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      let v = Math.sin(x * 0.2 + ph) + Math.sin(y * 0.25 + ph * 0.8) + Math.sin((x + y) * 0.15 + ph * 0.6)
      let amp = 1, freq = scale, fn = 0
      for (let o = 0; o < 3; o++) { fn += amp * _snoise2(x * freq + ph * 0.1, y * freq); amp *= 0.5; freq *= 2 }
      v += fn * 2.5
      out[y * W + x - xo] = clamp01(v * 0.15 + 0.5)
    }
  }
  return out
}

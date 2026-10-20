import { juggleDotCount, JUGGLE_COUNT } from './juggle'
import { SPIRAL_ARMS } from './limits'
import {
  BREATHE_BPM, CHASE_DRIFT, CHASE_SPACING, breatheCurve, breatheEnvelope, chaseSpacing, wipePalettePosition, wipeReversed,
} from './classics1d'
import { denormRate, NOISE_SPEED_MAX, NOISE_SCALE_MAX, SPEED_MAX, SCALE_MAX } from '../shared/speedRange'
import { speedPhase } from '../shared/speedClock'
import {
  burstFrame, burstPixel, pacificaFrame, pacificaPixel, plasmaFrame, spiralFrame, spiralPixel, plasmaIndex, prideFrame, pridePixel, twinkleFrame, twinklePixel, whitecap,
} from '../shared/integerPatterns'
import { scale8, scale8Video } from '../shared/lib8tion'
import { type Frame, hsv, type Palette, samplePalette, type RGB } from '../../state/palettes/ledColor'
import {
  DEFAULT_W,
  DEFAULT_H,
  buildFrame,
  clamp01,
  sparkState,
  rawBlankFrame,
  scaleRgb,
  addRgb,
  evalFieldToFrame,
  blankFrame,
} from '../../state/evaluator/frames'
import { allocField, instanceState } from '../../state/evaluator/memory'
import { RAIN_FLICKER_HZ, RAIN_SPAWN, RAIN_STEP, rainDirection, rainGeometry, rainIndex } from '../../state/evaluator/digitalRain'
import { hexToRgb } from '../../state/palettes/customPalette'
import {
  candleColor, candleMode, classicHash, heartbeatEnvelope, heartbeatPhase, stepLightning, sunriseColor, sunriseMode, sunriseProgress,
  tvColor, tvLayout, type LightningState,
} from '../../state/evaluator/classics'
import { wrapXBlend } from '../../state/evaluator/wrapX'
import { noiseShape, shapeNoise, worleyMode, worleyValue, type WorleyMode } from '../../state/evaluator/noiseShape'
import {
  seededRandom,
  seededRngState,
  seedOffset,
  _snoise2,
  worleyHash,
  normalizedSeed,
} from '../../state/evaluator/random'
import type { Field, NodeEvaluators } from '../../state/evaluator/types'

// FastLED fill_rainbow: a scrolling hue sweep across the strip (hue in 0–255
// units, +deltaHue per LED, animated by `start`). Index order matches the
// buffer's [y*W+x] layout so the preview lines up with the firmware.
function evalRainbow(start: number, deltaHue: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const hue = start + (y * W + x) * deltaHue
      return hsv((((hue % 256) + 256) % 256) / 256 * 360, 1, 1)
    })
}

// ── Pattern evaluators ────────────────────────────────────────────────────────
function evalPlasma(key: string, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  // The sketch's integer kernel (shared/integerPatterns.ts): four summed
  // sin16 waves to a palette index v*45 + t*20, wrapping as a uint8_t does.
  const frame = plasmaFrame(speedPhase(key, t, speed), t)
  return buildFrame(W, H, (x, y) => samplePalette(palette, plasmaIndex(x, y, W, H, frame) / 256))
}

// Homage to Mark Kriegsman's Pride2015 — a shifting full-spectrum rainbow with
// a breathing brightness wave along the strip. Same evocative-formula approach
// as Plasma above (identical trig on the preview and firmware side), not a
// literal port of the original's 16-bit fixed-point beatsin88 arithmetic.
// With a palette wired it becomes Kriegsman's colorwaves: the same hue sweep and
// brightness wave, read through the palette instead of the colour wheel.
function evalPride2015(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, palette: Palette | null = null): Frame {
  const frame = prideFrame(speedPhase(key, t, speed), scale)
  const out: Frame = []
  let i = 0
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    for (let x = 0; x < W; x++) {
      const { hue, bri } = pridePixel(i, frame)
      if (palette) {
        const c = samplePalette(palette, hue / 256)
        row.push({ r: scale8(c.r, bri), g: scale8(c.g, bri), b: scale8(c.b, bri) })
      } else row.push(hsv(hue / 256 * 360, 0.9, bri / 255))
      i++
    }
    out.push(row)
  }
  return out
}

// Homage to the FastLED "Pacifica" ocean-wave demo — several scrolling sine
// wave layers through an ocean palette, with a whitecap sparkle where a
// faster secondary wave crests. Same evocative-formula approach as Plasma,
// not a literal port of Pacifica's palette-blend/deepen/whitecap pipeline.
function evalPacifica(key: string, speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const frame = pacificaFrame(speedPhase(key, t, speed), scale)
  return buildFrame(W, H, (x, y) => {
      const { n, w } = pacificaPixel(x, y, frame)
      const c = samplePalette(palette, n / 256)
      return w ? { r: whitecap(c.r, w), g: whitecap(c.g, w), b: whitecap(c.b, w) } : c
    })
}

// Homage to Mark Kriegsman's TwinkleFox — every pixel twinkles on its own
// deterministic schedule, coloured from a palette. Same evocative-formula
// approach as Pride2015/Pacifica (identical maths on both sides), not a literal
// port of the original's PRNG16 walk. `density` blends from sparse, sharp
// sparkles (low) to most pixels lit (high) by softening the brightness curve.
function evalTwinkleFox(key: string, speed: number, density: number, t: number, palette: Palette, seed = 0, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const frame = twinkleFrame(speedPhase(key, t, speed), density)
  const out: Frame = []
  let i = 0
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    for (let x = 0; x < W; x++) {
      const { color, bri } = twinklePixel(i + seed * 131, frame)
      const base = samplePalette(palette, color / 256)
      row.push({ r: scale8Video(base.r, bri), g: scale8Video(base.g, bri), b: scale8Video(base.b, bri) })
      i++
    }
    out.push(row)
  }
  return out
}

function evalScanner(
  key: string, speed: number, width: number, fade: number, axis: string, t: number, palette: Palette,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const horizontal = axis !== 'vertical'
  const span = Math.max(1, horizontal ? W : H)
  const phase = (speedPhase(key, t, speed) % 2 + 2) % 2
  const travel = phase <= 1 ? phase : 2 - phase
  const pos = travel * Math.max(0, span - 1)
  const core = Math.max(0.5, Number.isFinite(width) ? width * 0.5 : 1)
  const tail = core + clamp01(fade) * Math.max(1, span * 0.35)
  const tailDen = Math.max(1e-6, tail - core)
  const base = samplePalette(palette, travel)

  return buildFrame(W, H, (x, y) => {
    const coord = horizontal ? x : y
    const dist = Math.abs(coord - pos)
    let v = dist <= core ? 1 : Math.max(0, 1 - (dist - core) / tailDen)
    v *= v
    return {
      r: Math.round(base.r * v),
      g: Math.round(base.g * v),
      b: Math.round(base.b * v),
    }
  })
}

function evalConfetti(
  nodeId: string, speed: number, density: number, fade: number, t: number, palette: Palette, seed = 0,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let state = sparkState.get(nodeId)
  if (!state || state.w !== W || state.h !== H) {
    state = { frame: rawBlankFrame(W, H), w: W, h: H }
    sparkState.set(nodeId, state)
  }

  const frame = state.frame
  const retention = Math.max(0, Math.min(1, 1 - fade))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = frame[y][x]
      const faded = scaleRgb(px, retention)
      px.r = faded.r; px.g = faded.g; px.b = faded.b
    }
  }

  const area = W * H
  const amount = clamp01(density)
  const motion = Math.max(0, speed)
  let spawnCount = Math.round(amount * (0.08 + motion * 0.3) * Math.max(1, Math.sqrt(area)))
  if (spawnCount < 1 && amount * motion > 0.08) spawnCount = 1
  const hueDrift = speedPhase(nodeId, t, motion) * 0.08

  const rnd = () => seededRandom(`${nodeId}:confetti`, seed)
  for (let i = 0; i < spawnCount; i++) {
    const x = Math.floor(rnd() * W)
    const y = Math.floor(rnd() * H)
    const v = ((rnd() + hueDrift) % 1 + 1) % 1
    const spark = samplePalette(palette, v)
    const px = frame[y][x]
    const sum = addRgb(px, spark)
    px.r = sum.r; px.g = sum.g; px.b = sum.b
  }

  return frame
}

function evalJuggle(
  nodeId: string, speed: number, count: number, fade: number, t: number, palette: Palette, seed = 0,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let state = sparkState.get(nodeId)
  if (!state || state.w !== W || state.h !== H) {
    state = { frame: rawBlankFrame(W, H), w: W, h: H }
    sparkState.set(nodeId, state)
  }

  const frame = state.frame
  const retention = Math.max(0, Math.min(1, 1 - fade))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = frame[y][x]
      const faded = scaleRgb(px, retention)
      px.r = faded.r; px.g = faded.g; px.b = faded.b
    }
  }

  const dots = juggleDotCount(count)
  const laneY = (i: number) =>
    dots <= 1 ? Math.round((H - 1) / 2) : Math.round(((i + 0.5) * H) / dots - 0.5)
  const addDot = (x: number, y: number, color: RGB, strength: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H || strength <= 0) return
    const px = frame[y][x]
    const sum = addRgb(px, scaleRgb(color, strength))
    px.r = sum.r; px.g = sum.g; px.b = sum.b
  }

  const ph = speedPhase(nodeId, t, speed)
  for (let i = 0; i < dots; i++) {
    const phase = seed ? seedOffset(seed, i) : 0
    const travel = Math.sin(ph * (2.5 + i * 0.35) + i * 0.9 + phase) * 0.5 + 0.5
    const x = Math.round(travel * (W - 1))
    const y = laneY(i)
    const pulse = 0.75 + 0.25 * Math.sin(ph * 3 + i + phase)
    const base = samplePalette(palette, (travel * 0.35 + i / dots) % 1)
    const dot = scaleRgb(base, pulse)
    addDot(x, y, dot, 1)
    addDot(x - 1, y, dot, 0.35)
    addDot(x + 1, y, dot, 0.35)
    addDot(x, y - 1, dot, 0.18)
    addDot(x, y + 1, dot, 0.18)
  }

  return frame
}

function evalSineField(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, xo = 0): Field {
  const ph = speedPhase(key, t, speed)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * Math.sin(x * freq + ph + oct * 1.7) * Math.cos(y * freq * 1.3 + ph * 0.8 + oct * 2.3)
        amp *= 0.5; freq *= 2.1
      }
      out[y * W + x - xo] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

function evalRadialBurst(key: string, speed: number, rings: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  // The sketch's integer kernel (shared/integerPatterns.ts): palette across
  // the radius, ring brightness from the burst wave.
  const frame = burstFrame(W, H, Math.max(1, Math.min(32, rings)), speedPhase(key, t, speed))
  return buildFrame(W, H, (x, y) => {
      const { index, bri } = burstPixel(x, y, W, H, frame)
      const c = samplePalette(palette, index / 256)
      return { r: scale8(c.r, bri), g: scale8(c.g, bri), b: scale8(c.b, bri) }
    })
}

function evalSpiral(key: string, speed: number, arms: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  // The sketch's integer kernel (shared/integerPatterns.ts).
  const frame = spiralFrame(W, H, arms, speedPhase(key, t, speed), t)
  return buildFrame(W, H, (x, y) => {
      const { index, bri } = spiralPixel(x, y, W, H, frame)
      const c = samplePalette(palette, index / 256)
      return { r: scale8(c.r, bri), g: scale8(c.g, bri), b: scale8(c.b, bri) }
    })
}

function wrap01(v: number): number {
  return ((v % 1) + 1) % 1
}

// Dispatch for the bundled `Noise` node — `noiseType` picks the algorithm.
// All variants share the (speed, scale)→field signature, then the node maps
// that field through a palette for its normal `frame` output. Keep the cases
// in sync with PROPERTY_META.noiseType and cppGenerator's `Noise` case.
/** The knobs only some noise types read. */
interface NoiseVariantOpts { worley: WorleyMode; octaves: number; frequency: number; orientation: number }

function evalNoiseFieldByType(key: string, noiseType: string, speed: number, scale: number, t: number, W: number, H: number, seed: number, wrapX: boolean, opts: NoiseVariantOpts): Field {
  if (!wrapX) return evalNoiseFieldVariant(key, noiseType, speed, scale, t, W, H, seed, 0, opts)
  // Seamless left/right join: the plain field blended with itself shifted a
  // canvas width (see state/evaluator/wrapX.ts).
  const plain = evalNoiseFieldVariant(key, noiseType, speed, scale, t, W, H, seed, 0, opts)
  return wrapXBlend(plain, evalNoiseFieldVariant(key, noiseType, speed, scale, t, W, H, seed, W, opts), W, H)
}

function evalNoiseFieldVariant(key: string, noiseType: string, speed: number, scale: number, t: number, W: number, H: number, seed: number, xo: number, opts: NoiseVariantOpts): Field {
  const ts = t + seedOffset(seed, 0)
  switch (noiseType) {
    case 'fbm':     return evalFbmField(key, speed, scale, opts.octaves, ts, W, H, xo)
    // Gabor's seed reshuffles its cells rather than shifting time.
    case 'gabor':   return evalGaborField(key, speed, scale, opts.frequency, opts.orientation, t, W, H, seed, xo)
    case 'simplex': return evalSimplex2DField(key, speed, scale, ts, W, H, xo)
    case 'noise3d': return evalNoise3DField(key, speed, scale, ts, W, H, xo)
    case 'noise4d': return evalNoise4DField(key, speed, scale, ts, W, H, xo)
    case 'worley':  return evalWorleyField(key, speed, scale, ts, W, H, xo, opts.worley)
    case 'plasma':  return evalPlasmaFractalField(key, speed, scale, ts, W, H, xo)
    case 'sine':    return evalSineField(key, speed, scale, ts, W, H, xo)
    case 'field':
    default:        return evalNoiseFieldRaw(key, speed, scale, ts, W, H, xo)
  }
}

function evalNoiseFieldRaw(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, xo = 0): Field {
  const ph = speedPhase(key, t, speed)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      const v = (Math.sin(x * scale * 0.5 + ph) +
                 Math.cos(y * scale * 0.5 + ph * 0.7)) / 2
      out[y * W + x - xo] = Math.max(0, Math.min(1, (v + 1) / 2))
    }
  }
  return out
}

function evalSimplex2DField(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, xo = 0): Field {
  const ph = speedPhase(key, t, speed)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 4; oct++) {
        v += amp * _snoise2(x * freq + ph * 0.13, y * freq + ph * 0.1)
        amp *= 0.5; freq *= 2
      }
      out[y * W + x - xo] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

function evalNoise3DField(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, xo = 0): Field {
  // 3D via two orthogonal 2D slices animated along the z (time) axis
  const ph = speedPhase(key, t, speed)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      const z = ph * 0.08
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * (_snoise2(x * freq + z * 0.37, y * freq) * 0.6 +
                    _snoise2(x * freq * 0.9, y * freq + z * 0.61) * 0.4)
        amp *= 0.5; freq *= 2.1
      }
      out[y * W + x - xo] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

// Looping "4D" noise approximation for the browser preview: animate around a
// circle in two hidden dimensions so the pattern returns to its starting point
// every cycle, matching the firmware variant's circular z/t path through
// FastLED's real inoise16(x, y, z, t).
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
      out[y * W + x - xo] = wrap01(v * 0.5 + 0.5)
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

// Metaballs: several moving charges; each pixel's field is the summed inverse-
// square influence, mapped smoothly to a palette (lava-lamp blobs).
function evalBlobs(key: string, speed: number, scale: number, count: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const n = Math.max(1, Math.min(6, Math.floor(count)))
  const r2 = (scale * Math.min(W, H)) ** 2
  const ph = speedPhase(key, t, speed)
  const bx: number[] = [], by: number[] = []
  for (let i = 0; i < n; i++) {
    bx.push(W * (0.5 + 0.4 * Math.sin(ph * (0.7 + i * 0.13) + i * 1.7)))
    by.push(H * (0.5 + 0.4 * Math.cos(ph * (0.6 + i * 0.17) + i * 2.3)))
  }
  return buildFrame(W, H, (x, y) => {
      let f = 0
      for (let i = 0; i < n; i++) { const dx = x - bx[i], dy = y - by[i]; f += r2 / (dx * dx + dy * dy + 1) }
      return samplePalette(palette, f / (f + 1))
    })
}

// Plasma blended with fractal (simplex) noise for an organic flowing field.
function evalPlasmaFractalField(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, xo = 0): Field {
  const ph = speedPhase(key, t, speed)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      let v = Math.sin(x * 0.2 + ph) + Math.sin(y * 0.25 + ph * 0.8) + Math.sin((x + y) * 0.15 + ph * 0.6)
      let amp = 1, freq = scale, fn = 0
      for (let o = 0; o < 3; o++) { fn += amp * _snoise2(x * freq + ph * 0.1, y * freq); amp *= 0.5; freq *= 2 }
      v += fn * 2.5
      out[y * W + x - xo] = wrap01(v * 0.15)
    }
  }
  return out
}

const CORE_GENERATIVE_EVALUATORS: NodeEvaluators = {
  // Bundled noise generators (NoiseField / Simplex2D / Noise3D / Noise4D /
  // Worley / PlasmaFractal / Sine 2D / fBm / Gabor). All share the same scalar-field core; the
  // node exposes that raw `field` output and also maps it through a palette
  // to its normal `frame` output. Keep in sync with PROPERTY_META.noiseType
  // and the `Noise` case in cppGenerator.ts.
  Noise({ num, pal, t, W, H, stateKey }, id, props) {
    const noiseType = String(props.noiseType ?? 'field')
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), NOISE_SPEED_MAX[noiseType] ?? 1)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.5), NOISE_SCALE_MAX[noiseType] ?? 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    const field = evalNoiseFieldByType(stateKey(id), noiseType, speed, scale, t, W, H, normalizedSeed(props.seed), props.wrapX === true, {
      worley: worleyMode(props.worleyMode),
      octaves: num(id, 'octaves', props, 'octaves', 4),
      frequency: num(id, 'frequency', props, 'frequency', 1.2),
      orientation: num(id, 'orientation', props, 'orientation', 45),
    })
    const shape = noiseShape(props.noiseShape)
    if (shape !== 'plain') for (let i = 0; i < field.length; i++) field[i] = shapeNoise(field[i], shape)
    return { field, frame: evalFieldToFrame(field, palette, 1, W, H) }
  },
  Plasma({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Plasma)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalPlasma(stateKey(id), speed, t, palette, W, H) }
  },
  Rainbow({ num, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.3), SPEED_MAX.Rainbow)
    const deltaHue = Math.max(0, Math.min(255, num(id, 'deltaHue', props, 'deltaHue', 6)))
    return { frame: evalRainbow(speedPhase(stateKey(id), t, speed), deltaHue, W, H) }
  },
  Pride2015({ input, num, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.4), SPEED_MAX.Pride2015)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.4), SCALE_MAX.Pride2015)
    const wired = input(id, 'paletteIn', null)
    const palette = Array.isArray(wired) ? wired as RGB[] : typeof wired === 'string' ? wired : null
    return { frame: evalPride2015(stateKey(id), speed, scale, t, W, H, palette) }
  },
  Pacifica({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.35), SPEED_MAX.Pacifica)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.5), SCALE_MAX.Pacifica)
    const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
    return { frame: evalPacifica(stateKey(id), speed, scale, t, palette, W, H) }
  },
  TwinkleFox({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.TwinkleFox)
    const density = num(id, 'density', props, 'density', 0.5)
    const palette = pal(id, 'paletteIn', props, 'palette', 'party')
    return { frame: evalTwinkleFox(stateKey(id), speed, density, t, palette, normalizedSeed(props.seed), W, H) }
  },
  Scanner({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.45), SPEED_MAX.Scanner)
    const width = Math.max(1, num(id, 'width', props, 'width', 2))
    const fade = num(id, 'fade', props, 'fade', 0.6)
    const axis = String(props.axis ?? 'horizontal')
    const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
    return { frame: evalScanner(stateKey(id), speed, width, fade, axis, t, palette, W, H) }
  },
  TheaterChase({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.TheaterChase)
    const spacing = chaseSpacing(num(id, 'spacing', props, 'spacing', CHASE_SPACING.default))
    const horizontal = String(props.axis ?? 'horizontal') !== 'vertical'
    const reverse = String(props.direction ?? 'forward') === 'reverse'
    const palette = pal(id, 'paletteIn', props, 'palette', 'party')
    const phase = speedPhase(stateKey(id), t, speed)
    const step = Math.floor(phase)
    const span = Math.max(1, horizontal ? W : H)
    return { frame: buildFrame(W, H, (x, y) => {
      const coord = horizontal ? x : y
      const k = reverse ? coord + step : coord - step
      if (((k % spacing) + spacing) % spacing !== 0) return { r: 0, g: 0, b: 0 }
      const v = coord / span + phase * CHASE_DRIFT
      return samplePalette(palette, ((v % 1) + 1) % 1)
    }) }
  },
  ColorWipe({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.4), SPEED_MAX.ColorWipe)
    const horizontal = String(props.axis ?? 'horizontal') !== 'vertical'
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    const phase = speedPhase(stateKey(id), t, speed)
    const n = Math.floor(phase)
    const span = Math.max(1, horizontal ? W : H)
    const filled = Math.floor((phase - n) * span)
    const fresh = samplePalette(palette, wipePalettePosition(n))
    const previous: RGB = n > 0 ? samplePalette(palette, wipePalettePosition(n - 1)) : { r: 0, g: 0, b: 0 }
    const reversed = wipeReversed(props.direction, n)
    return { frame: buildFrame(W, H, (x, y) => {
      const coord = horizontal ? x : y
      const i = reversed ? span - 1 - coord : coord
      return i < filled ? fresh : previous
    }) }
  },
  Breathe({ num, pal, t, W, H, stateKey }, id, props) {
    const bpm = Math.max(BREATHE_BPM.min, Math.min(BREATHE_BPM.max, num(id, 'bpm', props, 'bpm', BREATHE_BPM.default)))
    const minLevel = clamp01(num(id, 'minLevel', props, 'minLevel', 0.05))
    const env = breatheEnvelope(breatheCurve(props.curve), speedPhase(stateKey(id), t, bpm / 60))
    const level = minLevel + (1 - minLevel) * env
    const c = scaleRgb(samplePalette(pal(id, 'paletteIn', props, 'palette', 'ocean'), env), level)
    return { frame: buildFrame(W, H, () => c) }
  },
  Confetti({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.45), SPEED_MAX.Confetti)
    const density = num(id, 'density', props, 'density', 0.45)
    const fade = num(id, 'fade', props, 'fade', 0.28)
    const palette = pal(id, 'paletteIn', props, 'palette', 'party')
    return { frame: evalConfetti(stateKey(id), speed, density, fade, t, palette, normalizedSeed(props.seed), W, H) }
  },
  Juggle({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Juggle)
    const count = num(id, 'count', props, 'count', JUGGLE_COUNT.default)
    const fade = num(id, 'fade', props, 'fade', 0.22)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalJuggle(stateKey(id), speed, count, fade, t, palette, normalizedSeed(props.seed), W, H) }
  },
  RadialBurst({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.RadialBurst)
    const rings = num(id, 'arms', props, 'arms', 8)
    const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
    return { frame: evalRadialBurst(stateKey(id), speed, rings, palette, t, W, H) }
  },
  Spiral({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Spiral)
    const arms = Math.max(SPIRAL_ARMS.min, Math.min(SPIRAL_ARMS.max, num(id, 'arms', props, 'arms', 2)))
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalSpiral(stateKey(id), speed, arms, palette, t, W, H) }
  },
  Blobs({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.3), SPEED_MAX.Blobs)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.44), SCALE_MAX.Blobs)
    const count = num(id, 'count', props, 'count', 3)
    const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
    return { frame: evalBlobs(stateKey(id), speed, scale, count, t, palette, W, H) }
  },
}

// ── Classics: Candle, Lightning, Heartbeat, Sunrise, TV Simulator ─────────────
const lightningState = instanceState('lightningState', new Map<string, LightningState>())
interface RainState { w: number; h: number; dir: string; seed: number; head: Float32Array; spd: Float32Array; len: Float32Array }
const rainState = instanceState('rainState', new Map<string, RainState>())

function evalDigitalRain(
  nodeId: string, dir: ReturnType<typeof rainDirection>, density: number, speed: number, tail: number, flicker: number,
  t: number, palette: Palette, W: number, H: number, seed: number,
): Frame {
  const { lanes, along } = rainGeometry(dir, W, H)
  let s = rainState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.dir !== dir || s.seed !== seed) {
    seededRngState.delete(`${nodeId}:rain`)
    // Every lane starts idle: its head is past the far end with its whole tail.
    s = { w: W, h: H, dir, seed, head: new Float32Array(lanes).fill(along + 1000), spd: new Float32Array(lanes), len: new Float32Array(lanes).fill(1) }
    rainState.set(nodeId, s)
  }
  const rnd = () => seededRandom(`${nodeId}:rain`, seed)
  const dens = clamp01(density), fl = clamp01(flicker), tl = Math.max(2, tail)
  for (let l = 0; l < lanes; l++) {
    if (s.head[l] >= along + s.len[l]) {
      if (rnd() < dens * RAIN_SPAWN) { s.head[l] = 0; s.spd[l] = 0.25 + rnd() * 0.75; s.len[l] = Math.max(2, tl * (0.5 + rnd() * 0.5)) }
    } else s.head[l] += s.spd[l] * Math.max(0, speed) * RAIN_STEP
  }
  const frame = blankFrame(W, H)
  const bucket = Math.floor(t * RAIN_FLICKER_HZ)
  for (let l = 0; l < lanes; l++) {
    if (s.head[l] >= along + s.len[l]) continue
    for (let pos = 0; pos < along; pos++) {
      const d = s.head[l] - pos
      if (d < 0 || d >= s.len[l]) continue
      const b = 1 - d / s.len[l]
      const v = b * (1 - fl * classicHash(l * 131 + pos * 17 + bucket * 7))
      const c = samplePalette(palette, b)
      const at = rainIndex(dir, W, H, l, pos)
      frame[Math.floor(at / W)][at % W] = { r: Math.floor(c.r * v), g: Math.floor(c.g * v), b: Math.floor(c.b * v) }
    }
  }
  return frame
}

const scaled = (c: RGB, v: number): RGB => ({ r: Math.floor(c.r * v), g: Math.floor(c.g * v), b: Math.floor(c.b * v) })

const CLASSIC_EVALUATORS: NodeEvaluators = {
  Candle({ num, t, W, H }, id, props) {
    const flicker = num(id, 'flicker', props, 'flicker', 0.6)
    const warmth = num(id, 'warmth', props, 'warmth', 0.5)
    if (candleMode(props.mode) === 'single') {
      const c = candleColor(t, 0, flicker, warmth)
      return { frame: buildFrame(W, H, () => c) }
    }
    return { frame: buildFrame(W, H, (x, y) => candleColor(t, (y * W + x + 1) * 977, flicker, warmth)) }
  },
  Lightning({ input, num, t, W, H, stateKey }, id, props) {
    const key = stateKey(id)
    let s = lightningState.get(key)
    if (!s) { s = { nextAt: -1, start: -1e9, id: 0, prev: false, last: -Infinity }; lightningState.set(key, s) }
    const level = stepLightning(s, t, num(id, 'rate', props, 'rate', 6), Boolean(input(id, 'trigger', false)))
    const v = Math.max(0, Math.min(1, num(id, 'intensity', props, 'intensity', 1))) * level
    const c = scaled(hexToRgb(String(props.color ?? '#cfe0ff')), v)
    return { frame: buildFrame(W, H, () => c) }
  },
  Heartbeat({ num, pal, t, W, H }, id, props) {
    const env = heartbeatEnvelope(heartbeatPhase(t, num(id, 'bpm', props, 'bpm', 72)))
    const strength = Math.max(0, Math.min(1, num(id, 'strength', props, 'strength', 0.8)))
    const c = scaled(samplePalette(pal(id, 'paletteIn', props, 'palette', 'lava'), env), 1 - strength * (1 - env))
    return { frame: buildFrame(W, H, () => c) }
  },
  Sunrise({ num, t, W, H }, id, props) {
    const mode = sunriseMode(props.mode)
    const p = sunriseProgress(mode, t, num(id, 'start', props, 'start', 0), num(id, 'duration', props, 'duration', 30), num(id, 'progress', props, 'progress', 0))
    const c = sunriseColor(p)
    return { frame: buildFrame(W, H, () => c) }
  },
  DigitalRain({ num, pal, t, W, H, stateKey }, id, props) {
    return {
      frame: evalDigitalRain(
        stateKey(id), rainDirection(props.direction), num(id, 'density', props, 'density', 0.5),
        denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.DigitalRain), num(id, 'tailLength', props, 'tailLength', 8),
        num(id, 'flicker', props, 'flicker', 0.3), t, pal(id, 'paletteIn', props, 'palette', 'forest'), W, H, normalizedSeed(props.seed),
      ),
    }
  },
  TVSimulator({ num, t, W, H }, id, props) {
    const cutRate = Math.max(0.05, num(id, 'cutRate', props, 'cutRate', 0.5))
    const brightness = num(id, 'brightness', props, 'brightness', 0.8)
    const slot = Math.floor(t * cutRate)
    const { cols, rows } = tvLayout(slot)
    return {
      frame: buildFrame(W, H, (x, y) => {
        const blk = Math.min(rows - 1, Math.floor((y * rows) / H)) * cols + Math.min(cols - 1, Math.floor((x * cols) / W))
        return tvColor(t, slot, blk, brightness)
      }),
    }
  },
}

export const GENERATIVE_EVALUATORS: NodeEvaluators = { ...CORE_GENERATIVE_EVALUATORS, ...CLASSIC_EVALUATORS }

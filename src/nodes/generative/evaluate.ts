import { juggleDotCount, JUGGLE_COUNT } from '../../state/juggle'
import { denormRate, NOISE_SPEED_MAX, NOISE_SCALE_MAX, SPEED_MAX, SCALE_MAX } from '../../state/speedRange'
import { type Frame, hsv, type Palette, samplePalette, type RGB } from '../../state/ledColor'
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
import { allocField } from '../../state/evaluator/memory'
import {
  seededRandom,
  seedOffset,
  _snoise2,
  worleyHash,
  seededHash,
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
function evalPlasma(speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const v = Math.sin(x / 3 + t * speed)
              + Math.sin(y / 3 + t * speed * 0.8)
              + Math.sin((x + y) / 5 + t * speed * 0.6)
              + Math.sin(Math.hypot(x - W / 2, y - H / 2) / 3 + t * speed * 0.5)
      // Same shifting phase the old hue sweep used (v*45 + t*20), now mapped
      // through the palette — /256 so it wraps the same way ColorFromPalette's
      // uint8_t index does in codegen. The default 'rainbow' palette keeps the
      // classic full-spectrum look.
      return samplePalette(palette, (v * 45 + t * 20) / 256)
    })
}

// Homage to Mark Kriegsman's Pride2015 — a shifting full-spectrum rainbow with
// a breathing brightness wave along the strip. Same evocative-formula approach
// as Plasma above (identical trig on the preview and firmware side), not a
// literal port of the original's 16-bit fixed-point beatsin88 arithmetic.
function evalPride2015(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const out: Frame = []
  let i = 0
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    for (let x = 0; x < W; x++) {
      const hue = (i * scale * 6 + t * speed * 40) % 360
      const briTheta = i * scale * 3 + t * speed * 15
      const bri = 0.35 + 0.65 * (Math.sin(briTheta) * 0.5 + 0.5)
      row.push(hsv(hue, 0.9, bri))
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
function evalPacifica(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const v = Math.sin(x * 0.3 * scale + t * speed)
              + Math.sin((x * 0.15 * scale - y * 0.1 * scale) + t * speed * 0.6) * 0.7
              + Math.sin((x + y) * 0.08 * scale + t * speed * 1.3) * 0.5
      const n = Math.max(0, Math.min(1, v / 2.2 * 0.5 + 0.5))
      const c = samplePalette(palette, n)
      const foam = Math.sin(x * 0.9 * scale + y * 0.4 * scale + t * speed * 2.2)
      if (foam > 0.85) {
        const w = (foam - 0.85) / 0.15
        return {
          r: Math.round(c.r + (255 - c.r) * w),
          g: Math.round(c.g + (255 - c.g) * w),
          b: Math.round(c.b + (255 - c.b) * w),
        }
      }
      return c
    })
}

// Deterministic per-index hash → [0,1). Shared verbatim with the codegen so a
// pixel twinkles identically on the preview and on hardware.
function twinkleHash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

// Homage to Mark Kriegsman's TwinkleFox — every pixel twinkles on its own
// deterministic schedule, coloured from a palette. Same evocative-formula
// approach as Pride2015/Pacifica (identical maths on both sides), not a literal
// port of the original's PRNG16 walk. `density` blends from sparse, sharp
// sparkles (low) to most pixels lit (high) by softening the brightness curve.
function evalTwinkleFox(speed: number, density: number, t: number, palette: Palette, seed = 0, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const exponent = 6 - 5 * Math.max(0, Math.min(1, density))
  const out: Frame = []
  let i = 0
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    for (let x = 0; x < W; x++) {
      const si = i + seed * 131
      const phase = twinkleHash(si)
      const rate = 0.5 + twinkleHash(si + 11)
      const colorIdx = twinkleHash(si + 23)
      const cycle = (t * speed * rate + phase) % 1
      const tri = 1 - Math.abs(2 * cycle - 1)   // 0 → 1 → 0 across the cycle
      const bri = Math.pow(tri, exponent)
      const base = samplePalette(palette, colorIdx)
      row.push({
        r: Math.round(base.r * bri),
        g: Math.round(base.g * bri),
        b: Math.round(base.b * bri),
      })
      i++
    }
    out.push(row)
  }
  return out
}

function evalScanner(
  speed: number, width: number, fade: number, axis: string, t: number, palette: Palette,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const horizontal = axis !== 'vertical'
  const span = Math.max(1, horizontal ? W : H)
  const phase = ((t * speed) % 2 + 2) % 2
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
  const hueDrift = t * motion * 0.08

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

  for (let i = 0; i < dots; i++) {
    const phase = seed ? seedOffset(seed, i) : 0
    const travel = Math.sin(t * speed * (2.5 + i * 0.35) + i * 0.9 + phase) * 0.5 + 0.5
    const x = Math.round(travel * (W - 1))
    const y = laneY(i)
    const pulse = 0.75 + 0.25 * Math.sin(t * speed * 3 + i + phase)
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

function evalSineField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * Math.sin(x * freq + t * speed + oct * 1.7) * Math.cos(y * freq * 1.3 + t * speed * 0.8 + oct * 2.3)
        amp *= 0.5; freq *= 2.1
      }
      out[y * W + x] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

function evalRadialBurst(speed: number, rings: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxD = Math.hypot(cx, cy)
  const density = Math.max(1, Math.min(32, rings))
  return buildFrame(W, H, (x, y) => {
      const dist = Math.hypot(x - cx, y - cy) / maxD
      const wave = (Math.sin((dist * density - t * speed * 3) * Math.PI) + 1) / 2
      // Palette across the radius, ring brightness from the burst wave.
      return scaleRgb(samplePalette(palette, dist), wave)
    })
}

function evalSpiral(speed: number, arms: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxD = Math.hypot(cx, cy)
  return buildFrame(W, H, (x, y) => {
      const dx = x - cx, dy = y - cy
      const dist = Math.hypot(dx, dy) / maxD
      const angle = Math.atan2(dy, dx)
      const spiral = (angle + dist * Math.PI * 4 - t * speed * Math.PI) * arms
      const v = (Math.sin(spiral) + 1) / 2
      return scaleRgb(samplePalette(palette, dist + t * 0.083), v * 0.9)
    })
}

function evalKaleidoscope(src: Frame, segments: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const segAngle = (Math.PI * 2) / Math.max(2, segments)
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

function wrap01(v: number): number {
  return ((v % 1) + 1) % 1
}

// Dispatch for the bundled `Noise` node — `noiseType` picks the algorithm.
// All variants share the (speed, scale)→field signature, then the node maps
// that field through a palette for its normal `frame` output. Keep the cases
// in sync with PROPERTY_META.noiseType and cppGenerator's `Noise` case.
function evalNoiseFieldByType(noiseType: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H, seed = 0): Field {
  const ts = t + seedOffset(seed, 0)
  switch (noiseType) {
    case 'simplex': return evalSimplex2DField(speed, scale, ts, W, H)
    case 'noise3d': return evalNoise3DField(speed, scale, ts, W, H)
    case 'noise4d': return evalNoise4DField(speed, scale, ts, W, H)
    case 'worley':  return evalWorleyField(speed, scale, ts, W, H)
    case 'plasma':  return evalPlasmaFractalField(speed, scale, ts, W, H)
    case 'sine':    return evalSineField(speed, scale, ts, W, H)
    case 'field':
    default:        return evalNoiseFieldRaw(speed, scale, ts, W, H)
  }
}

function evalNoiseFieldRaw(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = (Math.sin(x * scale * 0.5 + t * speed) +
                 Math.cos(y * scale * 0.5 + t * speed * 0.7)) / 2
      out[y * W + x] = Math.max(0, Math.min(1, (v + 1) / 2))
    }
  }
  return out
}

function evalSimplex2DField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 4; oct++) {
        v += amp * _snoise2(x * freq + t * speed * 0.13, y * freq + t * speed * 0.1)
        amp *= 0.5; freq *= 2
      }
      out[y * W + x] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

function evalNoise3DField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  // 3D via two orthogonal 2D slices animated along the z (time) axis
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = t * speed * 0.08
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * (_snoise2(x * freq + z * 0.37, y * freq) * 0.6 +
                    _snoise2(x * freq * 0.9, y * freq + z * 0.61) * 0.4)
        amp *= 0.5; freq *= 2.1
      }
      out[y * W + x] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

// Looping "4D" noise approximation for the browser preview: animate around a
// circle in two hidden dimensions so the pattern returns to its starting point
// every cycle, matching the firmware variant's circular z/t path through
// FastLED's real inoise16(x, y, z, t).
function evalNoise4DField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const ang = t * speed * Math.PI * 2
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        const ox = Math.cos(ang + oct * 0.9) * 0.8
        const oy = Math.sin(ang + oct * 1.1) * 0.8
        const a = _snoise2(x * freq + ox, y * freq + oy)
        const b = _snoise2(x * freq + oy * 0.7 + 11.3, y * freq + ox * 0.7 - 7.1)
        v += amp * (a * 0.65 + b * 0.35)
        amp *= 0.5; freq *= 2
      }
      out[y * W + x] = wrap01(v * 0.5 + 0.5)
    }
  }
  return out
}

// Worley (cellular) noise: distance to the nearest animated feature point,
// coloured through a palette. Feature points jitter on a circle over time.
function evalWorleyField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x * scale, py = y * scale
      const xi = Math.floor(px), yi = Math.floor(py)
      let f1 = Infinity
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const cx = xi + di, cy = yi + dj
          const hh = worleyHash(cx, cy)
          const fx = cx + 0.5 + 0.45 * Math.sin(t * speed + hh * 6.2831)
          const fy = cy + 0.5 + 0.45 * Math.cos(t * speed * 1.1 + hh * 6.2831)
          const d = Math.hypot(px - fx, py - fy)
          if (d < f1) f1 = d
        }
      out[y * W + x] = Math.min(1, f1)
    }
  }
  return out
}

// Gabor noise: sparse-convolution noise summing one Gaussian-windowed cosine
// (Gabor) kernel per grid cell. `orientation` fixes the band direction (the
// anisotropic variant) and `frequency` the band spacing; phase animates over
// time. Coloured through a palette.
function evalGaborNoise(speed: number, scale: number, frequency: number, orientation: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H, seed = 0): Frame {
  const omega = (orientation * Math.PI) / 180
  const cosO = Math.cos(omega), sinO = Math.sin(omega)
  const TAU = Math.PI * 2
  return buildFrame(W, H, (x, y) => {
      const px = x * scale, py = y * scale
      const xi = Math.floor(px), yi = Math.floor(py)
      let v = 0
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const cx = xi + di, cy = yi + dj
          const h = seed ? seededHash(seed, cx, cy) : worleyHash(cx, cy)
          const h2 = seed ? seededHash(seed, cx + 31, cy - 17) : worleyHash(cx + 31, cy - 17)
          const fx = cx + 0.5 + (h - 0.5)
          const fy = cy + 0.5 + (h2 - 0.5)
          const dx = px - fx, dy = py - fy
          const gauss = Math.exp(-2.5 * (dx * dx + dy * dy))
          const proj = dx * cosO + dy * sinO
          const w = h2 < 0.5 ? 1 : -1
          v += w * gauss * Math.cos(TAU * frequency * proj + t * speed + h * TAU)
        }
      return samplePalette(palette, v * 0.5 + 0.5)
    })
}

// Fractal (fBm) noise: sum simplex octaves at doubling frequency / halving
// amplitude for a detailed, cloud-like field, coloured through a palette.
function evalFractalNoise(speed: number, scale: number, octaves: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H, seed = 0): Frame {
  const z = (t + seedOffset(seed, 0)) * speed * 0.15
  const oct = Math.max(1, Math.min(6, Math.floor(octaves)))
  return buildFrame(W, H, (x, y) => {
      let v = 0, amp = 0.5, freq = scale, norm = 0
      for (let o = 0; o < oct; o++) {
        v += amp * _snoise2(x * freq + z, y * freq - z * 0.5)
        norm += amp; amp *= 0.5; freq *= 2
      }
      const n = (v / norm) * 0.5 + 0.5
      return samplePalette(palette, ((n % 1) + 1) % 1)
    })
}

// Metaballs: several moving charges; each pixel's field is the summed inverse-
// square influence, mapped smoothly to a palette (lava-lamp blobs).
function evalBlobs(speed: number, scale: number, count: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const n = Math.max(1, Math.min(6, Math.floor(count)))
  const r2 = (scale * Math.min(W, H)) ** 2
  const bx: number[] = [], by: number[] = []
  for (let i = 0; i < n; i++) {
    bx.push(W * (0.5 + 0.4 * Math.sin(t * speed * (0.7 + i * 0.13) + i * 1.7)))
    by.push(H * (0.5 + 0.4 * Math.cos(t * speed * (0.6 + i * 0.17) + i * 2.3)))
  }
  return buildFrame(W, H, (x, y) => {
      let f = 0
      for (let i = 0; i < n; i++) { const dx = x - bx[i], dy = y - by[i]; f += r2 / (dx * dx + dy * dy + 1) }
      return samplePalette(palette, f / (f + 1))
    })
}

// Plasma blended with fractal (simplex) noise for an organic flowing field.
function evalPlasmaFractalField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = Math.sin(x * 0.2 + t * speed) + Math.sin(y * 0.25 + t * speed * 0.8) + Math.sin((x + y) * 0.15 + t * speed * 0.6)
      let amp = 1, freq = scale, fn = 0
      for (let o = 0; o < 3; o++) { fn += amp * _snoise2(x * freq + t * speed * 0.1, y * freq); amp *= 0.5; freq *= 2 }
      v += fn * 2.5
      out[y * W + x] = wrap01(v * 0.15)
    }
  }
  return out
}

export const GENERATIVE_EVALUATORS: NodeEvaluators = {
  // Bundled noise generators (NoiseField / Simplex2D / Noise3D / Noise4D /
  // Worley / PlasmaFractal). All share the same scalar-field core; the
  // node exposes that raw `field` output and also maps it through a palette
  // to its normal `frame` output. Keep in sync with PROPERTY_META.noiseType
  // and the `Noise` case in cppGenerator.ts.
  Noise({ num, pal, t, W, H }, id, props) {
    const noiseType = String(props.noiseType ?? 'field')
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), NOISE_SPEED_MAX[noiseType] ?? 1)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.5), NOISE_SCALE_MAX[noiseType] ?? 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    const field = evalNoiseFieldByType(noiseType, speed, scale, t, W, H, normalizedSeed(props.seed))
    return { field, frame: evalFieldToFrame(field, palette, 1, W, H) }
  },
  Plasma({ num, pal, t, W, H }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Plasma)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalPlasma(speed, t, palette, W, H) }
  },
  Rainbow({ num, t, W, H }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.3), SPEED_MAX.Rainbow)
    const deltaHue = Math.max(0, Math.min(255, num(id, 'deltaHue', props, 'deltaHue', 6)))
    return { frame: evalRainbow(t * speed, deltaHue, W, H) }
  },
  Pride2015({ num, t, W, H }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.4), SPEED_MAX.Pride2015)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.4), SCALE_MAX.Pride2015)
    return { frame: evalPride2015(speed, scale, t, W, H) }
  },
  Pacifica({ num, pal, t, W, H }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.35), SPEED_MAX.Pacifica)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.5), SCALE_MAX.Pacifica)
    const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
    return { frame: evalPacifica(speed, scale, t, palette, W, H) }
  },
  TwinkleFox({ num, pal, t, W, H }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.TwinkleFox)
    const density = num(id, 'density', props, 'density', 0.5)
    const palette = pal(id, 'paletteIn', props, 'palette', 'party')
    return { frame: evalTwinkleFox(speed, density, t, palette, normalizedSeed(props.seed), W, H) }
  },
  Scanner({ num, pal, t, W, H }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.45), SPEED_MAX.Scanner)
    const width = Math.max(1, num(id, 'width', props, 'width', 2))
    const fade = num(id, 'fade', props, 'fade', 0.6)
    const axis = String(props.axis ?? 'horizontal')
    const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
    return { frame: evalScanner(speed, width, fade, axis, t, palette, W, H) }
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
  RadialBurst({ num, pal, t, W, H }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.RadialBurst)
    const rings = num(id, 'arms', props, 'arms', 8)
    const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
    return { frame: evalRadialBurst(speed, rings, palette, t, W, H) }
  },
  Spiral({ num, pal, t, W, H }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Spiral)
    const arms = num(id, 'arms', props, 'arms', 2)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalSpiral(speed, arms, palette, t, W, H) }
  },
  Kaleidoscope({ input, num, W, H }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    const segments = num(id, 'segments', props, 'segments', 6)
    if (!src) { return { frame: blankFrame(W, H) } }
    return { frame: evalKaleidoscope(src, segments, W, H) }
  },
  FractalNoise({ num, pal, t, W, H }, id, props) {
    const speed   = denormRate(num(id, 'speed', props, 'speed', 0.25), SPEED_MAX.FractalNoise)
    const scale   = denormRate(num(id, 'scale', props, 'scale', 0.3), SCALE_MAX.FractalNoise)
    const octaves = num(id, 'octaves', props, 'octaves', 4)
    const palette = pal(id, 'paletteIn', props, 'palette', 'forest')
    return { frame: evalFractalNoise(speed, scale, octaves, t, palette, W, H, normalizedSeed(props.seed)) }
  },
  GaborNoise({ num, pal, t, W, H }, id, props) {
    const speed       = denormRate(num(id, 'speed', props, 'speed', 0.33), SPEED_MAX.GaborNoise)
    const scale       = denormRate(num(id, 'scale', props, 'scale', 0.7), SCALE_MAX.GaborNoise)
    const frequency   = num(id, 'frequency', props, 'frequency', 1.2)
    const orientation = num(id, 'orientation', props, 'orientation', 45)
    const palette     = pal(id, 'paletteIn', props, 'palette', 'ocean')
    return { frame: evalGaborNoise(speed, scale, frequency, orientation, t, palette, W, H, normalizedSeed(props.seed)) }
  },
  Blobs({ num, pal, t, W, H }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.3), SPEED_MAX.Blobs)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.44), SCALE_MAX.Blobs)
    const count = num(id, 'count', props, 'count', 3)
    const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
    return { frame: evalBlobs(speed, scale, count, t, palette, W, H) }
  },
}

import { makeShims, SHIM_NAMES } from '../../state/fastledShims'
import { FORMULA_FIELD_SPEED_MAX, denormRate, SPEED_MAX, SCALE_MAX } from '../../state/speedRange'
import type { Frame } from '../../state/ledColor'
import { compileFormula, fieldFormulaCache, centeredX, centeredY } from '../../state/evaluator/formula'
import { DEFAULT_W, DEFAULT_H, clamp01, evalFieldToFrame } from '../../state/evaluator/frames'
import { allocField, instanceState } from '../../state/evaluator/memory'
import { wrapXBlend } from '../../state/evaluator/wrapX'
import { seedOffset, _snoise2, normalizedSeed } from '../../state/evaluator/random'
import { ellipseSd, morphPolygonSd, rectSd } from '../../state/evaluator/sdf'
import { fanFold, hexCell, latticeCellValue, squareCell, triCell } from '../../state/evaluator/lattice'
import { wallpaperSamplePoint } from '../../state/evaluator/symmetry'
import {
  truchetCell, truchetLattice, truchetLineValue, truchetMotif,
  truchetMotifDistance, truchetOrientation, truchetOrientationCount,
} from '../../state/evaluator/truchet'
import {
  turingFieldValue, turingIterations, turingPrefixLength, turingRadii, turingSeed,
  turingStep, turingStepSize,
} from '../../state/evaluator/turing'
import { buildSliceChildMatrices, resolveSlicePattern, sliceBit, walkSliceLeaf } from '../../state/sliceTiling'
import type { Field, NodeEvaluators } from '../../state/evaluator/types'

interface WaveSimState { prev: Float32Array; cur: Float32Array; next: Float32Array; w: number; h: number; prevTrigger: boolean; pulse: number }
const waveSimState = instanceState('waveSimState', new Map<string, WaveSimState>())

interface TruchetState { epoch: number; prevReroll: boolean }
const truchetState = instanceState('truchetState', new Map<string, TruchetState>())

export function evalTruchet(
  nodeId: string,
  reroll: boolean,
  latticeValue: unknown,
  motifValue: unknown,
  cellsValue: number,
  lineWidthValue: number,
  scrollValue: number,
  rotationValue: number,
  seed: number,
  t: number,
  W = DEFAULT_W,
  H = DEFAULT_H,
): Field {
  let state = truchetState.get(nodeId)
  if (!state) {
    state = { epoch: 0, prevReroll: false }
    truchetState.set(nodeId, state)
  }
  if (reroll && !state.prevReroll) state.epoch++
  state.prevReroll = reroll

  const lattice = truchetLattice(latticeValue)
  const motif = truchetMotif(motifValue, lattice)
  const orientations = truchetOrientationCount(lattice, motif)
  const cells = Math.max(0.5, Math.min(8, cellsValue))
  const lineWidth = Math.max(0, Math.min(0.5, lineWidthValue))
  const scroll = Math.max(-8, Math.min(8, scrollValue))
  const rotation = Math.max(-180, Math.min(180, rotationValue))
  const angle = -rotation * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = (x + 0.5 - W / 2) * cells / W
    const py = (y + 0.5 - H / 2) * cells / W
    const rx = cos * px - sin * py + scroll * t
    const ry = sin * px + cos * py
    const cell = truchetCell(rx, ry, lattice)
    const orientation = truchetOrientation(cell, state.epoch, seed, orientations)
    const distance = truchetMotifDistance(lattice, motif, cell.x, cell.y, orientation)
    out[y * W + x] = truchetLineValue(distance, lineWidth)
  }
  return out
}

interface TuringState {
  a: Float32Array; prefix: Float32Array; w: number; h: number; seed: number; epoch: number; prevReset: boolean
}
const turingState = instanceState('turingState', new Map<string, TuringState>())

/**
 * McCabe multi-scale Turing field. The state restarts from its seeded noise
 * when the canvas size or seed changes, and from a fresh epoch of that noise on
 * each rising edge of `reset`, so the same edges give the same pattern on the
 * controller.
 */
export function evalTuringField(
  nodeId: string,
  reset: boolean,
  speedValue: number,
  stepSizeValue: number,
  scalesValue: unknown,
  baseRadiusValue: unknown,
  seed: number,
  W = DEFAULT_W,
  H = DEFAULT_H,
): Field {
  const N = W * H
  let s = turingState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.seed !== seed) {
    s = {
      a: new Float32Array(N), prefix: new Float32Array(turingPrefixLength(W, H)),
      w: W, h: H, seed, epoch: s?.epoch ?? 0, prevReset: s?.prevReset ?? false,
    }
    turingSeed(s.a, W, H, s.epoch, seed)
    turingState.set(nodeId, s)
  }
  if (reset && !s.prevReset) {
    s.epoch++
    turingSeed(s.a, W, H, s.epoch, seed)
  }
  s.prevReset = reset

  const radii = turingRadii(scalesValue, baseRadiusValue)
  const stepSize = turingStepSize(stepSizeValue)
  const iterations = turingIterations(speedValue)
  for (let it = 0; it < iterations; it++) turingStep(s.a, s.prefix, W, H, radii, stepSize)

  const out = allocField(N)
  for (let i = 0; i < N; i++) out[i] = turingFieldValue(s.a[i])
  return out
}

// Same fBm construction as evalFractalNoise, but returns the raw 0–1 scalar
// field instead of sampling it through a palette — the noise-driven Field
// source, alongside FieldFormula's hand-written expressions.
function evalFieldNoise(speed: number, scale: number, octaves: number, t: number, W = DEFAULT_W, H = DEFAULT_H, seed = 0, xo = 0): Field {
  const z = (t + seedOffset(seed, 0)) * speed * 0.15
  const oct = Math.max(1, Math.min(6, Math.floor(octaves)))
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = xo; x < W + xo; x++) {
      let v = 0, amp = 0.5, freq = scale, norm = 0
      for (let o = 0; o < oct; o++) {
        v += amp * _snoise2(x * freq + z, y * freq - z * 0.5)
        norm += amp; amp *= 0.5; freq *= 2
      }
      out[y * W + x - xo] = Math.max(0, Math.min(1, (v / norm) * 0.5 + 0.5))
    }
  }
  return out
}

function evalFieldFormula(formula: string, a: number, b: number, fieldIn: Field | null, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  const fn = compileFormula(formula, fieldFormulaCache)
  if (!fn) return out
  const shims = makeShims(t)
  const sv = SHIM_NAMES.map((n) => shims[n])

  for (let yi = 0; yi < H; yi++) {
    for (let xi = 0; xi < W; xi++) {
      const cx = centeredX(xi, W), cy = centeredY(yi, H)
      const r = Math.sqrt(cx * cx + cy * cy), angle = Math.atan2(cy, cx)
      const fin = fieldIn ? fieldIn[yi * W + xi] : 0
      let v = 0
      // FieldFormula uses integer pixel coords for x,y (ANIMartRIX convention).
      try { v = fn(xi, yi, cx, cy, r, angle, t, W, H, a, b, fin, ...sv) } catch { v = 0 }
      out[yi * W + xi] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
    }
  }
  return out
}

// ── Formula Field (curated closed-form fields — see
// docs/development/design/formula-pattern-nodes.md) ────────────────────────
// Each `formulaType` is exact closed-form math, so the evaluator and codegen
// share the identical formula with no approximation gap (unlike inoise8-backed
// fields) — the same property FieldFormula's shim table and Pride2015/Pacifica/
// TwinkleFox already rely on.
export const GOLDEN_RATIO = 1.618033988749895
// FormulaField's lissajousField variant samples the curve at this many points
// per pixel to approximate distance-to-curve (no closed form exists for an
// arbitrary Lissajous curve) — comparable per-frame cost to WaveSim's
// up-to-12 full-grid convolution passes, not a new order of magnitude for
// this codebase. Exported so cppGenerator.ts's codegen case uses the exact
// same sample count (no evaluator/firmware divergence).
export const LISSAJOUS_FIELD_SAMPLES = 48

export interface FormulaFieldParams {
  formulaType: string
  speed: number
  petals: number
  offset: number
  symmetry: number
  n1: number
  n2: number
  n3: number
  a: number
  b: number
  turns: number
  tightness: number
  bandWidth: number
  density: number
  phase: number
  freqA: number
  freqB: number
  thickness: number
}

function evalFormulaField(p: FormulaFieldParams, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  const rot = t * p.speed * (FORMULA_FIELD_SPEED_MAX[p.formulaType] ?? 1)

  switch (p.formulaType) {
    case 'superformula': {
      const theta0 = rot
      const m = Math.max(1, p.symmetry)
      const invN1 = 1 / Math.max(0.05, p.n1)
      const n2 = Math.max(0.05, p.n2), n3 = Math.max(0.05, p.n3)
      const sfA = Math.max(0.05, p.a), sfB = Math.max(0.05, p.b)
      const edge = 0.06
      for (let yi = 0; yi < H; yi++) {
        for (let xi = 0; xi < W; xi++) {
          const cx = centeredX(xi, W), cy = centeredY(yi, H)
          const r = Math.sqrt(cx * cx + cy * cy)
          const theta = Math.atan2(cy, cx) + theta0
          const t1 = Math.abs(Math.cos(m * theta / 4) / sfA)
          const t2 = Math.abs(Math.sin(m * theta / 4) / sfB)
          const raux = Math.pow(Math.pow(t1, n2) + Math.pow(t2, n3), -invN1)
          out[yi * W + xi] = clamp01(1 - (r - raux) / edge)
        }
      }
      break
    }

    case 'fibonacciSpiral': {
      const nTurns = Math.max(1, p.turns)
      const aSp = Math.max(0.02, p.tightness)
      const bw = Math.max(0.02, p.bandWidth)
      const period = (2 * Math.PI) / nTurns
      const lnPhi = Math.log(GOLDEN_RATIO)
      for (let yi = 0; yi < H; yi++) {
        for (let xi = 0; xi < W; xi++) {
          const cx = centeredX(xi, W), cy = centeredY(yi, H)
          const r = Math.max(Math.sqrt(cx * cx + cy * cy), 1e-4)
          const angle = Math.atan2(cy, cx)
          const phaseAtR = (Math.PI / 2) * Math.log(r / aSp) / lnPhi
          let delta = (angle + rot - phaseAtR) % period
          if (delta < 0) delta += period
          if (delta > period / 2) delta = period - delta
          out[yi * W + xi] = clamp01(1 - delta / bw)
        }
      }
      break
    }

    case 'goldenTiling': {
      const dens = Math.max(1, p.density)
      for (let yi = 0; yi < H; yi++) {
        for (let xi = 0; xi < W; xi++) {
          const cx = centeredX(xi, W), cy = centeredY(yi, H)
          const r = Math.sqrt(cx * cx + cy * cy)
          const nIdx = Math.floor(r * dens + rot + p.phase)
          const golden = nIdx / GOLDEN_RATIO
          out[yi * W + xi] = golden - Math.floor(golden)
        }
      }
      break
    }

    case 'lissajousField': {
      const freqA = Math.max(1, p.freqA), freqB = Math.max(1, p.freqB)
      const thickness = Math.max(0.02, p.thickness)
      for (let yi = 0; yi < H; yi++) {
        for (let xi = 0; xi < W; xi++) {
          const cx = centeredX(xi, W), cy = centeredY(yi, H)
          let minDistSq = Infinity
          for (let s = 0; s < LISSAJOUS_FIELD_SAMPLES; s++) {
            const sp = (s / LISSAJOUS_FIELD_SAMPLES) * Math.PI * 2
            const lx = Math.sin(freqA * sp + rot), ly = Math.sin(freqB * sp)
            const dx = cx - lx, dy = cy - ly
            const dSq = dx * dx + dy * dy
            if (dSq < minDistSq) minDistSq = dSq
          }
          out[yi * W + xi] = clamp01(1 - Math.sqrt(minDistSq) / thickness)
        }
      }
      break
    }

    case 'rose':
    default: {
      const k = Math.max(1, p.petals)
      const offsetRad = (p.offset * Math.PI) / 180
      for (let yi = 0; yi < H; yi++) {
        for (let xi = 0; xi < W; xi++) {
          const cx = centeredX(xi, W), cy = centeredY(yi, H)
          const r = Math.sqrt(cx * cx + cy * cy)
          const angle = Math.atan2(cy, cx)
          const rr = Math.cos(k * (angle + offsetRad + rot))
          out[yi * W + xi] = clamp01((rr + 1) / 2 * (1 - r * 0.15))
        }
      }
      break
    }
  }
  return out
}

const WAVE_SIM_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.5],
  [0.26, 0.34],
  [0.74, 0.4],
  [0.34, 0.76],
  [0.7, 0.7],
]

function injectWaveSimRipple(field: Float32Array, pulse: number, impulse: number, W: number, H: number): void {
  const [px, py] = WAVE_SIM_POINTS[pulse % WAVE_SIM_POINTS.length]
  const cx = px * (W - 1), cy = py * (H - 1)
  const radius = Math.max(1.5, Math.min(W, H) * 0.12)
  const x0 = Math.max(0, Math.floor(cx - radius - 1))
  const x1 = Math.min(W - 1, Math.ceil(cx + radius + 1))
  const y0 = Math.max(0, Math.floor(cy - radius - 1))
  const y1 = Math.min(H - 1, Math.ceil(cy + radius + 1))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy)
      const falloff = Math.max(0, 1 - dist / radius)
      if (falloff <= 0) continue
      const i = y * W + x
      field[i] = Math.max(-1, Math.min(1, field[i] + impulse * falloff * falloff))
    }
  }
}

// `wrapX` lets a wave leave one side and re-enter the other; off, the left and
// right edges reflect (the neighbour past the edge is the edge pixel itself).
// `halfDuplex` shows only the positive half of the wave, so a crest reads as
// raised water and the troughs stay dark, where the default shows the size of
// the displacement either way. Y always wraps, as it always has.
function evalWaveSim(nodeId: string, trigger: boolean, speed: number, damping: number, impulse: number, wrapX: boolean, halfDuplex: boolean, W = DEFAULT_W, H = DEFAULT_H): Field {
  const N = W * H
  let s = waveSimState.get(nodeId)
  if (!s || s.w !== W || s.h !== H) {
    s = {
      prev: new Float32Array(N),
      cur: new Float32Array(N),
      next: new Float32Array(N),
      w: W,
      h: H,
      prevTrigger: false,
      pulse: 1,
    }
    injectWaveSimRipple(s.cur, 0, impulse, W, H)
    waveSimState.set(nodeId, s)
  }

  if (trigger && !s.prevTrigger) {
    injectWaveSimRipple(s.cur, s.pulse, impulse, W, H)
    s.pulse++
  }
  s.prevTrigger = trigger

  const iters = Math.max(1, Math.min(12, Math.floor(speed)))
  const damp = Math.max(0.8, Math.min(0.999, damping))
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yr = y * W
      for (let x = 0; x < W; x++) {
        const xm = wrapX ? (x - 1 + W) % W : Math.max(x - 1, 0), xp = wrapX ? (x + 1) % W : Math.min(x + 1, W - 1), i = yr + x
        const neighbourAvg = (s.cur[ym + x] + s.cur[yp + x] + s.cur[yr + xm] + s.cur[yr + xp]) * 0.5
        s.next[i] = Math.max(-1, Math.min(1, (neighbourAvg - s.prev[i]) * damp))
      }
    }
    const swap = s.prev
    s.prev = s.cur
    s.cur = s.next
    s.next = swap
  }

  let peak = 0
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(s.cur[i]))
  if (peak < 0.002) {
    injectWaveSimRipple(s.cur, s.pulse, impulse * 0.6, W, H)
    s.pulse++
  }

  const out = allocField(N)
  for (let i = 0; i < N; i++) out[i] = Math.max(0, Math.min(1, (halfDuplex ? s.cur[i] : Math.abs(s.cur[i])) * 1.5))
  return out
}

// Distance from each pixel to a movable point (px,py in normalised 0–1 space).
// Output is 0 at the point, rising to 1; `scale` (≥1) stretches the ramp so it
// reaches 1 sooner. The diagonal of the unit square (√2) is the 1.0 reference.
function evalDistanceField(px: number, py: number, scale: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  const sc = Math.max(0.0001, scale)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = x / (W - 1 || 1), ny = y / (H - 1 || 1)
      const dx = nx - px, dy = ny - py
      const d = (Math.sqrt(dx * dx + dy * dy) / Math.SQRT2) * sc
      out[y * W + x] = Math.max(0, Math.min(1, d))
    }
  }
  return out
}

// Combine two fields pixel-by-pixel. An unwired input is a zero field, so unary
// ops (e.g. `subtract` from 0 to negate, clamped) still behave sensibly.
function evalFieldMath(a: Field | null, b: Field | null, op: string, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  for (let i = 0; i < W * H; i++) {
    const x = a ? a[i] : 0, y = b ? b[i] : 0
    let v: number
    switch (op) {
      case 'subtract':   v = x - y; break
      case 'multiply':   v = x * y; break
      case 'mix':        v = (x + y) * 0.5; break
      case 'min':        v = Math.min(x, y); break
      case 'max':        v = Math.max(x, y); break
      case 'difference': v = Math.abs(x - y); break
      case 'add':
      default:           v = x + y; break
    }
    out[i] = Math.max(0, Math.min(1, v))
  }
  return out
}

function evalFieldLevels(
  field: Field | null,
  low: number,
  high: number,
  steps: number,
  invert: boolean,
  W = DEFAULT_W,
  H = DEFAULT_H,
): Field {
  const out = allocField(W * H)
  const count = Math.max(1, Math.min(16, Math.round(steps)))
  for (let i = 0; i < W * H; i++) {
    const source = field ? field[i] : 0
    let value = high <= low
      ? (source >= low ? 1 : 0)
      : clamp01((source - low) / Math.max(1e-4, high - low))
    if (count >= 2) value = Math.round(value * (count - 1)) / (count - 1)
    out[i] = invert ? 1 - value : value
  }
  return out
}

function evalFieldLerp(a: Field | null, b: Field | null, amount: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  const t = clamp01(amount)
  for (let i = 0; i < W * H; i++) {
    const av = a ? a[i] : 0
    const bv = b ? b[i] : 0
    out[i] = av * (1 - t) + bv * t
  }
  return out
}

function smoothCoverage(sd: number, softness: number): number {
  if (softness <= 0) return sd <= 0 ? 1 : 0
  const t = clamp01(0.5 - sd / (2 * softness))
  return t * t * (3 - 2 * t)
}

function evalShapeField(
  shape: string,
  fieldMode: string,
  cx: number,
  cy: number,
  size: number,
  rotation: number,
  sides: number,
  aspect: number,
  softness: number,
  range: number,
  W = DEFAULT_W,
  H = DEFAULT_H,
): Field {
  const out = allocField(W * H)
  const shortSide = Math.max(1, Math.min(W, H))
  const radius = Math.max(1e-4, size * shortSide)
  const stretch = Math.max(0.01, aspect)
  const softPx = Math.max(0, softness) * shortSide
  const rangePx = Math.max(1e-4, range * shortSide)
  const centerX = clamp01(cx) * Math.max(0, W - 1) + 0.5
  const centerY = clamp01(cy) * Math.max(0, H - 1) + 0.5
  const radians = (-rotation * Math.PI) / 180
  const cosR = Math.cos(radians)
  const sinR = Math.sin(radians)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - centerX
      const dy = y + 0.5 - centerY
      const lx = dx * cosR - dy * sinR
      const ly = dx * sinR + dy * cosR
      const sd = shape === 'rect'
        ? rectSd(lx, ly, radius * stretch, radius)
        : shape === 'polygon'
          ? morphPolygonSd(lx, ly, sides, radius)
          : ellipseSd(lx, ly, radius * stretch, radius)
      out[y * W + x] = fieldMode === 'distance'
        ? clamp01(0.5 - sd / (2 * rangePx))
        : smoothCoverage(sd, softPx)
    }
  }
  return out
}

// Sample `field` at coordinates pushed by the dx/dy offset fields. Offsets map
// 0–1 → −strength…+strength pixels (an unwired offset field = no push). Sample
// is nearest-neighbour, clamped to the matrix edges.
function evalFieldWarp(field: Field | null, dx: Field | null, dy: Field | null, strength: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  if (!field) return out
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ox = dx ? (2 * dx[y * W + x] - 1) * strength : 0
      const oy = dy ? (2 * dy[y * W + x] - 1) * strength : 0
      const sx = Math.max(0, Math.min(W - 1, Math.round(x + ox)))
      const sy = Math.max(0, Math.min(H - 1, Math.round(y + oy)))
      out[y * W + x] = field[sy * W + sx]
    }
  }
  return out
}

// Rotate a field around its centre by `angleRad`. Samples the source at the
// inverse-rotated coordinate (nearest-neighbour), wrapping at the matrix edges.
function evalFieldRotate(field: Field | null, angleRad: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  if (!field) return out
  const cxc = (W - 1) / 2, cyc = (H - 1) / 2
  const ca = Math.cos(-angleRad), sa = Math.sin(-angleRad)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cxc, dy = y - cyc
      const sx = ((Math.round(dx * ca - dy * sa + cxc) % W) + W) % W
      const sy = ((Math.round(dx * sa + dy * ca + cyc) % H) + H) % H
      out[y * W + x] = field[sy * W + sx]
    }
  }
  return out
}

// Tile/repeat a field `tilesX`×`tilesY` times across the matrix (nearest sample).
function evalFieldTile(field: Field | null, tilesX: number, tilesY: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const out = allocField(W * H)
  if (!field) return out
  const tx = Math.max(1, Math.round(tilesX)), ty = Math.max(1, Math.round(tilesY))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      out[y * W + x] = field[((y * ty) % H) * W + ((x * tx) % W)]
    }
  }
  return out
}

export function evalFieldSymmetry(
  field: Field | null,
  group: unknown,
  cells: number,
  rotation: number,
  spin: number,
  offsetX: number,
  offsetY: number,
  t: number,
  W = DEFAULT_W,
  H = DEFAULT_H,
): Field {
  const out = allocField(W * H)
  if (!field) return out
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const source = wallpaperSamplePoint(group, x, y, cells, rotation, spin, offsetX, offsetY, t, W, H)
    const sx = Math.max(0, Math.min(W - 1, Math.floor(source.x + 0.5)))
    const sy = Math.max(0, Math.min(H - 1, Math.floor(source.y + 0.5)))
    out[y * W + x] = field[sy * W + sx]
  }
  return out
}

function smoothstep01(edge: number, value: number): number {
  if (edge <= 0) return value >= 0 ? 1 : 0
  const t = Math.max(0, Math.min(1, value / edge))
  return t * t * (3 - 2 * t)
}

/**
 * Paper-style recursively quartered fan slices, repeated on a regular lattice.
 * `field` is the solid/void pattern; `cell` holds one value per lattice polygon
 * (`latticeCellValue`), taken from the same cell lookup so the two outputs
 * always agree on which polygon a pixel is in.
 */
export function evalSliceTiling(
  lattice: string,
  depthValue: number,
  symmetry: string,
  preset: unknown,
  customBits: unknown,
  customBitsB: unknown,
  cellsValue: number,
  rotationDeg: number,
  spinDeg: number,
  warpValue: number,
  morphValue: number,
  edgeValue: number,
  t: number,
  W = DEFAULT_W,
  H = DEFAULT_H,
  seed = 0,
): { field: Field; cell: Field } {
  const out = allocField(W * H)
  const cellOut = allocField(W * H)
  const depth = Math.max(1, Math.min(3, Math.round(depthValue)))
  const cells = Math.max(0.5, Math.min(8, cellsValue))
  const warp = Math.max(-1, Math.min(1, warpValue))
  const morph = clamp01(morphValue)
  const edge = Math.max(0, Math.min(0.5, edgeValue))
  const pattern = resolveSlicePattern(preset, depth, customBits, customBitsB)
  const matrices = buildSliceChildMatrices(warp)
  const latticeType = lattice === 'square' || lattice === 'triangle' ? lattice : 'hex'
  const sides = latticeType === 'hex' ? 6 : latticeType === 'square' ? 4 : 3
  const radius = latticeType === 'hex' ? 2 / 3 : latticeType === 'square' ? Math.SQRT1_2 : 1 / Math.sqrt(3)
  const sector = Math.PI * 2 / sides
  const angle = -(rotationDeg + spinDeg * t) * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = (x + 0.5 - W / 2) * cells / W
      const py = (y + 0.5 - H / 2) * cells / W
      const rx = cos * px - sin * py
      const ry = sin * px + cos * py
      const cell = latticeType === 'square' ? squareCell(rx, ry)
        : latticeType === 'triangle' ? triCell(rx, ry) : hexCell(rx, ry)
      cellOut[y * W + x] = latticeCellValue(cell, seed)
      let orient = 0
      if (latticeType === 'hex') orient = -Math.PI / 6
      else if (latticeType === 'triangle') orient = cell.flipped ? -Math.PI / 6 : Math.PI / 6
      const oc = Math.cos(orient), os = Math.sin(orient)
      const lx = oc * cell.x - os * cell.y
      const ly = os * cell.x + oc * cell.y
      const folded = fanFold(lx, ly, sides, symmetry === 'dihedral')
      const sum = folded.x / (radius * Math.cos(sector / 2))
      const difference = folded.y / (radius * Math.sin(sector / 2))
      const lambda: [number, number, number] = [1 - sum, (sum - difference) / 2, (sum + difference) / 2]
      const walked = walkSliceLeaf(lambda, depth, matrices)
      const bitA = sliceBit(pattern.bits, walked.leaf)
      const bitB = sliceBit(pattern.bitsB, walked.leaf)
      const solid = bitA * (1 - morph) + bitB * morph
      out[y * W + x] = solid * smoothstep01(edge, Math.min(...walked.lambda))
    }
  }
  return { field: out, cell: cellOut }
}

export const FIELD_EVALUATORS: NodeEvaluators = {
  FieldFormula({ input, num, t, W, H, trusted }, id, props) {
    const a = num(id, 'a', props, 'a', 0)
    const b = num(id, 'b', props, 'b', 0)
    const fin = input(id, 'fieldIn', null)
    const fieldIn = fin instanceof Float32Array ? fin : null
    const formula = String(props.formula ?? 'sin8(r*200 + t*60)/255')
    return { field: trusted ? evalFieldFormula(formula, a, b, fieldIn, t, W, H) : allocField(W * H) }
  },
  FieldNoise({ num, t, W, H }, id, props) {
    const speed   = denormRate(num(id, 'speed', props, 'speed', 0.25), SPEED_MAX.FieldNoise)
    const scale   = denormRate(num(id, 'scale', props, 'scale', 0.3), SCALE_MAX.FieldNoise)
    const octaves = num(id, 'octaves', props, 'octaves', 4)
    const seed = normalizedSeed(props.seed)
    const field = evalFieldNoise(speed, scale, octaves, t, W, H, seed)
    // Seamless left/right join: see state/evaluator/wrapX.ts.
    return { field: props.wrapX === true ? wrapXBlend(field, evalFieldNoise(speed, scale, octaves, t, W, H, seed, W), W, H) : field }
  },
  SliceTiling({ num, t, W, H }, id, props) {
    return evalSliceTiling(
      String(props.lattice ?? 'hex'),
      Number(props.depth ?? 2),
      String(props.symmetry ?? 'dihedral'),
      props.preset ?? 'pinwheel',
      props.bits,
      props.bitsB,
      num(id, 'cells', props, 'cells', 1),
      num(id, 'rotation', props, 'rotation', 0),
      num(id, 'spin', props, 'spin', 0),
      num(id, 'warp', props, 'warp', 0),
      num(id, 'morph', props, 'morph', 0),
      num(id, 'edge', props, 'edge', 0.03),
      t, W, H, normalizedSeed(props.seed),
    )
  },
  Truchet({ input, num, t, W, H, stateKey }, id, props) {
    return { field: evalTruchet(
      stateKey(id),
      Boolean(input(id, 'reroll', false)),
      props.lattice ?? 'square',
      props.motif ?? 'arcs',
      num(id, 'cells', props, 'cells', 4),
      num(id, 'lineWidth', props, 'lineWidth', 0.08),
      num(id, 'scroll', props, 'scroll', 0),
      num(id, 'rotation', props, 'rotation', 0),
      normalizedSeed(props.seed),
      t, W, H,
    ) }
  },
  // Curated closed-form fields (rose/superformula/spiral/tiling/lissajous)
  // selected by a dropdown instead of free text — see
  // docs/development/design/formula-pattern-nodes.md. Every knob is a
  // property input; only the chosen variant's are read, so a wire into a
  // knob another formulaType owns is inert rather than wrong.
  FormulaField({ num, t, W, H }, id, props) {
    const fp: FormulaFieldParams = {
      formulaType: String(props.formulaType ?? 'rose'),
      speed: num(id, 'speed', props, 'speed', 0.3),
      petals: num(id, 'petals', props, 'petals', 5),
      offset: num(id, 'offset', props, 'offset', 0),
      symmetry: num(id, 'symmetry', props, 'symmetry', 6),
      n1: num(id, 'n1', props, 'n1', 0.3),
      n2: num(id, 'n2', props, 'n2', 0.3),
      n3: num(id, 'n3', props, 'n3', 0.3),
      a: num(id, 'a', props, 'a', 1),
      b: num(id, 'b', props, 'b', 1),
      turns: num(id, 'turns', props, 'turns', 3),
      tightness: num(id, 'tightness', props, 'tightness', 0.15),
      bandWidth: num(id, 'bandWidth', props, 'bandWidth', 0.25),
      density: num(id, 'density', props, 'density', 12),
      phase: num(id, 'phase', props, 'phase', 0),
      freqA: num(id, 'freqA', props, 'freqA', 3),
      freqB: num(id, 'freqB', props, 'freqB', 2),
      thickness: num(id, 'thickness', props, 'thickness', 0.1),
    }
    return { field: evalFormulaField(fp, t, W, H) }
  },
  TuringField({ input, num, W, H, stateKey }, id, props) {
    return { field: evalTuringField(
      stateKey(id),
      Boolean(input(id, 'reset', false)),
      num(id, 'speed', props, 'speed', 2),
      num(id, 'stepSize', props, 'stepSize', 0.05),
      props.scales ?? 3,
      props.baseRadius ?? 1,
      normalizedSeed(props.seed),
      W, H,
    ) }
  },
  WaveSim({ input, num, W, H, stateKey }, id, props) {
    const trigger = Boolean(input(id, 'trigger', false))
    const speed = num(id, 'speed', props, 'speed', 4)
    const damping = num(id, 'damping', props, 'damping', 0.985)
    const impulse = num(id, 'impulse', props, 'impulse', 1)
    return { field: evalWaveSim(stateKey(id), trigger, speed, damping, impulse, props.wrapX !== false, props.halfDuplex === true, W, H) }
  },
  FieldToFrame({ input, num, pal, W, H }, id, props) {
    const fv = input(id, 'field', null)
    const field = fv instanceof Float32Array ? fv : null
    const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
    const brightness = num(id, 'brightness', props, 'brightness', 1)
    return { frame: evalFieldToFrame(field, palette, brightness, W, H) }
  },
  // The inverse of FieldToFrame: a 0–1 brightness field from a rendered
  // frame (average of r,g,b — the same convention Mask uses for a mask
  // frame's opacity).
  FrameToField({ input, W, H }, id) {
    const src = input(id, 'frame', null) as Frame | null
    const out2 = allocField(W * H)
    if (src) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const px = src[y][x]
          out2[y * W + x] = (px.r + px.g + px.b) / 3 / 255
        }
      }
    }
    return { field: out2 }
  },
  DistanceField({ num, W, H }, id, props) {
    const px = num(id, 'px', props, 'px', 0.5)
    const py = num(id, 'py', props, 'py', 0.5)
    const scale = num(id, 'scale', props, 'scale', 1)
    return { field: evalDistanceField(px, py, scale, W, H) }
  },
  FieldMath({ input, W, H }, id, props) {
    const av = input(id, 'a', null)
    const bv = input(id, 'b', null)
    const op = String(props.fieldOp ?? 'add')
    return { field: evalFieldMath(
      av instanceof Float32Array ? av : null,
      bv instanceof Float32Array ? bv : null,
      op, W, H,
    ) }
  },
  FieldLevels({ input, num, W, H }, id, props) {
    const fv = input(id, 'field', null)
    return { field: evalFieldLevels(
      fv instanceof Float32Array ? fv : null,
      num(id, 'low', props, 'low', 0),
      num(id, 'high', props, 'high', 1),
      Number(props.steps ?? 1),
      Boolean(props.invert),
      W, H,
    ) }
  },
  FieldLerp({ input, num, W, H }, id, props) {
    const av = input(id, 'a', null)
    const bv = input(id, 'b', null)
    return { field: evalFieldLerp(
      av instanceof Float32Array ? av : null,
      bv instanceof Float32Array ? bv : null,
      num(id, 't', props, 't', 0.5),
      W, H,
    ) }
  },
  ShapeField({ num, W, H }, id, props) {
    return { field: evalShapeField(
      String(props.shape ?? 'circle'),
      String(props.fieldMode ?? 'fill'),
      num(id, 'cx', props, 'cx', 0.5),
      num(id, 'cy', props, 'cy', 0.5),
      num(id, 'size', props, 'size', 0.3),
      num(id, 'rotation', props, 'rotation', 0),
      num(id, 'sides', props, 'sides', 5),
      num(id, 'aspect', props, 'aspect', 1),
      Number(props.softness ?? 0.1),
      Number(props.range ?? 0.5),
      W, H,
    ) }
  },
  FieldWarp({ input, num, W, H }, id, props) {
    const fv = input(id, 'field', null)
    const dxv = input(id, 'dx', null)
    const dyv = input(id, 'dy', null)
    const strength = num(id, 'strength', props, 'strength', 1)
    return { field: evalFieldWarp(
      fv instanceof Float32Array ? fv : null,
      dxv instanceof Float32Array ? dxv : null,
      dyv instanceof Float32Array ? dyv : null,
      strength, W, H,
    ) }
  },
  FieldRotate({ input, num, t, W, H }, id, props) {
    const fv = input(id, 'field', null)
    const field = fv instanceof Float32Array ? fv : null
    // angle (degrees) plus an optional continuous spin (degrees/sec).
    const deg = num(id, 'angle', props, 'angle', 0) + t * num(id, 'spin', props, 'spin', 0)
    return { field: evalFieldRotate(field, (deg * Math.PI) / 180, W, H) }
  },
  FieldTile({ input, num, W, H }, id, props) {
    const fv = input(id, 'field', null)
    const field = fv instanceof Float32Array ? fv : null
    const tx = num(id, 'tilesX', props, 'tilesX', 2)
    const ty = num(id, 'tilesY', props, 'tilesY', 2)
    return { field: evalFieldTile(field, tx, ty, W, H) }
  },
  FieldSymmetry({ input, num, t, W, H }, id, props) {
    const source = input(id, 'field', null)
    return { field: evalFieldSymmetry(
      source instanceof Float32Array ? source : null,
      props.group ?? 'p4m',
      num(id, 'cells', props, 'cells', 2),
      num(id, 'rotation', props, 'rotation', 0),
      num(id, 'spin', props, 'spin', 0),
      num(id, 'offsetX', props, 'offsetX', 0),
      num(id, 'offsetY', props, 'offsetY', 0),
      t, W, H,
    ) }
  },
}

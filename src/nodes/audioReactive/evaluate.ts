import { useUiStore } from '../../state/uiStore'
import { denormalizeAudioFlowParam } from '../../state/audioFlowRange'
import { type Frame, type Palette, samplePalette, type RGB } from '../../state/ledColor'
import { evalAnimartrix, disposeAnimartrixState } from '../../animartrix/preview'
import type { NodeEvaluators } from '../../state/evaluator/types'
import {
  DEFAULT_W,
  DEFAULT_H,
  blankFrame,
  rawBlankFrame,
  clamp01,
  scaleRgb,
  solidFrame,
  buildFrame,
  sparkState,
  addRgb,
  mixRgb,
  heatColor,
  byte,
} from '../../state/evaluator/frames'
import { _snoise2, worleyHash, normalizedSeed } from '../../state/evaluator/random'
import { resampleSpectrumBins, isAudioSignal } from '../../state/evaluator/signals'
import { instanceState, onInstanceDisposed } from '../../state/evaluator/memory'

// An AnimARTrix instance is instance state held outside the evaluator's maps.
onInstanceDisposed(disposeAnimartrixState)

// Vocal Aurora intentionally compresses its vocal envelope before that signal
// drives brightness, motion, curtain width, and palette travel. Without this
// soft curve, one input effectively gets amplified by four visual responses.
export const VOCAL_AURORA_MIN_INPUT_GAIN = 0.5
export const VOCAL_AURORA_MAX_INPUT_GAIN = 0.7

const flashLevel  = instanceState('flashLevel', new Map<string, { level: number; rising: boolean }>())

interface ColorTrailsState {
  frame: Frame
  tmp: Frame
  w: number
  h: number
  seed: number
  lastT: number
  beatPulse: number
}
const colorTrailsState = instanceState('colorTrailsState', new Map<string, ColorTrailsState>())

interface SpectrumVisualizerState {
  levels: Float32Array
  peaks: Float32Array
  peakVelocity: Float32Array
  holdUntil: Float32Array
  waterfall: Frame
  w: number
  h: number
  style: string
  lastT: number
  lastWaterfallT: number
}
const spectrumVisualizerState = instanceState('spectrumVisualizerState', new Map<string, SpectrumVisualizerState>())

// ── New audio-reactive pattern state ──────────────────────────────────────
// KickShock — pool of expanding shockwave rings, spawned on kick/snare edges.
interface ShockRing { born: number; kind: 0 | 1; x: number; y: number }
interface KickShockState { rings: (ShockRing | null)[]; next: number; prevKick: boolean; prevSnare: boolean }
const kickShockState = instanceState('kickShockState', new Map<string, KickShockState>())
// BeatKaleidoscope — a decaying "punch" level, same shape as BeatFlash's flashLevel.
const kaleidoPunch = instanceState('kaleidoPunch', new Map<string, number>())
// PercussionBlobs — pool of metaball blobs, spawned on kick/snare/hihat edges.
interface Blob { x: number; y: number; born: number; kind: 0 | 1 | 2 }
interface PercussionBlobsState { blobs: (Blob | null)[]; next: number; prevKick: boolean; prevSnare: boolean; prevHihat: boolean }
const percussionBlobsState = instanceState('percussionBlobsState', new Map<string, PercussionBlobsState>())
// EmberPulse — a decaying beat-triggered "ember burst" level.
const emberBurst = instanceState('emberBurst', new Map<string, number>())
// RainRipples — pool of expanding ripples, spawned on a trigger rising edge.
interface Ripple { x: number; y: number; born: number }
interface RainRipplesState { ripples: (Ripple | null)[]; next: number; prevTrig: boolean }
const rainRipplesState = instanceState('rainRipplesState', new Map<string, RainRipplesState>())
// PrismStorm — held shard orientation (degrees), snapped on a hihat rising edge.
const prismOrientation = instanceState('prismOrientation', new Map<string, { v: number; prev: boolean }>())
// Integrated audio-modulated drift phases (VocalAurora, BeatKaleidoscope,
// SpectraMosaic, TurbulentBloom, PrismStorm, AudioFlow). These nodes animate
// by a rate that depends on a live audio level, so the phase must be
// integrated frame by frame: multiplying absolute t by the rate would
// re-scale all accumulated time on every level fluctuation, jumping the
// phase by t·Δrate (worse the longer the app runs). Terms that multiply t by
// constants/props alone don't jump and stay un-integrated.
interface DriftPhase { a: number; b: number; lastT: number }
const driftPhase = instanceState('driftPhase', new Map<string, DriftPhase>())
function advanceDrift(key: string, t: number, rateA: number, rateB = 0): DriftPhase {
  const state = driftPhase.get(key) ?? { a: 0, b: 0, lastT: t }
  const dt = Math.min(0.25, Math.max(0, t - state.lastT))
  state.a += dt * rateA
  state.b += dt * rateB
  state.lastT = t
  driftPhase.set(key, state)
  return state
}

function evalSpectrumBars(
  bass: number,
  mids: number,
  treble: number,
  intensity: number,
  speed: number,
  t: number,
  palette: Palette,
  mirror: boolean,
  W = DEFAULT_W,
  H = DEFAULT_H,
): Frame {
  const frame: Frame = blankFrame(W, H)
  const b = Math.max(0, Math.min(1, bass))
  const m = Math.max(0, Math.min(1, mids))
  const tr = Math.max(0, Math.min(1, treble))
  const strength = Math.max(0, Math.min(1, intensity))
  const spd = Math.max(0, Math.min(1, speed))
  const columns = Math.max(1, mirror ? Math.ceil(W / 2) : W)
  const levels = [b, m, tr]
  const geometryMotion = t * (0.45 + spd * 3.2)
  const paletteScroll = t * (0.08 + spd * 0.42)

  for (let x = 0; x < columns; x++) {
    const nx = columns <= 1 ? 0 : x / (columns - 1)
    const spectrumPos = nx * (levels.length - 1)
    const left = Math.floor(spectrumPos)
    const right = Math.min(levels.length - 1, left + 1)
    const blend = spectrumPos - left
    const baseLevel = levels[left] * (1 - blend) + levels[right] * blend
    const ripple = Math.sin(nx * 10.5 - geometryMotion * (1.1 + tr * 1.8)) * 0.08 * strength
    const shimmer = Math.max(0, Math.sin(nx * 21 + geometryMotion * (2 + m * 2.5))) * 0.06 * tr * strength
    const level = Math.max(0, Math.min(1, baseLevel * (0.45 + strength * 0.9) + ripple + shimmer))
    const barH = Math.max(0, Math.round(level * H))

    for (let row = 0; row < barH; row++) {
      const y = H - 1 - row
      const vertical = H <= 1 ? 0 : row / (H - 1)
      const pulse = 0.72 + 0.28 * Math.sin(vertical * 6.2 - geometryMotion * (1.4 + b * 1.6))
      const v = Math.max(0, Math.min(1, (0.28 + vertical * 0.72) * pulse))
      const colorPos = nx + paletteScroll + vertical * (0.12 + m * 0.12) + spectrumPos * 0.08
      const c = samplePalette(palette, colorPos)
      const px = {
        r: Math.round(c.r * v),
        g: Math.round(c.g * v),
        b: Math.round(c.b * v),
      }
      frame[y][x] = px
      if (mirror) frame[y][W - 1 - x] = { ...px }
    }

    if (barH > 0) {
      const peakY = Math.max(0, H - barH)
      const peak = samplePalette(palette, nx + paletteScroll + spectrumPos * 0.08)
      const glow = Math.min(1, 0.6 + tr * 0.35 + strength * 0.2)
      const cap = {
        r: Math.round(peak.r * glow),
        g: Math.round(peak.g * glow),
        b: Math.round(peak.b * glow),
      }
      frame[peakY][x] = cap
      if (mirror) frame[peakY][W - 1 - x] = { ...cap }
    }
  }

  return frame
}

interface SpectrumVisualizerParams {
  style: string
  bands: number
  gain: number
  smoothing: number
  tilt: number
  peakHold: number
  peakGravity: number
  waterfallSpeed: number
}

function evalSpectrumVisualizer(
  key: string,
  source: readonly number[],
  params: SpectrumVisualizerParams,
  t: number,
  palette: Palette,
  W = DEFAULT_W,
  H = DEFAULT_H,
): Frame {
  let state = spectrumVisualizerState.get(key)
  if (!state || state.w !== W || state.h !== H || state.style !== params.style) {
    state = {
      levels: new Float32Array(W),
      peaks: new Float32Array(W),
      peakVelocity: new Float32Array(W),
      holdUntil: new Float32Array(W),
      waterfall: rawBlankFrame(W, H),
      w: W,
      h: H,
      style: params.style,
      lastT: -1,
      lastWaterfallT: t,
    }
    spectrumVisualizerState.set(key, state)
  }

  const dt = state.lastT < 0 ? 1 / 60 : Math.max(0, Math.min(0.1, t - state.lastT))
  state.lastT = t
  const bands = Math.max(4, Math.min(32, Math.round(params.bands)))
  const sampled = resampleSpectrumBins(source, bands)
  const retain = Math.pow(Math.max(0, Math.min(0.95, params.smoothing)), dt * 60)
  /*
   * Every knob is bounded to its own declared domain, and to the same bounds
   * the generator emits. These were half-applied before - gain and tilt not at
   * all, peakHold and peakGravity only from below - which cost nothing while
   * the values could only arrive from a bounded slider. A wire has no such
   * bound, so the halves that were missing are where preview and firmware
   * would have parted company on a signal outside the domain.
   */
  const gain = Math.max(0.25, Math.min(4, params.gain))
  const tilt = Math.max(0, Math.min(1, params.tilt))
  const peakHold = Math.max(0, Math.min(2, params.peakHold))
  const peakGravity = Math.max(0.2, Math.min(6, params.peakGravity))

  for (let x = 0; x < W; x++) {
    const position = W <= 1 ? 0 : x / (W - 1) * (bands - 1)
    const left = Math.floor(position)
    const right = Math.min(bands - 1, left + 1)
    const mix = position - left
    const frequency = bands <= 1 ? 0 : position / (bands - 1)
    const raw = sampled[left] * (1 - mix) + sampled[right] * mix
    const target = clamp01(raw * gain * (1 + frequency * tilt * 1.8))
    state.levels[x] = state.levels[x] * retain + target * (1 - retain)

    if (state.levels[x] >= state.peaks[x]) {
      state.peaks[x] = state.levels[x]
      state.peakVelocity[x] = 0
      state.holdUntil[x] = t + peakHold
    } else if (t >= state.holdUntil[x]) {
      state.peakVelocity[x] += peakGravity * dt
      state.peaks[x] = Math.max(state.levels[x], state.peaks[x] - state.peakVelocity[x] * dt)
    }
  }

  if (params.style === 'Waterfall') {
    const speed = Math.max(1, Math.min(30, params.waterfallSpeed))
    const steps = Math.min(H, Math.floor((t - state.lastWaterfallT) * speed))
    if (steps > 0) {
      state.lastWaterfallT += steps / speed
      for (let step = 0; step < steps; step++) {
        for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) {
          const src = state.waterfall[y + 1][x]
          const dst = state.waterfall[y][x]
          dst.r = src.r; dst.g = src.g; dst.b = src.b
        }
        for (let x = 0; x < W; x++) {
          const level = clamp01(state.levels[x])
          const color = scaleRgb(samplePalette(palette, 0.14 + level * 0.82), level < 0.02 ? 0 : 0.25 + level * 0.75)
          const dst = state.waterfall[H - 1][x]
          dst.r = color.r; dst.g = color.g; dst.b = color.b
        }
      }
    }
    return state.waterfall
  }

  const frame = blankFrame(W, H)
  const paintPeak = (x: number, y: number, value: number) => {
    if (value < 0.015 || x < 0 || x >= W || y < 0 || y >= H) return
    frame[y][x] = scaleRgb(samplePalette(palette, 0.14 + value * 0.82), 1.15)
  }

  if (params.style === 'Orbit') {
    const cx = (W - 1) * 0.5
    const cy = (H - 1) * 0.5
    const minDim = Math.max(2, Math.min(W, H))
    const inner = 0.15
    const extent = 0.32
    const pixelRadius = 0.72 / minDim
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - cx) / minDim
      const dy = (y - cy) / minDim
      const radius = Math.hypot(dx, dy)
      const angle = (Math.atan2(dy, dx) + Math.PI * 2.5) % (Math.PI * 2) / (Math.PI * 2)
      const column = Math.min(W - 1, Math.floor(angle * W))
      const level = state.levels[column]
      const outer = inner + level * extent
      const peakRadius = inner + state.peaks[column] * extent
      if (Math.abs(radius - peakRadius) <= pixelRadius && state.peaks[column] > 0.015) {
        frame[y][x] = scaleRgb(samplePalette(palette, angle), 1.15)
      } else if (radius >= inner && radius <= outer) {
        frame[y][x] = scaleRgb(samplePalette(palette, angle), 0.34 + level * 0.66)
      }
    }
    return frame
  }

  if (params.style === 'Centre Mirror') {
    const upperCentre = Math.floor((H - 1) / 2)
    const lowerCentre = Math.ceil((H - 1) / 2)
    const reach = Math.max(1, Math.floor(H / 2))
    for (let x = 0; x < W; x++) {
      const level = state.levels[x]
      const length = Math.round(level * reach)
      for (let row = 0; row < length; row++) {
        const amount = reach <= 1 ? 1 : row / (reach - 1)
        const color = scaleRgb(samplePalette(palette, 0.14 + amount * 0.82), 0.4 + amount * 0.6)
        if (upperCentre - row >= 0) frame[upperCentre - row][x] = color
        if (lowerCentre + row < H) frame[lowerCentre + row][x] = { ...color }
      }
      const peakOffset = Math.round(state.peaks[x] * reach)
      paintPeak(x, upperCentre - peakOffset, state.peaks[x])
      paintPeak(x, lowerCentre + peakOffset, state.peaks[x])
    }
    return frame
  }

  for (let x = 0; x < W; x++) {
    const level = state.levels[x]
    const barHeight = Math.round(level * H)
    for (let row = 0; row < barHeight; row++) {
      const y = H - 1 - row
      const amount = H <= 1 ? 1 : row / (H - 1)
      const brightness = params.style === 'Ribbon'
        ? (row === barHeight - 1 ? 1 : 0.18 + amount * 0.42)
        : 0.34 + amount * 0.66
      frame[y][x] = scaleRgb(samplePalette(palette, 0.14 + amount * 0.82), brightness)
    }
    const peakY = H - 1 - Math.round(state.peaks[x] * (H - 1))
    paintPeak(x, peakY, state.peaks[x])
  }
  return frame
}

function evalBassPulse(bass: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = clamp01(bass)
  const v = Math.pow(level, 0.5)
  // Bass level sweeps across the palette; brightness rises with it too.
  const lit = scaleRgb(samplePalette(palette, level), v)
  return solidFrame(lit, W, H)
}

function evalBassRings(bass: number, intensity: number, speed: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, bass))
  const strength = Math.max(0, Math.min(1, intensity))
  const cx = W / 2
  const cy = H / 2
  const maxD = Math.max(1e-6, Math.hypot(cx, cy))
  const motion = Math.max(0, speed) * (0.75 + level * 1.75 * strength)
  const phase = t * (1.2 + motion * 4.8)
  const ringCount = 4 + level * 8 * strength
  const floor = 0.04 + level * 0.1 * strength
  const gain = 0.16 + level * 0.84 * strength
  return buildFrame(W, H, (x, y) => {
      const dist = Math.hypot(x - cx, y - cy) / maxD
      const wave = Math.sin(dist * ringCount * Math.PI * 2 - phase)
      const crisp = Math.pow(Math.max(0, wave * 0.5 + 0.5), 2.4)
      const v = Math.min(1, floor + crisp * gain)
      // Concentric palette rings by distance from centre, brightness by the wave.
      return scaleRgb(samplePalette(palette, dist), v)
    })
}

function evalMidrangeWaves(mids: number, intensity: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const midsAmt = Math.min(1, Math.max(0, mids))
      const strength = Math.min(1, Math.max(0, intensity))
      const motion = speed * (1 + midsAmt * 1.5 * strength)
      const contrast = 0.7 + midsAmt * 1.8 * strength
      const waveBase = Math.sin(x * 0.8 + t * motion * 4) * Math.sin(y * 0.5 + t * motion * 2.5)
      const wave = Math.max(-1, Math.min(1, waveBase * contrast))
      const waveIntensity = Math.min(1, 0.1 + Math.pow(midsAmt, 0.65) * 1.25 * strength)
      const v = (wave + 1) / 2 * waveIntensity
      const c = samplePalette(palette, (wave + 1) / 2)
      return {
        r: Math.round(c.r * v),
        g: Math.round(c.g * v),
        b: Math.round(c.b * v),
      }
    })
}

function evalMidrangeBloom(mids: number, intensity: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, mids))
  const strength = Math.max(0, Math.min(1, intensity))
  const motion = Math.max(0, speed) * (0.8 + level * 2.2 * strength)
  const cx0 = (W - 1) / 2
  const cy0 = (H - 1) / 2
  const sx = Math.max(1, W / 2)
  const sy = Math.max(1, H / 2)
  return buildFrame(W, H, (x, y) => {
      const cx = (x - cx0) / sx
      const cy = (y - cy0) / sy
      const radial = Math.hypot(cx, cy)
      const swirl = Math.sin((cx * cx - cy * cy) * 6 + t * motion * 3.2)
        + Math.cos((cx + cy) * 4 - t * motion * 2.4)
      const bloom = Math.sin(radial * (5 + level * 8 * strength) * Math.PI - t * motion * 4 + swirl * 0.6)
      const crisp = Math.pow(Math.max(0, bloom * 0.5 + 0.5), 1.8)
      const v = Math.min(1, crisp * (0.22 + level * 0.78 * strength))
      const c = samplePalette(palette, radial * 0.6 + swirl * 0.12 + t * motion * 0.05)
      return {
        r: Math.round(c.r * v),
        g: Math.round(c.g * v),
        b: Math.round(c.b * v),
      }
    })
}

function evalTrebleSparks(nodeId: string, treble: number, density: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, treble))
  const amount = Math.max(0, Math.min(1, density))
  let state = sparkState.get(nodeId)
  if (!state || state.w !== W || state.h !== H) {
    // Persistent buffer, mutated in place each pass — never pool-allocated.
    state = { frame: rawBlankFrame(W, H), w: W, h: H }
    sparkState.set(nodeId, state)
  }

  const frame = state.frame
  const fade = 0.58 + (1 - level) * 0.16
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = frame[y][x]
      const faded = scaleRgb(px, fade)
      px.r = faded.r; px.g = faded.g; px.b = faded.b
    }
  }

  const spawnChance = 0.2 + level * 0.8
  let spawnCount = Math.round(W * H * amount * (0.03 + level * 0.12))
  if (spawnCount < 1 && amount * level > 0.05) spawnCount = 1

  const addSpark = (x: number, y: number, spark: RGB, strength: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H || strength <= 0) return
    const px = frame[y][x]
    const sum = addRgb(px, scaleRgb(spark, strength))
    px.r = sum.r; px.g = sum.g; px.b = sum.b
  }

  for (let i = 0; i < spawnCount; i++) {
    if (Math.random() > spawnChance) continue
    const x = Math.floor(Math.random() * W)
    const y = Math.floor(Math.random() * H)
    const flash = 0.55 + Math.random() * 0.45
    // Each spark draws a random point of the palette, then flashes toward white.
    const whiteHot = mixRgb(samplePalette(palette, Math.random()), { r: 255, g: 255, b: 255 }, 0.35 + level * 0.35)
    const spark = scaleRgb(whiteHot, (0.7 + level * 0.6) * flash)
    addSpark(x, y, spark, 1)
    addSpark(x - 1, y, spark, 0.42)
    addSpark(x + 1, y, spark, 0.42)
    addSpark(x, y - 1, spark, 0.42)
    addSpark(x, y + 1, spark, 0.42)
    addSpark(x - 1, y - 1, spark, 0.16)
    addSpark(x + 1, y - 1, spark, 0.16)
    addSpark(x - 1, y + 1, spark, 0.16)
    addSpark(x + 1, y + 1, spark, 0.16)
  }

  // `frame` IS the persistent state buffer (mutated in place above);
  // downstream consumers never mutate their inputs, so return it directly.
  return frame
}

function evalTreblePrism(treble: number, intensity: number, speed: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const level = Math.max(0, Math.min(1, treble))
  const strength = Math.max(0, Math.min(1, intensity))
  const motion = Math.max(0, speed) * (1.2 + level * 3.2 * strength)
  return buildFrame(W, H, (x, y) => {
      const diagA = x * 1.7 + y * 1.15
      const diagB = x * -1.1 + y * 1.9
      const waveA = Math.sin(diagA + t * motion * 7.5)
      const waveB = Math.sin(diagB - t * motion * 6.1)
      const prism = Math.max(0, waveA * 0.55 + waveB * 0.45)
      const shard = Math.pow(prism, 3.6)
      const flash = Math.pow(Math.max(0, Math.sin((x + y) * 2.4 - t * motion * 9) * 0.5 + 0.5), 10)
      const v = Math.min(1, shard * (0.3 + level * 0.7 * strength) + flash * level * 0.9 * strength)
      // Diagonal position spreads the palette across the shards, like a prism.
      const pt = (x + y) / (W + H)
      return scaleRgb(samplePalette(palette, pt), v)
    })
}

function evalAudioCascade(bass: number, mids: number, treble: number, intensity: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const b = Math.max(0, Math.min(1, bass))
  const m = Math.max(0, Math.min(1, mids))
  const tr = Math.max(0, Math.min(1, treble))
  const strength = Math.max(0, Math.min(1, intensity))
  const motion = Math.max(0, speed) * (0.8 + (b + m + tr) * 1.4 * strength)
  return buildFrame(W, H, (x, y) => {
      const nx = W > 1 ? x / (W - 1) : 0
      const ny = H > 1 ? y / (H - 1) : 0
      const ribbon = Math.sin((nx * 7 + ny * 2.5) + t * motion * (2 + m * 3 * strength))
      const sweep = Math.cos((ny * 9 - nx * 3) - t * motion * (1.4 + b * 2.2 * strength))
      const shimmer = Math.pow(Math.max(0, Math.sin((nx + ny) * 18 + t * motion * (4 + tr * 8 * strength)) * 0.5 + 0.5), 6)
      const body = Math.max(0, ribbon * 0.55 + sweep * 0.45)
      const v = Math.min(1, body * (0.18 + m * 0.52 * strength) + b * 0.24 * strength + shimmer * tr * 0.85 * strength)
      const pt = nx * (0.2 + b * 0.5) + ny * (0.35 + m * 0.45) + shimmer * 0.15 + t * motion * 0.03
      const c = samplePalette(palette, pt)
      return {
        r: Math.round(c.r * v),
        g: Math.round(c.g * v),
        b: Math.round(c.b * v),
      }
    })
}

// Attack ramps the flash level to 1 over `attack` seconds instead of snapping
// immediately (attack = 0, the default, reproduces the original instant-flash
// behaviour); once at peak, decay multiplies the level down each tick as before.
export const BEAT_FLASH_ATTACK_MAX_SEC = 1.5

function updateBeatFlashLevel(key: string, beat: boolean, attack: number, decay: number): number {
  const state = flashLevel.get(key) ?? { level: 0, rising: false }
  const attackSec = Math.max(0, attack) * BEAT_FLASH_ATTACK_MAX_SEC
  const attackStep = attackSec > 0 ? Math.min(1, 1 / (attackSec * 60)) : 1
  if (beat) state.rising = true
  if (state.rising) {
    state.level = Math.min(1, state.level + attackStep)
    if (state.level >= 1) state.rising = false
  } else {
    state.level *= decay
  }
  flashLevel.set(key, state)
  return state.level
}

// Blend a beat-triggered flash of `color` onto `base` at `level` (0–1).
// `preserveBase` toggles whether the underlying frame shows through the flash
// (screen/add toward color) or is fully replaced by the flash color while lit.
function blendBeatFlash(
  base: Frame | null, level: number, color: RGB, intensity: number,
  blendMode: 'screen' | 'add', preserveBase: boolean, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const src = base ?? blankFrame(W, H)
  if (level < 0.003) return src

  const effective = Math.max(0, level * intensity)
  const { r: cr, g: cg, b: cb } = color
  return src.map(row =>
    row.map(px => {
      if (!preserveBase) {
        return {
          r: Math.max(0, Math.min(255, Math.round(cr * effective))),
          g: Math.max(0, Math.min(255, Math.round(cg * effective))),
          b: Math.max(0, Math.min(255, Math.round(cb * effective))),
        }
      }
      if (blendMode === 'add') {
        return {
          r: Math.min(255, Math.round(px.r + cr * effective)),
          g: Math.min(255, Math.round(px.g + cg * effective)),
          b: Math.min(255, Math.round(px.b + cb * effective)),
        }
      }
      return {
        r: Math.max(0, Math.min(255, Math.round(px.r + (cr - px.r) * effective))),
        g: Math.max(0, Math.min(255, Math.round(px.g + (cg - px.g) * effective))),
        b: Math.max(0, Math.min(255, Math.round(px.b + (cb - px.b) * effective))),
      }
    })
  )
}

// ── New audio-reactive patterns ───────────────────────────────────────────

// Expanding shockwave rings triggered by kick (big/slow) and snare (small/fast),
// textured with hihat grain — a Particles-pool-style capped spawn array.
function evalKickShock(
  key: string, kick: number, snare: number, hihat: number, energy: number, speed: number,
  t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
  count = 8, decay = 1, thickness = 1, spawnSpread = 0, blendMode: 'add' | 'max' = 'add',
  tiles = 1,
): Frame {
  const CAP = Math.max(1, Math.round(count))
  let state = kickShockState.get(key)
  if (!state || state.rings.length !== CAP) {
    state = { rings: new Array(CAP).fill(null), next: 0, prevKick: false, prevSnare: false }
    kickShockState.set(key, state)
  }
  const tileCount = Math.max(1, Math.min(8, Math.round(tiles)))
  const tileW = W / tileCount, tileH = H / tileCount
  const cx = (tileW - 1) / 2, cy = (tileH - 1) / 2
  const spread = clamp01(spawnSpread)
  // spread=0 (the default) always spawns at the shared centre — identical to
  // the old fixed-origin shockwave; spread=1 spawns anywhere on the matrix.
  const spawnAt = () => ({ x: cx + (Math.random() * tileW - cx) * spread, y: cy + (Math.random() * tileH - cy) * spread })
  const kickHit = kick > 0.5, snareHit = snare > 0.5
  if (kickHit && !state.prevKick) { const o = spawnAt(); state.rings[state.next] = { born: t, kind: 0, ...o }; state.next = (state.next + 1) % CAP }
  if (snareHit && !state.prevSnare) { const o = spawnAt(); state.rings[state.next] = { born: t, kind: 1, ...o }; state.next = (state.next + 1) % CAP }
  state.prevKick = kickHit; state.prevSnare = snareHit

  const strength = clamp01(energy)
  const spd = Math.max(0.2, speed)
  const lifeMult = Math.max(0.05, decay), bandMult = Math.max(0.05, thickness)
  // Divide speed by lifeMult (and multiply life by it) so the ring's total
  // travel distance (speed*life) stays constant regardless of decay — decay
  // then reads as "lingers longer" rather than merely "the age>life cutoff
  // fires later," which alone wouldn't matter since the front would have
  // already expanded past the visible matrix either way.
  const speedK = (0.35 + strength * 0.5) * spd / lifeMult, speedS = speedK * 1.8
  const lifeK = 1.9 * lifeMult, lifeS = 1.0 * lifeMult, bandK = 0.10 * bandMult, bandS = 0.055 * bandMult
  const maxD = Math.max(1e-6, Math.hypot(cx, cy))
  const hihatAmt = clamp01(hihat)
  const additive = blendMode !== 'max'

  return buildFrame(W, H, (x, y) => {
    // Repeat the same shockwave field in every grid cell. Fractional tile
    // coordinates keep the split even when W/H are not divisible by tiles.
    const localX = ((x + 0.5) * tileCount % W) / tileCount - 0.5
    const localY = ((y + 0.5) * tileCount % H) / tileCount - 0.5
    // Kept centre-relative regardless of spawnSpread — the jitter/palette
    // texture is a cosmetic sweep from the matrix middle, not tied to any
    // one ring's origin.
    const distC = Math.hypot(localX - cx, localY - cy) / maxD
    let wave = 0
    for (const ring of state.rings) {
      if (!ring) continue
      const age = t - ring.born
      const isKick = ring.kind === 0
      const spdR = isKick ? speedK : speedS, life = isKick ? lifeK : lifeS, band = isKick ? bandK : bandS
      if (age < 0 || age > life) continue
      const dist = Math.hypot(localX - ring.x, localY - ring.y) / maxD
      const front = Math.exp(-((dist - age * spdR) ** 2) / (2 * band * band))
      const contribution = front * (1 - age / life)
      wave = additive ? wave + contribution : Math.max(wave, contribution)
    }
    wave = Math.min(1, wave)
    const jitter = hihatAmt * 0.18 * (Math.sin(distC * 50 - t * speed * 22) * 0.5 + 0.5)
    const v = Math.min(1, wave * (0.5 + strength * 0.5) + jitter * wave + 0.03 * strength)
    const c = samplePalette(palette, distC * 0.5 + t * speed * 0.03)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Vertical aurora-borealis curtains shaped by vocal presence; dims toward black
// on silence.
function evalVocalAurora(
  key: string, vocals: number, energy: number, silence: boolean, speed: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const rawLevel = clamp01(vocals)
  const level = rawLevel * (
    VOCAL_AURORA_MIN_INPUT_GAIN
    + rawLevel * (VOCAL_AURORA_MAX_INPUT_GAIN - VOCAL_AURORA_MIN_INPUT_GAIN)
  )
  const strength = clamp01(energy)
  const gate = silence ? 0 : 1
  const drift = advanceDrift(key, t, speed * (0.15 + level * 0.35)).a
  return buildFrame(W, H, (x, y) => {
    const ny = H > 1 ? y / (H - 1) : 0
    let curtain = 0
    for (let bnd = 0; bnd < 3; bnd++) {
      const bandPhase = ny * 3.0 + bnd * 2.1 + drift * (1 + bnd * 0.4)
      const xOff = Math.sin(bandPhase) * (1.2 + level * 1.8) + Math.sin(bandPhase * 0.5 + bnd) * 0.6
      const dx = (x - W / 2) / Math.max(1, W / 2) - xOff * 0.35
      curtain += Math.exp(-dx * dx * 3.0) * (0.5 + 0.5 * Math.sin(bandPhase * 1.7 + bnd * 1.3))
    }
    const vBrightness = Math.min(1, (0.12 + strength * 0.35 + level * 0.65) * gate)
    const v = Math.min(1, curtain * 0.6) * vBrightness
    const c = samplePalette(palette, ny * 0.6 + drift * 0.08 + level * 0.25)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Wedge-mirrored plasma that punches wider and spins harder on every beat
// (beat is already a one-frame pulse, so no separate edge tracking is needed —
// the punch level decays the same way BeatFlash's flashLevel does).
function evalBeatKaleidoscope(
  key: string, beat: boolean, hue: number, energy: number, speed: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let punch = kaleidoPunch.get(key) ?? 0
  punch = beat ? 1 : punch * 0.85
  kaleidoPunch.set(key, punch)

  const strength = clamp01(energy)
  const wedges = 6 + Math.round(punch * 6)
  const rot = advanceDrift(key, t, speed * (0.15 + strength * 0.35)).a + punch * 0.8
  const wedgeAngle = (Math.PI * 2) / wedges
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const maxD = Math.max(1e-6, Math.hypot(cx, cy))

  return buildFrame(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy
    const dist = Math.hypot(dx, dy) / maxD
    const ang = Math.atan2(dy, dx) + rot
    let a = ((ang % wedgeAngle) + wedgeAngle) % wedgeAngle
    if (a > wedgeAngle / 2) a = wedgeAngle - a
    const tex = Math.sin(a * 10 + dist * 8 * (1 + punch * 0.6) - t * speed * 3) * Math.cos(dist * 5 * (1 + punch * 0.6) - a * 6)
    const v = Math.min(1, Math.max(0, tex * 0.5 + 0.5) * (0.35 + strength * 0.65) + punch * 0.25)
    const c = samplePalette(palette, dist * 0.5 + a * 0.3 + hue / 360 + t * speed * 0.05)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Tiled mosaic grid — bass/mids/treble sweep diagonally across the cells.
function evalSpectraMosaic(
  key: string, bass: number, mids: number, treble: number, energy: number, speed: number, tiles: number,
  t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const n = Math.max(2, Math.min(8, Math.round(tiles)))
  const strength = clamp01(energy)
  const cellW = W / n, cellH = H / n
  const sweep = advanceDrift(key, t, speed * (0.4 + strength * 0.8)).a
  return buildFrame(W, H, (x, y) => {
    const cx = Math.floor(x / cellW), cy = Math.floor(y / cellH)
    const diag = (cx + cy) / (2 * Math.max(1, n - 1))
    const mix = bass * (1 - diag) + mids * 0.5 + treble * diag
    const phase = cx * 0.6 + cy * 0.9 + sweep
    const shimmer = Math.sin(phase) * 0.5 + 0.5
    const v = Math.min(1, 0.15 + mix * 0.6 * strength + shimmer * 0.25)
    const c = samplePalette(palette, diag * 0.6 + mix * 0.3 + t * speed * 0.04)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Three-tier metaball blobs — kick (large/slow), snare (medium/sharp), and
// hihat (tiny/fast) each spawn their own tier.
function evalPercussionBlobs(
  key: string, kick: number, snare: number, hihat: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
  count = 12, size = 1, decay = 1, spawnSpread = 1, blendMode: 'add' | 'max' = 'add',
): Frame {
  const CAP = Math.max(1, Math.round(count))
  let state = percussionBlobsState.get(key)
  if (!state || state.blobs.length !== CAP) {
    state = { blobs: new Array(CAP).fill(null), next: 0, prevKick: false, prevSnare: false, prevHihat: false }
    percussionBlobsState.set(key, state)
  }
  const kickHit = kick > 0.5, snareHit = snare > 0.5, hihatHit = hihat > 0.55
  const cx = W / 2, cy = H / 2
  const spread = clamp01(spawnSpread)
  // spread=1 (the default) reproduces the old fully-random spawn exactly
  // (cx + (rand*W - cx)*1 === rand*W); lower values pull spawns toward centre.
  const spawn = (kind: 0 | 1 | 2) => {
    state.blobs[state.next] = {
      x: cx + (Math.random() * W - cx) * spread,
      y: cy + (Math.random() * H - cy) * spread,
      born: t, kind,
    }
    state.next = (state.next + 1) % CAP
  }
  if (kickHit && !state.prevKick) spawn(0)
  if (snareHit && !state.prevSnare) spawn(1)
  if (hihatHit && !state.prevHihat) spawn(2)
  state.prevKick = kickHit; state.prevSnare = snareHit; state.prevHihat = hihatHit

  const sizeMult = Math.max(0.1, size), lifeMult = Math.max(0.05, decay)
  const PARAMS = {
    0: { r: 0.34 * sizeMult, life: 1.4 * lifeMult },
    1: { r: 0.20 * sizeMult, life: 0.7 * lifeMult },
    2: { r: 0.10 * sizeMult, life: 0.35 * lifeMult },
  } as const
  const minDim = Math.min(W, H)
  const additive = blendMode !== 'max'

  return buildFrame(W, H, (x, y) => {
    let field = 0
    for (const blob of state.blobs) {
      if (!blob) continue
      const age = t - blob.born
      const p = PARAMS[blob.kind]
      if (age < 0 || age > p.life) continue
      const lifeT = age / p.life
      const radius = p.r * minDim * (0.4 + 0.6 * Math.min(1, lifeT * 2))
      const decayF = 1 - lifeT
      const dx = x - blob.x, dy = y - blob.y
      const contribution = decayF * (radius * radius) / (dx * dx + dy * dy + radius * radius * 0.15)
      field = additive ? field + contribution : Math.max(field, contribution)
    }
    const v = Math.min(1, field / (field + 1.1))
    const c = samplePalette(palette, Math.min(1, field * 0.4))
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Bottom-up column fire (the shared black-body heatColor() ramp) — bass/mids/
// treble shape which columns run hot, with a beat-triggered ember burst.
function evalEmberPulse(
  key: string, bass: number, mids: number, treble: number, beat: boolean, energy: number,
  speed: number, t: number, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let burst = emberBurst.get(key) ?? 0
  burst = beat ? Math.min(1, burst + 0.6) : burst * 0.90
  emberBurst.set(key, burst)

  const strength = clamp01(energy)
  const flicker = t * speed * 3.0

  return buildFrame(W, H, (x, y) => {
    const nx = W > 1 ? x / (W - 1) : 0
    const heightFromBottom = H > 1 ? (H - 1 - y) / (H - 1) : 0   // 0 at bottom, 1 at top
    const centerDist = Math.abs(nx - 0.5) * 2
    const bandWeight = bass * (1 - centerDist) + mids * (1 - Math.abs(centerDist - 0.5) * 2) + treble * centerDist
    const flicker1 = Math.sin(nx * 17 + flicker + heightFromBottom * 4) * 0.5 + 0.5
    const flicker2 = Math.sin(nx * 29 - flicker * 1.3) * 0.5 + 0.5
    const heightFalloff = Math.max(0, 1 - heightFromBottom * (1.1 - bandWeight * 0.5 - strength * 0.3))
    let heat = heightFalloff * (0.35 + bandWeight * 0.65 * strength) * (0.7 + flicker1 * 0.2 + flicker2 * 0.1)
    heat = Math.min(1, heat + burst * Math.max(0, 1 - heightFromBottom * 0.6) * 0.8)
    return heatColor(heat * 255)
  })
}

// Radial bloom whose sample coordinates are pushed through noise turbulence
// before evaluating the bloom — treble drives fine/fast jitter, mids the
// slow/large-scale drift.
function evalTurbulentBloom(
  key: string, bass: number, mids: number, treble: number, energy: number, speed: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const strength = clamp01(energy)
  const trebleAmp = 0.15 + treble * 0.6, midsAmp = 0.3 + mids * 0.9
  // FastLED's per-band normalization spends a lot of time in the upper half
  // of the 0..1 range.  Keep that useful headroom instead of clipping every
  // bass value above ~0.56 to the same brightness.
  const bassPulse = 0.5 + Math.sqrt(clamp01(bass)) * 0.5
  const phases = advanceDrift(key, t, speed * (1.5 + treble * 2), speed * (0.3 + mids * 0.6))
  const tFast = phases.a, tSlow = phases.b

  return buildFrame(W, H, (x, y) => {
    const cx = (x - (W - 1) / 2) / Math.max(1, W / 2)
    const cy = (y - (H - 1) / 2) / Math.max(1, H / 2)
    const nOffX = _snoise2(cx * 3 + tFast, cy * 3 - tFast) * trebleAmp + _snoise2(cx * 0.6 + tSlow, cy * 0.6 + 50 + tSlow) * midsAmp
    const nOffY = _snoise2(cx * 3 + 50 + tFast, cy * 3 + 50 - tFast) * trebleAmp + _snoise2(cx * 0.6 + 50 + tSlow, cy * 0.6 + tSlow) * midsAmp
    const wx = cx + nOffX, wy = cy + nOffY
    const radial = Math.hypot(wx, wy)
    const bloom = Math.sin(radial * 6 - t * speed * 3) + Math.cos((wx + wy) * 3 + t * speed * 2)
    const crisp = Math.pow(Math.max(0, bloom * 0.5 + 0.5), 1.6)
    const v = Math.min(1, crisp * (0.2 + 0.8 * strength) * bassPulse)
    const c = samplePalette(palette, radial * 0.5 + tSlow * 0.05)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Gravitational-lensing rings around a drifting well — rings bunch up near the
// well instead of BassRings' evenly-spaced sine rings.
function evalGravityWell(
  bass: number, energy: number, speed: number, color: RGB, t: number,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const level = clamp01(bass), strength = clamp01(energy)
  const cx0 = (W - 1) / 2, cy0 = (H - 1) / 2
  const orbitR = Math.min(W, H) * 0.12 * (0.5 + strength * 0.5)
  const wellX = cx0 + Math.cos(t * speed * 0.25) * orbitR
  const wellY = cy0 + Math.sin(t * speed * 0.35) * orbitR
  const maxD = Math.max(1e-6, Math.hypot(cx0, cy0))
  const k = 5 + level * 10 * strength
  const phase = t * (1.0 + speed * 2.2)

  return buildFrame(W, H, (x, y) => {
    const dist = Math.hypot(x - wellX, y - wellY) / maxD
    const wave = Math.sin(k / (dist + 0.12) - phase)
    const crisp = Math.pow(Math.max(0, wave * 0.5 + 0.5), 2.2)
    const v = Math.min(1, 0.03 + level * 0.08 * strength + crisp * (0.15 + level * 0.85 * strength))
    return { r: Math.round(color.r * v), g: Math.round(color.g * v), b: Math.round(color.b * v) }
  })
}

// A pool of expanding, fading ripples — one born on each trigger rising edge,
// max-combined so overlapping ripples don't blow out.
function evalRainRipples(
  key: string, trigger: boolean, energy: number, speed: number, t: number,
  palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
  count = 8, decay = 1, thickness = 1, spawnSpread = 1, blendMode: 'add' | 'max' = 'max',
): Frame {
  const CAP = Math.max(1, Math.round(count))
  let state = rainRipplesState.get(key)
  if (!state || state.ripples.length !== CAP) {
    state = { ripples: new Array(CAP).fill(null), next: 0, prevTrig: false }
    rainRipplesState.set(key, state)
  }
  const cx = W / 2, cy = H / 2
  const spread = clamp01(spawnSpread)
  if (trigger && !state.prevTrig) {
    // spread=1 (the default) reproduces the old fully-random spawn exactly.
    state.ripples[state.next] = {
      x: cx + (Math.random() * W - cx) * spread,
      y: cy + (Math.random() * H - cy) * spread,
      born: t,
    }
    state.next = (state.next + 1) % CAP
  }
  state.prevTrig = trigger

  const strength = clamp01(energy)
  const spd = Math.max(0.2, speed)
  const lifeMult = Math.max(0.05, decay), bandMult = Math.max(0.05, thickness)
  const life = (1.6 / spd) * lifeMult
  const speedPx = Math.max(W, H) * 0.9 / life
  const band = (0.9 + (1 - strength) * 0.6) * bandMult
  const additive = blendMode === 'add'

  return buildFrame(W, H, (x, y) => {
    let v = 0
    for (const ripple of state.ripples) {
      if (!ripple) continue
      const age = t - ripple.born
      if (age < 0 || age > life) continue
      const dist = Math.hypot(x - ripple.x, y - ripple.y)
      const ring = Math.exp(-((dist - age * speedPx) ** 2) / (2 * band * band))
      const contribution = ring * (1 - age / life)
      v = additive ? v + contribution : Math.max(v, contribution)
    }
    v = Math.min(1, v * (0.6 + strength * 0.6))
    const c = samplePalette(palette, v * 0.5 + t * speed * 0.02)
    return { r: Math.round(c.r * v), g: Math.round(c.g * v), b: Math.round(c.b * v) }
  })
}

// Oriented Gabor-noise shards (same sparse-hash convolution as GaborNoise) that
// snap to a new pseudo-random orientation on every hihat rising edge.
function evalPrismStorm(
  key: string, treble: number, mids: number, hihat: number, energy: number, speed: number,
  t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let held = prismOrientation.get(key)
  if (!held) { held = { v: Math.random() * 360, prev: false }; prismOrientation.set(key, held) }
  const above = hihat > 0.55
  if (above && !held.prev) held.v = Math.random() * 360
  held.prev = above

  const strength = clamp01(energy)
  const drift = advanceDrift(key, t, speed * (4 + mids * 8)).a
  const omega = ((held.v + drift) * Math.PI) / 180
  const cosO = Math.cos(omega), sinO = Math.sin(omega)
  const freq = 0.8 + treble * 2.5
  const scale = 0.5 + mids * 0.4
  const TAU = Math.PI * 2

  return buildFrame(W, H, (x, y) => {
    const px = x * scale, py = y * scale
    const xi = Math.floor(px), yi = Math.floor(py)
    let v = 0
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const cx = xi + di, cy = yi + dj
        const h = worleyHash(cx, cy)
        const h2 = worleyHash(cx + 31, cy - 17)
        const fx = cx + 0.5 + (h - 0.5), fy = cy + 0.5 + (h2 - 0.5)
        const dx = px - fx, dy = py - fy
        const gauss = Math.exp(-2.5 * (dx * dx + dy * dy))
        const proj = dx * cosO + dy * sinO
        const w = h2 < 0.5 ? 1 : -1
        v += w * gauss * Math.cos(TAU * freq * proj + t * speed * 2 + h * TAU)
      }
    }
    const shard = Math.pow(Math.max(0, v * 0.5 + 0.5), 1.4)
    const vv = Math.min(1, shard * (0.25 + strength * 0.75))
    const c = samplePalette(palette, v * 0.5 + 0.5 + mids * 0.2)
    return { r: Math.round(c.r * vv), g: Math.round(c.g * vv), b: Math.round(c.b * vv) }
  })
}

// Color Trails is adapted from prototype work by Stefan Petrick, creator of
// AnimARTrix: https://github.com/StefanPetrick/animartrix
interface ColorTrailsParams {
  injectionMode: string
  flowMode: string
  xSpeed: number
  xAmplitude: number
  xFrequency: number
  ySpeed: number
  yAmplitude: number
  yFrequency: number
  displacement: number
  endpointSpeed: number
  colorSpeed: number
  persistence: number
  bass: number
  mids: number
  treble: number
  beat: boolean
  seed: number
}

// Seedable 1D gradient noise with Perlin's C² smootherstep. The integer hash
// replaces a per-instance 512-byte permutation table while keeping the same
// two-gradient/one-lerp construction; cppGenerator emits this exact hash.
function colorTrailsNoise1(x: number, seed: number): number {
  const hash = (lattice: number) => {
    let h = ((lattice >>> 0) ^ (seed >>> 0)) >>> 0
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
    return (h ^ (h >>> 16)) >>> 0
  }
  const xi = Math.floor(x)
  const xf = x - xi
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
  const a = (hash(xi) & 1) === 0 ? xf : -xf
  const d = xf - 1
  const b = (hash(xi + 1) & 1) === 0 ? d : -d
  return a + (b - a) * u
}

// Hash-based 2D Perlin variant used by the source's morphing flow mode. Keeping
// time on its own axis makes each profile evolve rather than merely translate.
function colorTrailsNoise2(x: number, y: number, seed: number): number {
  const hash = (latticeX: number, latticeY: number) => {
    const q = (Math.imul(latticeX, 0x8da6b343) ^ Math.imul(latticeY, 0xd8163841)) >>> 0
    let h = (q ^ (seed >>> 0)) >>> 0
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
    return (h ^ (h >>> 16)) >>> 0
  }
  const grad = (h: number, dx: number, dy: number) => {
    switch (h & 7) {
      case 0: return dx + dy
      case 1: return -dx + dy
      case 2: return dx - dy
      case 3: return -dx - dy
      case 4: return dx
      case 5: return -dx
      case 6: return dy
      default: return -dy
    }
  }
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
  const x0 = grad(hash(xi, yi), xf, yf) + (grad(hash(xi + 1, yi), xf - 1, yf) - grad(hash(xi, yi), xf, yf)) * u
  const x1 = grad(hash(xi, yi + 1), xf, yf - 1) + (grad(hash(xi + 1, yi + 1), xf - 1, yf - 1) - grad(hash(xi, yi + 1), xf, yf - 1)) * u
  return x0 + (x1 - x0) * v
}

function evalColorTrails(
  key: string,
  p: ColorTrailsParams,
  t: number,
  palette: Palette,
  W = DEFAULT_W,
  H = DEFAULT_H,
): Frame {
  let s = colorTrailsState.get(key)
  if (!s || s.w !== W || s.h !== H || s.seed !== p.seed) {
    s = {
      frame: rawBlankFrame(W, H),
      tmp: rawBlankFrame(W, H),
      w: W,
      h: H,
      seed: p.seed,
      lastT: -1,
      beatPulse: 0,
    }
    colorTrailsState.set(key, s)
  }

  // The source prototype is calibrated at 60 fps. Scale feedback, injection,
  // and displacement by elapsed frame-equivalents so firmware loop rate and a
  // temporarily slow browser preview do not change the character of the flow.
  // Each final advection shift is still capped to one pixel per rendered frame:
  // larger jumps break the continuous, buttery trail blend this effect relies on.
  const dtFrames = s.lastT < 0 ? 1 : Math.max(0, Math.min(4, (t - s.lastT) * 60))
  s.lastT = t
  if (dtFrames <= 0 || W <= 0 || H <= 0) return s.frame

  const bass = clamp01(p.bass)
  const mids = clamp01(p.mids)
  const treble = clamp01(p.treble)
  s.beatPulse = p.beat ? 1 : s.beatPulse * Math.pow(0.78, dtFrames)
  const beatPulse = s.beatPulse
  const endpointSpeed = p.endpointSpeed * (1 + mids * 1.5)
  const colorSpeed = p.colorSpeed * (1 + treble * 2)
  const displacement = Math.max(0, p.displacement) * (1 + bass * 1.5) * dtFrames
  const weightForDt = (weight: number) => {
    const w = clamp01(weight * (1 + beatPulse * 0.65))
    return 1 - Math.pow(1 - w, dtFrames)
  }
  const blend = (px: number, py: number, color: RGB, weight: number) => {
    if (px < 0 || px >= W || py < 0 || py >= H) return
    const w = weightForDt(weight)
    if (w <= 0) return
    const dst = s!.frame[py][px]
    dst.r = Math.round(dst.r * (1 - w) + color.r * w)
    dst.g = Math.round(dst.g * (1 - w) + color.g * w)
    dst.b = Math.round(dst.b * (1 - w) + color.b * w)
  }
  const phaseColor = (u: number) => samplePalette(palette, t * colorSpeed + u)

  const injectLine = p.injectionMode !== 'Rainbow Border'
  const injectBorder = p.injectionMode !== 'Moving Line'

  // Inject the moving, palette-swept Lissajous segment using the same 3×
  // oversampled bilinear splat and soft endpoint discs as the Pygame source.
  const cx = (W - 1) * 0.5, cy = (H - 1) * 0.5
  const x1 = cx + (W - 1) * (11.5 / 31) * Math.sin(t * endpointSpeed * 1.13 + 0.20)
  const y1 = cy + (H - 1) * (10.5 / 31) * Math.sin(t * endpointSpeed * 1.71 + 1.30)
  const x2 = cx + (W - 1) * (12.0 / 31) * Math.sin(t * endpointSpeed * 1.89 + 2.20)
  const y2 = cy + (H - 1) * (11.0 / 31) * Math.sin(t * endpointSpeed * 1.37 + 0.70)
  if (injectLine) {
    const dx = x2 - x1, dy = y2 - y1
    const steps = Math.max(1, Math.floor(Math.max(Math.abs(dx), Math.abs(dy)) * 3))
    for (let i = 0; i <= steps; i++) {
      const u = i / steps, x = x1 + dx * u, y = y1 + dy * u
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
      const color = phaseColor(u)
      blend(xi, yi, color, (1 - fx) * (1 - fy))
      blend(xi + 1, yi, color, fx * (1 - fy))
      blend(xi, yi + 1, color, (1 - fx) * fy)
      blend(xi + 1, yi + 1, color, fx * fy)
    }
    const endpointRadius = 0.85 + beatPulse * 0.9
    const drawEndpoint = (ex: number, ey: number, color: RGB) => {
      const minX = Math.max(0, Math.floor(ex - endpointRadius - 1))
      const maxX = Math.min(W - 1, Math.ceil(ex + endpointRadius + 1))
      const minY = Math.max(0, Math.floor(ey - endpointRadius - 1))
      const maxY = Math.min(H - 1, Math.ceil(ey + endpointRadius + 1))
      for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
        const dist = Math.hypot(px + 0.5 - ex, py + 0.5 - ey)
        blend(px, py, color, clamp01(endpointRadius + 0.5 - dist))
      }
    }
    drawEndpoint(x1, y1, phaseColor(0))
    drawEndpoint(x2, y2, phaseColor(1))
  }

  // Liquid-frame variant: continuously seed a palette around the perimeter,
  // then let the same capped subpixel advection pull it through the matrix.
  if (injectBorder) {
    const perimeter: Array<[number, number]> = []
    for (let x = 0; x < W; x++) perimeter.push([x, 0])
    for (let y = 1; y < H; y++) perimeter.push([W - 1, y])
    if (H > 1) for (let x = W - 2; x >= 0; x--) perimeter.push([x, H - 1])
    if (W > 1) for (let y = H - 2; y > 0; y--) perimeter.push([0, y])
    const count = Math.max(1, perimeter.length)
    perimeter.forEach(([x, y], i) => blend(x, y, phaseColor(i / count), 1))
  }

  const wrap = (v: number, size: number) => ((v % size) + size) % size
  const seedX = p.seed >>> 0
  const seedY = (p.seed + 1295) >>> 0 // default 42 → the source's second seed 1337

  // Pass 1: horizontal subpixel shift per row from the Y profile.
  for (let y = 0; y < H; y++) {
    const spatial = y * 0.23 * p.yFrequency
    const noise = p.flowMode === 'Morphing 2D'
      ? colorTrailsNoise2(spatial, t * p.ySpeed, seedY)
      : colorTrailsNoise1(spatial + t * p.ySpeed, seedY)
    const profile = noise * p.yAmplitude
    const shift = Math.max(-1, Math.min(1, profile * displacement))
    for (let x = 0; x < W; x++) {
      const sx = wrap(x - shift, W), x0 = Math.floor(sx), xNext = (x0 + 1) % W, f = sx - x0
      const a = s.frame[y][x0], b = s.frame[y][xNext], dst = s.tmp[y][x]
      dst.r = Math.round(a.r * (1 - f) + b.r * f)
      dst.g = Math.round(a.g * (1 - f) + b.g * f)
      dst.b = Math.round(a.b * (1 - f) + b.b * f)
    }
  }

  // Pass 2: vertical subpixel shift per column from the reversed X profile,
  // then apply the long feedback fade.
  const fade = Math.pow(Math.max(0, Math.min(0.99999, p.persistence)), dtFrames)
  for (let x = 0; x < W; x++) {
    const spatial = (W - 1 - x) * 0.23 * p.xFrequency
    const noise = p.flowMode === 'Morphing 2D'
      ? colorTrailsNoise2(spatial, t * p.xSpeed, seedX)
      : colorTrailsNoise1(spatial + t * p.xSpeed, seedX)
    const profile = noise * p.xAmplitude
    const shift = Math.max(-1, Math.min(1, profile * displacement))
    for (let y = 0; y < H; y++) {
      const sy = wrap(y - shift, H), y0 = Math.floor(sy), yNext = (y0 + 1) % H, f = sy - y0
      const a = s.tmp[y0][x], b = s.tmp[yNext][x], dst = s.frame[y][x]
      dst.r = Math.round((a.r * (1 - f) + b.r * f) * fade)
      dst.g = Math.round((a.g * (1 - f) + b.g * f) * fade)
      dst.b = Math.round((a.b * (1 - f) + b.b * f) * fade)
    }
  }
  return s.frame
}

// Audio-reactive flow: a simplex band field scrolling at a speed set by mids,
// brightness pulsed by bass, hue nudged by treble.
function evalAudioFlow(key: string, bass: number, mids: number, treble: number, speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const flow = advanceDrift(key, t, speed * (0.2 + mids * 1.5)).a
  // Random vertical drift: a slow noise wander (random up/down direction) whose
  // reach grows with treble/bass, so the field bobs vertically in time with the
  // music while `flow` scrolls it horizontally.
  const vAmp = 0.2 + treble * 0.7 + bass * 0.3
  const vflow = _snoise2(t * speed * 4 + 50, 17.3) * vAmp
  // Preserve the old useful low-level lift, but do not flatten FastLED's
  // normalized bass range above 0.7 into one constant brightness.
  const bright = 0.25 + Math.sqrt(clamp01(bass)) * 0.75
  return buildFrame(W, H, (x, y) => {
      const v = _snoise2(x * scale + flow, y * scale * 0.6 + vflow) * 0.5 + 0.5
      const c = samplePalette(palette, (((v + treble * 0.3) % 1) + 1) % 1)
      return { r: Math.round(c.r * bright), g: Math.round(c.g * bright), b: Math.round(c.b * bright) }
    })
}

export const AUDIO_REACTIVE_EVALUATORS: NodeEvaluators = {
  SpectrumBars({ num, pal, t, W, H }, id, props) {
    // Unwired bands rest at 0 unless the Test Signal toggle drives a demo.
    const demo = useUiStore.getState().testSignal
    const bass   = num(id, 'bass',   props, 'bass',   demo ? (Math.sin(t * 2.1) + 1) / 2 : 0)
    const mids   = num(id, 'mids',   props, 'mids',   demo ? (Math.sin(t * 3.7 + 1) + 1) / 2 : 0)
    const treble = num(id, 'treble', props, 'treble', demo ? (Math.sin(t * 5.3 + 2) + 1) / 2 : 0)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 0.6)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    const mirror = !!props.mirror
    return { frame: evalSpectrumBars(bass, mids, treble, energy, speed, t, palette, mirror, W, H) }
  },
  SpectrumVisualizer({ input, num, pal, t, W, H, stateKey }, id, props) {
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    const hasLiveAudio = Boolean(audio && (audio.active || audio.micActive))
    const spectrum = hasLiveAudio
      ? (audio!.previewSpectrum?.length ? audio!.previewSpectrum : audio!.spectrum)
      : useUiStore.getState().testSignal
        ? Array.from({ length: 32 }, (_, i) => {
            const lowBias = 1 - i / 48
            return clamp01((Math.sin(t * (2.1 + i * 0.065) + i * 0.72) * 0.5 + 0.5) * lowBias)
          })
        : []
    const palette = pal(id, 'paletteIn', props, 'palette', 'citrus')
    return { frame: evalSpectrumVisualizer(stateKey(id), spectrum, {
      style: String(props.style ?? 'Bars'),
      // `bands` sizes the band array and stays a property; the rest read
      // wire-then-property, and `evalSpectrumVisualizer` bounds each to
      // the same domain the generator emits.
      bands: Number(props.bands ?? 16),
      gain: num(id, 'gain', props, 'gain', 1.25),
      smoothing: num(id, 'smoothing', props, 'smoothing', 0.58),
      tilt: num(id, 'tilt', props, 'tilt', 0.2),
      peakHold: num(id, 'peakHold', props, 'peakHold', 0.42),
      peakGravity: num(id, 'peakGravity', props, 'peakGravity', 1.8),
      waterfallSpeed: num(id, 'waterfallSpeed', props, 'waterfallSpeed', 10),
    }, t, palette, W, H) }
  },
  BassPulse({ num, pal, W, H }, id, props) {
    const bass = num(id, 'bass', props, 'bass', 0)
    const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
    return { frame: evalBassPulse(bass, palette, W, H) }
  },
  BassRings({ num, pal, t, W, H }, id, props) {
    const bass = num(id, 'bass', props, 'bass', 0.5)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
    return { frame: evalBassRings(bass, energy, speed, palette, t, W, H) }
  },
  MidrangeWaves({ num, pal, t, W, H }, id, props) {
    const mids = num(id, 'mids', props, 'mids', 0.5)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
    return { frame: evalMidrangeWaves(mids, energy, speed, t, palette, W, H) }
  },
  MidrangeBloom({ num, pal, t, W, H }, id, props) {
    const mids = num(id, 'mids', props, 'mids', 0.5)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'party')
    return { frame: evalMidrangeBloom(mids, energy, speed, t, palette, W, H) }
  },
  TrebleSparks({ num, pal, W, H, stateKey }, id, props) {
    const treble = num(id, 'treble', props, 'treble', 0.5)
    const density = num(id, 'density', props, 'density', 0.5)
    const palette = pal(id, 'paletteIn', props, 'palette', 'ice')
    return { frame: evalTrebleSparks(stateKey(id), treble, density, palette, W, H) }
  },
  TreblePrism({ num, pal, t, W, H }, id, props) {
    const treble = num(id, 'treble', props, 'treble', 0.5)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'amethyst')
    return { frame: evalTreblePrism(treble, energy, speed, palette, t, W, H) }
  },
  AudioCascade({ num, pal, t, W, H }, id, props) {
    const bass = num(id, 'bass', props, 'bass', 0.5)
    const mids = num(id, 'mids', props, 'mids', 0.5)
    const treble = num(id, 'treble', props, 'treble', 0.5)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalAudioCascade(bass, mids, treble, energy, speed, t, palette, W, H) }
  },
  BeatFlash({ input, num, pal, W, H, stateKey, incoming }, id, props) {
    const beatVal = input(id, 'beat', false) as boolean
    const baseFrame = input(id, 'frame', null) as Frame | null
    const decay = num(id, 'decay', props, 'decay', 0.85)
    const attack = num(id, 'attack', props, 'attack', 0)
    const intensity = num(id, 'intensity', props, 'intensity', 1)
    const blendMode = String(props.blendMode ?? 'screen') === 'add' ? 'add' : 'screen'
    const preserveBase = props.preserveBase !== false
    const level = updateBeatFlashLevel(stateKey(id), beatVal, attack, decay)
    const paletteWired = incoming.has(`${id}:paletteIn`)
    const color = (paletteWired || String(props.palette ?? 'none') !== 'none')
      ? samplePalette(pal(id, 'paletteIn', props, 'palette', 'rainbow'), 1 - level)
      : {
        r: byte(num(id, 'r', props, 'r', 255) / 255),
        g: byte(num(id, 'g', props, 'g', 255) / 255),
        b: byte(num(id, 'b', props, 'b', 255) / 255),
      }
    return { frame: blendBeatFlash(baseFrame, level, color, intensity, blendMode, preserveBase, W, H) }
  },
  KickShock({ num, pal, t, W, H, stateKey }, id, props) {
    const kick = num(id, 'kick', props, 'kick', 0)
    const snare = num(id, 'snare', props, 'snare', 0)
    const hihat = num(id, 'hihat', props, 'hihat', 0)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'volcano')
    // `count` sizes the firmware's static shock pool, so it stays a
    // property; the multipliers are read wire-then-property.
    const count = Math.max(1, Math.round(Number(props.count ?? 8)))
    const decay = num(id, 'decay', props, 'decay', 1)
    const thickness = num(id, 'thickness', props, 'thickness', 1)
    const spawnSpread = num(id, 'spawnSpread', props, 'spawnSpread', 0)
    const tiles = num(id, 'tiles', props, 'tiles', 1)
    const blendMode = String(props.blendMode ?? 'add') === 'max' ? 'max' : 'add'
    return { frame: evalKickShock(stateKey(id), kick, snare, hihat, energy, speed, t, palette, W, H, count, decay, thickness, spawnSpread, blendMode, tiles) }
  },
  VocalAurora({ input, num, pal, t, W, H, stateKey }, id, props) {
    const vocals = num(id, 'vocals', props, 'vocals', 0)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const silence = input(id, 'silence', false) as boolean
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'aurora')
    return { frame: evalVocalAurora(stateKey(id), vocals, energy, silence, speed, t, palette, W, H) }
  },
  BeatKaleidoscope({ input, num, pal, t, W, H, stateKey }, id, props) {
    const beatVal = input(id, 'beat', false) as boolean
    const hue = num(id, 'hue', props, 'hue', 0)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'ultraviolet')
    return { frame: evalBeatKaleidoscope(stateKey(id), beatVal, hue, energy, speed, t, palette, W, H) }
  },
  SpectraMosaic({ num, pal, t, W, H, stateKey }, id, props) {
    const bass = num(id, 'bass', props, 'bass', 0.5)
    const mids = num(id, 'mids', props, 'mids', 0.5)
    const treble = num(id, 'treble', props, 'treble', 0.5)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const tiles = num(id, 'tiles', props, 'tiles', 4)
    const palette = pal(id, 'paletteIn', props, 'palette', 'peacock')
    return { frame: evalSpectraMosaic(stateKey(id), bass, mids, treble, energy, speed, tiles, t, palette, W, H) }
  },
  PercussionBlobs({ num, pal, t, W, H, stateKey }, id, props) {
    const kick = num(id, 'kick', props, 'kick', 0)
    const snare = num(id, 'snare', props, 'snare', 0)
    const hihat = num(id, 'hihat', props, 'hihat', 0)
    const palette = pal(id, 'paletteIn', props, 'palette', 'party')
    // `count` sizes the firmware's static blob pool, so it stays a
    // property; the multipliers are read wire-then-property.
    const count = Math.max(1, Math.round(Number(props.count ?? 12)))
    const size = num(id, 'size', props, 'size', 1)
    const decay = num(id, 'decay', props, 'decay', 1)
    const spawnSpread = num(id, 'spawnSpread', props, 'spawnSpread', 1)
    const blendMode = String(props.blendMode ?? 'add') === 'max' ? 'max' : 'add'
    return { frame: evalPercussionBlobs(stateKey(id), kick, snare, hihat, t, palette, W, H, count, size, decay, spawnSpread, blendMode) }
  },
  EmberPulse({ input, num, t, W, H, stateKey }, id, props) {
    const bass = num(id, 'bass', props, 'bass', 0.5)
    const mids = num(id, 'mids', props, 'mids', 0.5)
    const treble = num(id, 'treble', props, 'treble', 0.5)
    const beatVal = input(id, 'beat', false) as boolean
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    return { frame: evalEmberPulse(stateKey(id), bass, mids, treble, beatVal, energy, speed, t, W, H) }
  },
  TurbulentBloom({ num, pal, t, W, H, stateKey }, id, props) {
    const bass = num(id, 'bass', props, 'bass', 0.5)
    const mids = num(id, 'mids', props, 'mids', 0.5)
    const treble = num(id, 'treble', props, 'treble', 0.5)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'deepsea')
    return { frame: evalTurbulentBloom(stateKey(id), bass, mids, treble, energy, speed, t, palette, W, H) }
  },
  GravityWell({ input, num, t, W, H }, id, props) {
    const bass = num(id, 'bass', props, 'bass', 0.5)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const colorIn = input(id, 'color', null) as RGB | null
    const color = colorIn ?? {
      r: byte(num(id, 'r', props, 'r', 80) / 255),
      g: byte(num(id, 'g', props, 'g', 160) / 255),
      b: byte(num(id, 'b', props, 'b', 255) / 255),
    }
    return { frame: evalGravityWell(bass, energy, speed, color, t, W, H) }
  },
  RainRipples({ input, num, pal, t, W, H, stateKey }, id, props) {
    const trigger = input(id, 'trigger', false) as boolean
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'laguna')
    // `count` sizes the firmware's static ripple arrays, so it stays a
    // property; the three multipliers are read wire-then-property.
    const count = Math.max(1, Math.round(Number(props.count ?? 8)))
    const decay = num(id, 'decay', props, 'decay', 1)
    const thickness = num(id, 'thickness', props, 'thickness', 1)
    const spawnSpread = num(id, 'spawnSpread', props, 'spawnSpread', 1)
    const blendMode = String(props.blendMode ?? 'max') === 'add' ? 'add' : 'max'
    return { frame: evalRainRipples(stateKey(id), trigger, energy, speed, t, palette, W, H, count, decay, thickness, spawnSpread, blendMode) }
  },
  PrismStorm({ num, pal, t, W, H, stateKey }, id, props) {
    const treble = num(id, 'treble', props, 'treble', 0.5)
    const mids = num(id, 'mids', props, 'mids', 0.5)
    const hihat = num(id, 'hihat', props, 'hihat', 0)
    const energy = num(id, 'energy', props, 'energy', 0.7)
    const speed = num(id, 'speed', props, 'speed', 1)
    const palette = pal(id, 'paletteIn', props, 'palette', 'amethyst')
    return { frame: evalPrismStorm(stateKey(id), treble, mids, hihat, energy, speed, t, palette, W, H) }
  },
  AudioFlow({ num, pal, t, W, H, stateKey }, id, props) {
    const bass = num(id, 'bass', props, 'bass', 0.5)
    const mids = num(id, 'mids', props, 'mids', 0.5)
    const treble = num(id, 'treble', props, 'treble', 0.3)
    const speed = denormalizeAudioFlowParam('speed', num(id, 'speed', props, 'speed', 0.5))
    const scale = denormalizeAudioFlowParam('scale', num(id, 'scale', props, 'scale', 0.5))
    const palette = pal(id, 'paletteIn', props, 'palette', 'party')
    return { frame: evalAudioFlow(stateKey(id), bass, mids, treble, speed, scale, t, palette, W, H) }
  },
  ColorTrails({ input, num, pal, t, W, H, stateKey }, id, props) {
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalColorTrails(stateKey(id), {
      injectionMode: String(props.injectionMode ?? 'Moving Line'),
      flowMode: String(props.flowMode ?? 'Scrolling'),
      bass: num(id, 'bass', props, 'bass', 0),
      mids: num(id, 'mids', props, 'mids', 0),
      treble: num(id, 'treble', props, 'treble', 0),
      beat: Boolean(input(id, 'beat', false)),
      xSpeed: num(id, 'xSpeed', props, 'xSpeed', 0.1),
      xAmplitude: num(id, 'xAmplitude', props, 'xAmplitude', 1),
      xFrequency: num(id, 'xFrequency', props, 'xFrequency', 0.33),
      ySpeed: num(id, 'ySpeed', props, 'ySpeed', 0.1),
      yAmplitude: num(id, 'yAmplitude', props, 'yAmplitude', 1),
      yFrequency: num(id, 'yFrequency', props, 'yFrequency', 0.32),
      displacement: num(id, 'displacement', props, 'displacement', 1.8),
      endpointSpeed: num(id, 'endpointSpeed', props, 'endpointSpeed', 0.35),
      colorSpeed: num(id, 'colorSpeed', props, 'colorSpeed', 0.1),
      persistence: num(id, 'persistence', props, 'persistence', 0.99922),
      seed: normalizedSeed(props.seed ?? 42),
    }, t, palette, W, H) }
  },
  Animartrix({ input, num, t, W, H, stateKey }, id, props) {
    return { frame: evalAnimartrix(stateKey(id), {
      effect: String(props.effect ?? 'Water'),
      speed: num(id, 'speed', props, 'speed', 0.65),
      audioAmount: num(id, 'audioAmount', props, 'audioAmount', 1),
      bass: num(id, 'bass', props, 'bass', 0),
      mids: num(id, 'mids', props, 'mids', 0),
      treble: num(id, 'treble', props, 'treble', 0),
      kick: num(id, 'kick', props, 'kick', 0),
      snare: num(id, 'snare', props, 'snare', 0),
      hihat: num(id, 'hihat', props, 'hihat', 0),
      beat: Boolean(input(id, 'beat', false)),
    }, t, W, H) }
  },
}

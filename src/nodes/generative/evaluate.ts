import { juggleDotCount, JUGGLE_COUNT } from './juggle'
import { CONFETTI_SPAWN, PRIDE_SAT, SCANNER_PALETTE_FLOOR, SPIRAL_ARMS, rainbowAxis, type RainbowAxis } from './limits'
import { STRING_MAX_ROWS } from '../shared/stringCanvas'
import {
  BREATHE_BPM, CHASE_DRIFT, CHASE_SPACING, breatheCurve, breatheEnvelope, chaseSpacing, wipePalettePosition, wipeReversed,
} from './classics1d'
import { denormRate, NOISE_SPEED_MAX, NOISE_SCALE_MAX, PLASMA_SCALE_MAX, PLASMA_SPEED_MAX, SPEED_MAX, SCALE_MAX } from '../shared/speedRange'
import { noiseType as noiseTypeOf, plasmaStyle } from './noiseTypes'
import { evalNoiseFieldByType } from './noiseField'
export { gaborCellHashes } from './noiseField'
import { speedPhase } from '../shared/speedClock'
import { passFrames } from '../shared/passClock'
import { fadeFrameToBlackBy, trailFadeSteps } from '../shared/trailFade'
import {
  burstFrame, burstPixel, pacificaFrame, sineFieldFrame, sineFieldSum, pacificaPixel, plasmaFrame, spiralFrame, spiralPixel, plasmaIndex, prideFrame, pridePixel, twinkleFrame, twinklePixel, whitecap,
} from '../shared/integerPatterns'
import { scale8, scale8Video } from '../shared/lib8tion'
import { FILL_RAINBOW_SAT, hsv2rgbRainbow } from '../shared/hsvRainbow'
import { type Frame, type Palette, samplePalette, samplePaletteClamped, type RGB } from '../../state/palettes/ledColor'
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
  candleColor, candleMode, classicHash, stepLightning, sunriseColor, sunriseMode, sunriseProgress,
  tvColor, tvLayout, type LightningState,
} from '../../state/evaluator/classics'
import { noiseContrast, noiseContrastOf, noiseShape, shapeNoise, worleyMode } from '../../state/evaluator/noiseShape'
import {
  seededRandom,
  seededRngState,
  seedOffset,
  normalizedSeed,
} from '../../state/evaluator/random'
import type { Field, NodeEvaluators } from '../../state/evaluator/types'

// FastLED fill_rainbow: a scrolling hue sweep (hue in 0–255 units, +deltaHue
// per LED from a whole-byte `start`), through FastLED's own rainbow wheel at
// fill_rainbow's saturation, so the preview's bytes are the sketch's. The
// `string` axis follows the buffer's [y*W+x] order, as fill_rainbow does;
// `horizontal` and `vertical` step once per column or row.
export function evalRainbow(phase: number, deltaHue: number, axis: RainbowAxis, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const start = Math.floor(((phase % 256) + 256) % 256)
  const step = Math.trunc(deltaHue)
  return buildFrame(W, H, (x, y) => {
      const i = axis === 'horizontal' ? x : axis === 'vertical' ? y : y * W + x
      return hsv2rgbRainbow(start + i * step, FILL_RAINBOW_SAT, 255)
    })
}

// ── Pattern evaluators ────────────────────────────────────────────────────────
function evalPlasma(key: string, speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  // The sketch's integer kernel (shared/integerPatterns.ts): four summed
  // sin16 waves to a palette index v*45 + phase*20, wrapping as a uint8_t does.
  const frame = plasmaFrame(speedPhase(key, t, speed), scale)
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
      } else row.push(hsv2rgbRainbow(hue, PRIDE_SAT, bri))
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

interface ScannerState { frame: Frame; w: number; h: number; prev: number }
const scannerState = instanceState('scannerState', new Map<string, ScannerState>())

/*
 * The beam is drawn into a persistent buffer that fades by `trail`, so its
 * tail lies behind it along the way it travels, as on a Larson scanner. Each
 * pass lights the whole span the beam crossed since the last, so a fast beam
 * leaves no gaps, and keeps the brighter of the old and new light. Its colour
 * comes from the bright part of the palette, `SCANNER_PALETTE_FLOOR` to the
 * end, held at the ends: palettes such as lava start almost black.
 */
function evalScanner(
  key: string, speed: number, width: number, trail: number, axis: string, t: number, palette: Palette,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const horizontal = axis !== 'vertical'
  const span = Math.max(1, horizontal ? W : H)
  let s = scannerState.get(key)
  if (!s || s.w !== W || s.h !== H) {
    s = { frame: rawBlankFrame(W, H), w: W, h: H, prev: -1 }
    scannerState.set(key, s)
  }
  const frame = s.frame
  fadeFrameToBlackBy(frame, trailFadeSteps(key, t, trail))
  const phase = (speedPhase(key, t, speed) % 2 + 2) % 2
  const travel = phase <= 1 ? phase : 2 - phase
  const pos = travel * Math.max(0, span - 1)
  const from = s.prev < 0 ? pos : s.prev
  s.prev = pos
  const lo = Math.min(from, pos), hi = Math.max(from, pos)
  const core = Math.max(0.5, Number.isFinite(width) ? width * 0.5 : 1)
  const base = samplePaletteClamped(palette, SCANNER_PALETTE_FLOOR + (1 - SCANNER_PALETTE_FLOOR) * travel)
  const across = horizontal ? H : W
  for (let c = 0; c < span; c++) {
    const dist = c < lo ? lo - c : c > hi ? c - hi : 0
    const v = Math.min(1, core + 0.5 - dist)
    if (v <= 0) continue
    const q = Math.floor(v * 255)
    const r = scale8Video(base.r, q), g = scale8Video(base.g, q), b = scale8Video(base.b, q)
    for (let o = 0; o < across; o++) {
      const px = horizontal ? frame[o][c] : frame[c][o]
      px.r = Math.max(px.r, r); px.g = Math.max(px.g, g); px.b = Math.max(px.b, b)
    }
  }
  return frame
}

function evalConfetti(
  nodeId: string, speed: number, density: number, trail: number, t: number, palette: Palette, seed = 0,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  let state = sparkState.get(nodeId)
  if (!state || state.w !== W || state.h !== H) {
    state = { frame: rawBlankFrame(W, H), w: W, h: H }
    sparkState.set(nodeId, state)
  }

  const frame = state.frame
  fadeFrameToBlackBy(frame, trailFadeSteps(nodeId, t, trail))

  const area = W * H
  const amount = clamp01(density)
  let spawnCount = Math.round(amount * CONFETTI_SPAWN * Math.max(1, Math.sqrt(area)))
  if (spawnCount < 1 && amount > 0.08) spawnCount = 1
  // Speed is the colour drift: how fast the speckles' colours wander the palette.
  const hueDrift = speedPhase(nodeId, t, Math.max(0, speed)) * 0.08

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
  nodeId: string, speed: number, count: number, t: number, palette: Palette, seed = 0,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  // Drawn fresh each pass: the dots alone. A Trails node after Juggle gives
  // them tails, so there is one fade to set, not two stacked.
  const frame = blankFrame(W, H)

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

// Plasma's Sine 2D: three octaves of sine-times-cosine interference. The sum
// is held at the palette's ends, where it once wrapped and cut seams through
// a palette such as lava.
function evalSine2DField(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const ph = speedPhase(key, t, speed)
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * Math.sin(x * freq + ph + oct * 1.7) * Math.cos(y * freq * 1.3 + ph * 0.8 + oct * 2.3)
        amp *= 0.5; freq *= 2.1
      }
      out[y * W + x] = clamp01(v * 0.5 + 0.5)
    }
  }
  return out
}

// Plasma's Sine Grid: two crossed sine waves, through the sketch's integer
// kernel (shared/integerPatterns.ts).
function evalSineGridField(key: string, speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Field {
  const frame = sineFieldFrame(scale, speedPhase(key, t, speed))
  const out = allocField(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) out[y * W + x] = sineFieldSum(x, y, frame) / 131072
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

/**
 * The side Blobs sizes its blobs by: the shorter one, except on a string,
 * where that is a single LED and the blobs shrank to a dim speck.
 */
export function blobSpan(W: number, H: number): number {
  return Math.min(W, H) > STRING_MAX_ROWS ? Math.min(W, H) : Math.max(W, H)
}

// Metaballs: several moving charges; each pixel's field is the summed inverse-
// square influence, mapped smoothly to a palette (lava-lamp blobs).
function evalBlobs(key: string, speed: number, scale: number, count: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const n = Math.max(1, Math.min(6, Math.floor(count)))
  const r2 = (scale * blobSpan(W, H)) ** 2
  const ph = speedPhase(key, t, speed)
  const bx: number[] = [], by: number[] = []
  for (let i = 0; i < n; i++) {
    bx.push(W * (0.5 + 0.4 * Math.sin(ph * (0.7 + i * 0.13) + i * 1.7)))
    by.push(H * (0.5 + 0.4 * Math.cos(ph * (0.6 + i * 0.17) + i * 2.3)))
  }
  return buildFrame(W, H, (x, y) => {
      let f = 0
      for (let i = 0; i < n; i++) { const dx = x - bx[i], dy = y - by[i]; f += r2 / (dx * dx + dy * dy + 1) }
      // A field strength, so the ends hold: a blob's core is the palette's
      // last colour, not a blend back toward its first.
      return samplePaletteClamped(palette, f / (f + 1))
    })
}

const CORE_GENERATIVE_EVALUATORS: NodeEvaluators = {
  // Bundled noise generators (fBm / Noise4D / Worley / Plasma Fractal /
  // Gabor). All share the same scalar-field core; the node exposes that raw
  // `field` output and also maps it through a palette to its normal `frame`
  // output. Keep in sync with NOISE_TYPES and the `Noise` emitter.
  Noise({ num, pal, t, W, H, stateKey }, id, props) {
    const noiseType = noiseTypeOf(props.noiseType)
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), NOISE_SPEED_MAX[noiseType])
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.5), NOISE_SCALE_MAX[noiseType])
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    const field = evalNoiseFieldByType(stateKey(id), noiseType, speed, scale, t, W, H, normalizedSeed(props.seed), props.wrapX === true, {
      worley: worleyMode(props.worleyMode),
      octaves: num(id, 'octaves', props, 'octaves', 4),
      frequency: num(id, 'frequency', props, 'frequency', 1.2),
      orientation: num(id, 'orientation', props, 'orientation', 45),
    })
    // Contrast, then shape: both fold about the field's middle.
    const contrast = noiseContrastOf(props.contrast)
    const shape = noiseShape(props.noiseShape)
    if (contrast !== 1 || shape !== 'plain') {
      for (let i = 0; i < field.length; i++) field[i] = shapeNoise(noiseContrast(field[i], contrast), shape)
    }
    return { field, frame: evalFieldToFrame(field, palette, 1, W, H) }
  },
  // The classic plasma, or the two sine styles that were Noise types. Each
  // style keeps its own speed and scale range (PLASMA_SPEED_MAX), and the
  // sine styles map their 0–1 value through the palette as Noise did.
  Plasma({ num, pal, t, W, H, stateKey }, id, props) {
    const style = plasmaStyle(props.plasmaStyle)
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), PLASMA_SPEED_MAX[style])
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.5), PLASMA_SCALE_MAX[style])
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    if (style === 'classic') return { frame: evalPlasma(stateKey(id), speed, scale, t, palette, W, H) }
    const field = style === 'sineGrid'
      ? evalSineGridField(stateKey(id), speed, scale, t, W, H)
      : evalSine2DField(stateKey(id), speed, scale, t, W, H)
    return { frame: evalFieldToFrame(field, palette, 1, W, H) }
  },
  Rainbow({ num, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.3), SPEED_MAX.Rainbow)
    const deltaHue = Math.max(0, Math.min(255, num(id, 'deltaHue', props, 'deltaHue', 6)))
    return { frame: evalRainbow(speedPhase(stateKey(id), t, speed), deltaHue, rainbowAxis(props.axis), W, H) }
  },
  Pride2015({ incoming, num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.4), SPEED_MAX.Pride2015)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.4), SCALE_MAX.Pride2015)
    // 'none' is the rainbow; a palette, set or wired, makes it colorwaves.
    const palette = incoming.has(`${id}:paletteIn`) || String(props.palette ?? 'none') !== 'none'
      ? pal(id, 'paletteIn', props, 'palette', 'rainbow') : null
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
    const trail = num(id, 'trail', props, 'trail', 0.55)
    const axis = String(props.axis ?? 'horizontal')
    const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
    return { frame: evalScanner(stateKey(id), speed, width, trail, axis, t, palette, W, H) }
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
    // The envelope is an amount, so the peak holds the palette's last colour.
    const c = scaleRgb(samplePaletteClamped(pal(id, 'paletteIn', props, 'palette', 'ocean'), env), level)
    return { frame: buildFrame(W, H, () => c) }
  },
  Confetti({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.45), SPEED_MAX.Confetti)
    const density = num(id, 'density', props, 'density', 0.45)
    const trail = num(id, 'trail', props, 'trail', 0.35)
    const palette = pal(id, 'paletteIn', props, 'palette', 'party')
    return { frame: evalConfetti(stateKey(id), speed, density, trail, t, palette, normalizedSeed(props.seed), W, H) }
  },
  Juggle({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Juggle)
    const count = num(id, 'count', props, 'count', JUGGLE_COUNT.default)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalJuggle(stateKey(id), speed, count, t, palette, normalizedSeed(props.seed), W, H) }
  },
  RadialBurst({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.RadialBurst)
    const rings = num(id, 'rings', props, 'rings', 8)
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
    const scale = denormRate(num(id, 'size', props, 'size', 0.44), SCALE_MAX.Blobs)
    const count = num(id, 'count', props, 'count', 3)
    const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
    return { frame: evalBlobs(stateKey(id), speed, scale, count, t, palette, W, H) }
  },
}

// ── Classics: Candle, Lightning, Sunrise, TV Simulator ─────────────────────────
const lightningState = instanceState('lightningState', new Map<string, LightningState>())
const sunriseState = instanceState('sunriseState', new Map<string, { origin: number; prev: boolean }>())
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
  // Spawns and steps are per 60th of a second, so the rain keeps its pace at any frame rate.
  const frames = passFrames(nodeId, t)
  for (let l = 0; l < lanes; l++) {
    if (s.head[l] >= along + s.len[l]) {
      if (rnd() < Math.min(1, dens * RAIN_SPAWN * frames)) { s.head[l] = 0; s.spd[l] = 0.25 + rnd() * 0.75; s.len[l] = Math.max(2, tl * (0.5 + rnd() * 0.5)) }
    } else s.head[l] += s.spd[l] * Math.max(0, speed) * RAIN_STEP * frames
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
  Sunrise({ input, num, t, W, H, stateKey }, id, props) {
    const mode = sunriseMode(props.mode)
    // A rising Trigger restarts the timed ramp: it counts from that moment.
    const key = stateKey(id)
    const s = sunriseState.get(key) ?? { origin: 0, prev: false }
    const trigger = Boolean(input(id, 'trigger', false))
    if (trigger && !s.prev) s.origin = t
    s.prev = trigger
    sunriseState.set(key, s)
    const p = sunriseProgress(mode, t - s.origin, num(id, 'start', props, 'start', 0), num(id, 'duration', props, 'duration', 30), num(id, 'progress', props, 'progress', 0))
    const c = sunriseColor(p)
    return { frame: buildFrame(W, H, () => c) }
  },
  DigitalRain({ num, pal, t, W, H, stateKey }, id, props) {
    return {
      frame: evalDigitalRain(
        stateKey(id), rainDirection(props.direction, W, H), num(id, 'density', props, 'density', 0.5),
        denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.DigitalRain), num(id, 'tailLength', props, 'tailLength', 8),
        num(id, 'flicker', props, 'flicker', 0.3), t, pal(id, 'paletteIn', props, 'palette', 'forest'), W, H, normalizedSeed(props.seed),
      ),
    }
  },
  TVSimulator({ num, t, W, H, stateKey }, id, props) {
    const cutRate = Math.max(0.05, num(id, 'cutRate', props, 'cutRate', 0.5))
    const brightness = num(id, 'brightness', props, 'brightness', 0.8)
    // Integrated, so a live Cut Rate moves the next cut rather than jumping scenes.
    const slot = Math.floor(speedPhase(stateKey(id), t, cutRate))
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

import { samplePalette, type Palette, type RGB } from './ledColor'
import { hexToRgb } from './polinePalette'

export const STEREO_VU_MODES = [
  'Classic Ladder',
  'Palette Fill',
  'Solid Channel',
  'Segmented Blocks',
  'Peak Cap',
  'Falling Comet',
  'Center Burst',
  'Frame-Inward',
  'Dot Runner',
  'History Trail',
  'Stereo Balance',
  'Beat Spark',
] as const

export type StereoVuMode = typeof STEREO_VU_MODES[number]
export type StereoVuPolicy = 'Manual' | 'Timed cycle' | 'Beat cycle' | 'Shuffle'

export interface StereoVuSettings {
  ledCount: number
  enabled: boolean
  mode: StereoVuMode
  policy: StereoVuPolicy
  cycleIntervalSec: number
  palette: Palette
  leftColor: RGB
  rightColor: RGB
  gain: number
  noiseGate: number
  responseCurve: number
  attackMs: number
  releaseMs: number
  peakHoldMs: number
  peakFallPerSec: number
  trailAmount: number
  beatAccent: number
  brightness: number
  leftDirection: 'Bottom' | 'Top'
  rightDirection: 'Bottom' | 'Top'
  swapChannels: boolean
  /** Stable per fixture/source. It namespaces the deterministic shuffle and
   * lets the caller reset ballistics when an Audio wire changes provider. */
  instanceKey: string
}

export interface StereoVuInput {
  active: boolean
  left: number
  right: number
  beat: boolean
  timeSec: number
}

export interface StereoVuState {
  signature: string
  lastTimeSec: number
  leftLevel: number
  rightLevel: number
  leftPeak: number
  rightPeak: number
  leftHoldUntil: number
  rightHoldUntil: number
  leftHistory: number[]
  rightHistory: number[]
  historyAt: number
  beatGlow: number
  previousBeat: boolean
  policyMode: number
  policyAt: number
  shuffleOrder: number[]
}

export interface StereoVuFrame {
  /** Logical pixels from the physical bottom of the rail to its top. */
  left: RGB[]
  right: RGB[]
  /** FastLED pixel order after applying each string's data-in position. */
  leftPhysical: RGB[]
  rightPhysical: RGB[]
  mode: StereoVuMode
  active: boolean
  leftLevel: number
  rightLevel: number
  leftPeak: number
  rightPeak: number
}

const BLACK: RGB = { r: 0, g: 0, b: 0 }
const WHITE: RGB = { r: 255, g: 255, b: 255 }

const clamp01 = (value: number): number => Number.isFinite(value)
  ? Math.max(0, Math.min(1, value))
  : 0

const scale = (color: RGB, amount: number): RGB => {
  const k = clamp01(amount)
  return {
    r: Math.round(color.r * k),
    g: Math.round(color.g * k),
    b: Math.round(color.b * k),
  }
}

const add = (a: RGB, b: RGB): RGB => ({
  r: Math.min(255, a.r + b.r),
  g: Math.min(255, a.g + b.g),
  b: Math.min(255, a.b + b.b),
})

const mix = (a: RGB, b: RGB, amount: number): RGB => {
  const k = clamp01(amount)
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  }
}

const validMode = (value: string): StereoVuMode => (
  STEREO_VU_MODES.includes(value as StereoVuMode)
    ? value as StereoVuMode
    : 'Classic Ladder'
)

export function stereoVuSettings(properties: Record<string, unknown>, instanceKey = ''): StereoVuSettings {
  const policy = String(properties.visualizationPolicy ?? 'Shuffle')
  return {
    ledCount: Math.max(1, Math.min(1024, Math.round(Number(properties.ledCount ?? 60) || 60))),
    enabled: properties.enabled !== false,
    mode: validMode(String(properties.visualizationMode ?? 'Classic Ladder')),
    policy: ['Manual', 'Timed cycle', 'Beat cycle', 'Shuffle'].includes(policy)
      ? policy as StereoVuPolicy
      : 'Shuffle',
    cycleIntervalSec: Math.max(0.25, Number(properties.cycleInterval ?? 20) || 20),
    palette: String(properties.palette ?? 'party'),
    leftColor: hexToRgb(String(properties.leftColor ?? '#20ff70')),
    rightColor: hexToRgb(String(properties.rightColor ?? '#20a0ff')),
    gain: Math.max(0, Number(properties.gain ?? 1) || 0),
    noiseGate: clamp01(Number(properties.noiseGate ?? 0.02)),
    responseCurve: Math.max(0.05, Number(properties.responseCurve ?? 0.6) || 0.6),
    attackMs: Math.max(0, Number(properties.attackMs ?? 10) || 0),
    releaseMs: Math.max(0, Number(properties.releaseMs ?? 280) || 0),
    peakHoldMs: Math.max(0, Number(properties.peakHoldMs ?? 350) || 0),
    peakFallPerSec: Math.max(0, Number(properties.peakFall ?? 0.7) || 0),
    trailAmount: clamp01(Number(properties.trailAmount ?? 0.72)),
    beatAccent: clamp01(Number(properties.beatAccent ?? 0.7)),
    brightness: clamp01(Number(properties.brightness ?? 0.65)),
    leftDirection: properties.leftDirection === 'Top' ? 'Top' : 'Bottom',
    rightDirection: properties.rightDirection === 'Top' ? 'Top' : 'Bottom',
    swapChannels: properties.swapChannels === true,
    instanceKey,
  }
}

function hash(value: string): number {
  let result = 2166136261
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

/** Deterministic mode order shared with generated firmware. */
export function stereoVuShuffleOrder(key: string): number[] {
  const result = STEREO_VU_MODES.map((_, index) => index)
  let seed = hash(key || 'StereoVuMeter') || 1
  for (let i = result.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function stateSignature(settings: StereoVuSettings): string {
  return [
    settings.instanceKey,
    settings.ledCount,
    settings.enabled ? 1 : 0,
    settings.mode,
    settings.policy,
    settings.cycleIntervalSec,
  ].join('|')
}

export function blankStereoVuState(settings: StereoVuSettings, timeSec = 0): StereoVuState {
  return {
    signature: stateSignature(settings),
    lastTimeSec: timeSec,
    leftLevel: 0,
    rightLevel: 0,
    leftPeak: 0,
    rightPeak: 0,
    leftHoldUntil: timeSec,
    rightHoldUntil: timeSec,
    leftHistory: Array(settings.ledCount).fill(0),
    rightHistory: Array(settings.ledCount).fill(0),
    historyAt: timeSec,
    beatGlow: 0,
    previousBeat: false,
    policyMode: STEREO_VU_MODES.indexOf(settings.mode),
    policyAt: timeSec,
    shuffleOrder: stereoVuShuffleOrder(settings.instanceKey),
  }
}

function condition(raw: number, settings: StereoVuSettings): number {
  const amplified = clamp01(raw) * settings.gain
  const gated = amplified <= settings.noiseGate
    ? 0
    : (amplified - settings.noiseGate) / Math.max(0.0001, 1 - settings.noiseGate)
  return Math.pow(clamp01(gated), settings.responseCurve)
}

function follow(previous: number, target: number, dt: number, attackMs: number, releaseMs: number): number {
  const tau = (target >= previous ? attackMs : releaseMs) / 1000
  if (tau <= 0 || dt <= 0) return dt <= 0 ? previous : target
  return previous + (target - previous) * (1 - Math.exp(-dt / tau))
}

function ladderColor(position: number): RGB {
  if (position < 0.65) return mix({ r: 15, g: 210, b: 55 }, { r: 235, g: 220, b: 30 }, position / 0.65)
  return mix({ r: 235, g: 220, b: 30 }, { r: 255, g: 35, b: 20 }, (position - 0.65) / 0.35)
}

function filled(count: number, level: number, colorAt: (position: number) => RGB): RGB[] {
  const exact = clamp01(level) * count
  return Array.from({ length: count }, (_, index) => {
    const coverage = clamp01(exact - index)
    return scale(colorAt(count === 1 ? 0 : index / (count - 1)), coverage)
  })
}

interface RailRender {
  level: number
  peak: number
  history: number[]
  baseColor: RGB
  otherLevel: number
  side: 'left' | 'right'
}

function renderRail(mode: StereoVuMode, settings: StereoVuSettings, rail: RailRender, beatGlow: number): RGB[] {
  const n = settings.ledCount
  const paletteAt = (position: number) => samplePalette(settings.palette, position * 0.82)
  switch (mode) {
    case 'Palette Fill':
      return filled(n, rail.level, paletteAt)

    case 'Solid Channel':
      return Array.from({ length: n }, () => scale(rail.baseColor, rail.level))

    case 'Segmented Blocks':
      return filled(n, rail.level, (position) => ladderColor(position))
        .map((color, index) => index % 4 === 3 ? BLACK : color)

    case 'Peak Cap': { 
      const pixels = filled(n, rail.level, paletteAt)
      const peakIndex = Math.min(n - 1, Math.floor(rail.peak * n))
      if (rail.peak > 0) pixels[peakIndex] = WHITE
      return pixels
    }

    case 'Falling Comet': {
      const head = Math.min(n - 1, Math.round(rail.peak * (n - 1)))
      const tail = Math.max(1, Math.round(1 + settings.trailAmount * Math.min(12, n - 1)))
      return Array.from({ length: n }, (_, index) => {
        const distance = head - index
        if (rail.peak <= 0 || distance < 0 || distance > tail) return BLACK
        const glow = distance === 0 ? 1 : (1 - distance / (tail + 1)) * settings.trailAmount
        return scale(paletteAt(index / Math.max(1, n - 1)), glow)
      })
    }

    case 'Center Burst': {
      const center = (n - 1) / 2
      const radius = rail.level * (n / 2)
      return Array.from({ length: n }, (_, index) => {
        const coverage = clamp01(radius + 0.5 - Math.abs(index - center))
        return scale(paletteAt(Math.abs(index - center) / Math.max(1, n / 2)), coverage)
      })
    }

    case 'Frame-Inward':
      return filled(n, rail.level, (position) => paletteAt(1 - position)).reverse()

    case 'Dot Runner': {
      const head = Math.min(n - 1, Math.round(rail.level * (n - 1)))
      const tail = Math.max(1, Math.round(settings.trailAmount * Math.min(8, n - 1)))
      return Array.from({ length: n }, (_, index) => {
        const distance = head - index
        if (distance < 0 || distance > tail) return BLACK
        return scale(rail.baseColor, distance === 0 ? 1 : settings.trailAmount * (1 - distance / (tail + 1)))
      })
    }

    case 'History Trail':
      return Array.from({ length: n }, (_, index) => {
        const value = rail.history[index] ?? 0
        return scale(paletteAt(value), value)
      })

    case 'Stereo Balance': { 
      const total = clamp01((rail.level + rail.otherLevel) / 2)
      const balance = (rail.level - rail.otherLevel + 1) / 2
      const balanceColor = mix({ r: 35, g: 90, b: 255 }, { r: 255, g: 45, b: 85 }, balance)
      const sideEmphasis = rail.side === 'left' ? clamp01(0.55 + balance) : clamp01(1.55 - balance)
      return filled(n, total, () => scale(balanceColor, sideEmphasis))
    }

    case 'Beat Spark': {
      const pixels = filled(n, rail.level, ladderColor)
      const tip = Math.min(n - 1, Math.floor(rail.level * n))
      if (rail.level > 0 && beatGlow > 0) {
        pixels[tip] = add(pixels[tip], scale(WHITE, beatGlow * settings.beatAccent))
        if (tip > 0) pixels[tip - 1] = add(pixels[tip - 1], scale(WHITE, beatGlow * settings.beatAccent * 0.35))
      }
      return pixels
    }

    case 'Classic Ladder':
    default:
      return filled(n, rail.level, ladderColor)
  }
}

function selectedMode(settings: StereoVuSettings, state: StereoVuState, beatEdge: boolean, timeSec: number): StereoVuMode {
  const base = STEREO_VU_MODES.indexOf(settings.mode)
  if (settings.policy === 'Manual') return settings.mode
  if (settings.policy === 'Timed cycle') {
    const steps = Math.floor(Math.max(0, timeSec - state.policyAt) / settings.cycleIntervalSec)
    return STEREO_VU_MODES[(base + steps) % STEREO_VU_MODES.length]
  }
  if (settings.policy === 'Shuffle') {
    const steps = Math.floor(Math.max(0, timeSec - state.policyAt) / settings.cycleIntervalSec)
    return STEREO_VU_MODES[state.shuffleOrder[steps % state.shuffleOrder.length]]
  }
  if (beatEdge && timeSec - state.policyAt >= 0.35) {
    state.policyMode = (state.policyMode + 1) % STEREO_VU_MODES.length
    state.policyAt = timeSec
  }
  return STEREO_VU_MODES[state.policyMode]
}

function advancePeak(level: number, peak: number, holdUntil: number, timeSec: number, dt: number, settings: StereoVuSettings): [number, number] {
  if (level >= peak) return [level, timeSec + settings.peakHoldMs / 1000]
  if (timeSec < holdUntil) return [peak, holdUntil]
  return [Math.max(level, peak - settings.peakFallPerSec * dt), holdUntil]
}

/**
 * Advance one paired VU fixture. The caller owns the returned state, which
 * keeps this renderer deterministic and reusable by preview, tests and the
 * firmware-vector port without any module-global animation state.
 */
export function renderStereoVu(
  input: StereoVuInput,
  settings: StereoVuSettings,
  previous?: StereoVuState,
): { frame: StereoVuFrame; state: StereoVuState } {
  const timeSec = Number.isFinite(input.timeSec) ? Math.max(0, input.timeSec) : 0
  const signature = stateSignature(settings)
  let state = previous && previous.signature === signature
    ? { ...previous, leftHistory: [...previous.leftHistory], rightHistory: [...previous.rightHistory] }
    : blankStereoVuState(settings, timeSec)

  if (!settings.enabled || !input.active) {
    state = blankStereoVuState(settings, timeSec)
    const black = Array.from({ length: settings.ledCount }, () => ({ ...BLACK }))
    return {
      state,
      frame: {
        left: black,
        right: black.map((pixel) => ({ ...pixel })),
        leftPhysical: black.map((pixel) => ({ ...pixel })),
        rightPhysical: black.map((pixel) => ({ ...pixel })),
        mode: settings.mode,
        active: false,
        leftLevel: 0,
        rightLevel: 0,
        leftPeak: 0,
        rightPeak: 0,
      },
    }
  }

  const dt = Math.min(0.25, Math.max(0, timeSec - state.lastTimeSec))
  state.lastTimeSec = timeSec
  const rawLeft = settings.swapChannels ? input.right : input.left
  const rawRight = settings.swapChannels ? input.left : input.right
  state.leftLevel = follow(state.leftLevel, condition(rawLeft, settings), dt, settings.attackMs, settings.releaseMs)
  state.rightLevel = follow(state.rightLevel, condition(rawRight, settings), dt, settings.attackMs, settings.releaseMs)
  ;[state.leftPeak, state.leftHoldUntil] = advancePeak(
    state.leftLevel, state.leftPeak, state.leftHoldUntil, timeSec, dt, settings,
  )
  ;[state.rightPeak, state.rightHoldUntil] = advancePeak(
    state.rightLevel, state.rightPeak, state.rightHoldUntil, timeSec, dt, settings,
  )

  const beatEdge = input.beat && !state.previousBeat
  state.previousBeat = input.beat
  state.beatGlow = beatEdge ? 1 : Math.max(0, state.beatGlow - dt * 5)

  const historyPeriod = 1 / 30
  if (timeSec - state.historyAt >= historyPeriod) {
    const steps = Math.min(settings.ledCount, Math.floor((timeSec - state.historyAt) / historyPeriod))
    for (let i = 0; i < steps; i++) {
      state.leftHistory.unshift(state.leftLevel)
      state.rightHistory.unshift(state.rightLevel)
      state.leftHistory.pop()
      state.rightHistory.pop()
    }
    state.historyAt += steps * historyPeriod
  }

  const mode = selectedMode(settings, state, beatEdge, timeSec)
  const leftRaw = renderRail(mode, settings, {
    level: state.leftLevel,
    peak: state.leftPeak,
    history: state.leftHistory,
    baseColor: settings.leftColor,
    otherLevel: state.rightLevel,
    side: 'left',
  }, state.beatGlow)
  const rightRaw = renderRail(mode, settings, {
    level: state.rightLevel,
    peak: state.rightPeak,
    history: state.rightHistory,
    baseColor: settings.rightColor,
    otherLevel: state.leftLevel,
    side: 'right',
  }, state.beatGlow)
  const left = leftRaw.map((color) => scale(color, settings.brightness))
  const right = rightRaw.map((color) => scale(color, settings.brightness))
  return {
    state,
    frame: {
      left,
      right,
      leftPhysical: settings.leftDirection === 'Top' ? [...left].reverse() : [...left],
      rightPhysical: settings.rightDirection === 'Top' ? [...right].reverse() : [...right],
      mode,
      active: true,
      leftLevel: state.leftLevel,
      rightLevel: state.rightLevel,
      leftPeak: state.leftPeak,
      rightPeak: state.rightPeak,
    },
  }
}

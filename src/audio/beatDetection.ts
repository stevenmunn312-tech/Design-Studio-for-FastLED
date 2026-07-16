const DEFAULT_THRESHOLD = 0.05
const DEFAULT_ATTACK = 0.45
const DEFAULT_DECAY = 0.13
const DEFAULT_COOLDOWN_MS = 160

export const BEAT_PARAM_RANGES = {
  threshold: { min: 0, max: 0.25 },
  attack: { min: 0.02, max: 0.8 },
  decay: { min: 0.01, max: 0.5 },
} as const

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export interface BeatDetectorState {
  fast: number
  slow: number
  prevFlux: number
  lastBeatMs: number
  lastMs: number
  bpm: number
  prevSpectrum: number[]
  lastFlux: number
  lastOnset: number
  lastContrast: number
  lastThreshold: number
  lastCooldownMs: number
}

export interface BeatDetectorConfig {
  threshold?: number
  attack?: number
  decay?: number
  cooldownMs?: number
}

export interface BeatDetectorResult {
  beat: boolean
  bpm: number
  state: BeatDetectorState
}

export function createBeatDetectorState(): BeatDetectorState {
  return {
    fast: 0,
    slow: 0,
    prevFlux: 0,
    lastBeatMs: -1,
    lastMs: -1,
    bpm: 120,
    prevSpectrum: [],
    lastFlux: 0,
    lastOnset: 0,
    lastContrast: 0,
    lastThreshold: DEFAULT_THRESHOLD,
    lastCooldownMs: DEFAULT_COOLDOWN_MS,
  }
}

export function denormalizeBeatParam(
  key: keyof typeof BEAT_PARAM_RANGES,
  value: number,
): number {
  const range = BEAT_PARAM_RANGES[key]
  return range.min + clamp01(value) * (range.max - range.min)
}

/**
 * Detect a beat from a normalised bass signal using a fast/slow envelope pair.
 * The fast envelope follows onsets more quickly than the slow envelope; when
 * the fast envelope rises sufficiently above the slow one, we treat it as a
 * beat and update the BPM estimate from the inter-beat interval.
 */
export function updateBeatDetector(
  bass: number,
  nowMs: number,
  prev: BeatDetectorState,
  config: BeatDetectorConfig = {},
): BeatDetectorResult {
  return updateBeatDetectorFromSpectrum([bass], nowMs, prev, config)
}

// A transient only moves a handful of bands, and the AnalyserNode's time
// smoothing (0.75) spreads its rise over several frames — so a plain weighted
// *average* across all 32 bands dilutes even a hard kick to ~0.05, right at
// the threshold floor. FLUX_GAIN rescales the average so realistic onsets land
// well inside the threshold slider's 0–0.25 range (calibrated by simulation:
// a strong kick reads ~0.3, a very soft one ~0.12, steady noise ~0.1 — noise
// is then rejected by the onset-contrast gate, which is scale-aware). The C++
// mirrors in cppGenerator.ts interpolate this same constant.
export const FLUX_GAIN = 6

function weightedFlux(current: readonly number[], previous: readonly number[]): number {
  const len = Math.max(current.length, previous.length)
  if (len === 0) return 0
  let sum = 0
  let weightSum = 0
  for (let i = 0; i < len; i++) {
    const cur = clamp01(current[i] ?? 0)
    const prev = clamp01(previous[i] ?? 0)
    const diff = Math.max(0, cur - prev)
    const weight = i < 6 ? 2.0 : i < 12 ? 1.35 : i < 20 ? 0.85 : 0.45
    sum += diff * weight
    weightSum += weight
  }
  return clamp01((sum / Math.max(1e-6, weightSum)) * FLUX_GAIN)
}

export function updateBeatDetectorFromSpectrum(
  spectrum: readonly number[],
  nowMs: number,
  prev: BeatDetectorState,
  config: BeatDetectorConfig = {},
): BeatDetectorResult {
  const threshold = clamp01(Number.isFinite(config.threshold ?? NaN) ? Number(config.threshold) : DEFAULT_THRESHOLD)
  const attack = clamp01(Number.isFinite(config.attack ?? NaN) ? Number(config.attack) : DEFAULT_ATTACK)
  const decay = clamp01(Number.isFinite(config.decay ?? NaN) ? Number(config.decay) : DEFAULT_DECAY)
  const cooldownMs = Math.max(0, Number.isFinite(config.cooldownMs ?? NaN) ? Number(config.cooldownMs) : DEFAULT_COOLDOWN_MS)

  const current = Array.from(spectrum, (value) => clamp01(Number(value) || 0))
  if (prev.prevSpectrum.length === 0) {
    return {
      beat: false,
      bpm: prev.bpm > 0 ? prev.bpm : 120,
      state: {
        ...prev,
        prevSpectrum: current,
        lastMs: nowMs,
        lastFlux: 0,
        lastOnset: 0,
        lastContrast: 0,
        lastThreshold: threshold,
        lastCooldownMs: cooldownMs,
      },
    }
  }

  // The caller's clock went backward (the preview loop's animation clock
  // restarts at zero on remount while this state lives in a module-level
  // map): drop the timing memory so a huge stale lastBeatMs can't hold the
  // cooldown gate shut for minutes.
  const clockReset = prev.lastMs >= 0 && nowMs < prev.lastMs
  const lastBeatBase = clockReset ? -1 : prev.lastBeatMs

  // attack/decay are calibrated as per-frame coefficients at 60 fps, but the
  // detector is not always stepped at 60 fps (the preview loop drops to 8 fps
  // with the panel closed; firmware loops run much faster). Convert them to
  // the elapsed interval so envelope behaviour is framerate-independent —
  // without this, the slow baseline stops collapsing between kicks at low
  // rates and the contrast gate silences every beat.
  const dtMs = clockReset || prev.lastMs < 0 ? 1000 / 60 : Math.max(1, Math.min(500, nowMs - prev.lastMs))
  const dtFrames = dtMs / (1000 / 60)
  const attackAlpha = 1 - Math.pow(1 - attack, dtFrames)
  const decayAlpha = 1 - Math.pow(1 - decay, dtFrames)

  const flux = weightedFlux(current, prev.prevSpectrum)
  const fast = prev.fast + (flux - prev.fast) * attackAlpha
  const slow = prev.slow + (flux - prev.slow) * decayAlpha
  // Compare against the *pre-sample* slow baseline: at coarse evaluation rates
  // (large dt) a single sample carries the whole onset, and folding it into
  // `slow` before the comparison would let the kick mask itself.
  const onset = fast - prev.slow
  const baseline = Math.max(0.02, prev.slow)
  const contrast = onset / baseline
  const prevBpm = prev.bpm > 0 ? prev.bpm : 120
  const dynamicCooldown = Math.max(150, Math.min(600, 60000 / prevBpm * 0.42))
  const gap = Math.max(cooldownMs, dynamicCooldown)
  const elapsed = lastBeatBase >= 0 ? nowMs - lastBeatBase : Number.POSITIVE_INFINITY
  // A rising edge, not a local-peak test: requiring the two *previous* frames
  // to be non-decreasing (`prevFlux >= prevPrevFlux`) randomly rejected ~half
  // of all onsets, because noise-floor jitter in the quiet frames before a
  // kick fails that check on a coin flip. The cooldown + contrast gates
  // already stop one onset from firing twice.
  const isRising = flux > prev.prevFlux
  const beat = flux > threshold && isRising && onset > threshold * 0.45 && contrast > 1.1 && elapsed >= gap

  let bpm = prevBpm
  let lastBeatMs = lastBeatBase

  if (beat) {
    if (lastBeatBase >= 0) {
      const interval = nowMs - lastBeatBase
      if (interval >= 220 && interval <= 1800) {
        const instant = 60000 / interval
        bpm = bpm * 0.65 + instant * 0.35
      }
    }
    lastBeatMs = nowMs
  }

  return {
    beat,
    bpm,
    state: {
      fast,
      slow,
      prevFlux: flux,
      lastBeatMs,
      lastMs: nowMs,
      bpm,
      prevSpectrum: current,
      lastFlux: flux,
      lastOnset: onset,
      lastContrast: contrast,
      lastThreshold: threshold,
      lastCooldownMs: gap,
    },
  }
}

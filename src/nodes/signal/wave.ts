// Waveform math shared by the Wave node's evaluator and its inline preview
// scope, so the on-node preview matches the rendered signal. (The C++
// generator mirrors these shapes as emitted expressions.)

export type WaveType = 'sine' | 'triangle' | 'square' | 'sawtooth'

/** How the Wave's rate is given: cycles a second, or one cycle per beat. */
export const WAVE_RATE_UNITS = ['Hz', 'BPM'] as const

/** Cycles per second for the Wave's selected rate unit. */
export function waveHz(unit: unknown, frequency: number, bpm: number): number {
  return unit === 'BPM' ? bpm / 60 : frequency
}

/** How a Wave's output sits around its offset: the same rule on both sides. */
export interface WaveLevel {
  /** 0 to amplitude instead of −amplitude to +amplitude. */
  unipolar: boolean
  offset: number
}

/** offset + amplitude · wave(frequency·t + phase); the base wave is in [-1, 1]. */
export function waveSample(type: string, amplitude: number, frequency: number, phase: number, t: number, level?: WaveLevel): number {
  return waveAt(type, amplitude, frequency * t, phase, level)
}

/** `waveSample` over an already-integrated argument: `cycles` is `∫ frequency dt`. */
export function waveAt(type: string, amplitude: number, cycles: number, phase: number, level: WaveLevel = { unipolar: false, offset: 0 }): number {
  const arg = cycles + phase
  const ph = ((arg % 1) + 1) % 1
  let w: number
  switch (type) {
    case 'square':   w = ph < 0.5 ? 1 : -1; break
    case 'sawtooth': w = 2 * ph - 1; break
    case 'triangle': w = 4 * Math.abs(ph - 0.5) - 1; break
    default:         w = Math.sin(2 * Math.PI * arg) // sine
  }
  return level.offset + amplitude * (level.unipolar ? (w + 1) / 2 : w)
}

/** The span a Wave's output covers, for range checks on its wire. */
export function waveRange(amplitude: number, level: WaveLevel): { min: number; max: number } {
  const lo = level.unipolar ? 0 : -amplitude
  const a = level.offset + lo, b = level.offset + amplitude
  return { min: Math.min(a, b), max: Math.max(a, b) }
}

// ── Preview sampling ──────────────────────────────────────────────────────────
// A small fixed window (two cycles of a 1 Hz wave) used by the node scope.
const PREVIEW_SAMPLES = 64
const PREVIEW_WINDOW = 2 // seconds

/** Number of points / window (seconds) a node preview scope samples. */
export const PREVIEW_POINTS = PREVIEW_SAMPLES
export const PREVIEW_SECONDS = PREVIEW_WINDOW

/** Sample a Wave node's own waveform across the preview window. */
export function waveNodeSamples(type: string, amplitude: number, frequency: number, phase: number, level?: WaveLevel): number[] {
  const out: number[] = []
  for (let i = 0; i < PREVIEW_SAMPLES; i++) {
    const t = (i / (PREVIEW_SAMPLES - 1)) * PREVIEW_WINDOW
    out.push(waveSample(type, amplitude, frequency, phase, t, level))
  }
  return out
}

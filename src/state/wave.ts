// Waveform math shared by the Wave / ComplexWave nodes' evaluator and their
// inline preview scope, so the on-node preview matches the rendered signal.
// (The C++ generator mirrors these shapes as emitted expressions.)

export type WaveType = 'sine' | 'triangle' | 'square' | 'sawtooth'
export type CombineOp = 'add' | 'multiply' | 'average' | 'min' | 'max' | 'difference'

/** amplitude · wave(frequency·t + phase); the base wave is in [-1, 1]. */
export function waveSample(type: string, amplitude: number, frequency: number, phase: number, t: number): number {
  const arg = frequency * t + phase
  const ph = ((arg % 1) + 1) % 1
  let w: number
  switch (type) {
    case 'square':   w = ph < 0.5 ? 1 : -1; break
    case 'sawtooth': w = 2 * ph - 1; break
    case 'triangle': w = 4 * Math.abs(ph - 0.5) - 1; break
    default:         w = Math.sin(2 * Math.PI * arg) // sine
  }
  return amplitude * w
}

/** Combine two wave values into one. */
export function combineWaves(op: string, a: number, b: number): number {
  switch (op) {
    case 'multiply':   return a * b
    case 'average':    return (a + b) / 2
    case 'min':        return Math.min(a, b)
    case 'max':        return Math.max(a, b)
    case 'difference': return a - b
    default:           return a + b // add
  }
}

// ── Preview sampling ──────────────────────────────────────────────────────────
// A small fixed window (two cycles of a 1 Hz wave) used by the node scope.
const PREVIEW_SAMPLES = 64
const PREVIEW_WINDOW = 2 // seconds

/** Sample a Wave node's own waveform across the preview window. */
export function waveNodeSamples(type: string, amplitude: number, frequency: number, phase: number): number[] {
  const out: number[] = []
  for (let i = 0; i < PREVIEW_SAMPLES; i++) {
    const t = (i / (PREVIEW_SAMPLES - 1)) * PREVIEW_WINDOW
    out.push(waveSample(type, amplitude, frequency, phase, t))
  }
  return out
}

/**
 * Sample a ComplexWave preview: the chosen operation applied to two reference
 * sines (1× and 2×), illustrating the combine's character across the window.
 */
export function complexWaveSamples(op: string): number[] {
  const out: number[] = []
  for (let i = 0; i < PREVIEW_SAMPLES; i++) {
    const t = (i / (PREVIEW_SAMPLES - 1)) * PREVIEW_WINDOW
    out.push(combineWaves(op, waveSample('sine', 1, 1, 0, t), waveSample('sine', 1, 2, 0, t)))
  }
  return out
}

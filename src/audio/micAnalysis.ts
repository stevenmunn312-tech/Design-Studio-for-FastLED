export const MIC_DEFAULTS = {
  gain: 1,
  agc: false,
  threshold: 0.10,
  attack: 0.30,
  decay: 0.08,
} as const

export const MIC_MAX_GAIN = 20
export const MIC_SAMPLE_RATE = 16_000
export const MIC_FFT_SIZE = 512
export const MIC_SPECTRUM_BARS = 32
export const MIC_SPECTRUM_MIN_HZ = 30
export const MIC_SPECTRUM_MAX_HZ = 8_000
export const MIC_MIN_DB = -100
export const MIC_MAX_DB = -30
export const MIC_SPECTRUM_SMOOTHING = 0.75
export const MIC_THRESHOLD_RANGE = 0.25
export const MIC_REFERENCE_FRAME_MS = 1000 / 60

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function dbToNormalized(db: number): number {
  if (!Number.isFinite(db)) return 0
  return clamp01((db - MIC_MIN_DB) / (MIC_MAX_DB - MIC_MIN_DB))
}

/**
 * The browser-side equivalent of the generated firmware's Hann-windowed,
 * in-place radix-2 FFT. Keeping this small implementation shared by tests and
 * preview avoids depending on AnalyserNode's browser-specific FFT window and
 * magnitude scaling.
 */
export function fillNormalizedFft(
  samples: Float32Array,
  re: Float32Array,
  im: Float32Array,
  out: Float32Array,
): void {
  const n = samples.length
  if (n < 2 || (n & (n - 1)) !== 0 || re.length < n || im.length < n || out.length < n / 2) {
    throw new Error('FFT buffers must fit the same power-of-two sample length')
  }
  for (let i = 0; i < n; i++) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
    re[i] = samples[i] * window
    im[i] = 0
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wr = Math.cos(angle), wi = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const vr = re[b] * cr - im[b] * ci
        const vi = re[b] * ci + im[b] * cr
        re[b] = re[a] - vr; im[b] = im[a] - vi
        re[a] += vr; im[a] += vi
        const nextCr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nextCr
      }
    }
  }
  out.fill(0)
  for (let i = 1; i < n / 2; i++) {
    const magnitude = Math.hypot(re[i], im[i])
    const amplitude = Math.max(0.00001, magnitude * (4 / n))
    out[i] = dbToNormalized(20 * Math.log10(amplitude))
  }
}

/** Convert a 60 fps coefficient into an elapsed-time-independent alpha. */
export function elapsedAlpha(coefficient: number, elapsedMs = MIC_REFERENCE_FRAME_MS): number {
  const base = clamp01(coefficient)
  const frames = Math.max(0.001, Math.min(30, elapsedMs / MIC_REFERENCE_FRAME_MS))
  return 1 - Math.pow(1 - base, frames)
}

/** Convert a 60 fps "retain previous" smoothing value into a follow alpha. */
export function smoothingAlpha(retain: number, elapsedMs = MIC_REFERENCE_FRAME_MS): number {
  const base = clamp01(retain)
  const frames = Math.max(0.001, Math.min(30, elapsedMs / MIC_REFERENCE_FRAME_MS))
  return 1 - Math.pow(base, frames)
}

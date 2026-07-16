export const MIC_DEFAULTS = {
  gain: 1,
} as const

export const MIC_MAX_GAIN = 20
// Matches fl::audio::Config::CreateInmp441's default I2S rate, so the browser
// capture and the on-device FastLED audio pipeline analyse the same bandwidth.
export const MIC_SAMPLE_RATE = 44_100
export const MIC_FFT_SIZE = 512
export const MIC_SPECTRUM_BARS = 32

/**
 * In-place iterative radix-2 FFT (Cooley–Tukey) — the browser-side equivalent
 * of the FFT inside FastLED's audio pipeline. `re`/`im` must share the same
 * power-of-two length. Callers own windowing and magnitude scaling
 * (see fastledReactive.ts).
 */
export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length
  if (n < 2 || (n & (n - 1)) !== 0 || im.length < n) {
    throw new Error('FFT buffers must share the same power-of-two length')
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
}

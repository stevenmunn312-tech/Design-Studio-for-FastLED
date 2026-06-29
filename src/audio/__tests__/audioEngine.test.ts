import { describe, expect, it } from 'vitest'
import { averageFrequencyBand, logarithmicSpectrum } from '../audioEngine'

describe('audioEngine FFT helpers', () => {
  it('selects bands using the actual sample rate', () => {
    const data = new Uint8Array(256)
    // 48 kHz / 512 = 93.75 Hz per bin; bin 2 is 187.5 Hz (bass).
    data[2] = 255
    expect(averageFrequencyBand(data, 48_000, 512, 30, 250)).toBeGreaterThan(0)
    expect(averageFrequencyBand(data, 48_000, 512, 250, 2_000)).toBe(0)
  })

  it('builds a low-to-high logarithmic spectrum at the requested resolution', () => {
    const data = new Uint8Array(256)
    data[1] = 255
    const spectrum = logarithmicSpectrum(data, 48_000, 512, 24)
    expect(spectrum).toHaveLength(24)
    expect(Math.max(...spectrum.slice(0, 8))).toBeGreaterThan(0)
    expect(Math.max(...spectrum.slice(16))).toBe(0)
  })
})

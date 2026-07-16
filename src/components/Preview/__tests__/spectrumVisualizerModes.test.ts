import { describe, expect, it } from 'vitest'
import {
  SPECTRUM_VISUALIZER_OPTIONS,
  SPECTRUM_VISUALIZER_STYLES,
  isSpectrumVisualizerMode,
  resampleSpectrum,
  spectrumVisualizerLabel,
} from '../spectrumVisualizerModes'

describe('spectrum visualizer modes', () => {
  it('offers Auto plus five named visualizer styles', () => {
    expect(SPECTRUM_VISUALIZER_STYLES).toEqual(['bars', 'mirror', 'ribbon', 'orbit', 'waterfall'])
    expect(SPECTRUM_VISUALIZER_OPTIONS.map((option) => option.value)).toEqual([
      'auto', 'bars', 'mirror', 'ribbon', 'orbit', 'waterfall',
    ])
    expect(spectrumVisualizerLabel('mirror')).toBe('Centre mirror')
  })

  it('validates persisted modes and rejects stale values', () => {
    expect(isSpectrumVisualizerMode('auto')).toBe(true)
    expect(isSpectrumVisualizerMode('orbit')).toBe(true)
    expect(isSpectrumVisualizerMode('radial')).toBe(false)
  })

  it('resamples the shared spectrum without escaping normalized bounds', () => {
    expect(resampleSpectrum([0, 0.5, 1, 2], 2)).toEqual([0.25, 1])
    expect(resampleSpectrum([], 3)).toEqual([0, 0, 0])
  })
})

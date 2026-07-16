import { describe, expect, it } from 'vitest'
import {
  SPECTRUM_VISUALIZER_OPTIONS,
  SPECTRUM_VISUALIZER_STYLES,
  isSpectrumVisualizerMode,
  nextSpectrumVisualizerMode,
  resampleSpectrum,
  spectrumVisualizerLabel,
} from '../spectrumVisualizerModes'

describe('spectrum visualizer modes', () => {
  it('offers Auto plus seven named visualizer styles', () => {
    expect(SPECTRUM_VISUALIZER_STYLES).toEqual([
      'bars', 'mirror', 'ribbon', 'orbit', 'waterfall', 'stacks', 'constellation',
    ])
    expect(SPECTRUM_VISUALIZER_OPTIONS.map((option) => option.value)).toEqual([
      'auto', 'bars', 'mirror', 'ribbon', 'orbit', 'waterfall', 'stacks', 'constellation',
    ])
    expect(spectrumVisualizerLabel('mirror')).toBe('Centre mirror')
  })

  it('cycles the Stage button through every option', () => {
    expect(nextSpectrumVisualizerMode('bars')).toBe('mirror')
    expect(nextSpectrumVisualizerMode('constellation')).toBe('auto')
    expect(nextSpectrumVisualizerMode('auto')).toBe('bars')
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

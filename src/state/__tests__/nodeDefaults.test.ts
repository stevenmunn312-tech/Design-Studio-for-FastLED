import { beforeEach, describe, expect, it } from 'vitest'
import { resolveDefaultProperties, useNodeDefaults } from '../nodeDefaults'

describe('node defaults', () => {
  beforeEach(() => {
    localStorage.clear()
    useNodeDefaults.setState({ overrides: {} })
  })

  it('does not persist or resolve the obsolete MicInput sample rate', () => {
    useNodeDefaults.getState().setDefault('MicInput', { gain: 2, sampleRate: 44_100 })

    expect(useNodeDefaults.getState().overrides.MicInput).toEqual({ gain: 2 })
    // Asserted field by field: a resolved MicInput also carries the selected
    // board's I2S pins, which this test isn't about.
    const resolved = resolveDefaultProperties('MicInput', { gain: 1, sampleRate: 48_000 })
    expect(resolved.gain).toBe(2)
    expect(resolved).not.toHaveProperty('sampleRate')
    expect(JSON.parse(localStorage.getItem('design-studio-for-fastled.node-defaults.v1') ?? '{}')).toEqual({
      MicInput: { gain: 2 },
    })
  })
})

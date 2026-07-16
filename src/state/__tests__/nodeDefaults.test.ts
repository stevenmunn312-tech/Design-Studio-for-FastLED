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
    expect(resolveDefaultProperties('MicInput', { gain: 1, sampleRate: 48_000 })).toEqual({ gain: 2 })
    expect(JSON.parse(localStorage.getItem('fastled-studio.node-defaults.v1') ?? '{}')).toEqual({
      MicInput: { gain: 2 },
    })
  })
})

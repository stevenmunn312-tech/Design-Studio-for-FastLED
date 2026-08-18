import { beforeEach, describe, expect, it } from 'vitest'
import { resolveDefaultProperties, useNodeDefaults } from '../nodeDefaults'
import { useUploadStore } from '../uploadStore'

describe('node defaults', () => {
  beforeEach(() => {
    localStorage.clear()
    useNodeDefaults.setState({ overrides: {}, micOverridesByFqbn: {} })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
  })

  it('does not persist or resolve the obsolete MicInput sample rate', () => {
    useNodeDefaults.getState().setDefault('MicInput', { gain: 2, sampleRate: 44_100 })

    expect(useNodeDefaults.getState().micOverridesByFqbn['esp32:esp32:esp32s3']).toEqual({ gain: 2 })
    // Asserted field by field: a resolved MicInput also carries the selected
    // board's I2S pins, which this test isn't about.
    const resolved = resolveDefaultProperties('MicInput', { gain: 1, sampleRate: 48_000 })
    expect(resolved.gain).toBe(2)
    expect(resolved).not.toHaveProperty('sampleRate')
    expect(JSON.parse(localStorage.getItem('design-studio-for-fastled.mic-defaults-by-board.v1') ?? '{}')).toEqual({
      'esp32:esp32:esp32s3': { gain: 2 },
    })
  })

  it('keeps microphone defaults separate for each selected board', () => {
    useNodeDefaults.getState().setDefault('MicInput', {
      gain: 1, i2sWs: 2, i2sSck: 3, i2sSd: 4,
    }, 'teensy:avr:teensy40')
    useNodeDefaults.getState().setDefault('MicInput', {
      gain: 2, i2sWs: 25, i2sSck: 26, i2sSd: 27,
    }, 'esp32:esp32:esp32')

    useUploadStore.setState({ selectedFqbn: 'teensy:avr:teensy40' })
    expect(resolveDefaultProperties('MicInput', { gain: 0.5 })).toMatchObject({
      gain: 1, i2sWs: 2, i2sSck: 3, i2sSd: 4,
    })

    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32' })
    expect(resolveDefaultProperties('MicInput', { gain: 0.5 })).toMatchObject({
      gain: 2, i2sWs: 25, i2sSck: 26, i2sSd: 27,
    })
  })

  it('uses a board common pinout until that board has a custom default', () => {
    useUploadStore.setState({ selectedFqbn: 'teensy:avr:teensy40' })
    expect(resolveDefaultProperties('MicInput', { gain: 1 })).toMatchObject({
      i2sWs: 20, i2sSck: 21, i2sSd: 8,
    })
  })
})

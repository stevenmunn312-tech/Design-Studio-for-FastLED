import { beforeEach, describe, expect, it } from 'vitest'
import { resolveDefaultProperties, useNodeDefaults } from '../nodeDefaults'
import { useUploadStore } from '../uploadStore'
import { boardProfileById } from '../../build/boardProfiles'

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

  // The hardware view is the only thing that says what an output physically
  // is. A saved default carrying a form handed every new output the shape of
  // whichever part was on the bench when save was pressed, which is how the
  // starters came to load as LED Strings.
  it('ignores a saved LED output form, including one already stored', () => {
    useNodeDefaults.setState({ overrides: { MatrixOutput: { form: 'ring', ledCount: 24, brightness: 120 } } })

    const resolved = resolveDefaultProperties('MatrixOutput', { form: 'matrix', width: 16, height: 16 })

    expect(resolved.form).toBe('matrix')   // the library's, not the saved one
    expect(resolved.brightness).toBe(120)  // everything else still applies
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

  it('uses the exact board RTC defaults instead of saved cross-board pins', () => {
    useNodeDefaults.getState().setDefault('RTCInput', { sdaPin: 30, sclPin: 31, startYear: 2030 })
    const xiao = boardProfileById('seeed-xiao-esp32s3')
    expect(resolveDefaultProperties('RTCInput', { sdaPin: 21, sclPin: 22 }, xiao)).toMatchObject({
      sdaPin: 5,
      sclPin: 6,
      startYear: 2030,
    })
  })

  it('uses the selected board core defaults for the complete SD SPI bus', () => {
    useNodeDefaults.getState().setDefault('SDCard', { sdCsPin: 10 })
    const esp32d = boardProfileById('esp32-devkit-v1-30pin-esp32d')
    expect(resolveDefaultProperties('SDCard', {
      sdCsPin: 10, sdSckPin: 12, sdMisoPin: 13, sdMosiPin: 11,
    }, esp32d)).toMatchObject({
      sdCsPin: 5, sdSckPin: 18, sdMisoPin: 19, sdMosiPin: 23,
    })
  })
})

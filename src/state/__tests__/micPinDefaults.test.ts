import { describe, expect, it } from 'vitest'
import {
  MIC_PIN_DEFAULTS_BY_FQBN,
  inmp441FirmwareBackendForBoard,
  inmp441SupportedForBoard,
  micPinDefaultsForBoard,
  micPinsFromProfile,
  retargetedMicPins,
} from '../micPinDefaults'
import { BOARDS } from '../uploadStore'
import { findBoardPinCompatibility } from '../../utils/validateGraph'
import type { StudioNode } from '../graphStore'

const micNode = (properties: Record<string, unknown>): StudioNode => ({
  id: 'mic',
  type: 'studioNode',
  position: { x: 0, y: 0 },
  data: { nodeType: 'MicInput', label: 'Microphone', category: 'input', properties },
} as unknown as StudioNode)

describe('board-aware MicInput pin defaults', () => {
  it('enables every compatible built-in target requested by the hardware catalogue', () => {
    const compatible = [
      ...BOARDS.filter((board) => board.fqbn.startsWith('esp32:esp32:')),
      ...BOARDS.filter((board) => ['teensy41', 'teensy40', 'teensyMM', 'teensy36', 'teensy35', 'teensy31'].some((id) => board.fqbn.endsWith(`:${id}`))),
      ...BOARDS.filter((board) => board.fqbn.startsWith('rp2040:rp2040:')),
      ...BOARDS.filter((board) => [
        'adafruit:samd:adafruit_feather_m4',
        'adafruit:samd:adafruit_grandcentral_m4',
      ].includes(board.fqbn)),
      ...BOARDS.filter((board) => [
        'STMicroelectronics:stm32:blackpill_f411ce',
        'STMicroelectronics:stm32:nucleo_f429zi',
        'STMicroelectronics:stm32:nucleo_f439zi',
      ].includes(board.fqbn)),
    ]

    expect(compatible).not.toHaveLength(0)
    for (const board of compatible) {
      expect(inmp441SupportedForBoard(board.fqbn), board.label).toBe(true)
      expect(micPinDefaultsForBoard(board.fqbn), board.label).toBeDefined()
      expect(inmp441FirmwareBackendForBoard(board.fqbn), board.label).toBeDefined()
    }
  })

  it('routes each family to a real firmware capture backend', () => {
    expect(inmp441FirmwareBackendForBoard('esp32:esp32:esp32s3')).toBe('fastled-esp32')
    expect(inmp441FirmwareBackendForBoard('teensy:avr:teensy40')).toBe('fastled-teensy')
    expect(inmp441FirmwareBackendForBoard('rp2040:rp2040:rpipico')).toBe('pico-i2s')
    expect(inmp441FirmwareBackendForBoard('adafruit:samd:adafruit_feather_m4')).toBe('samd51-zero-i2s')
    expect(inmp441FirmwareBackendForBoard('STMicroelectronics:stm32:blackpill_f411ce')).toBe('stm32-i2s')
    expect(inmp441FirmwareBackendForBoard('arduino:avr:uno')).toBeUndefined()
  })

  it('uses pins exposed safely by every supported catalogue target', () => {
    for (const board of BOARDS) {
      const pins = micPinDefaultsForBoard(board.fqbn)
      if (!pins) continue
      const { errors, warnings } = findBoardPinCompatibility([micNode({ ...pins })], board.fqbn)
      expect(errors, board.label).toEqual([])
      // ADC2/Wi-Fi only affects analogRead; INMP441 uses digital I2S, so that
      // analog-only caveat must not appear for otherwise safe microphone pins.
      expect(warnings, board.label).toEqual([])
    }
  })

  it('uses the fixed PJRC I2S pins on Teensy 4.x and 3.x', () => {
    expect(micPinDefaultsForBoard('teensy:avr:teensy40')).toEqual({ i2sWs: 20, i2sSck: 21, i2sSd: 8 })
    expect(micPinDefaultsForBoard('teensy:avr:teensy41')).toEqual({ i2sWs: 20, i2sSck: 21, i2sSd: 8 })
    expect(micPinDefaultsForBoard('teensy:avr:teensyMM')).toEqual({ i2sWs: 20, i2sSck: 21, i2sSd: 8 })
    expect(micPinDefaultsForBoard('teensy:avr:teensy36')).toEqual({ i2sWs: 23, i2sSck: 9, i2sSd: 13 })
  })

  it('keeps genuinely unsupported targets disabled', () => {
    for (const fqbn of [
      'arduino:avr:uno',
      'esp8266:esp8266:nodemcuv2',
      'teensy:avr:teensy30',
      'teensy:avr:teensyLC',
      'arduino:samd:arduino_zero_native',
      'adafruit:samd:adafruit_feather_m0',
      'adafruit:samd:adafruit_matrixportal_m4',
      'STMicroelectronics:stm32:bluepill_f103c8',
      'arduino:renesas_uno:unor4wifi',
      'adafruit:nrf52:feather52840',
    ]) {
      expect(inmp441SupportedForBoard(fqbn), fqbn).toBe(false)
      expect(micPinDefaultsForBoard(fqbn), fqbn).toBeUndefined()
    }
  })

  it('uses the Adafruit SAMD51 variant I2S input pins', () => {
    expect(micPinDefaultsForBoard('adafruit:samd:adafruit_feather_m4'))
      .toEqual({ i2sWs: 10, i2sSck: 1, i2sSd: 12 })
    expect(micPinDefaultsForBoard('adafruit:samd:adafruit_grandcentral_m4'))
      .toEqual({ i2sWs: 33, i2sSck: 14, i2sSd: 31 })
  })

  it('uses STM32duino digital numbers for the common PB12/PB13/PB15 I2S bus', () => {
    expect(micPinDefaultsForBoard('STMicroelectronics:stm32:blackpill_f411ce'))
      .toEqual({ i2sWs: 27, i2sSck: 28, i2sSd: 30 })
    expect(micPinDefaultsForBoard('STMicroelectronics:stm32:nucleo_f429zi'))
      .toEqual({ i2sWs: 19, i2sSck: 18, i2sSd: 17 })
  })

  it('retargets to the next board common wiring even if the old board was hand-wired', () => {
    expect(retargetedMicPins(
      { i2sWs: 5, i2sSck: 18, i2sSd: 19 },
      'teensy:avr:teensy40',
    )).toEqual({ i2sWs: 20, i2sSck: 21, i2sSd: 8 })
  })

  it('prefers the next board saved wiring over its common wiring', () => {
    expect(retargetedMicPins(
      { i2sWs: 39, i2sSck: 40, i2sSd: 41 },
      'teensy:avr:teensy40',
      { i2sWs: 2, i2sSck: 3, i2sSd: 4, gain: 2 },
    )).toEqual({ i2sWs: 2, i2sSck: 3, i2sSd: 4 })
  })

  it('leaves pins visible but unchanged while an unsupported board is selected', () => {
    expect(retargetedMicPins(
      { i2sWs: 39, i2sSck: 40, i2sSd: 41 },
      'arduino:avr:uno',
    )).toBeUndefined()
  })

  it('never reuses one pin for two I2S roles', () => {
    for (const [fqbn, pins] of Object.entries(MIC_PIN_DEFAULTS_BY_FQBN)) {
      expect(new Set(Object.values(pins)).size, fqbn).toBe(3)
    }
  })
})

describe('board profile pins take precedence over the FQBN table', () => {
  // An FQBN names a chip, not a board: a XIAO ESP32S3 and an ESP32-S3-DevKitC-1
  // are both esp32:esp32:esp32s3, and only the profile knows which pads are
  // actually broken out.
  const profile = {
    peripheralPins: { inmp441: { wsLrclk: 5, sckBclk: 6, sdDout: 7 } },
  } as unknown as Parameters<typeof micPinsFromProfile>[0]

  it('reads the profile pins in Studio property order', () => {
    expect(micPinsFromProfile(profile)).toEqual({ i2sWs: 5, i2sSck: 6, i2sSd: 7 })
  })

  it('is undefined when the profile carries no microphone pins', () => {
    expect(micPinsFromProfile({ peripheralPins: {} } as never)).toBeUndefined()
    expect(micPinsFromProfile(undefined)).toBeUndefined()
  })

  it('prefers the profile over the FQBN table when retargeting', () => {
    const current = { i2sWs: 1, i2sSck: 2, i2sSd: 3 }
    expect(retargetedMicPins(current, 'esp32:esp32:esp32s3', undefined, profile))
      .toEqual({ i2sWs: 5, i2sSck: 6, i2sSd: 7 })
  })

  it('still lets the user’s saved pins for that board win over both', () => {
    // Their bench is wired the way it is wired; a board profile is a starting
    // point, not a correction.
    const current = { i2sWs: 1, i2sSck: 2, i2sSd: 3 }
    const saved = { i2sWs: 30, i2sSck: 31, i2sSd: 32 }
    expect(retargetedMicPins(current, 'esp32:esp32:esp32s3', saved, profile))
      .toEqual({ i2sWs: 30, i2sSck: 31, i2sSd: 32 })
  })

  it('falls back to the FQBN table when the profile has no pins', () => {
    const current = { i2sWs: 1, i2sSck: 2, i2sSd: 3 }
    expect(retargetedMicPins(current, 'esp32:esp32:esp32s3', undefined, undefined))
      .toEqual(MIC_PIN_DEFAULTS_BY_FQBN['esp32:esp32:esp32s3'])
  })
})

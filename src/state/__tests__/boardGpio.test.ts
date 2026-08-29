import { describe, expect, it } from 'vitest'
import { BOARD_GPIO_BY_FQBN, pinSupports, pinWarningForCapability, type PinNote } from '../boardGpio'
import { BOARDS, boardGpioInfo } from '../uploadStore'

describe('board GPIO capability catalogue', () => {
  it('covers every built-in board', () => {
    expect(BOARDS).not.toHaveLength(0)
    for (const board of BOARDS) {
      expect(boardGpioInfo(board.fqbn), board.label).toBeDefined()
    }
    expect(Object.keys(BOARD_GPIO_BY_FQBN)).toHaveLength(BOARDS.length)
  })

  it('preserves high Arduino pin aliases on large boards', () => {
    expect(boardGpioInfo('arduino:avr:mega')?.maxPin).toBe(69)
    const nucleo = boardGpioInfo('STMicroelectronics:stm32:nucleo_f429zi')!
    expect(nucleo.maxPin).toBe(116)
    expect(nucleo.recommended.find((pin) => pin.pin === 56)?.note).toMatch(/Alias of pin 31/)
    expect(nucleo.caution.find((pin) => pin.pin === 72)?.note).toMatch(/Not connected/)
  })

  it('distinguishes analog-only, input-only, and pull-up capabilities', () => {
    const nanoA6 = boardGpioInfo('arduino:avr:nano')!.recommended.find((pin) => pin.pin === 20)!
    expect(pinSupports(nanoA6, 'analogInput')).toBe(true)
    expect(pinSupports(nanoA6, 'digitalInput')).toBe(false)

    const espInputOnly = boardGpioInfo('esp32:esp32:esp32')!.recommended.find((pin) => pin.pin === 34)!
    expect(pinSupports(espInputOnly, 'digitalInput')).toBe(true)
    expect(pinSupports(espInputOnly, 'digitalOutput')).toBe(false)
    expect(pinSupports(espInputOnly, 'pullup')).toBe(false)
  })

  it('marks classic ESP32 ADC2 pins with their Wi-Fi conflict', () => {
    const adc2 = boardGpioInfo('esp32:esp32:esp32')!.recommended.find((pin) => pin.pin === 25)!
    expect(pinSupports(adc2, 'analogInput')).toBe(true)
    expect(pinWarningForCapability(adc2, 'analogInput')).toMatch(/ADC2 shares hardware with Wi-Fi/)
    expect(pinWarningForCapability(adc2, 'digitalOutput')).toBeUndefined()
  })

  it('models the 30-pin ESP-32D DevKit header, which omits GPIO0', () => {
    const classic = boardGpioInfo('esp32:esp32:esp32')!
    const devkit = boardGpioInfo('esp32:esp32:esp32doit-devkit-v1')!
    // Same classic ESP32 silicon minus the one pad the 30-pin header doesn't carry.
    expect(devkit.recommended.map((pin) => pin.pin))
      .toEqual(classic.recommended.map((pin) => pin.pin).filter((pin) => pin !== 0))
    expect(devkit.caution.find((pin) => pin.pin === 0)?.note).toMatch(/BOOT button only/)
    // Header-specific wording: the on-board LED and UART2 are known on this board.
    expect(devkit.recommended.find((pin) => pin.pin === 2)?.warning).toMatch(/on-board blue LED/)
    expect(devkit.recommended.find((pin) => pin.pin === 16)?.note).toMatch(/UART2 RX/)
  })

  it('uses each core variant’s declared analog pin aliases', () => {
    const featherM4 = boardGpioInfo('adafruit:samd:adafruit_feather_m4')!
    expect(featherM4.recommended.filter((pin) => pinSupports(pin, 'analogInput')).map((pin) => pin.pin))
      .toEqual([14, 15, 16, 17, 18, 19])
  })

  it('keeps legacy custom-board recommendations permissive', () => {
    const legacyPin: PinNote = { pin: 12, note: 'Saved before capability metadata' }
    expect(pinSupports(legacyPin, 'analogInput')).toBe(true)
    expect(pinSupports(legacyPin, 'digitalOutput')).toBe(true)
  })
})

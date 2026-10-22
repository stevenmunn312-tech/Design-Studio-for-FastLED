import { describe, expect, it } from 'vitest'
import { boardHasDacOutput } from '../boardDacOutput'

describe('boardHasDacOutput', () => {
  it.each([
    'esp32:esp32:esp32',
    'esp32:esp32:esp32:PSRAM=enabled',
    'esp32:esp32:nodemcu-32s',
    'esp32:esp32:lolin_s2_mini',
    'esp32:esp32:adafruit_feather_esp32s2',
    'arduino:renesas_uno:minima',
    'arduino:samd:nano_33_iot',
    'adafruit:samd:adafruit_feather_m4',
    'teensy:avr:teensy36',
    'STMicroelectronics:stm32:nucleo_f429zi',
  ])('recognizes hardware DAC output on %s', (fqbn) => {
    expect(boardHasDacOutput(fqbn)).toBe(true)
  })

  it.each([
    '', 'esp32:esp32:esp32s3', 'esp32:esp32:esp32s3:PSRAM=opi',
    'esp32:esp32:esp32c3', 'esp32:esp32:nano_nora',
    'esp32:esp32:lolin_s3', 'arduino:avr:uno', 'teensy:avr:teensy41',
    'rp2040:rp2040:rpipico', 'unknown:unknown:unknown',
  ])('does not mistake PWM, ADC or an unknown target for a DAC on %s', (fqbn) => {
    expect(boardHasDacOutput(fqbn)).toBe(false)
  })
})

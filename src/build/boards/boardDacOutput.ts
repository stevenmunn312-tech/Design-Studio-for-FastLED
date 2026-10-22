/** Hardware DAC output capability, independent of Studio's audio decoder.
 * Do not infer this from ADC inputs or PWM support. Keep targets explicit:
 * newer members of a board family may remove the DAC (for example Teensy 4).
 *
 * Sources:
 * https://docs.espressif.com/projects/arduino-esp32/en/latest/api/dac.html
 * https://support.arduino.cc/hc/en-us/articles/9350537961500
 * https://docs.arduino.cc/tutorials/uno-r4-minima/dac/
 * https://learn.adafruit.com/adafruit-grand-central/circuitpython-analog-out
 * https://www.pjrc.com/teensy/teensyLC.html
 * https://www.pjrc.com/store/
 * https://www.pjrc.com/store/teensy35.html
 * https://learn.adafruit.com/adafruit-qt-py?view=all
 * https://www.st.com/en/microcontrollers-microprocessors/stm32f429zi.html
 * https://www.st.com/resource/en/datasheet/stm32f439zi.pdf
 */
const DAC_OUTPUT_TARGETS = new Set([
  'esp32:esp32:esp32',
  'esp32:esp32:esp32doit-devkit-v1',
  'esp32:esp32:esp32wrover',
  'esp32:esp32:nodemcu-32s',
  'esp32:esp32:adafruit_feather_esp32_v2',
  'esp32:esp32:wt32-eth01',
  'esp32:esp32:esp32s2',
  'esp32:esp32:lolin_s2_mini',
  'esp32:esp32:adafruit_feather_esp32s2',
  'esp32:esp32:adafruit_qtpy_esp32s2',
  'arduino:samd:arduino_zero_native',
  'arduino:samd:arduino_zero_edbg',
  'arduino:samd:nano_33_iot',
  'arduino:sam:arduino_due_x',
  'arduino:sam:arduino_due_x_dbg',
  'arduino:renesas_uno:minima',
  'arduino:renesas_uno:unor4wifi',
  'adafruit:samd:adafruit_feather_m0',
  'adafruit:samd:adafruit_feather_m4',
  'adafruit:samd:adafruit_grandcentral_m4',
  'adafruit:samd:adafruit_qtpy_m0',
  'teensy:avr:teensy31',
  'teensy:avr:teensy35',
  'teensy:avr:teensy36',
  'teensy:avr:teensyLC',
  'STMicroelectronics:stm32:nucleo_f429zi',
  'STMicroelectronics:stm32:nucleo_f439zi',
])

export function boardHasDacOutput(fqbn: string): boolean {
  // Board options do not change whether the hardware contains a DAC.
  return DAC_OUTPUT_TARGETS.has(fqbn.split(':').slice(0, 3).join(':'))
}

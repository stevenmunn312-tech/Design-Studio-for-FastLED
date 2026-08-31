/** Arduino `Wire` defaults for every physical board profile in the catalogue.
 *
 * `arduinoPin` is the number used by sketches and collision checks. Some cores
 * expose a duplicate Arduino alias for a pad (Nano Every), while some imported
 * physical maps only know the pad's silkscreen name (SAMD, nRF52 and STM32).
 * `physicalLabels` bridges those cases without pretending the two namespaces
 * are always identical.
 */
export interface BoardI2cPinDefault {
  arduinoPin: number
  physicalLabels?: readonly string[]
  displayLabel?: string
}

export interface BoardI2cDefault {
  sda: BoardI2cPinDefault
  scl: BoardI2cPinDefault
}

const pins = (
  sda: number,
  scl: number,
  options: {
    sdaLabels?: readonly string[]
    sclLabels?: readonly string[]
    sdaDisplay?: string
    sclDisplay?: string
  } = {},
): BoardI2cDefault => ({
  sda: { arduinoPin: sda, physicalLabels: options.sdaLabels, displayLabel: options.sdaDisplay },
  scl: { arduinoPin: scl, physicalLabels: options.sclLabels, displayLabel: options.sclDisplay },
})

/** Reviewed against the board packages' Arduino variant definitions. Keep this
 * exhaustive: boardI2cDefaults.test.ts deliberately fails when a board profile
 * is added without its default bus being reviewed. */
export const BOARD_I2C_DEFAULTS: Readonly<Record<string, BoardI2cDefault>> = {
  'generic-esp32-s3-n16r8-44pin-dual-usbc': pins(8, 9),
  'espressif-esp32-s3-devkitc-1': pins(8, 9),
  'esp32-generic-devkit-38pin': pins(21, 22),
  'esp32-devkit-v1-30pin-esp32d': pins(21, 22),
  'esp32-2432s028r': pins(21, 22),
  'lolin-s3-40pin-dual-usbc': pins(42, 41),
  'seeed-xiao-esp32s3': pins(5, 6),
  'adafruit-feather-esp32-s2': pins(3, 4),
  'adafruit-feather-esp32-s3': pins(3, 4),
  'adafruit-feather-esp32-v2': pins(22, 20),
  'adafruit-feather-m0-express': pins(20, 21, { sdaLabels: ['SDA'], sclLabels: ['SCL'] }),
  'adafruit-feather-m4-express': pins(21, 22, { sdaLabels: ['SDA'], sclLabels: ['SCL'] }),
  'adafruit-feather-nrf52840-express': pins(22, 23, { sdaLabels: ['SDA'], sclLabels: ['SCL'] }),
  'adafruit-grand-central-m4': pins(20, 21),
  'adafruit-matrixportal-m4': pins(5, 6, { sdaDisplay: 'SDA / STEMMA QT', sclDisplay: 'SCL / STEMMA QT' }),
  'adafruit-qt-py-esp32-s2': pins(7, 6),
  'adafruit-qt-py-m0': pins(4, 5, { sdaLabels: ['SDA'], sclLabels: ['SCL'] }),
  'arduino-due': pins(20, 21),
  'arduino-leonardo': pins(2, 3),
  'arduino-mega-2560-rev3': pins(20, 21),
  'arduino-micro': pins(2, 3),
  'arduino-nano-33-ble': pins(18, 19, { sdaLabels: ['A4/SDA', 'A4 / SDA'], sclLabels: ['A5/SCL', 'A5 / SCL'] }),
  'arduino-nano-33-iot': pins(18, 19),
  'arduino-nano-classic': pins(18, 19),
  'arduino-nano-every': pins(22, 23, { sdaLabels: ['A4/SDA', 'A4 / SDA'], sclLabels: ['A5/SCL', 'A5 / SCL'] }),
  'arduino-nano-rp2040-connect': pins(18, 19, { sdaLabels: ['A4/SDA', 'A4 / SDA'], sclLabels: ['A5/SCL', 'A5 / SCL'] }),
  'arduino-uno-r3-dip': pins(18, 19),
  'arduino-uno-r3-smd': pins(18, 19),
  'arduino-uno-r4-minima': pins(18, 19, { sdaLabels: ['SDA'], sclLabels: ['SCL'] }),
  'arduino-uno-r4-wifi': pins(18, 19),
  'arduino-zero': pins(20, 21, { sdaLabels: ['SDA'], sclLabels: ['SCL'] }),
  'esp32-c3-devkitm-1': pins(8, 9),
  'esp32-c3-super-mini': pins(8, 9),
  'esp32-c6-devkitc-1': pins(23, 22),
  'esp32-c6-devkitm-1': pins(23, 22),
  'esp32-c6-super-mini': pins(23, 22),
  'esp32-h2-devkitm-1': pins(12, 22),
  'esp32-h2-super-mini': pins(12, 22),
  'esp8266-adafruit-feather-huzzah': pins(4, 5),
  'esp8266-lolin-d1-mini': pins(4, 5),
  'esp8266-nodemcu-v2-amica': pins(4, 5),
  'esp8266-wemos-d1-r2': pins(4, 5),
  'espressif-esp32-devkitc-v4-38pin': pins(21, 22),
  'espressif-esp32-s2-devkitc-1': pins(8, 9),
  'lolin-c3-mini': pins(8, 10),
  'lolin-s2-mini': pins(33, 35),
  'nordic-nrf52840-dk': pins(26, 27, { sdaLabels: ['P0.26'], sclLabels: ['P0.27'] }),
  'raspberry-pi-pico': pins(4, 5),
  'raspberry-pi-pico-2': pins(4, 5),
  'raspberry-pi-pico-2-w': pins(4, 5),
  'raspberry-pi-pico-w': pins(4, 5),
  'seeed-xiao-esp32c3': pins(6, 7),
  'seeed-xiao-esp32c6': pins(22, 23),
  'seeed-xiao-nrf52840': pins(4, 5),
  'sparkfun-pro-micro-5v': pins(2, 3),
  'stm32-blue-pill-f103c8': pins(23, 22, { sdaLabels: ['B7', 'PB7'], sclLabels: ['B6', 'PB6'], sdaDisplay: 'PB7', sclDisplay: 'PB6' }),
  'stm32-nucleo-f429zi': pins(14, 15, { sdaLabels: ['D14'], sclLabels: ['D15'] }),
  'stm32-nucleo-f439zi': pins(14, 15, { sdaLabels: ['D14'], sclLabels: ['D15'] }),
  'teensy-3-2': pins(18, 19),
  'teensy-3-6': pins(18, 19),
  'teensy-4-0': pins(18, 19),
  'teensy-4-1': pins(18, 19),
  'teensy-lc': pins(18, 19),
  'weact-black-pill-f411ce': pins(23, 22, { sdaLabels: ['B7', 'PB7'], sclLabels: ['B6', 'PB6'], sdaDisplay: 'PB7', sclDisplay: 'PB6' }),
}

export function boardI2cDefault(profileId: string | undefined): BoardI2cDefault | undefined {
  return profileId ? BOARD_I2C_DEFAULTS[profileId] : undefined
}

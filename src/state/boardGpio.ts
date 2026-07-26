export type GpioCapability = 'digitalInput' | 'digitalOutput' | 'analogInput' | 'pullup'
export const MAX_PIN_NUMBER = 255

export interface PinNote {
  pin: number
  /** Human-facing board label such as A0. Numeric values remain the values
   *  emitted into the generated Arduino sketch. */
  label?: string
  note?: string
  /** A caveat worth surfacing in graph validation (ADC2/Wi-Fi, boot straps). */
  warning?: string
  capabilities?: readonly GpioCapability[]
}

export interface BoardGpio {
  /** Usable Arduino pin numbers. The picker filters this list by the
   *  capability required by the property being edited. */
  recommended: PinNote[]
  /** Known board/core pin numbers which must not be used for general GPIO
   *  (integrated flash, USB, debug, or other on-board wiring). */
  caution: PinNote[]
  /** Highest numeric Arduino alias. Optional for legacy custom-board tables. */
  maxPin?: number
}

const DIGITAL: readonly GpioCapability[] = ['digitalInput', 'digitalOutput', 'pullup']
const ANALOG_ONLY: readonly GpioCapability[] = ['analogInput']

const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)

interface BoardPinsOptions {
  digital: readonly number[]
  analog?: readonly number[]
  analogOnly?: readonly number[]
  inputOnly?: readonly number[]
  noPullup?: readonly number[]
  labels?: Readonly<Record<number, string>>
  notes?: Readonly<Record<number, string>>
  warnings?: Readonly<Record<number, string>>
  unavailable?: Readonly<Record<number, string>>
}

function boardPins({
  digital,
  analog = [],
  analogOnly = [],
  inputOnly = [],
  noPullup = [],
  labels = {},
  notes = {},
  warnings = {},
  unavailable = {},
}: BoardPinsOptions): BoardGpio {
  const analogSet = new Set(analog)
  const analogOnlySet = new Set(analogOnly)
  const inputOnlySet = new Set(inputOnly)
  const noPullupSet = new Set(noPullup)
  const usable = [...new Set([...digital, ...analogOnly])].sort((a, b) => a - b)
  const recommended = usable.map((pin): PinNote => {
    let capabilities: readonly GpioCapability[]
    if (analogOnlySet.has(pin)) {
      capabilities = ANALOG_ONLY
    } else if (inputOnlySet.has(pin)) {
      capabilities = [
        'digitalInput',
        ...(analogSet.has(pin) ? ['analogInput' as const] : []),
        ...(!noPullupSet.has(pin) ? ['pullup' as const] : []),
      ]
    } else {
      capabilities = [
        ...DIGITAL,
        ...(analogSet.has(pin) ? ['analogInput' as const] : []),
      ].filter((capability) => capability !== 'pullup' || !noPullupSet.has(pin))
    }
    return {
      pin,
      label: labels[pin],
      note: notes[pin],
      warning: warnings[pin],
      capabilities,
    }
  })
  const caution = Object.entries(unavailable)
    .map(([pin, note]): PinNote => ({ pin: Number(pin), note, capabilities: [] }))
    .sort((a, b) => a.pin - b.pin)
  const maxPin = Math.max(0, ...recommended.map((pin) => pin.pin), ...caution.map((pin) => pin.pin))
  return { recommended, caution, maxPin }
}

function analogLabels(pins: readonly number[], start = 0): Record<number, string> {
  return Object.fromEntries(pins.map((pin, index) => [pin, `A${index + start}`]))
}

const ADC2_WIFI = 'ADC2 shares hardware with Wi-Fi — analogRead may fail while Wi-Fi is active'

const ESP32_S3_ANALOG = range(1, 20)
const ESP32_S3_GPIO = boardPins({
  digital: [...range(0, 21), ...range(33, 48)],
  analog: ESP32_S3_ANALOG,
  inputOnly: [46],
  noPullup: [46],
  notes: {
    19: 'Native USB D− on boards using USB-OTG',
    20: 'Native USB D+ on boards using USB-OTG',
    39: 'Common I2S WS default',
    40: 'Common I2S SCK default',
    41: 'Common I2S SD default',
    43: 'Default UART0 TX',
    44: 'Default UART0 RX',
    46: 'Input-only; no internal pull resistor',
  },
  warnings: {
    0: 'Boot-strapping pin — must be high at boot',
    3: 'Strapping pin — check the required boot level',
    ...Object.fromEntries(range(11, 20).map((pin) => [pin, ADC2_WIFI])),
    ...Object.fromEntries(range(33, 37).map((pin) => [pin, 'Often connected to octal flash/PSRAM — check your module'])),
    45: 'Strapping pin — check the required boot level',
    46: 'Strapping pin and input-only',
  },
  unavailable: {
    ...Object.fromEntries(range(22, 25).map((pin) => [pin, 'Not present as general GPIO on ESP32-S3'])),
    ...Object.fromEntries(range(26, 32).map((pin) => [pin, 'Connected to integrated flash/PSRAM on common modules'])),
  },
})

const ESP32_GPIO = boardPins({
  digital: [0, 1, 2, 3, 4, 5, ...range(12, 19), 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39],
  analog: [0, 2, 4, ...range(12, 15), 25, 26, 27, ...range(32, 39)],
  inputOnly: [34, 35, 36, 39],
  noPullup: [34, 35, 36, 39],
  notes: {
    1: 'Default UART0 TX',
    3: 'Default UART0 RX',
    34: 'Input-only; no internal pull resistor',
    35: 'Input-only; no internal pull resistor',
    36: 'Input-only; no internal pull resistor',
    39: 'Input-only; no internal pull resistor',
  },
  warnings: {
    ...Object.fromEntries([0, 2, 4, ...range(12, 15), 25, 26, 27].map((pin) => [pin, ADC2_WIFI])),
    0: `Boot-strapping pin — must be high at boot. ${ADC2_WIFI}`,
    2: `Strapping pin; often tied to the onboard LED. ${ADC2_WIFI}`,
    12: `Strapping pin sets flash voltage — usually must be low at boot. ${ADC2_WIFI}`,
    15: `Strapping pin — check the required boot level. ${ADC2_WIFI}`,
  },
  unavailable: Object.fromEntries([
    ...range(6, 11).map((pin) => [pin, 'Connected to integrated SPI flash — not usable']),
    ...[20, 24, 28, 29, 30, 31, 37, 38].map((pin) => [pin, 'Not broken out on most ESP32 modules']),
  ]),
})

const ESP32_S2_GPIO = boardPins({
  digital: [...range(0, 21), ...range(33, 46)],
  analog: range(1, 20),
  inputOnly: [46],
  noPullup: [46],
  notes: { 46: 'Input-only; no internal pull resistor' },
  warnings: {
    0: 'Boot-strapping pin — check the required boot level',
    ...Object.fromEntries(range(11, 20).map((pin) => [pin, ADC2_WIFI])),
    ...Object.fromEntries(range(39, 42).map((pin) => [pin, 'Default JTAG pin — avoid when hardware debugging'])),
    45: 'Strapping pin — check the required boot level',
    46: 'Strapping pin and input-only',
  },
  unavailable: Object.fromEntries(range(22, 32).map((pin) => [
    pin,
    pin >= 26 ? 'Connected to integrated flash/PSRAM on common modules' : 'Not present on ESP32-S2',
  ])),
})

const ESP32_C3_GPIO = boardPins({
  digital: [...range(0, 11), ...range(18, 21)],
  analog: range(0, 5),
  warnings: {
    2: 'Strapping pin — check the required boot level',
    5: ADC2_WIFI,
    8: 'Strapping pin — check the required boot level',
    9: 'Boot-strapping pin — check the required boot level',
  },
  notes: {
    18: 'Native USB D− on boards using USB-JTAG',
    19: 'Native USB D+ on boards using USB-JTAG',
  },
  unavailable: Object.fromEntries(range(12, 17).map((pin) => [pin, 'Connected to integrated SPI flash on common modules'])),
})

const ESP32_C6_GPIO = boardPins({
  digital: range(0, 23),
  analog: range(0, 6),
  warnings: {
    4: 'Strapping pin — check the required boot level',
    5: 'Strapping pin — check the required boot level',
    8: 'Strapping pin — check the required boot level',
    9: 'Boot-strapping pin — check the required boot level',
    15: 'Strapping pin — check the required boot level',
  },
  notes: { 12: 'Native USB D−', 13: 'Native USB D+' },
  unavailable: Object.fromEntries(range(24, 30).map((pin) => [pin, 'Connected to integrated SPI flash on common modules'])),
})

const ESP32_H2_GPIO = boardPins({
  digital: [...range(0, 14), ...range(22, 27)],
  analog: range(1, 5),
  warnings: {
    2: 'Strapping pin — check the required boot level',
    3: 'Strapping pin — check the required boot level',
    8: 'Strapping pin — check the required boot level',
    9: 'Boot-strapping pin — check the required boot level',
    25: 'Strapping pin — check the required boot level',
  },
  notes: { 26: 'USB-JTAG D−', 27: 'USB-JTAG D+' },
  unavailable: Object.fromEntries(range(15, 21).map((pin) => [pin, 'Connected to integrated SPI flash on common modules'])),
})

const ESP8266_GPIO = boardPins({
  digital: [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16],
  analogOnly: [17],
  labels: { 17: 'A0' },
  notes: { 16: 'D0 — no interrupt/PWM support', 17: 'A0 — analog input only' },
  warnings: {
    0: 'Boot-strapping pin (D3) — must be high at boot',
    2: 'Boot-strapping pin (D4) — must be high at boot',
    15: 'Boot-strapping pin (D8) — must be low at boot',
  },
  unavailable: Object.fromEntries(range(6, 11).map((pin) => [pin, 'Connected to integrated SPI flash — not usable'])),
})

const UNO_GPIO = boardPins({
  digital: range(0, 19),
  analog: range(14, 19),
  labels: analogLabels(range(14, 19)),
})
const NANO_GPIO = boardPins({
  digital: range(0, 19),
  analog: range(14, 19),
  analogOnly: [20, 21],
  labels: analogLabels(range(14, 21)),
  notes: { 20: 'A6 — analog input only', 21: 'A7 — analog input only' },
})
const LEONARDO_ANALOG = range(18, 29)
const LEONARDO_GPIO = boardPins({
  digital: range(0, 29),
  analog: LEONARDO_ANALOG,
  labels: analogLabels(LEONARDO_ANALOG),
  notes: {
    24: 'A6 alias of D4',
    25: 'A7 alias of D6',
    26: 'A8 alias of D8',
    27: 'A9 alias of D9',
    28: 'A10 alias of D10',
    29: 'A11 alias of D12',
  },
  unavailable: { 30: 'TX LED pin — not exposed as a normal header pin' },
})
const MEGA_GPIO = boardPins({
  digital: range(0, 69),
  analog: range(54, 69),
  labels: analogLabels(range(54, 69)),
})
const NANO_EVERY_GPIO = boardPins({
  digital: range(0, 21),
  analog: range(14, 21),
  labels: analogLabels(range(14, 21)),
})

const TEENSY_41_ANALOG = [...range(14, 27), ...range(38, 41)]
const TEENSY_40_ANALOG = range(14, 27)
const TEENSY_36_ANALOG = [...range(14, 23), ...range(31, 39), 49, 50, 64, 65]
const TEENSY_32_ANALOG = [...range(14, 23), ...range(26, 31), ...range(34, 37), 40]
const TEENSY_30_ANALOG = [...range(14, 23), ...range(34, 37)]
const TEENSY_LC_ANALOG = range(14, 26)
const teensy = (lastDigital: number, analog: readonly number[]) => boardPins({
  digital: range(0, lastDigital),
  analog: analog.filter((pin) => pin <= lastDigital),
  analogOnly: analog.filter((pin) => pin > lastDigital),
  labels: analogLabels(analog),
})

const PICO_GPIO = boardPins({
  digital: [...range(0, 22), ...range(26, 28)],
  analog: range(26, 28),
  labels: analogLabels(range(26, 28)),
  unavailable: {
    23: 'Used internally for the on-board power supply',
    24: 'Used internally for VBUS sensing',
    25: 'Connected to the on-board LED, not exposed on the headers',
    29: 'ADC3 is used for VSYS monitoring and is not exposed on the headers',
  },
})

const NANO_33_IOT_GPIO = boardPins({
  digital: range(0, 21),
  analog: range(14, 21),
  labels: analogLabels(range(14, 21)),
  unavailable: Object.fromEntries(range(22, 30).map((pin) => [pin, 'Wired internally to the NINA Wi-Fi module'])),
})
const DUE_GPIO = boardPins({
  digital: range(0, 65),
  analog: range(54, 65),
  labels: analogLabels(range(54, 65)),
  unavailable: { 66: 'DAC0 analog output — not a general digital pin', 67: 'DAC1 analog output — not a general digital pin' },
})
const ZERO_GPIO = boardPins({
  digital: range(0, 24),
  analog: range(14, 19),
  labels: analogLabels(range(14, 19)),
  unavailable: {
    25: 'RX LED connection',
    26: 'TX LED connection',
    27: 'USB host-enable connection',
    28: 'Native USB D−',
    29: 'Native USB D+',
    30: 'EDBG serial TX connection',
    31: 'EDBG serial RX connection',
  },
})

const FEATHER_M0_GPIO = boardPins({
  digital: range(0, 24),
  analog: range(14, 19),
  analogOnly: [44, 45],
  labels: { ...analogLabels(range(14, 19)), 44: 'A6', 45: 'A7' },
  unavailable: {
    25: 'RX LED connection',
    26: 'TX LED connection',
    27: 'USB host-enable connection',
    28: 'Native USB D−',
    29: 'Native USB D+',
  },
})
const QTPY_M0_ANALOG = [0, 1, 2, 3, 6, 7, 8, 9, 10]
const QTPY_M0_GPIO = boardPins({
  digital: range(0, 10),
  analog: QTPY_M0_ANALOG,
  labels: analogLabels(QTPY_M0_ANALOG),
  unavailable: {
    11: 'Connected to the on-board NeoPixel',
    14: 'Connected to integrated SPI flash',
    15: 'Connected to integrated SPI flash',
    16: 'Connected to integrated SPI flash',
    17: 'Connected to integrated SPI flash',
    18: 'USB host-enable connection',
    19: 'Native USB D−',
    20: 'Native USB D+',
  },
})
const FEATHER_M4_GPIO = boardPins({
  digital: range(0, 25).filter((pin) => pin !== 8),
  analog: range(14, 19),
  labels: analogLabels(range(14, 19)),
  unavailable: {
    8: 'Connected to the on-board NeoPixel',
    28: 'USB host-enable connection',
    29: 'Native USB D−',
    30: 'Native USB D+',
    ...Object.fromEntries(range(34, 39).map((pin) => [pin, 'Connected to integrated QSPI flash'])),
  },
})
const GRAND_CENTRAL_ANALOG = [...range(67, 74), ...range(54, 61), 12, 13, 9]
const GRAND_CENTRAL_GPIO = boardPins({
  digital: range(0, 74),
  analog: GRAND_CENTRAL_ANALOG,
  labels: analogLabels(GRAND_CENTRAL_ANALOG),
})
const MATRIX_PORTAL_GPIO = boardPins({
  digital: [...range(0, 26), 34, 35, 36, 48, 49, 50],
  analog: range(22, 26),
  labels: analogLabels(range(22, 26)),
  notes: Object.fromEntries(range(7, 21).map((pin) => [pin, 'Wired to the HUB75 matrix connector'])),
  unavailable: {
    27: 'Wired to the on-board ESP32 Wi-Fi coprocessor',
    28: 'Wired to the on-board ESP32 Wi-Fi coprocessor',
    29: 'Wired to the on-board ESP32 Wi-Fi coprocessor',
    30: 'Wired to the on-board ESP32 Wi-Fi coprocessor',
    31: 'Wired to the on-board ESP32 Wi-Fi coprocessor',
    33: 'Wi-Fi coprocessor chip select',
    ...Object.fromEntries(range(41, 46).map((pin) => [pin, 'Connected to integrated QSPI flash'])),
  },
})

const BLUE_PILL_GPIO = boardPins({
  digital: range(0, 32),
  analog: range(20, 29),
  labels: analogLabels(range(20, 29)),
  notes: { 8: 'Native USB D+', 9: 'Native USB D−', 17: 'On-board LED (PC13)' },
  warnings: { 32: 'BOOT1 pin — check the required boot level' },
  unavailable: { 33: 'SWDIO debug pin', 34: 'SWCLK debug pin' },
})
const BLACK_PILL_GPIO = boardPins({
  digital: range(0, 33),
  analog: [...range(0, 7), 16, 17],
  labels: analogLabels([...range(0, 7), 16, 17]),
  notes: { 11: 'Native USB D−', 12: 'Native USB D+', 31: 'On-board LED (PC13)' },
  unavailable: { 34: 'External oscillator pin', 35: 'External oscillator pin' },
})
const NUCLEO_ANALOG = [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 11, 12, 13, 24, 32, 61, 62, 63, 33, 88, 89, 97, 98, 99]
const NUCLEO_F4X9_GPIO = boardPins({
  digital: range(0, 116).filter((pin) => pin !== 72),
  analog: NUCLEO_ANALOG,
  labels: analogLabels(NUCLEO_ANALOG),
  notes: {
    56: 'Alias of pin 31 (PE2)',
    71: 'Alias of pin 11 (PA7)',
  },
  unavailable: { 72: 'Not connected on the Nucleo F4x9ZI variant' },
})
const UNO_R4_GPIO = boardPins({
  digital: range(0, 19),
  analog: range(14, 19),
  labels: analogLabels(range(14, 19)),
})
const NRF52840_GPIO = boardPins({
  digital: range(0, 47).filter((pin) => ![17, 19, 20, 21, 22, 23].includes(pin)),
  analog: [3, 4, 28, 29, 30, 31],
  labels: analogLabels([3, 4, 28, 29, 30, 31]),
  notes: { 9: 'NFC1 pin when NFC is enabled', 10: 'NFC2 pin when NFC is enabled' },
  unavailable: {
    17: 'Connected to integrated QSPI flash chip select',
    19: 'Connected to integrated QSPI flash clock',
    20: 'Connected to integrated QSPI flash IO0',
    21: 'Connected to integrated QSPI flash IO1',
    22: 'Connected to integrated QSPI flash IO2',
    23: 'Connected to integrated QSPI flash IO3',
  },
})

/** Complete capability catalogue for every built-in board. Custom boards are
 * intentionally absent and retain a conservative numeric fallback. */
export const BOARD_GPIO_BY_FQBN: Readonly<Record<string, BoardGpio>> = {
  'esp32:esp32:esp32s3': ESP32_S3_GPIO,
  'esp32:esp32:esp32': ESP32_GPIO,
  'esp32:esp32:esp32s2': ESP32_S2_GPIO,
  'esp32:esp32:esp32c3': ESP32_C3_GPIO,
  'esp32:esp32:esp32c6': ESP32_C6_GPIO,
  'esp32:esp32:esp32h2': ESP32_H2_GPIO,
  'esp8266:esp8266:nodemcuv2': ESP8266_GPIO,
  'arduino:avr:uno': UNO_GPIO,
  'arduino:avr:nano': NANO_GPIO,
  'arduino:avr:leonardo': LEONARDO_GPIO,
  'arduino:avr:mega': MEGA_GPIO,
  'arduino:megaavr:nona4809': NANO_EVERY_GPIO,
  'teensy:avr:teensy41': teensy(54, TEENSY_41_ANALOG),
  'teensy:avr:teensy40': teensy(39, TEENSY_40_ANALOG),
  'teensy:avr:teensy36': teensy(63, TEENSY_36_ANALOG),
  'teensy:avr:teensy35': teensy(63, TEENSY_36_ANALOG),
  'teensy:avr:teensy31': teensy(33, TEENSY_32_ANALOG),
  'teensy:avr:teensy30': teensy(33, TEENSY_30_ANALOG),
  'teensy:avr:teensyLC': teensy(26, TEENSY_LC_ANALOG),
  'rp2040:rp2040:rpipico': PICO_GPIO,
  'rp2040:rp2040:rpipico2': PICO_GPIO,
  'arduino:samd:nano_33_iot': NANO_33_IOT_GPIO,
  'arduino:sam:arduino_due_x': DUE_GPIO,
  'arduino:samd:arduino_zero_native': ZERO_GPIO,
  'adafruit:samd:adafruit_feather_m0': FEATHER_M0_GPIO,
  'adafruit:samd:adafruit_qtpy_m0': QTPY_M0_GPIO,
  'adafruit:samd:adafruit_feather_m4': FEATHER_M4_GPIO,
  'adafruit:samd:adafruit_grandcentral_m4': GRAND_CENTRAL_GPIO,
  'adafruit:samd:adafruit_matrixportal_m4': MATRIX_PORTAL_GPIO,
  'STMicroelectronics:stm32:bluepill_f103c8': BLUE_PILL_GPIO,
  'STMicroelectronics:stm32:blackpill_f411ce': BLACK_PILL_GPIO,
  'STMicroelectronics:stm32:nucleo_f429zi': NUCLEO_F4X9_GPIO,
  'STMicroelectronics:stm32:nucleo_f439zi': NUCLEO_F4X9_GPIO,
  'arduino:renesas_uno:unor4wifi': UNO_R4_GPIO,
  'adafruit:nrf52:pca10056': NRF52840_GPIO,
}

export function pinSupports(pin: PinNote, capability: GpioCapability): boolean {
  // Custom-board tables saved before capability modeling only contained a
  // curated recommended list. Preserve that list's former permissive behavior.
  return pin.capabilities?.includes(capability) ?? true
}

export function pinDisplayLabel(pin: PinNote): string {
  return pin.label ? `${pin.label} (${pin.pin})` : `Pin ${pin.pin}`
}

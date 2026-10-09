import type { BuildTargetFamily } from '../buildProfile'
import { targetFamilyFromFqbn } from '../buildProfile'
import { BOARD_CAPABILITY_DATA, GENERATED_BOARD_PROFILES } from '../generated/boardCapabilityData'
import { boardI2cDefault } from './boardI2cDefaults'
import { boardPinSafetyOverride } from './boardPinSafetyOverrides'
import { CLASSIC_ESP32_RAM_BUDGET_BYTES, ESP32_S3_RAM_BUDGET_BYTES } from '../ramBudgets'
import { CUSTOM_BOARD_PROFILE_ID, type CustomBoardDefinition, type CustomBoardIssue } from './customBoard'
import type { BoardGpio } from './boardGpio'
import type { BoardI2cDefault } from './boardI2cDefaults'
import { resolveCustomBoard } from './customBoardProfile'
import type {
  BoardCapabilityData,
  BoardPeripheralPins,
  BoardPinSafety,
  BoardRenderAsset,
} from './boardCapabilities'

// Re-exported so consumers keep importing board types from this one module.
export type { BoardCapabilityData, BoardPeripheralPins, BoardPinSafety, BoardRenderAsset }

export type BoardProfileConfidence = 'manufacturer-verified' | 'pinout-verified' | 'visual-match-only' | 'user-defined'
export type BoardPinRole = 'gpio' | 'power-in' | 'power-out' | 'ground' | 'usb' | 'analog' | 'reserved'
export type BoardPinLabelAlign = 'left' | 'right' | 'top' | 'bottom'
export type BoardPinAvailability = 'available' | 'unavailable'

export interface PhysicalBoardPinAnchor {
  id: string
  x: number
  y: number
  labelAlign: BoardPinLabelAlign
}

export interface PhysicalBoardPinProfile {
  id: string
  label: string
  role: BoardPinRole
  anchorId: string
  availability?: BoardPinAvailability
  gpio?: number
  note?: string
  /** A power input's rated range, where it is not a 5 V pin. The power plan
   *  feeds a controller converter only into an input whose range admits it. */
  inputVoltage?: { min: number; max: number }
}

/**
 * Wired Ethernet built into the board. Art-Net and NTP time sync use it in
 * place of Wi-Fi, as they would an Ethernet module on the bench.
 */
export interface BoardOnboardEthernet {
  /** The PHY, as Arduino-ESP32's `eth_phy_type_t` names it. */
  phy: 'ETH_PHY_LAN8720'
  phyAddress: number
  mdcPin: number
  mdioPin: number
  /** Powers the PHY or its clock oscillator. */
  powerPin: number
  /** Arduino-ESP32's `eth_clock_mode_t`: where the 50 MHz RMII clock comes from. */
  clockMode: 'ETH_CLOCK_GPIO0_IN'
}

export interface PhysicalBoardProfile {
  id: string
  label: string
  manufacturer: string
  model: string
  revision: string
  targetFamilies: BuildTargetFamily[]
  compatibleFqbns: string[]
  dimensionsMm: { width: number; height: number }
  confidence: BoardProfileConfidence
  /** Module silkscreen drawn on the schematic board graphic. Defaults to
   *  `model`, which is only right when the model name *is* the module name. */
  moduleSilk?: string
  previewSvg: string
  notes: string[]
  caveats: string[]
  sourceSummary: string
  pinAnchors?: PhysicalBoardPinAnchor[]
  pins?: PhysicalBoardPinProfile[]
  /** False for a board with no USB connector: its power-in pin is the only
   *  way to power it, and it is flashed through a USB-to-serial adapter. */
  hasUsb?: boolean
  onboardEthernet?: BoardOnboardEthernet
  processor?: string
  memory?: { flashMb: number; psramMb: number }
  /** Graph-owned internal-RAM allowance after board/core runtime overhead. */
  internalRamBudgetBytes?: number
  /** PSRAM interface positively identified for this exact physical board.
   *  Presence makes the Board node's automatic PSRAM policy safe to enable;
   *  memory capacity alone is not enough because the build must select the
   *  module's actual QSPI/OPI bus mode. */
  psramMode?: 'opi' | 'qspi'
  pinSafety?: BoardPinSafety
  /** Prose safety commentary from the imported manifest. Displayed, never parsed. */
  safetyNotes?: string[]
  peripheralPins?: BoardPeripheralPins
  /** Present once the board has been imported from the Blender asset set;
   *  absent while the profile is still on the generated `previewSvg` placeholder. */
  render?: BoardRenderAsset
  /** Effective project profile only; never inserted into the stock catalogue.
   * An empty GPIO table is explicit exposure, not missing stock pin advice. */
  custom?: {
    definition: CustomBoardDefinition
    /** The stock template whose build settings this board inherits. */
    referenceLabel: string
    gpio: BoardGpio
    /** Absent when the requested pair is not on this board's enabled pins. */
    defaultI2c?: BoardI2cDefault
  }
}

export type BoardPinStanding = 'safe' | 'caution' | 'reserved' | 'unknown'

export interface BoardPinVerdict {
  standing: BoardPinStanding
  /** Why it is not plainly safe. Absent for `safe`, and for `unknown`, where
   *  the honest answer is that this profile carries no safety data yet. */
  reason?: string
}

function boardSvg(label: string, accent: string, portLabel: string, badge: string): string {
  return `
<svg viewBox="0 0 260 148" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="board-surface" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12333a"/>
      <stop offset="100%" stop-color="#0b171d"/>
    </linearGradient>
  </defs>
  <rect x="18" y="18" width="224" height="112" rx="16" fill="url(#board-surface)" stroke="${accent}" stroke-width="3"/>
  <rect x="192" y="42" width="30" height="22" rx="5" fill="#d7e3ea" opacity="0.88"/>
  <rect x="54" y="38" width="54" height="34" rx="8" fill="#0f2731" stroke="${accent}" stroke-width="2" opacity="0.9"/>
  <rect x="118" y="38" width="54" height="34" rx="8" fill="#13222a" stroke="#7ee2cf" stroke-width="2" opacity="0.74"/>
  <rect x="58" y="86" width="110" height="18" rx="8" fill="#0b1115" stroke="#4d6772" stroke-width="2"/>
  <g fill="#b3c6cf">
    <circle cx="40" cy="40" r="3"/><circle cx="40" cy="56" r="3"/><circle cx="40" cy="72" r="3"/><circle cx="40" cy="88" r="3"/><circle cx="40" cy="104" r="3"/>
    <circle cx="220" cy="76" r="3"/><circle cx="220" cy="92" r="3"/><circle cx="220" cy="108" r="3"/>
  </g>
  <text x="32" y="122" fill="#eef6f8" font-size="13" font-family="system-ui, sans-serif">${label}</text>
  <text x="32" y="32" fill="${accent}" font-size="11" font-family="system-ui, sans-serif">${badge}</text>
  <text x="198" y="80" fill="#d8e5ea" font-size="9" font-family="system-ui, sans-serif">${portLabel}</text>
</svg>`.trim()
}

function verticalAnchors(
  prefix: string,
  side: 'left' | 'right',
  labels: readonly string[],
  x: number,
  yStart: number,
  step: number,
): PhysicalBoardPinAnchor[] {
  return labels.map((_, index) => ({
    id: `${prefix}-${index + 1}`,
    x,
    y: yStart + (index * step),
    labelAlign: side,
  }))
}

function pin(
  id: string,
  label: string,
  role: BoardPinRole,
  anchorId: string,
  availability?: BoardPinAvailability,
  gpio?: number,
  note?: string,
): PhysicalBoardPinProfile {
  return { id, label, role, anchorId, availability, gpio, note }
}

const DEVKITC_J1_LABELS = [
  '3V3', '3V3', 'RST', '4', '5', '6', '7', '15', '16', '17', '18',
  '8', '3', '46', '9', '10', '11', '12', '13', '14', '5V', 'G',
] as const

const DEVKITC_J3_LABELS = [
  'G', 'TX', 'RX', '1', '2', '42', '41', '40', '39', '38', '37',
  '36', '35', '0', '45', '48', '47', '21', '20', '19', 'G', 'G',
] as const

const DEVKITC_PIN_ANCHORS = [
  ...verticalAnchors('j1', 'left', DEVKITC_J1_LABELS, 30, 88, 18),
  ...verticalAnchors('j3', 'right', DEVKITC_J3_LABELS, 330, 88, 18),
]

const DEVKITC_PINS: PhysicalBoardPinProfile[] = [
  pin('j1-1', '3V3', 'power-out', 'j1-1'),
  pin('j1-2', '3V3', 'power-out', 'j1-2'),
  pin('j1-3', 'RST', 'reserved', 'j1-3', undefined, undefined, 'Board reset / EN'),
  pin('j1-4', 'GPIO4', 'gpio', 'j1-4', undefined, 4),
  pin('j1-5', 'GPIO5', 'gpio', 'j1-5', undefined, 5),
  pin('j1-6', 'GPIO6', 'gpio', 'j1-6', undefined, 6),
  pin('j1-7', 'GPIO7', 'gpio', 'j1-7', undefined, 7),
  pin('j1-8', 'GPIO15', 'gpio', 'j1-8', undefined, 15),
  pin('j1-9', 'GPIO16', 'gpio', 'j1-9', undefined, 16),
  pin('j1-10', 'GPIO17', 'gpio', 'j1-10', undefined, 17),
  pin('j1-11', 'GPIO18', 'gpio', 'j1-11', undefined, 18),
  pin('j1-12', 'GPIO8', 'gpio', 'j1-12', undefined, 8),
  pin('j1-13', 'GPIO3', 'gpio', 'j1-13', undefined, 3),
  pin('j1-14', 'GPIO46', 'gpio', 'j1-14', undefined, 46, 'Input-only / strapping pin'),
  pin('j1-15', 'GPIO9', 'gpio', 'j1-15', undefined, 9),
  pin('j1-16', 'GPIO10', 'gpio', 'j1-16', undefined, 10),
  pin('j1-17', 'GPIO11', 'gpio', 'j1-17', undefined, 11),
  pin('j1-18', 'GPIO12', 'gpio', 'j1-18', undefined, 12),
  pin('j1-19', 'GPIO13', 'gpio', 'j1-19', undefined, 13),
  pin('j1-20', 'GPIO14', 'gpio', 'j1-20', undefined, 14),
  pin('j1-21', '5V', 'power-in', 'j1-21'),
  pin('j1-22', 'GND', 'ground', 'j1-22'),
  pin('j3-1', 'GND', 'ground', 'j3-1'),
  pin('j3-2', 'U0TXD / GPIO43', 'gpio', 'j3-2', undefined, 43, 'UART0 TX'),
  pin('j3-3', 'U0RXD / GPIO44', 'gpio', 'j3-3', undefined, 44, 'UART0 RX'),
  pin('j3-4', 'GPIO1', 'gpio', 'j3-4', undefined, 1),
  pin('j3-5', 'GPIO2', 'gpio', 'j3-5', undefined, 2),
  pin('j3-6', 'GPIO42', 'gpio', 'j3-6', undefined, 42),
  pin('j3-7', 'GPIO41', 'gpio', 'j3-7', undefined, 41),
  pin('j3-8', 'GPIO40', 'gpio', 'j3-8', undefined, 40),
  pin('j3-9', 'GPIO39', 'gpio', 'j3-9', undefined, 39),
  pin('j3-10', 'GPIO38 / RGB LED', 'gpio', 'j3-10', undefined, 38),
  pin('j3-11', 'GPIO37', 'gpio', 'j3-11', undefined, 37, 'Unavailable on octal flash/PSRAM variants'),
  pin('j3-12', 'GPIO36', 'gpio', 'j3-12', undefined, 36, 'Unavailable on octal flash/PSRAM variants'),
  pin('j3-13', 'GPIO35', 'gpio', 'j3-13', undefined, 35, 'Unavailable on octal flash/PSRAM variants'),
  pin('j3-14', 'GPIO0 / BOOT', 'gpio', 'j3-14', undefined, 0, 'Boot-strapping pin'),
  pin('j3-15', 'GPIO45', 'gpio', 'j3-15', undefined, 45, 'Strapping pin'),
  pin('j3-16', 'GPIO48', 'gpio', 'j3-16', undefined, 48, 'Drove the on-board RGB LED on the initial revision; v1.1 uses GPIO38'),
  pin('j3-17', 'GPIO47', 'gpio', 'j3-17', undefined, 47),
  pin('j3-18', 'GPIO21', 'gpio', 'j3-18', undefined, 21),
  pin('j3-19', 'USB_D+ / GPIO20', 'gpio', 'j3-19', undefined, 20, 'Native USB D+'),
  pin('j3-20', 'USB_D- / GPIO19', 'gpio', 'j3-20', undefined, 19, 'Native USB D-'),
  pin('j3-21', 'GND', 'ground', 'j3-21'),
  pin('j3-22', 'GND', 'ground', 'j3-22'),
]

// Silkscreen order, USB at the bottom, confirmed against two physical boards
// and the board render. The previous map came from a single seller listing
// image: it ran GPIO1..GPIO18 straight down the left rail, exposed GPIO33/34
// (which this board doesn't break out), and totalled 43 entries on a board
// named 44-pin. Only two of its 43 positions matched the real header.
const GENERIC_N16R8_LEFT_LABELS = [
  '3V3', '3V3', 'RST', '4', '5', '6', '7', '15', '16', '17', '18',
  '8', '19', '20', '3', '46', '9', '10', '11', '12', '3V3', 'GND',
] as const

const GENERIC_N16R8_RIGHT_LABELS = [
  'GND', '1', '2', 'TX', 'RX', '42', '41', '40', '39', '38', '37',
  '36', '35', '0', '45', '48', '47', '21', '14', '13', '5VIN', 'GND',
] as const

const GENERIC_N16R8_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', GENERIC_N16R8_LEFT_LABELS, 30, 78, 16),
  ...verticalAnchors('right', 'right', GENERIC_N16R8_RIGHT_LABELS, 354, 86, 16),
]

const GENERIC_N16R8_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', '3V3', 'power-out', 'left-1'),
  pin('left-2', '3V3', 'power-out', 'left-2'),
  pin('left-3', 'RST', 'reserved', 'left-3', undefined, undefined, 'Board reset / EN'),
  pin('left-4', 'GPIO4', 'gpio', 'left-4', undefined, 4),
  pin('left-5', 'GPIO5', 'gpio', 'left-5', undefined, 5),
  pin('left-6', 'GPIO6', 'gpio', 'left-6', undefined, 6),
  pin('left-7', 'GPIO7', 'gpio', 'left-7', undefined, 7),
  pin('left-8', 'GPIO15', 'gpio', 'left-8', undefined, 15),
  pin('left-9', 'GPIO16', 'gpio', 'left-9', undefined, 16),
  pin('left-10', 'GPIO17', 'gpio', 'left-10', undefined, 17),
  pin('left-11', 'GPIO18', 'gpio', 'left-11', undefined, 18),
  pin('left-12', 'GPIO8', 'gpio', 'left-12', undefined, 8),
  pin('left-13', 'USB_D- / GPIO19', 'gpio', 'left-13', undefined, 19, 'Native USB D-'),
  pin('left-14', 'USB_D+ / GPIO20', 'gpio', 'left-14', undefined, 20, 'Native USB D+'),
  pin('left-15', 'GPIO3', 'gpio', 'left-15', undefined, 3),
  pin('left-16', 'GPIO46', 'gpio', 'left-16', undefined, 46, 'Input-only / strapping pin'),
  pin('left-17', 'GPIO9', 'gpio', 'left-17', undefined, 9),
  pin('left-18', 'GPIO10', 'gpio', 'left-18', undefined, 10),
  pin('left-19', 'GPIO11', 'gpio', 'left-19', undefined, 11),
  pin('left-20', 'GPIO12', 'gpio', 'left-20', undefined, 12),
  pin('left-21', '3V3', 'power-out', 'left-21'),
  pin('left-22', 'GND', 'ground', 'left-22'),
  pin('right-1', 'GND', 'ground', 'right-1'),
  pin('right-2', 'GPIO1', 'gpio', 'right-2', undefined, 1),
  pin('right-3', 'GPIO2', 'gpio', 'right-3', undefined, 2),
  pin('right-4', 'TX / GPIO43', 'gpio', 'right-4', undefined, 43, 'UART0 TX'),
  pin('right-5', 'RX / GPIO44', 'gpio', 'right-5', undefined, 44, 'UART0 RX'),
  pin('right-6', 'GPIO42', 'gpio', 'right-6', undefined, 42),
  pin('right-7', 'GPIO41', 'gpio', 'right-7', undefined, 41),
  pin('right-8', 'GPIO40', 'gpio', 'right-8', undefined, 40),
  pin('right-9', 'GPIO39', 'gpio', 'right-9', undefined, 39),
  pin('right-10', 'GPIO38', 'gpio', 'right-10', undefined, 38),
  pin('right-11', 'GPIO37', 'gpio', 'right-11', 'unavailable', 37, 'Unavailable on N16R8 modules — octal PSRAM uses it'),
  pin('right-12', 'GPIO36', 'gpio', 'right-12', 'unavailable', 36, 'Unavailable on N16R8 modules — octal PSRAM uses it'),
  pin('right-13', 'GPIO35', 'gpio', 'right-13', 'unavailable', 35, 'Unavailable on N16R8 modules — octal PSRAM uses it'),
  pin('right-14', 'GPIO0 / BOOT', 'gpio', 'right-14', undefined, 0, 'Boot-strapping pin'),
  pin('right-15', 'GPIO45', 'gpio', 'right-15', undefined, 45, 'Strapping pin'),
  pin('right-16', 'GPIO48', 'gpio', 'right-16', undefined, 48, 'Drives the on-board RGB LED'),
  pin('right-17', 'GPIO47', 'gpio', 'right-17', undefined, 47),
  pin('right-18', 'GPIO21', 'gpio', 'right-18', undefined, 21),
  pin('right-19', 'GPIO14', 'gpio', 'right-19', undefined, 14),
  pin('right-20', 'GPIO13', 'gpio', 'right-20', undefined, 13),
  pin('right-21', '5VIN', 'power-in', 'right-21', undefined, undefined, 'Use this 5VIN label for controller power discussions'),
  pin('right-22', 'GND', 'ground', 'right-22'),
]

// 30-pin DOIT-style DevKit v1 (ESP32-WROOM-32D, silk "ESP-32D"), USB at the
// bottom. Two 15-pin rails; GPIO0 is deliberately absent — the BOOT button is
// its only connection on this board, so there is nothing to wire to.
const ESP32D_LEFT_LABELS = [
  'EN', '36', '39', '34', '35', '32', '33', '25', '26', '27', '14', '12', '13', 'GND', 'VIN',
] as const

const ESP32D_RIGHT_LABELS = [
  '23', '22', 'TX0', 'RX0', '21', '19', '18', '5', 'TX2', 'RX2', '4', '2', '15', 'GND', '3V3',
] as const

const ESP32D_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', ESP32D_LEFT_LABELS, 30, 90, 22),
  ...verticalAnchors('right', 'right', ESP32D_RIGHT_LABELS, 330, 90, 22),
]

const INPUT_ONLY_NOTE = 'Input-only; no internal pull resistor'

const ESP32D_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', 'EN', 'reserved', 'left-1', undefined, undefined, 'Board reset — pull low to reset'),
  pin('left-2', 'GPIO36 / VP', 'gpio', 'left-2', undefined, 36, INPUT_ONLY_NOTE),
  pin('left-3', 'GPIO39 / VN', 'gpio', 'left-3', undefined, 39, INPUT_ONLY_NOTE),
  pin('left-4', 'GPIO34', 'gpio', 'left-4', undefined, 34, INPUT_ONLY_NOTE),
  pin('left-5', 'GPIO35', 'gpio', 'left-5', undefined, 35, INPUT_ONLY_NOTE),
  pin('left-6', 'GPIO32', 'gpio', 'left-6', undefined, 32),
  pin('left-7', 'GPIO33', 'gpio', 'left-7', undefined, 33),
  pin('left-8', 'GPIO25', 'gpio', 'left-8', undefined, 25, 'DAC1'),
  pin('left-9', 'GPIO26', 'gpio', 'left-9', undefined, 26, 'DAC2'),
  pin('left-10', 'GPIO27', 'gpio', 'left-10', undefined, 27),
  pin('left-11', 'GPIO14', 'gpio', 'left-11', undefined, 14),
  pin('left-12', 'GPIO12', 'gpio', 'left-12', undefined, 12, 'Strapping pin — must be low at boot'),
  pin('left-13', 'GPIO13', 'gpio', 'left-13', undefined, 13),
  pin('left-14', 'GND', 'ground', 'left-14'),
  pin('left-15', 'VIN', 'power-in', 'left-15', undefined, undefined, '5 V input — bypasses the USB regulator'),
  pin('right-1', 'GPIO23', 'gpio', 'right-1', undefined, 23, 'VSPI MOSI'),
  pin('right-2', 'GPIO22', 'gpio', 'right-2', undefined, 22, 'I2C SCL'),
  pin('right-3', 'TX0 / GPIO1', 'gpio', 'right-3', undefined, 1, 'UART0 TX — used by the USB serial bridge'),
  pin('right-4', 'RX0 / GPIO3', 'gpio', 'right-4', undefined, 3, 'UART0 RX — used by the USB serial bridge'),
  pin('right-5', 'GPIO21', 'gpio', 'right-5', undefined, 21, 'I2C SDA'),
  pin('right-6', 'GPIO19', 'gpio', 'right-6', undefined, 19, 'VSPI MISO'),
  pin('right-7', 'GPIO18', 'gpio', 'right-7', undefined, 18, 'VSPI SCK'),
  pin('right-8', 'GPIO5', 'gpio', 'right-8', undefined, 5, 'VSPI SS / strapping pin'),
  pin('right-9', 'TX2 / GPIO17', 'gpio', 'right-9', undefined, 17, 'UART2 TX'),
  pin('right-10', 'RX2 / GPIO16', 'gpio', 'right-10', undefined, 16, 'UART2 RX'),
  pin('right-11', 'GPIO4', 'gpio', 'right-11', undefined, 4),
  pin('right-12', 'GPIO2', 'gpio', 'right-12', undefined, 2, 'Strapping pin; drives the on-board blue LED'),
  pin('right-13', 'GPIO15', 'gpio', 'right-13', undefined, 15, 'Strapping pin'),
  pin('right-14', 'GND', 'ground', 'right-14'),
  pin('right-15', '3V3', 'power-out', 'right-15', undefined, undefined, 'Regulated 3.3 V output — not enough for an LED strip'),
]

// Silkscreen order with USB at the bottom, matching every other board here.
// The map used to be stored in a different orientation, which the pinout
// preview compensated for with a per-board rotate special case; it was also
// scrambled — no rotation of the real board produces it.
const XIAO_PIN_ANCHORS: PhysicalBoardPinAnchor[] = [
  ...verticalAnchors('left', 'left', ['D7', 'D8', 'D9', 'D10', '3V3', 'GND', '5V'], 24, 92, 30),
  ...verticalAnchors('right', 'right', ['D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], 276, 92, 30),
  { id: 'bottom-1', x: 92, y: 344, labelAlign: 'bottom' },
  { id: 'bottom-2', x: 140, y: 344, labelAlign: 'bottom' },
  { id: 'bottom-3', x: 188, y: 344, labelAlign: 'bottom' },
  { id: 'bottom-4', x: 236, y: 344, labelAlign: 'bottom' },
]

const XIAO_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', 'D7 / GPIO44', 'gpio', 'left-1', undefined, 44, 'UART RX'),
  pin('left-2', 'D8 / GPIO7', 'gpio', 'left-2', undefined, 7, 'SPI SCK'),
  pin('left-3', 'D9 / GPIO8', 'gpio', 'left-3', undefined, 8, 'SPI MISO'),
  pin('left-4', 'D10 / GPIO9', 'gpio', 'left-4', undefined, 9, 'SPI MOSI'),
  pin('left-5', '3V3', 'power-out', 'left-5', undefined, undefined, 'Regulated 3.3 V output'),
  pin('left-6', 'GND', 'ground', 'left-6'),
  pin('left-7', '5V', 'power-in', 'left-7', undefined, undefined, 'USB VBUS'),
  pin('right-1', 'D6 / GPIO43', 'gpio', 'right-1', undefined, 43, 'UART TX'),
  pin('right-2', 'D5 / GPIO6', 'gpio', 'right-2', undefined, 6, 'I2C SCL'),
  pin('right-3', 'D4 / GPIO5', 'gpio', 'right-3', undefined, 5, 'I2C SDA'),
  pin('right-4', 'D3 / GPIO4', 'gpio', 'right-4', undefined, 4),
  pin('right-5', 'D2 / GPIO3', 'gpio', 'right-5', undefined, 3),
  pin('right-6', 'D1 / GPIO2', 'gpio', 'right-6', undefined, 2),
  pin('right-7', 'D0 / GPIO1', 'gpio', 'right-7', undefined, 1),
  pin('bottom-1', 'GPIO42 / D11', 'gpio', 'bottom-1', undefined, 42, 'Underside pad; Sense expansion / mic CLK'),
  pin('bottom-2', 'GPIO41 / D12', 'gpio', 'bottom-2', undefined, 41, 'Underside pad; Sense expansion / mic DATA'),
  pin('bottom-3', 'GPIO40 / MTDO', 'gpio', 'bottom-3', undefined, 40, 'Underside pad'),
  pin('bottom-4', 'GPIO39 / MTCK', 'gpio', 'bottom-4', undefined, 39, 'Underside pad'),
]

// Generic 38-pin ESP32-WROOM-32 dev board (NodeMCU-32S style), USB at the
// bottom. Unlike the 30-pin ESP-32D, this layout brings the module's SPI-flash
// pins out to the header; they are listed so a wire to one is rejected rather
// than silently accepted.
const DEVKIT38_LEFT_LABELS = [
  '3V3', 'EN', 'VP', 'VN', '34', '35', '32', '33', '25', '26',
  '27', '14', '12', 'GND', '13', '9', '10', '11', 'VIN',
] as const

const DEVKIT38_RIGHT_LABELS = [
  'GND', '23', '22', 'TX0', 'RX0', '21', 'GND', '19', '18', '5',
  'TX2', 'RX2', '4', '0', '2', '15', '8', '7', '6',
] as const

const DEVKIT38_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', DEVKIT38_LEFT_LABELS, 30, 78, 16),
  ...verticalAnchors('right', 'right', DEVKIT38_RIGHT_LABELS, 354, 78, 16),
]

const DEVKIT38_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', '3V3', 'power-out', 'left-1'),
  pin('left-2', 'EN', 'reserved', 'left-2', undefined, undefined, 'Board reset / enable'),
  pin('left-3', 'VP / GPIO36', 'gpio', 'left-3', undefined, 36, 'Input-only; no internal pull resistor'),
  pin('left-4', 'VN / GPIO39', 'gpio', 'left-4', undefined, 39, 'Input-only; no internal pull resistor'),
  pin('left-5', 'GPIO34', 'gpio', 'left-5', undefined, 34, 'Input-only; no internal pull resistor'),
  pin('left-6', 'GPIO35', 'gpio', 'left-6', undefined, 35, 'Input-only; no internal pull resistor'),
  pin('left-7', 'GPIO32', 'gpio', 'left-7', undefined, 32),
  pin('left-8', 'GPIO33', 'gpio', 'left-8', undefined, 33),
  pin('left-9', 'GPIO25', 'gpio', 'left-9', undefined, 25, 'DAC1'),
  pin('left-10', 'GPIO26', 'gpio', 'left-10', undefined, 26, 'DAC2'),
  pin('left-11', 'GPIO27', 'gpio', 'left-11', undefined, 27),
  pin('left-12', 'GPIO14', 'gpio', 'left-12', undefined, 14),
  pin('left-13', 'GPIO12', 'gpio', 'left-13', undefined, 12, 'Strapping pin - must be low at boot'),
  pin('left-14', 'GND', 'ground', 'left-14'),
  pin('left-15', 'GPIO13', 'gpio', 'left-15', undefined, 13),
  pin('left-16', 'GPIO9', 'gpio', 'left-16', 'unavailable', 9, 'Wired to the module SPI flash - not usable as GPIO'),
  pin('left-17', 'GPIO10', 'gpio', 'left-17', 'unavailable', 10, 'Wired to the module SPI flash - not usable as GPIO'),
  pin('left-18', 'GPIO11', 'gpio', 'left-18', 'unavailable', 11, 'Wired to the module SPI flash - not usable as GPIO'),
  pin('left-19', 'VIN', 'power-in', 'left-19', undefined, undefined, '5 V input - bypasses the USB regulator'),
  pin('right-1', 'GND', 'ground', 'right-1'),
  pin('right-2', 'GPIO23', 'gpio', 'right-2', undefined, 23, 'VSPI MOSI'),
  pin('right-3', 'GPIO22', 'gpio', 'right-3', undefined, 22, 'I2C SCL'),
  pin('right-4', 'TX0 / GPIO1', 'gpio', 'right-4', undefined, 1, 'UART0 TX - used by the USB serial bridge'),
  pin('right-5', 'RX0 / GPIO3', 'gpio', 'right-5', undefined, 3, 'UART0 RX - used by the USB serial bridge'),
  pin('right-6', 'GPIO21', 'gpio', 'right-6', undefined, 21, 'I2C SDA'),
  pin('right-7', 'GND', 'ground', 'right-7'),
  pin('right-8', 'GPIO19', 'gpio', 'right-8', undefined, 19, 'VSPI MISO'),
  pin('right-9', 'GPIO18', 'gpio', 'right-9', undefined, 18, 'VSPI SCK'),
  pin('right-10', 'GPIO5', 'gpio', 'right-10', undefined, 5, 'VSPI SS / strapping pin'),
  pin('right-11', 'TX2 / GPIO17', 'gpio', 'right-11', undefined, 17, 'UART2 TX'),
  pin('right-12', 'RX2 / GPIO16', 'gpio', 'right-12', undefined, 16, 'UART2 RX'),
  pin('right-13', 'GPIO4', 'gpio', 'right-13', undefined, 4),
  pin('right-14', 'GPIO0 / BOOT', 'gpio', 'right-14', undefined, 0, 'Boot-strapping pin'),
  pin('right-15', 'GPIO2', 'gpio', 'right-15', undefined, 2, 'Strapping pin; drives the on-board LED'),
  pin('right-16', 'GPIO15', 'gpio', 'right-16', undefined, 15, 'Strapping pin'),
  pin('right-17', 'GPIO8', 'gpio', 'right-17', 'unavailable', 8, 'Wired to the module SPI flash - not usable as GPIO'),
  pin('right-18', 'GPIO7', 'gpio', 'right-18', 'unavailable', 7, 'Wired to the module SPI flash - not usable as GPIO'),
  pin('right-19', 'GPIO6', 'gpio', 'right-19', 'unavailable', 6, 'Wired to the module SPI flash - not usable as GPIO'),
]

// LOLIN S3, 20 + 20 header, USB at the bottom. Rail order read out of the
// board model's own silkscreen text objects, which are plain GPIO numbers.
// GPIO35-37 are absent from the header entirely on this N16R8 board - octal
// PSRAM uses them.
const LOLIN_S3_LEFT_LABELS = [
  '3V3', '3V3', 'RST', '4', '5', '6', '7', '15', '16', '17',
  '18', '8', '3', '46', '9', '10', '11', '12', '5V', 'GND',
] as const

const LOLIN_S3_RIGHT_LABELS = [
  'GND', '1', '2', '43', '44', '42', '41', '40', '39', '38',
  '0', '45', '48', '47', '21', '14', '13', 'GND', 'GND', 'GND',
] as const

const LOLIN_S3_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', LOLIN_S3_LEFT_LABELS, 30, 78, 16),
  ...verticalAnchors('right', 'right', LOLIN_S3_RIGHT_LABELS, 354, 78, 16),
]

const LOLIN_S3_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', '3V3', 'power-out', 'left-1'),
  pin('left-2', '3V3', 'power-out', 'left-2'),
  pin('left-3', 'RST', 'reserved', 'left-3', undefined, undefined, 'Board reset / EN'),
  pin('left-4', 'GPIO4', 'gpio', 'left-4', undefined, 4),
  pin('left-5', 'GPIO5', 'gpio', 'left-5', undefined, 5),
  pin('left-6', 'GPIO6', 'gpio', 'left-6', undefined, 6),
  pin('left-7', 'GPIO7', 'gpio', 'left-7', undefined, 7),
  pin('left-8', 'GPIO15', 'gpio', 'left-8', undefined, 15),
  pin('left-9', 'GPIO16', 'gpio', 'left-9', undefined, 16),
  pin('left-10', 'GPIO17', 'gpio', 'left-10', undefined, 17),
  pin('left-11', 'GPIO18', 'gpio', 'left-11', undefined, 18),
  pin('left-12', 'GPIO8', 'gpio', 'left-12', undefined, 8),
  pin('left-13', 'GPIO3', 'gpio', 'left-13', undefined, 3),
  pin('left-14', 'GPIO46', 'gpio', 'left-14', undefined, 46, 'Input-only; no internal pull resistor'),
  pin('left-15', 'GPIO9', 'gpio', 'left-15', undefined, 9),
  pin('left-16', 'GPIO10', 'gpio', 'left-16', undefined, 10),
  pin('left-17', 'GPIO11', 'gpio', 'left-17', undefined, 11),
  pin('left-18', 'GPIO12', 'gpio', 'left-18', undefined, 12),
  pin('left-19', '5V', 'power-in', 'left-19', undefined, undefined, '5 V input - bypasses the USB regulator'),
  pin('left-20', 'GND', 'ground', 'left-20'),
  pin('right-1', 'GND', 'ground', 'right-1'),
  pin('right-2', 'GPIO1', 'gpio', 'right-2', undefined, 1),
  pin('right-3', 'GPIO2', 'gpio', 'right-3', undefined, 2),
  pin('right-4', 'TX / GPIO43', 'gpio', 'right-4', undefined, 43, 'UART0 TX'),
  pin('right-5', 'RX / GPIO44', 'gpio', 'right-5', undefined, 44, 'UART0 RX'),
  pin('right-6', 'GPIO42', 'gpio', 'right-6', undefined, 42),
  pin('right-7', 'GPIO41', 'gpio', 'right-7', undefined, 41),
  pin('right-8', 'GPIO40', 'gpio', 'right-8', undefined, 40),
  pin('right-9', 'GPIO39', 'gpio', 'right-9', undefined, 39),
  pin('right-10', 'GPIO38', 'gpio', 'right-10', undefined, 38),
  pin('right-11', 'GPIO0 / BOOT', 'gpio', 'right-11', undefined, 0, 'Boot-strapping pin'),
  pin('right-12', 'GPIO45', 'gpio', 'right-12', undefined, 45, 'Strapping pin'),
  pin('right-13', 'GPIO48', 'gpio', 'right-13', undefined, 48, 'Drives the on-board RGB LED'),
  pin('right-14', 'GPIO47', 'gpio', 'right-14', undefined, 47),
  pin('right-15', 'GPIO21', 'gpio', 'right-15', undefined, 21),
  pin('right-16', 'GPIO14', 'gpio', 'right-16', undefined, 14),
  pin('right-17', 'GPIO13', 'gpio', 'right-17', undefined, 13),
  pin('right-18', 'GND', 'ground', 'right-18'),
  pin('right-19', 'GND', 'ground', 'right-19'),
  pin('right-20', 'GND', 'ground', 'right-20'),
]

// Component side, USB at the bottom: 5V, GND and 3V3 sit beside the USB-C
// connector, GPIO0 and GPIO21 at the antenna end. The widely shared pinout
// image shows the underside with USB at the top, and the first import copied
// it without turning it over, so both rails ran backwards.
const C3_SUPER_MINI_LEFT_LABELS = ['0', '1', '2', '3', '4', '3V3', 'GND', '5V'] as const
const C3_SUPER_MINI_RIGHT_LABELS = ['21', '20', '10', '9', '8', '7', '6', '5'] as const

const C3_SUPER_MINI_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', C3_SUPER_MINI_LEFT_LABELS, 24, 92, 30),
  ...verticalAnchors('right', 'right', C3_SUPER_MINI_RIGHT_LABELS, 276, 92, 30),
]

const C3_SUPER_MINI_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', 'GPIO0 / A0', 'gpio', 'left-1', undefined, 0),
  pin('left-2', 'GPIO1 / A1', 'gpio', 'left-2', undefined, 1),
  pin('left-3', 'GPIO2 / A2', 'gpio', 'left-3', undefined, 2, 'Strapping pin'),
  pin('left-4', 'GPIO3 / A3', 'gpio', 'left-4', undefined, 3),
  pin('left-5', 'GPIO4 / A4 / SCK', 'gpio', 'left-5', undefined, 4),
  pin('left-6', '3V3', 'power-out', 'left-6'),
  pin('left-7', 'GND', 'ground', 'left-7'),
  pin('left-8', '5V', 'power-in', 'left-8'),
  pin('right-1', 'GPIO21 / TX', 'gpio', 'right-1', undefined, 21, 'UART0 TX'),
  pin('right-2', 'GPIO20 / RX', 'gpio', 'right-2', undefined, 20, 'UART0 RX'),
  pin('right-3', 'GPIO10', 'gpio', 'right-3', undefined, 10),
  pin('right-4', 'GPIO9 / SCL / BOOT', 'gpio', 'right-4', undefined, 9, 'Strapping pin, wired to the BOOT button'),
  pin('right-5', 'GPIO8 / SDA', 'gpio', 'right-5', undefined, 8, 'Strapping pin; drives the on-board blue LED'),
  pin('right-6', 'GPIO7 / SS', 'gpio', 'right-6', undefined, 7),
  pin('right-7', 'GPIO6 / MOSI', 'gpio', 'right-7', undefined, 6),
  pin('right-8', 'GPIO5 / A5 / MISO', 'gpio', 'right-8', undefined, 5),
]

// Espressif's J1 and J3, module end at the top. Checked against the user guide's
// header tables and the v1.4 schematic.
const C6_DEVKITC_J1_LABELS = [
  '3V3', 'RST', '4', '5', '6', '7', '0', '1', '8', '10', '11', '2', '3', '5V', 'G', 'NC',
] as const

const C6_DEVKITC_J3_LABELS = [
  'G', 'TX', 'RX', '15', '23', '22', '21', '20', '19', '18', '9', 'G', '13', '12', 'G', 'NC',
] as const

const C6_DEVKITC_PIN_ANCHORS = [
  ...verticalAnchors('j1', 'left', C6_DEVKITC_J1_LABELS, 30, 88, 18),
  ...verticalAnchors('j3', 'right', C6_DEVKITC_J3_LABELS, 330, 88, 18),
]

const C6_DEVKITC_PINS: PhysicalBoardPinProfile[] = [
  pin('j1-1', '3V3', 'power-out', 'j1-1'),
  pin('j1-2', 'RST', 'reserved', 'j1-2', undefined, undefined, 'Board reset / EN'),
  pin('j1-3', 'GPIO4', 'gpio', 'j1-3', undefined, 4, 'Strapping pin (MTMS)'),
  pin('j1-4', 'GPIO5', 'gpio', 'j1-4', undefined, 5, 'Strapping pin (MTDI)'),
  pin('j1-5', 'GPIO6', 'gpio', 'j1-5', undefined, 6),
  pin('j1-6', 'GPIO7', 'gpio', 'j1-6', undefined, 7),
  pin('j1-7', 'GPIO0', 'gpio', 'j1-7', undefined, 0),
  pin('j1-8', 'GPIO1', 'gpio', 'j1-8', undefined, 1),
  pin('j1-9', 'GPIO8', 'gpio', 'j1-9', undefined, 8, 'Strapping pin; drives the on-board RGB LED'),
  pin('j1-10', 'GPIO10', 'gpio', 'j1-10', undefined, 10),
  pin('j1-11', 'GPIO11', 'gpio', 'j1-11', undefined, 11),
  pin('j1-12', 'GPIO2', 'gpio', 'j1-12', undefined, 2),
  pin('j1-13', 'GPIO3', 'gpio', 'j1-13', undefined, 3),
  pin('j1-14', '5V', 'power-in', 'j1-14'),
  pin('j1-15', 'GND', 'ground', 'j1-15'),
  pin('j1-16', 'NC', 'reserved', 'j1-16', undefined, undefined, 'Not connected'),
  pin('j3-1', 'GND', 'ground', 'j3-1'),
  pin('j3-2', 'TX / GPIO16', 'gpio', 'j3-2', undefined, 16, 'UART0 TX to the USB-to-UART bridge'),
  pin('j3-3', 'RX / GPIO17', 'gpio', 'j3-3', undefined, 17, 'UART0 RX from the USB-to-UART bridge'),
  pin('j3-4', 'GPIO15', 'gpio', 'j3-4', undefined, 15, 'Strapping pin'),
  pin('j3-5', 'GPIO23 / SDA', 'gpio', 'j3-5', undefined, 23),
  pin('j3-6', 'GPIO22 / SCL', 'gpio', 'j3-6', undefined, 22),
  pin('j3-7', 'GPIO21', 'gpio', 'j3-7', undefined, 21),
  pin('j3-8', 'GPIO20', 'gpio', 'j3-8', undefined, 20),
  pin('j3-9', 'GPIO19', 'gpio', 'j3-9', undefined, 19),
  pin('j3-10', 'GPIO18', 'gpio', 'j3-10', undefined, 18),
  pin('j3-11', 'GPIO9 / BOOT', 'gpio', 'j3-11', undefined, 9, 'Boot-strapping pin, wired to the BOOT button'),
  pin('j3-12', 'GND', 'ground', 'j3-12'),
  pin('j3-13', 'USB_D+ / GPIO13', 'gpio', 'j3-13', undefined, 13, 'Native USB D+'),
  pin('j3-14', 'USB_D- / GPIO12', 'gpio', 'j3-14', undefined, 12, 'Native USB D-'),
  pin('j3-15', 'GND', 'ground', 'j3-15'),
  pin('j3-16', 'NC', 'reserved', 'j3-16', undefined, undefined, 'Not connected'),
]

// LOLIN's J2 and J3, antenna at the top. Checked against the V4.0.0 schematic:
// A0 is the ESP8266's ADC behind a 220k/100k divider, and 5V is USB VBUS with
// no diode between them.
const D1_MINI_LEFT_LABELS = ['RST', 'A0', 'D0', 'D5', 'D6', 'D7', 'D8', '3V3'] as const
const D1_MINI_RIGHT_LABELS = ['TX', 'RX', 'D1', 'D2', 'D3', 'D4', 'G', '5V'] as const

const D1_MINI_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', D1_MINI_LEFT_LABELS, 24, 92, 30),
  ...verticalAnchors('right', 'right', D1_MINI_RIGHT_LABELS, 276, 92, 30),
]

const D1_MINI_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', 'RST', 'reserved', 'left-1', undefined, undefined, 'Board reset'),
  pin('left-2', 'A0', 'analog', 'left-2', undefined, 17, 'Analog input only, 0 to 3.2 V through the on-board divider'),
  pin('left-3', 'D0 / GPIO16', 'gpio', 'left-3', undefined, 16, 'No interrupt or PWM'),
  pin('left-4', 'D5 / GPIO14 / SCK', 'gpio', 'left-4', undefined, 14),
  pin('left-5', 'D6 / GPIO12 / MISO', 'gpio', 'left-5', undefined, 12),
  pin('left-6', 'D7 / GPIO13 / MOSI', 'gpio', 'left-6', undefined, 13),
  pin('left-7', 'D8 / GPIO15', 'gpio', 'left-7', undefined, 15, 'Boot-strapping pin, pulled low'),
  pin('left-8', '3V3', 'power-out', 'left-8'),
  pin('right-1', 'TX / GPIO1', 'gpio', 'right-1', undefined, 1, 'UART0 TX'),
  pin('right-2', 'RX / GPIO3', 'gpio', 'right-2', undefined, 3, 'UART0 RX'),
  pin('right-3', 'D1 / GPIO5 / SCL', 'gpio', 'right-3', undefined, 5),
  pin('right-4', 'D2 / GPIO4 / SDA', 'gpio', 'right-4', undefined, 4),
  pin('right-5', 'D3 / GPIO0', 'gpio', 'right-5', undefined, 0, 'Boot-strapping pin, pulled high'),
  pin('right-6', 'D4 / GPIO2', 'gpio', 'right-6', undefined, 2, 'Boot-strapping pin, pulled high; drives the on-board LED'),
  pin('right-7', 'GND', 'ground', 'right-7'),
  pin('right-8', '5V', 'power-in', 'right-8', undefined, undefined, 'USB VBUS, joined to the connector with no diode'),
]

// Raspberry Pi's pins 21-40 down the left and 20-1 down the right: the
// datasheet's USB-up drawing turned round so USB is at the bottom.
const PICO_W_LEFT_LABELS = [
  'GP16', 'GP17', 'GND', 'GP18', 'GP19', 'GP20', 'GND', 'GP21', 'GP22', 'RUN',
  'GP26', 'GP27', 'AGND', 'GP28', 'ADC_VREF', '3V3', '3V3_EN', 'GND', 'VSYS', 'VBUS',
] as const

const PICO_W_RIGHT_LABELS = [
  'GP15', 'GP14', 'GND', 'GP13', 'GP12', 'GP11', 'GND', 'GP10', 'GP9', 'GP8',
  'GP7', 'GP6', 'GND', 'GP5', 'GP4', 'GP3', 'GND', 'GP2', 'GP1', 'GP0',
] as const

const PICO_W_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', PICO_W_LEFT_LABELS, 30, 88, 18),
  ...verticalAnchors('right', 'right', PICO_W_RIGHT_LABELS, 330, 88, 18),
]

const PICO_W_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', 'GP16', 'gpio', 'left-1', undefined, 16),
  pin('left-2', 'GP17', 'gpio', 'left-2', undefined, 17),
  pin('left-3', 'GND', 'ground', 'left-3'),
  pin('left-4', 'GP18', 'gpio', 'left-4', undefined, 18),
  pin('left-5', 'GP19', 'gpio', 'left-5', undefined, 19),
  pin('left-6', 'GP20', 'gpio', 'left-6', undefined, 20),
  pin('left-7', 'GND', 'ground', 'left-7'),
  pin('left-8', 'GP21', 'gpio', 'left-8', undefined, 21),
  pin('left-9', 'GP22', 'gpio', 'left-9', undefined, 22),
  pin('left-10', 'RUN', 'reserved', 'left-10', undefined, undefined, 'Board reset; pull low to reset'),
  pin('left-11', 'GP26 / A0', 'gpio', 'left-11', undefined, 26),
  pin('left-12', 'GP27 / A1', 'gpio', 'left-12', undefined, 27),
  pin('left-13', 'AGND', 'ground', 'left-13', undefined, undefined, 'Analog ground for the ADC'),
  pin('left-14', 'GP28 / A2', 'gpio', 'left-14', undefined, 28),
  pin('left-15', 'ADC_VREF', 'reserved', 'left-15', undefined, undefined, 'ADC reference voltage'),
  pin('left-16', '3V3', 'power-out', 'left-16'),
  pin('left-17', '3V3_EN', 'reserved', 'left-17', undefined, undefined, 'Pull low to switch the 3V3 regulator off'),
  pin('left-18', 'GND', 'ground', 'left-18'),
  pin('left-19', 'VSYS', 'power-in', 'left-19', undefined, undefined, 'System input, 1.8 to 5.5 V; VBUS feeds it through an on-board Schottky diode'),
  pin('left-20', 'VBUS', 'power-out', 'left-20', undefined, undefined, 'USB 5 V, present only while USB is connected'),
  pin('right-1', 'GP15', 'gpio', 'right-1', undefined, 15),
  pin('right-2', 'GP14', 'gpio', 'right-2', undefined, 14),
  pin('right-3', 'GND', 'ground', 'right-3'),
  pin('right-4', 'GP13', 'gpio', 'right-4', undefined, 13),
  pin('right-5', 'GP12', 'gpio', 'right-5', undefined, 12),
  pin('right-6', 'GP11', 'gpio', 'right-6', undefined, 11),
  pin('right-7', 'GND', 'ground', 'right-7'),
  pin('right-8', 'GP10', 'gpio', 'right-8', undefined, 10),
  pin('right-9', 'GP9', 'gpio', 'right-9', undefined, 9),
  pin('right-10', 'GP8', 'gpio', 'right-10', undefined, 8),
  pin('right-11', 'GP7', 'gpio', 'right-11', undefined, 7),
  pin('right-12', 'GP6', 'gpio', 'right-12', undefined, 6),
  pin('right-13', 'GND', 'ground', 'right-13'),
  pin('right-14', 'GP5', 'gpio', 'right-14', undefined, 5),
  pin('right-15', 'GP4', 'gpio', 'right-15', undefined, 4),
  pin('right-16', 'GP3', 'gpio', 'right-16', undefined, 3),
  pin('right-17', 'GND', 'ground', 'right-17'),
  pin('right-18', 'GP2', 'gpio', 'right-18', undefined, 2),
  pin('right-19', 'GP1', 'gpio', 'right-19', undefined, 1),
  pin('right-20', 'GP0', 'gpio', 'right-20', undefined, 0),
]

// PJRC's card turned round so USB is at the bottom: 33-41 and 13-23 down the
// left, 32-24 and 12-0 down the right. The underside pads are not drawn.
const TEENSY_41_LEFT_LABELS = [
  '33', '34', '35', '36', '37', '38', '39', '40', '41', 'GND', '13', '14',
  '15', '16', '17', '18', '19', '20', '21', '22', '23', '3V3', 'GND', 'VIN',
] as const

const TEENSY_41_RIGHT_LABELS = [
  '32', '31', '30', '29', '28', '27', '26', '25', '24', '3V3', '12', '11',
  '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0', 'GND',
] as const

const TEENSY_41_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', TEENSY_41_LEFT_LABELS, 30, 78, 16),
  ...verticalAnchors('right', 'right', TEENSY_41_RIGHT_LABELS, 330, 78, 16),
]

/** One Teensy rail: its numbered pins keep their own Arduino numbers. */
function teensyRail(side: 'left' | 'right', labels: readonly string[]): PhysicalBoardPinProfile[] {
  return labels.map((label, index) => {
    const id = `${side}-${index + 1}`
    if (label === 'GND') return pin(id, 'GND', 'ground', id)
    if (label === '3V3') return pin(id, '3V3', 'power-out', id)
    if (label === 'VIN') {
      return pin(id, 'VIN', 'power-in', id, undefined, undefined, '3.6 to 5.5 V; joined to USB 5 V unless the VIN-VUSB pads are cut')
    }
    const gpio = Number(label)
    return pin(id, `Pin ${label}`, 'gpio', id, undefined, gpio, gpio === 13 ? 'Drives the on-board LED' : undefined)
  })
}

const TEENSY_41_PINS: PhysicalBoardPinProfile[] = [
  ...teensyRail('left', TEENSY_41_LEFT_LABELS),
  ...teensyRail('right', TEENSY_41_RIGHT_LABELS),
]

// Arduino's JP2 and JP1 turned USB-down: JP2 (D1/TX to D12) down the left and
// JP1 (VIN to D13) down the right. Pins are GPIO numbers, which is why the
// helper builds this board with the core's GPIO numbering.
const NANO_ESP32_LEFT_LABELS = [
  'TX', 'RX', 'RST', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12',
] as const

const NANO_ESP32_RIGHT_LABELS = [
  'VIN', 'GND', 'B1', 'VBUS', 'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'B0', '3V3', 'D13',
] as const

const NANO_ESP32_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', NANO_ESP32_LEFT_LABELS, 30, 88, 18),
  ...verticalAnchors('right', 'right', NANO_ESP32_RIGHT_LABELS, 330, 88, 18),
]

const NANO_ESP32_ADC2 = 'ADC2: analog reads conflict with Wi-Fi'

const NANO_ESP32_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', 'D1 / TX / GPIO43', 'gpio', 'left-1', undefined, 43, 'UART0 TX; Serial is the USB port'),
  pin('left-2', 'D0 / RX / GPIO44', 'gpio', 'left-2', undefined, 44, 'UART0 RX; Serial is the USB port'),
  pin('left-3', 'RST', 'reserved', 'left-3', undefined, undefined, 'Board reset'),
  pin('left-4', 'GND', 'ground', 'left-4'),
  pin('left-5', 'D2 / GPIO5', 'gpio', 'left-5', undefined, 5),
  pin('left-6', 'D3 / GPIO6', 'gpio', 'left-6', undefined, 6),
  pin('left-7', 'D4 / GPIO7', 'gpio', 'left-7', undefined, 7),
  pin('left-8', 'D5 / GPIO8', 'gpio', 'left-8', undefined, 8),
  pin('left-9', 'D6 / GPIO9', 'gpio', 'left-9', undefined, 9),
  pin('left-10', 'D7 / GPIO10', 'gpio', 'left-10', undefined, 10),
  pin('left-11', 'D8 / GPIO17', 'gpio', 'left-11', undefined, 17),
  pin('left-12', 'D9 / GPIO18', 'gpio', 'left-12', undefined, 18),
  pin('left-13', 'D10 / GPIO21', 'gpio', 'left-13', undefined, 21),
  pin('left-14', 'D11 / GPIO38', 'gpio', 'left-14', undefined, 38),
  pin('left-15', 'D12 / GPIO47', 'gpio', 'left-15', undefined, 47),
  {
    ...pin('right-1', 'VIN', 'power-in', 'right-1', undefined, undefined, '6 to 21 V into the on-board buck; there is no 5 V input'),
    inputVoltage: { min: 6, max: 21 },
  },
  pin('right-2', 'GND', 'ground', 'right-2'),
  pin('right-3', 'B1 / GPIO0', 'gpio', 'right-3', undefined, 0, 'BOOT strapping pin and the RGB LED green; outputs only'),
  pin('right-4', 'VBUS', 'power-out', 'right-4', undefined, undefined, 'USB 5 V, present only while USB is connected'),
  pin('right-5', 'A7 / GPIO14', 'gpio', 'right-5', undefined, 14, NANO_ESP32_ADC2),
  pin('right-6', 'A6 / GPIO13', 'gpio', 'right-6', undefined, 13, NANO_ESP32_ADC2),
  pin('right-7', 'A5 / GPIO12', 'gpio', 'right-7', undefined, 12, `Default I2C SCL; ${NANO_ESP32_ADC2}`),
  pin('right-8', 'A4 / GPIO11', 'gpio', 'right-8', undefined, 11, `Default I2C SDA; ${NANO_ESP32_ADC2}`),
  pin('right-9', 'A3 / GPIO4', 'gpio', 'right-9', undefined, 4),
  pin('right-10', 'A2 / GPIO3', 'gpio', 'right-10', undefined, 3),
  pin('right-11', 'A1 / GPIO2', 'gpio', 'right-11', undefined, 2),
  pin('right-12', 'A0 / GPIO1', 'gpio', 'right-12', undefined, 1),
  pin('right-13', 'B0 / GPIO46', 'gpio', 'right-13', undefined, 46, 'Strapping pin and the RGB LED red; outputs only'),
  pin('right-14', '3V3', 'power-out', 'right-14'),
  pin('right-15', 'D13 / GPIO48', 'gpio', 'right-15', undefined, 48, 'SCK; drives the amber LED_BUILTIN'),
]

// Wireless-Tag's pinout drawing, RJ45 at the bottom. Each rail starts with
// three pins of the flashing header: EN, GND, 3V3 on the left and TXD0, RXD0,
// IO0 on the right.
const WT32_ETH01_LEFT_LABELS = [
  'EN', 'GND', '3V3', 'EN', 'IO32', 'IO33', 'IO5', 'IO17', 'GND', '3V3', 'GND', '5V', 'LINK',
] as const

const WT32_ETH01_RIGHT_LABELS = [
  'TXD0', 'RXD0', 'IO0', 'GND', 'IO39', 'IO36', 'IO15', 'IO14', 'IO12', 'IO35', 'IO4', 'IO2', 'GND',
] as const

const WT32_ETH01_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', WT32_ETH01_LEFT_LABELS, 30, 88, 18),
  ...verticalAnchors('right', 'right', WT32_ETH01_RIGHT_LABELS, 330, 88, 18),
]

const WT32_ETH01_3V3 = 'Regulator output when 5V is fed, or a 3.3 V input in its place; never both'

const WT32_ETH01_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', 'EN', 'reserved', 'left-1', undefined, undefined, 'Enable; pull low to reset'),
  pin('left-2', 'GND', 'ground', 'left-2'),
  pin('left-3', '3V3', 'power-out', 'left-3', undefined, undefined, WT32_ETH01_3V3),
  pin('left-4', 'EN', 'reserved', 'left-4', undefined, undefined, 'Enable; pull low to reset'),
  pin('left-5', 'IO32 / CFG', 'gpio', 'left-5', undefined, 32, 'Default I2C SCL'),
  pin('left-6', 'IO33 / 485_EN', 'gpio', 'left-6', undefined, 33, 'Default I2C SDA'),
  pin('left-7', 'IO5 / RXD', 'gpio', 'left-7', undefined, 5, 'Strapping pin; UART2 RX, drives the RXD LED'),
  pin('left-8', 'IO17 / TXD', 'gpio', 'left-8', undefined, 17, 'UART2 TX, drives the TXD LED'),
  pin('left-9', 'GND', 'ground', 'left-9'),
  pin('left-10', '3V3', 'power-out', 'left-10', undefined, undefined, WT32_ETH01_3V3),
  pin('left-11', 'GND', 'ground', 'left-11'),
  pin('left-12', '5V', 'power-in', 'left-12', undefined, undefined, '5 V into the AMS1117 regulator; the board has no USB'),
  pin('left-13', 'LINK', 'reserved', 'left-13', undefined, undefined, 'Ethernet link LED output'),
  pin('right-1', 'TXD0 / IO1', 'gpio', 'right-1', undefined, 1, 'UART0 TX: the flashing and Serial port'),
  pin('right-2', 'RXD0 / IO3', 'gpio', 'right-2', undefined, 3, 'UART0 RX: the flashing and Serial port'),
  pin('right-3', 'IO0', 'reserved', 'right-3', 'unavailable', 0, 'Ethernet clock input; hold it to GND at reset to flash'),
  pin('right-4', 'GND', 'ground', 'right-4'),
  pin('right-5', 'IO39', 'gpio', 'right-5', undefined, 39, 'Input only'),
  pin('right-6', 'IO36', 'gpio', 'right-6', undefined, 36, 'Input only'),
  pin('right-7', 'IO15', 'gpio', 'right-7', undefined, 15, 'Strapping pin'),
  pin('right-8', 'IO14', 'gpio', 'right-8', undefined, 14),
  pin('right-9', 'IO12', 'gpio', 'right-9', undefined, 12, 'Strapping pin; must be low at reset'),
  pin('right-10', 'IO35', 'gpio', 'right-10', undefined, 35, 'Input only'),
  pin('right-11', 'IO4', 'gpio', 'right-11', undefined, 4),
  pin('right-12', 'IO2', 'gpio', 'right-12', undefined, 2, 'Strapping pin'),
  pin('right-13', 'GND', 'ground', 'right-13'),
]

const QUINLED_DIG_UNO_LABELS = {
  left: ['VIN', 'GND', 'BUTTON', 'Q2', 'Q1', '3V3', 'A0', '1WIRE'],
  right: ['Q4', 'Q3', 'LED2', 'LED1', 'GND', 'V+', 'SDA', 'SCL'],
} as const

const QUINLED_DIG_UNO_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', QUINLED_DIG_UNO_LABELS.left, 30, 88, 18),
  ...verticalAnchors('right', 'right', QUINLED_DIG_UNO_LABELS.right, 330, 88, 18),
]

const QUINLED_DIG_UNO_PINS: PhysicalBoardPinProfile[] = [
  {
    ...pin('left-1', 'VIN 5-24V', 'power-in', 'left-1', undefined, undefined, 'Main fused LED and controller supply'),
    inputVoltage: { min: 5, max: 24 },
  },
  pin('left-2', 'GND', 'ground', 'left-2'),
  pin('left-3', 'Button / GPIO0', 'gpio', 'left-3', undefined, 0, 'Dedicated active-low button input with onboard pull-up; boot-strapping pin'),
  pin('left-4', 'Q2 / GPIO12', 'gpio', 'left-4', undefined, 12, 'External GPIO; may be pulled low'),
  pin('left-5', 'Q1 / GPIO15', 'gpio', 'left-5', undefined, 15, 'External GPIO; may be pulled low'),
  pin('left-6', '3V3', 'power-out', 'left-6'),
  pin('left-7', 'A0 / GPIO36', 'analog', 'left-7', undefined, 36, 'Analog input only; no internal pull resistor'),
  pin('left-8', '1-wire / GPIO13', 'gpio', 'left-8', undefined, 13, 'Optional onboard DS18B20 connection'),
  pin('right-1', 'Q4 / GPIO32', 'gpio', 'right-1', undefined, 32, 'External GPIO; may be pulled high'),
  pin('right-2', 'Q3 / GPIO2', 'gpio', 'right-2', undefined, 2, 'External GPIO; may be pulled high'),
  pin('right-3', 'LED2 / GPIO3', 'gpio', 'right-3', undefined, 3, 'Unidirectional level-shifted output; also UART0 RX'),
  pin('right-4', 'LED1 / GPIO16', 'gpio', 'right-4', undefined, 16, 'Unidirectional level-shifted output'),
  pin('right-5', 'LED GND', 'ground', 'right-5'),
  pin('right-6', 'LED V+', 'power-out', 'right-6', undefined, undefined, 'Fused pass-through of the 5-24 V main input'),
  pin('right-7', 'SDA / GPIO21', 'gpio', 'right-7', undefined, 21, 'Default I2C SDA'),
  pin('right-8', 'SCL / GPIO22', 'gpio', 'right-8', undefined, 22, 'Default I2C SCL'),
]

const QUINLED_DIG_QUAD_LABELS = {
  left: ['VIN', 'BUTTON', 'Q2', 'Q1', '3V3', 'A0', '1WIRE', 'SDA', 'SCL'],
  right: ['GND', 'Q4', 'Q3', 'LED4', 'LED3', 'LED2', 'LED1', 'LED GND', 'LED V+'],
} as const

const QUINLED_DIG_QUAD_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', QUINLED_DIG_QUAD_LABELS.left, 30, 78, 16),
  ...verticalAnchors('right', 'right', QUINLED_DIG_QUAD_LABELS.right, 330, 78, 16),
]

const QUINLED_DIG_QUAD_PINS: PhysicalBoardPinProfile[] = [
  {
    ...pin('left-1', 'VIN 5-24V', 'power-in', 'left-1', undefined, undefined, 'Dual high-current controller and LED supply'),
    inputVoltage: { min: 5, max: 24 },
  },
  pin('left-2', 'Button / GPIO0', 'gpio', 'left-2', undefined, 0, 'Dedicated active-low button input with onboard pull-up; boot-strapping pin'),
  pin('left-3', 'Q2 / GPIO12', 'gpio', 'left-3', undefined, 12, 'External GPIO; may be pulled low'),
  pin('left-4', 'Q1 / GPIO15', 'gpio', 'left-4', undefined, 15, 'External GPIO; shared with the level-shifted Q1R relay output'),
  pin('left-5', '3V3', 'power-out', 'left-5'),
  pin('left-6', 'A0 / GPIO36', 'analog', 'left-6', undefined, 36, 'Analog input only; no internal pull resistor'),
  pin('left-7', '1-wire / GPIO13', 'gpio', 'left-7', undefined, 13, 'Onboard DS18B20 temperature sensor connection'),
  pin('left-8', 'SDA / GPIO21', 'gpio', 'left-8', undefined, 21, 'Default I2C SDA'),
  pin('left-9', 'SCL / GPIO22', 'gpio', 'left-9', undefined, 22, 'Default I2C SCL'),
  pin('right-1', 'GND', 'ground', 'right-1'),
  pin('right-2', 'Q4 / GPIO32', 'gpio', 'right-2', undefined, 32, 'External GPIO; may be pulled high'),
  pin('right-3', 'Q3 / GPIO2', 'gpio', 'right-3', undefined, 2, 'External GPIO; may be pulled high'),
  pin('right-4', 'LED4 / GPIO4', 'gpio', 'right-4', undefined, 4, 'Unidirectional level-shifted output'),
  pin('right-5', 'LED3 / GPIO1', 'gpio', 'right-5', undefined, 1, 'Unidirectional level-shifted output; also UART0 TX'),
  pin('right-6', 'LED2 / GPIO3', 'gpio', 'right-6', undefined, 3, 'Unidirectional level-shifted output; also UART0 RX'),
  pin('right-7', 'LED1 / GPIO16', 'gpio', 'right-7', undefined, 16, 'Unidirectional level-shifted output'),
  pin('right-8', 'LED GND', 'ground', 'right-8'),
  pin('right-9', 'LED V+', 'power-out', 'right-9', undefined, undefined, 'Fused pass-through of the 5-24 V main input'),
]

// Adafruit's Eagle schematic for PID 6100. The 2x3 pad and the three screw
// terminals are the user connections; the microphone, IR receiver, NeoPixel
// and boot button are soldered on and are not pads.
const SPARKLE_MOTION_LABELS = {
  left: ['VIN', 'GND', '3V3', 'SDA', 'SCL', 'GPIO27', 'TX', 'RX', 'GPIO18'],
  right: ['SIG1', 'SIG2', 'SIG3', 'SIG4', 'V+', 'GND'],
} as const

const SPARKLE_MOTION_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', SPARKLE_MOTION_LABELS.left, 30, 72, 16),
  ...verticalAnchors('right', 'right', SPARKLE_MOTION_LABELS.right, 330, 88, 18),
]

const SPARKLE_MOTION_SHIFTED = 'Unidirectional 5 V output through a 74LVC2G34. It cannot be an input.'

const SPARKLE_MOTION_PINS: PhysicalBoardPinProfile[] = [
  {
    ...pin('left-1', 'VIN 5-24V', 'power-in', 'left-1', undefined, undefined, 'Barrel jack or USB-C PD, diode-OR\'d into the 5 A fuse'),
    inputVoltage: { min: 5, max: 24 },
  },
  pin('left-2', 'GND', 'ground', 'left-2'),
  pin('left-3', '3V3', 'power-out', 'left-3', undefined, undefined, 'Regulator output, 500 mA peak'),
  pin('left-4', 'SDA / GPIO14', 'gpio', 'left-4', undefined, 14, 'STEMMA QT SDA. The HUSB238 power-delivery chip is on this bus at 0x08'),
  pin('left-5', 'SCL / GPIO13', 'gpio', 'left-5', undefined, 13, 'STEMMA QT SCL'),
  pin('left-6', 'GPIO27 / JST', 'gpio', 'left-6', undefined, 27, 'JST analog or digital input. ADC2, so analog reads stop once Wi-Fi starts'),
  pin('left-7', 'TX / GPIO9', 'gpio', 'left-7', undefined, 9, 'Serial1 TX on the ESP32-MINI-1'),
  pin('left-8', 'RX / GPIO10', 'gpio', 'left-8', undefined, 10, 'Serial1 RX on the ESP32-MINI-1'),
  pin('left-9', 'GPIO18', 'gpio', 'left-9', undefined, 18),
  pin('right-1', 'SIG1 / GPIO21', 'gpio', 'right-1', undefined, 21, SPARKLE_MOTION_SHIFTED),
  pin('right-2', 'SIG2 / GPIO22', 'gpio', 'right-2', undefined, 22, SPARKLE_MOTION_SHIFTED),
  pin('right-3', 'SIG3 / GPIO19', 'gpio', 'right-3', undefined, 19, SPARKLE_MOTION_SHIFTED),
  pin('right-4', 'SIG4 / GPIO23', 'gpio', 'right-4', undefined, 23, SPARKLE_MOTION_SHIFTED),
  pin('right-5', 'V+', 'power-out', 'right-5', undefined, undefined, 'Fused pass-through of the 5-24 V input. All three + terminals are this rail'),
  pin('right-6', 'LED GND', 'ground', 'right-6', undefined, undefined, 'The three terminal grounds are this rail'),
]

// PID 6160. USB-C is the only supply. GPIO32 and GPIO33 are the level-shifted
// LED pads; the microphone uses GPIO9, GPIO10 and GPIO23 on the board itself.
const SPARKLE_MOTION_MINI_LABELS = {
  left: ['3V3', 'GND', 'TX', 'RX', 'GPIO27', 'GPIO14', 'SDA', 'SCL', 'GPIO13'],
  right: ['5V', 'SIG1', 'SIG2', 'GND'],
} as const

const SPARKLE_MOTION_MINI_PIN_ANCHORS = [
  ...verticalAnchors('left', 'left', SPARKLE_MOTION_MINI_LABELS.left, 30, 72, 16),
  ...verticalAnchors('right', 'right', SPARKLE_MOTION_MINI_LABELS.right, 330, 96, 20),
]

const SPARKLE_MOTION_MINI_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', '3V3', 'power-out', 'left-1', undefined, undefined, 'Regulator output from USB 5 V, 500 mA peak'),
  pin('left-2', 'GND', 'ground', 'left-2'),
  pin('left-3', 'TX / GPIO25', 'gpio', 'left-3', undefined, 25, 'Serial1 TX'),
  pin('left-4', 'RX / GPIO26', 'gpio', 'left-4', undefined, 26, 'Serial1 RX'),
  pin('left-5', 'GPIO27', 'gpio', 'left-5', undefined, 27, 'ADC2, so analog reads stop once Wi-Fi starts'),
  pin('left-6', 'GPIO14', 'gpio', 'left-6', undefined, 14, 'ADC2, so analog reads stop once Wi-Fi starts'),
  pin('left-7', 'SDA / GPIO19', 'gpio', 'left-7', undefined, 19, 'STEMMA QT SDA'),
  pin('left-8', 'SCL / GPIO22', 'gpio', 'left-8', undefined, 22, 'STEMMA QT SCL'),
  pin('left-9', 'GPIO13 / JST', 'gpio', 'left-9', undefined, 13, 'JST analog or digital input. ADC2, so analog reads stop once Wi-Fi starts'),
  pin('right-1', '5V', 'power-out', 'right-1', undefined, undefined, 'Fused USB 5 V for the LED pads. Power the board from USB-C'),
  pin('right-2', 'SIG1 / GPIO32', 'gpio', 'right-2', undefined, 32, SPARKLE_MOTION_SHIFTED),
  pin('right-3', 'SIG2 / GPIO33', 'gpio', 'right-3', undefined, 33, SPARKLE_MOTION_SHIFTED),
  pin('right-4', 'LED GND', 'ground', 'right-4'),
]

const AUTHORED_PROFILES: PhysicalBoardProfile[] = [
  {
    id: 'generic-esp32-s3-n16r8-44pin-dual-usbc',
    label: 'Generic ESP32-S3 N16R8, 44-pin dual USB-C',
    manufacturer: 'Generic / AliExpress',
    model: 'ESP32-S3 N16R8 44-pin dual USB-C',
    revision: 'YD-ESP32-23 v1.3 style, 22 + 22 header',
    targetFamilies: ['esp32-s3'],
    compatibleFqbns: ['esp32:esp32:esp32s3'],
    dimensionsMm: { width: 63.5, height: 28 },
    confidence: 'pinout-verified',
    // N16R8 is the module part number: 16MB flash, 8MB octal PSRAM.
    // Recorded because the generic `esp32:esp32:esp32s3` FQBN resolves to
    // PlatformIO's stock DevKitC-1 id, whose manifest is the *N8* variant —
    // so without this the build, and the capacity meter reading it, target
    // 8MB on a 16MB part. Confirmed on the bench with esptool.
    memory: { flashMb: 16, psramMb: 8 },
    // ESP32-S3 has substantially more usable internal SRAM than classic
    // ESP32. Keep room for the Arduino core, Wi-Fi and generator libraries;
    // this allowance is for the allocations estimateFirmwareRam owns.
    internalRamBudgetBytes: ESP32_S3_RAM_BUDGET_BYTES,
    psramMode: 'opi',
    moduleSilk: 'ESP32-S3-WROOM',
    previewSvg: boardSvg('Generic ESP32-S3 N16R8', '#ffd166', 'USB-C', 'Pinout verified'),
    notes: [
      'Use the physical board\'s 5VIN label for controller power discussions in Build Diagram.',
      'GPIO35, GPIO36, and GPIO37 are unavailable because octal PSRAM consumes them on N16R8 modules.',
      'GPIO19 and GPIO20 are the native USB pair and sit on the left rail on this board.',
    ],
    caveats: [
      'USB power sharing, 5VIN backfeed protection, regulator current, and jumper behaviour remain unverified.',
      'Generic sellers ship several layouts under this name; this is the 22 + 22 dual-USB-C board whose silkscreen runs 3V3, 3V3, RST, 4, 5, 6, 7 down the left rail.',
    ],
    sourceSummary: 'Header order read from the board render and confirmed against two physical boards; power-path behaviour still treated as uncertain.',
    // The classic ESP32 defaults (26/25/22) are not header pins on this S3
    // board. Use three exposed, unencumbered GPIOs instead. The ESP32-S3 GPIO
    // matrix can route I2S to these pins; keeping the microphone on its separate
    // 39/40/41 trio also lets both audio devices coexist.
    peripheralPins: {
      inmp441: { wsLrclk: 39, sckBclk: 40, sdDout: 41 },
      max98357: { bclk: 17, lrc: 18, din: 16 },
    },
    pinAnchors: GENERIC_N16R8_PIN_ANCHORS,
    pins: GENERIC_N16R8_PINS,
  },
  {
    id: 'espressif-esp32-s3-devkitc-1',
    label: 'Espressif ESP32-S3-DevKitC-1',
    manufacturer: 'Espressif',
    model: 'ESP32-S3-DevKitC-1',
    revision: 'v1.1, ESP32-S3-WROOM-1-N8R8',
    targetFamilies: ['esp32-s3'],
    compatibleFqbns: ['esp32:esp32:esp32s3'],
    // Espressif's v1.1 mechanical drawing: 25.40 mm wide, 62.74 mm to the
    // connector mounting edge. The previous 54 x 28 matched no revision and
    // would have mis-sized the board on a true-relative-scale diagram.
    dimensionsMm: { width: 62.74, height: 25.4 },
    confidence: 'manufacturer-verified',
    internalRamBudgetBytes: ESP32_S3_RAM_BUDGET_BYTES,
    moduleSilk: 'ESP32-S3-WROOM-1',
    previewSvg: boardSvg('Espressif DevKitC-1', '#58d68d', 'USB', 'Manufacturer verified'),
    notes: [
      'Use the exact DevKitC-1 revision and memory variant when reviewing available pins.',
      'The official header tables expose both direct power pins and USB-powered entry paths.',
      'Header order and visible aliases were cross-checked against the user-supplied USB-down ESP32-S3-DevKitC-1 pinout reference.',
    ],
    caveats: [],
    sourceSummary: 'Official board family documentation reviewed for pinout and power-path expectations.',
    pinAnchors: DEVKITC_PIN_ANCHORS,
    pins: DEVKITC_PINS,
  },
  {
    id: 'esp32-generic-devkit-38pin',
    label: 'Generic ESP32 DevKit, 38-pin',
    manufacturer: 'Generic / NodeMCU-32S style',
    model: 'ESP32-WROOM-32 development board',
    revision: '38-pin generic layout',
    targetFamilies: ['esp32'],
    compatibleFqbns: ['esp32:esp32:esp32', 'esp32:esp32:nodemcu-32s'],
    dimensionsMm: { width: 55, height: 28 },
    confidence: 'pinout-verified',
    internalRamBudgetBytes: CLASSIC_ESP32_RAM_BUDGET_BYTES,
    moduleSilk: 'ESP32-WROOM-32',
    previewSvg: boardSvg('Generic ESP32 38-pin', '#8ad0ff', 'USB-C', 'Pinout verified'),
    notes: [
      'Two 19-pin rails. Unlike the 30-pin board this layout brings GPIO6-GPIO11 out to the header, but they are wired to the module SPI flash and cannot be used.',
      'GPIO34-36 and GPIO39 are input-only with no internal pull resistor - they cannot drive LED data.',
      'The 3V3 rail comes off the on-board regulator and is not a supply for LED strips; feed strips from your own 5 V supply and share ground.',
    ],
    caveats: [
      'Component placement varies between sellers under this layout; the header order and dimensions are the verified part.',
      'Regulator headroom, VIN backfeed protection, and USB power sharing are unverified on generic clones of this board.',
    ],
    sourceSummary: 'Header order and dimensions taken from the board render package; component placement treated as seller-variable.',
    pinAnchors: DEVKIT38_PIN_ANCHORS,
    pins: DEVKIT38_PINS,
  },
  {
    id: 'esp32-devkit-v1-30pin-esp32d',
    label: 'ESP32 DevKit v1, 30-pin (ESP-32D)',
    manufacturer: 'DOIT / generic',
    model: 'ESP32-WROOM-32D',
    revision: '30-pin DevKit v1',
    targetFamilies: ['esp32'],
    compatibleFqbns: ['esp32:esp32:esp32doit-devkit-v1', 'esp32:esp32:esp32'],
    dimensionsMm: { width: 51.5, height: 28.5 },
    confidence: 'pinout-verified',
    internalRamBudgetBytes: CLASSIC_ESP32_RAM_BUDGET_BYTES,
    previewSvg: boardSvg('ESP32 DevKit v1 (ESP-32D)', '#7ee2cf', 'USB', 'Pinout verified'),
    notes: [
      'Two 15-pin rails; GPIO0 has no header pad, so the BOOT button is its only connection.',
      'GPIO34-36 and GPIO39 are input-only with no internal pull resistor — they cannot drive LED data.',
      'The 3V3 rail comes off the on-board regulator and is not a supply for LED strips; feed strips from your own 5 V supply and share ground.',
    ],
    caveats: [
      'Regulator headroom, VIN backfeed protection, and USB power sharing are unverified on generic clones of this board.',
      'Header map read from the user-supplied ESP-32D pinout image and confirmed against the physical board\'s 15 + 15 rails.',
    ],
    sourceSummary: 'Header order taken from the user-supplied ESP-32D pinout image; pin count confirmed against the physical board.',
    /*
     * Hardware-validated on this board, 2026-08-18: BCLK 27, LRC 26, DIN 25,
     * checked pad-to-pin with a meter and confirmed by a clean 440 Hz tone
     * through a MAX98357A on exactly these pins.
     *
     * The generated data carries no amp pinout for this board at all, and the
     * 38-pin profiles carry 27/14/22 — which is what an amplifier here
     * inherited when the board changed, GPIO14 included, a pad this board's own
     * safety map flags. Measured pins beat imported ones (`hand-authored pin
     * maps win`, see the generated file's header).
     *
     * GPIO25/26 are also this chip's DAC pins. Not a conflict: one Amplifier is
     * either an I2S module or an analog one taking line level from that DAC,
     * never both at once.
     */
    peripheralPins: { max98357: { bclk: 27, lrc: 26, din: 25 } },
    pinAnchors: ESP32D_PIN_ANCHORS,
    pins: ESP32D_PINS,
  },
  {
    id: 'lolin-s3-40pin-dual-usbc',
    label: 'LOLIN S3, 40-pin dual USB-C',
    manufacturer: 'WEMOS / LOLIN',
    model: 'LOLIN S3 (ESP32-S3-WROOM-1 N16R8)',
    revision: '40-pin dual USB-C',
    targetFamilies: ['esp32-s3'],
    compatibleFqbns: ['esp32:esp32:esp32s3'],
    dimensionsMm: { width: 70, height: 25.4 },
    confidence: 'pinout-verified',
    // N16R8 is the module part number: 16MB flash, 8MB octal PSRAM.
    // Recorded because the generic `esp32:esp32:esp32s3` FQBN resolves to
    // PlatformIO's stock DevKitC-1 id, whose manifest is the *N8* variant —
    // so without this the build, and the capacity meter reading it, target
    // 8MB on a 16MB part. Confirmed on the bench with esptool.
    memory: { flashMb: 16, psramMb: 8 },
    internalRamBudgetBytes: ESP32_S3_RAM_BUDGET_BYTES,
    psramMode: 'opi',
    moduleSilk: 'ESP32-S3-WROOM',
    previewSvg: boardSvg('LOLIN S3', '#c9a0ff', 'USB-C', 'Pinout verified'),
    notes: [
      'Two 20-pin rails with two USB-C ports: OTG on the left, UART on the right.',
      'GPIO35, GPIO36 and GPIO37 are not on the header at all - octal PSRAM uses them on N16R8 modules.',
      'GPIO46 is input-only with no internal pull resistor, so it cannot drive LED data.',
    ],
    caveats: [
      'Not hardware-validated by this project. The header order comes from the board model rather than a board in hand.',
    ],
    sourceSummary: 'Rail order read from the board model silkscreen; pad geometry projected from the model through its render camera.',
    pinAnchors: LOLIN_S3_PIN_ANCHORS,
    pins: LOLIN_S3_PINS,
  },
  {
    id: 'seeed-xiao-esp32s3',
    label: 'Seeed Studio XIAO ESP32S3',
    manufacturer: 'Seeed Studio',
    model: 'XIAO ESP32S3',
    revision: 'manufacturer profile',
    targetFamilies: ['esp32-s3'],
    compatibleFqbns: ['esp32:esp32:esp32s3'],
    // Seeed's figures: 21.0 mm along the rails, 17.8 mm across them.
    dimensionsMm: { width: 21, height: 17.8 },
    confidence: 'manufacturer-verified',
    internalRamBudgetBytes: ESP32_S3_RAM_BUDGET_BYTES,
    moduleSilk: 'ESP32-S3',
    previewSvg: boardSvg('Seeed XIAO ESP32S3', '#7aa2ff', 'USB-C', 'Compact layout'),
    notes: [
      'Compact board geometry changes cable clearances and connector access in tight installations.',
      'GPIO41 and GPIO42 are available through the compact expansion pads used by the Sense microphone path.',
    ],
    caveats: [],
    sourceSummary: 'Official board family documentation reviewed for the compact pinout and power entry.',
    pinAnchors: XIAO_PIN_ANCHORS,
    pins: XIAO_PINS,
  },
  {
    id: 'esp32-c3-super-mini',
    label: 'ESP32-C3 Super Mini',
    manufacturer: 'Generic multi-vendor clone family',
    model: 'ESP32-C3 Super Mini',
    revision: 'Common 18 x 22.52 mm ceramic-antenna layout',
    targetFamilies: ['esp32-c3'],
    compatibleFqbns: ['esp32:esp32:esp32c3'],
    dimensionsMm: { width: 18, height: 22.52 },
    confidence: 'pinout-verified',
    moduleSilk: 'ESP32-C3FN4',
    previewSvg: boardSvg('ESP32-C3 Super Mini', '#7ee2cf', 'USB-C', 'Pinout verified'),
    notes: [
      '5V, GND and 3V3 are the three left pads beside the USB-C connector.',
      'GPIO18 and GPIO19 carry native USB and are not on either rail.',
    ],
    caveats: [
      'Not hardware-validated by this project. Sellers change the regulator, antenna, LED polarity and silkscreen under this name.',
    ],
    sourceSummary: 'Rail order checked against a photographed board and the common underside pinout turned over; dimensions from the Super Mini manual.',
    pinAnchors: C3_SUPER_MINI_PIN_ANCHORS,
    pins: C3_SUPER_MINI_PINS,
  },
  {
    id: 'esp32-c6-devkitc-1',
    label: 'Espressif ESP32-C6-DevKitC-1',
    manufacturer: 'Espressif',
    model: 'ESP32-C6-DevKitC-1',
    revision: 'v1.2 carrier, ESP32-C6-WROOM-1 module',
    targetFamilies: ['esp32-c6'],
    compatibleFqbns: ['esp32:esp32:esp32c6'],
    dimensionsMm: { width: 25.4, height: 51.8 },
    confidence: 'manufacturer-verified',
    moduleSilk: 'ESP32-C6-WROOM-1',
    previewSvg: boardSvg('ESP32-C6-DevKitC-1', '#58d68d', 'USB-C', 'Manufacturer verified'),
    notes: [
      'Two USB-C ports: UART through the USB-to-UART bridge on the left, native USB on GPIO12 and GPIO13 on the right.',
      'Power it from one source only: a USB port, the 5V and GND pins, or the 3V3 and GND pins.',
    ],
    caveats: [],
    sourceSummary: "Espressif's user guide header tables, v1.2 mechanical drawing and v1.4 schematic.",
    pinAnchors: C6_DEVKITC_PIN_ANCHORS,
    pins: C6_DEVKITC_PINS,
  },
  {
    id: 'esp8266-lolin-d1-mini',
    label: 'ESP8266 LOLIN D1 Mini',
    manufacturer: 'LOLIN / WEMOS',
    model: 'D1 Mini',
    revision: 'V4.0.0',
    targetFamilies: ['esp8266'],
    compatibleFqbns: ['esp8266:esp8266:d1_mini'],
    // LOLIN's V4.0.0 drawing.
    dimensionsMm: { width: 25.4, height: 34.3 },
    confidence: 'manufacturer-verified',
    moduleSilk: 'ESP8266EX',
    previewSvg: boardSvg('LOLIN D1 Mini', '#8ad0ff', 'USB-C', 'Manufacturer verified'),
    notes: [
      'Arduino pin numbers are GPIO numbers, so D4 is pin 2; the printed D labels are aliases.',
      'The 5V pin is USB VBUS. Do not feed it while USB is plugged in.',
    ],
    caveats: [],
    sourceSummary: "LOLIN's V4.0.0 product page, schematic and dimension drawing.",
    pinAnchors: D1_MINI_PIN_ANCHORS,
    pins: D1_MINI_PINS,
  },
  {
    id: 'raspberry-pi-pico-w',
    label: 'Raspberry Pi Pico W / WH',
    manufacturer: 'Raspberry Pi',
    model: 'Pico W / WH',
    revision: 'RP2040 with CYW43439 wireless',
    targetFamilies: ['rp2040'],
    compatibleFqbns: ['rp2040:rp2040:rpipicow'],
    dimensionsMm: { width: 21, height: 51 },
    confidence: 'manufacturer-verified',
    moduleSilk: 'RP2040',
    previewSvg: boardSvg('Raspberry Pi Pico W', '#70cf63', 'USB', 'Manufacturer verified'),
    notes: [
      'Feed an external 5 V supply into VSYS, not VBUS: the on-board diode keeps it off the USB host.',
      'GP23, GP24, GP25 and GP29 drive the wireless chip and are not on the header.',
    ],
    caveats: [],
    sourceSummary: "Raspberry Pi's Pico W datasheet and pinout.",
    pinAnchors: PICO_W_PIN_ANCHORS,
    pins: PICO_W_PINS,
  },
  {
    id: 'teensy-4-1',
    label: 'Teensy 4.1',
    manufacturer: 'PJRC',
    model: 'Teensy 4.1',
    revision: 'IMXRT1062',
    targetFamilies: ['teensy'],
    compatibleFqbns: ['teensy:avr:teensy41'],
    dimensionsMm: { width: 17.78, height: 60.96 },
    confidence: 'manufacturer-verified',
    moduleSilk: 'IMXRT1062',
    previewSvg: boardSvg('Teensy 4.1', '#7aa2ff', 'USB', 'Manufacturer verified'),
    notes: [
      'Signals are 3.3 V and are not 5 V tolerant.',
      'VIN and USB 5 V are joined until the pads between them on the underside are cut.',
      'The underside pads, the Ethernet header and the USB host header are not drawn.',
    ],
    caveats: [],
    sourceSummary: "PJRC's Teensy 4.1 pinout card and product page.",
    pinAnchors: TEENSY_41_PIN_ANCHORS,
    pins: TEENSY_41_PINS,
  },
  {
    id: 'arduino-nano-esp32',
    label: 'Arduino Nano ESP32',
    manufacturer: 'Arduino',
    model: 'Nano ESP32 (ABX00083)',
    revision: 'u-blox NORA-W106-10B, USB-C',
    targetFamilies: ['esp32-s3'],
    compatibleFqbns: ['esp32:esp32:nano_nora'],
    dimensionsMm: { width: 18, height: 45 },
    confidence: 'manufacturer-verified',
    // NORA-W106-10B: 8 MB octal PSRAM in the module, 16 MB GD25B128 flash on
    // the board. The board definition enables the PSRAM without a menu.
    memory: { flashMb: 16, psramMb: 8 },
    internalRamBudgetBytes: ESP32_S3_RAM_BUDGET_BYTES,
    psramMode: 'opi',
    moduleSilk: 'NORA-W106',
    previewSvg: boardSvg('Arduino Nano ESP32', '#4fc3c8', 'USB-C', 'Manufacturer verified'),
    notes: [
      'Printed D and A numbers are aliases: Studio builds with GPIO numbering, so D6 is GPIO9.',
      'Serial is the USB port; D0 and D1 are a free UART.',
      'VIN takes 6 to 21 V into the on-board buck. There is no 5 V input, and VBUS carries USB 5 V only while USB is connected.',
    ],
    caveats: [],
    sourceSummary: "Arduino's ABX00083 datasheet, top-view pinout and the core's pins_arduino.h.",
    pinAnchors: NANO_ESP32_PIN_ANCHORS,
    pins: NANO_ESP32_PINS,
  },
  {
    id: 'wt32-eth01',
    label: 'WT32-ETH01',
    manufacturer: 'Wireless-Tag',
    model: 'WT32-ETH01',
    revision: 'WT32-S1 module, LAN8720A PHY, RJ45',
    targetFamilies: ['esp32'],
    compatibleFqbns: ['esp32:esp32:wt32-eth01'],
    dimensionsMm: { width: 25, height: 55 },
    confidence: 'manufacturer-verified',
    memory: { flashMb: 4, psramMb: 0 },
    internalRamBudgetBytes: CLASSIC_ESP32_RAM_BUDGET_BYTES,
    moduleSilk: 'WT32-S1',
    hasUsb: false,
    // The core's wt32-eth01 variant: PHY address 1, MDC 23, MDIO 18, and
    // GPIO16 enabling the oscillator whose clock enters on GPIO0.
    onboardEthernet: {
      phy: 'ETH_PHY_LAN8720', phyAddress: 1, mdcPin: 23, mdioPin: 18, powerPin: 16, clockMode: 'ETH_CLOCK_GPIO0_IN',
    },
    previewSvg: boardSvg('WT32-ETH01', '#4fc3c8', 'RJ45', 'Manufacturer verified'),
    notes: [
      'Ethernet is built in: Art-Net and NTP time sync use its RJ45 port and need no Wi-Fi credentials.',
      'There is no USB. Power it through 5V, or 3V3 instead, never both. Flash it through a USB-to-serial adapter on TXD0, RXD0 and GND, holding IO0 to GND at reset.',
      'IO35, IO36 and IO39 are input-only. IO0 carries the Ethernet clock and is for flashing only.',
    ],
    caveats: [],
    sourceSummary: "Wireless-Tag's WT32-ETH01 datasheet V1.1 and pinout drawing, and the core's wt32-eth01 variant.",
    pinAnchors: WT32_ETH01_PIN_ANCHORS,
    pins: WT32_ETH01_PINS,
  },
  {
    id: 'quinled-dig-uno',
    label: 'QuinLED Dig-Uno v3.1',
    manufacturer: 'Intermittent Technology',
    model: 'QuinLED Dig-Uno',
    revision: 'Pre-assembled v3.1 with socketed QuinLED-ESP32',
    targetFamilies: ['esp32'],
    compatibleFqbns: ['esp32:esp32:esp32'],
    dimensionsMm: { width: 48.523, height: 39.37 },
    confidence: 'manufacturer-verified',
    memory: { flashMb: 4, psramMb: 0 },
    internalRamBudgetBytes: CLASSIC_ESP32_RAM_BUDGET_BYTES,
    moduleSilk: 'QuinLED-ESP32',
    previewSvg: boardSvg('QuinLED Dig-Uno', '#8c72d6', 'USB-C', 'Manufacturer verified'),
    notes: [
      'LED1 is GPIO16 and LED2 is GPIO3. Both terminal outputs are level-shifted to about 5.12 V and cannot be inputs.',
      'Feed 5-24 V through VIN. LED V+ passes that input voltage through the onboard fuse; match it to the LEDs.',
      'Q1-Q4, Button, A0, 1-wire and the GPIO21/GPIO22 I2C bus remain exposed on headers.',
    ],
    caveats: [
      'This profile covers the base pre-assembled v3.1 board with a standard QuinLED-ESP32, not the AE+ expansion or Ethernet variant.',
    ],
    sourceSummary: "QuinLED's v3/v3.1 pinout, dimension drawing, pre-assembled specifications and firmware profile.",
    pinAnchors: QUINLED_DIG_UNO_PIN_ANCHORS,
    pins: QUINLED_DIG_UNO_PINS,
  },
  {
    id: 'quinled-dig-quad',
    label: 'QuinLED Dig-Quad v3.1',
    manufacturer: 'Intermittent Technology',
    model: 'QuinLED Dig-Quad',
    revision: 'Pre-assembled v3.1 with socketed QuinLED-ESP32',
    targetFamilies: ['esp32'],
    compatibleFqbns: ['esp32:esp32:esp32'],
    dimensionsMm: { width: 100.394, height: 48.209 },
    confidence: 'manufacturer-verified',
    memory: { flashMb: 4, psramMb: 0 },
    internalRamBudgetBytes: CLASSIC_ESP32_RAM_BUDGET_BYTES,
    moduleSilk: 'QuinLED-ESP32',
    previewSvg: boardSvg('QuinLED Dig-Quad', '#8c72d6', 'USB-C', 'Manufacturer verified'),
    notes: [
      'LED1-LED4 are GPIO16, GPIO3, GPIO1 and GPIO4. All four terminal outputs are level-shifted to about 5.12 V and cannot be inputs.',
      'Feed 5-24 V through the dual high-current input. Seven V+ and seven GND outputs distribute power through five ATO fuses; match input voltage to the LEDs.',
      'Q1-Q4, Button, A0, 1-wire and the GPIO21/GPIO22 I2C bus remain exposed. Q1 also drives the separate level-shifted Q1R relay output.',
    ],
    caveats: [
      'This profile covers the base pre-assembled v3.1 board with a standard QuinLED-ESP32, not an Ethernet or antenna expansion variant.',
    ],
    sourceSummary: "QuinLED's v3/v3.1 pinout, dimension drawing, pre-assembled specifications and front render.",
    pinAnchors: QUINLED_DIG_QUAD_PIN_ANCHORS,
    pins: QUINLED_DIG_QUAD_PINS,
  },
  {
    id: 'adafruit-sparkle-motion',
    label: 'Adafruit Sparkle Motion',
    manufacturer: 'Adafruit',
    model: 'Sparkle Motion',
    revision: 'PID 6100, ESP32-MINI-1, PCB antenna',
    targetFamilies: ['esp32'],
    compatibleFqbns: ['esp32:esp32:esp32'],
    // Eagle dimension layer of Adafruit's published board file. The shop page's
    // 33 by 45 mm is the short marketing figure.
    dimensionsMm: { width: 50.8, height: 33.147 },
    confidence: 'manufacturer-verified',
    memory: { flashMb: 4, psramMb: 0 },
    internalRamBudgetBytes: CLASSIC_ESP32_RAM_BUDGET_BYTES,
    processor: 'ESP32-MINI-1',
    moduleSilk: 'ESP32-MINI-1',
    previewSvg: boardSvg('Sparkle Motion', '#e85d4c', 'USB-C', 'Manufacturer verified'),
    notes: [
      'SIG1 to SIG4 are GPIO21, GPIO22, GPIO19 and GPIO23. All four are 5 V outputs through a 74LVC2G34 and cannot be inputs.',
      'Feed 5-24 V from the barrel jack or from USB-C PD. The slide switch selects 5, 12 or 20 V. The + terminals pass that voltage through a 5 A fuse.',
      'STEMMA QT is SDA GPIO14 and SCL GPIO13. The HUSB238 power-delivery chip sits on that bus at 0x08.',
      'The onboard ICS-43434 microphone, IR receiver, NeoPixel and boot button are soldered to the board and are not header pads.',
    ],
    caveats: [
      'This profile is the PCB-antenna board, product 6100. The external-antenna board 6167 uses the same pinout.',
      'On macOS, plug in through a hub and a USB-A to USB-C cable. A direct USB-C port treats the board as a power-delivery device and the serial port does not appear.',
      'The Build Diagram uses the generic schematic until a measured render exists, so wires do not land on the real terminals.',
    ],
    sourceSummary: "Adafruit's PID 6100 schematic, learn-guide pinout and Eagle board outline.",
    peripheralPins: {
      inmp441: { wsLrclk: 27, sckBclk: 18, sdDout: 9 },
      fastLedData: {
        recommendedDefault: 21,
        commonAlternatives: [22, 19, 23],
        selectionNote: 'SIG1 to SIG4 are the four 5 V level-shifted LED outputs: GPIO21, GPIO22, GPIO19 and GPIO23.',
      },
    },
    pinAnchors: SPARKLE_MOTION_PIN_ANCHORS,
    pins: SPARKLE_MOTION_PINS,
  },
  {
    id: 'adafruit-sparkle-motion-mini',
    label: 'Adafruit Sparkle Motion Mini',
    manufacturer: 'Adafruit',
    model: 'Sparkle Motion Mini',
    revision: 'PID 6160, ESP32-MINI-1',
    targetFamilies: ['esp32'],
    compatibleFqbns: ['esp32:esp32:esp32'],
    // Eagle dimension layer. The shop page's 31.6 by 19.8 by 7.3 mm includes
    // the USB-C shell; the PCB outline is 30.48 by 19.749 mm.
    dimensionsMm: { width: 30.48, height: 19.749 },
    confidence: 'manufacturer-verified',
    memory: { flashMb: 4, psramMb: 0 },
    internalRamBudgetBytes: CLASSIC_ESP32_RAM_BUDGET_BYTES,
    processor: 'ESP32-MINI-1',
    moduleSilk: 'ESP32-MINI-1',
    previewSvg: boardSvg('Sparkle Motion Mini', '#e85d4c', 'USB-C', 'Manufacturer verified'),
    notes: [
      'The two LED pads are GPIO32 and GPIO33, level-shifted to 5 V. They cannot be inputs.',
      'Power comes from USB-C only, rated 5 V at 4 A through a resetting fuse. The 5 V pad feeds the LEDs from that rail.',
      'STEMMA QT is SDA GPIO19 and SCL GPIO22.',
      'The onboard ICS-43434 microphone, NeoPixel and boot button are soldered to the board and are not header pads.',
    ],
    caveats: [
      'This profile is product 6160, without a terminal block fitted. Product 6314 is the same board with the 4-pin block soldered on.',
      'The Build Diagram uses the generic schematic until a measured render exists, so wires do not land on the real terminals.',
    ],
    sourceSummary: "Adafruit's PID 6160 schematic, learn-guide pinout and Eagle board outline.",
    peripheralPins: {
      inmp441: { wsLrclk: 14, sckBclk: 27, sdDout: 25 },
      fastLedData: {
        recommendedDefault: 32,
        commonAlternatives: [33],
        selectionNote: 'GPIO32 and GPIO33 are the two 5 V level-shifted LED pads.',
      },
    },
    pinAnchors: SPARKLE_MOTION_MINI_PIN_ANCHORS,
    pins: SPARKLE_MOTION_MINI_PINS,
  },
]

/**
 * The authored profiles with imported capability data merged on.
 *
 * The authored side wins for anything it declares: its pin maps and anchors are
 * hand-checked, test-covered, and for several boards confirmed against a board
 * in hand, so the import adds capability data rather than overwriting geometry.
 * Capability data for an id with no authored profile is ignored — a render and
 * a pin-safety list are not enough to build a usable profile without the pin
 * map, so those boards wait until one is authored.
 */
/**
 * Curated peripheral pinouts that land on the board's own I2C bus, dropped.
 *
 * The importer already keeps the curated set disjoint — it prefers the
 * microphone and discards an amplifier or LED default that overlaps it — but
 * it cannot see `BOARD_I2C_DEFAULTS`, which lives here rather than in the
 * board manifests. So a trio could be curated onto SDA or SCL, and the
 * generic 38-pin DevKit's was: MAX98357 DIN on GPIO 22, which is that board's
 * SCL. Fine alone, and refused by pin validation the moment any I2C part is
 * present — an OLED, or the DS3231 the app also ships.
 *
 * Dropping the whole entry rather than moving one pin is the same answer the
 * importer gives for the microphone overlap, and it is the right one: with no
 * curated pinout, `PART_PIN_PLANS.Amplifier` falls through to three plain
 * digital lines from the pool, which its own comment already calls the honest
 * request. ESP32 I2S routes through the GPIO matrix, so a curated trio is a
 * tidy suggestion, never a hardware constraint.
 *
 * The amplifier only, because that is where the importer's own precedence
 * already puts the cost: it prefers the microphone and discards whatever
 * overlaps it. Treating the board's bus as claimed *before* the amplifier
 * extends that same order by one claim rather than inventing a new policy —
 * and a curated microphone stays curated, since a board with no I2C part on it
 * has nothing to collide with.
 */
function withoutI2cBusCollisions(
  profileId: string,
  pins: BoardPeripheralPins | undefined,
): BoardPeripheralPins | undefined {
  if (!pins) return pins
  const bus = boardI2cDefault(profileId)
  if (!bus) return pins
  const busPins = new Set([bus.sda.arduinoPin, bus.scl.arduinoPin])
  const collides = (entry: Record<string, number> | undefined) =>
    !!entry && Object.values(entry).some((pin) => busPins.has(pin))
  if (!collides(pins.max98357)) return pins
  const kept = { ...pins }
  delete kept.max98357
  return kept
}

const MERGED_AUTHORED: PhysicalBoardProfile[] = AUTHORED_PROFILES.map((profile) => {
  const imported: BoardCapabilityData | undefined = BOARD_CAPABILITY_DATA[profile.id]
  const authored = boardPinSafetyOverride(profile.id)
  if (!imported && !authored) return profile
  return {
    ...profile,
    processor: profile.processor ?? imported?.processor,
    memory: profile.memory ?? imported?.memory,
    internalRamBudgetBytes: profile.internalRamBudgetBytes
      ?? authored?.internalRamBudgetBytes ?? imported?.internalRamBudgetBytes,
    pinSafety: profile.pinSafety ?? authored?.pinSafety ?? imported?.pinSafety,
    peripheralPins: withoutI2cBusCollisions(profile.id, profile.peripheralPins ?? imported?.peripheralPins),
    render: profile.render ?? imported?.render,
    safetyNotes: profile.safetyNotes ?? authored?.safetyNotes ?? imported?.safetyNotes,
  }
})

/**
 * Generated profiles for boards nobody has authored a profile for, appended
 * after the authored ones so an authored profile always wins on id collision.
 *
 * `targetFamilies` is derived here rather than in the generator so it stays in
 * lockstep with every other consumer of `targetFamilyFromFqbn`, and the preview
 * SVG is the same placeholder the authored profiles use — the imported render
 * is a separate, richer asset shown by the pinout view. Sparse source pin maps
 * remain sparse: unresolved labels have no GPIO number and stay neutral.
 */
const IMPORTED_PROFILES: PhysicalBoardProfile[] = GENERATED_BOARD_PROFILES
  .filter((generated) => !AUTHORED_PROFILES.some((p) => p.id === generated.id))
  .map((generated) => {
    const families = [...new Set(generated.compatibleFqbns.map(targetFamilyFromFqbn))]
    const capability: BoardCapabilityData = BOARD_CAPABILITY_DATA[generated.id] ?? {}
    const authored = boardPinSafetyOverride(generated.id)
    return {
      ...generated,
      targetFamilies: families,
      // Imported maps have not been checked against a board in hand, and the
      // caveat the generator attaches says so.
      confidence: 'visual-match-only' as BoardProfileConfidence,
      previewSvg: boardSvg(generated.label, '#7aa2ff', 'USB', 'Imported'),
      pinAnchors: generated.pinAnchors as PhysicalBoardPinAnchor[],
      pins: generated.pins as PhysicalBoardPinProfile[],
      processor: capability.processor,
      memory: capability.memory,
      internalRamBudgetBytes: authored?.internalRamBudgetBytes ?? capability.internalRamBudgetBytes,
      pinSafety: authored?.pinSafety ?? capability.pinSafety,
      peripheralPins: withoutI2cBusCollisions(generated.id, capability.peripheralPins),
      render: capability.render,
      safetyNotes: authored?.safetyNotes ?? capability.safetyNotes,
    }
  })

/** Imported board ids that have no profile at all — no authored map, no usable generated one. */
export const UNMAPPED_CAPABILITY_IDS: string[] = Object.keys(BOARD_CAPABILITY_DATA)
  .filter((id) => !AUTHORED_PROFILES.some((p) => p.id === id))
  .filter((id) => !IMPORTED_PROFILES.some((p) => p.id === id))
  .sort()

export const BOARD_PROFILES: PhysicalBoardProfile[] = [...MERGED_AUTHORED, ...IMPORTED_PROFILES]

export interface BoardProfileFamily {
  id: string
  label: string
}

const BOARD_PROFILE_FAMILY_DEFINITIONS: readonly BoardProfileFamily[] = [
  { id: 'esp32', label: 'ESP32' },
  { id: 'esp32-s2', label: 'ESP32-S2' },
  { id: 'esp32-s3', label: 'ESP32-S3' },
  { id: 'esp32-c3', label: 'ESP32-C3' },
  { id: 'esp32-c6', label: 'ESP32-C6' },
  { id: 'esp32-h2', label: 'ESP32-H2' },
  { id: 'esp8266', label: 'ESP8266' },
  { id: 'teensy', label: 'Teensy' },
  { id: 'rp', label: 'RP2040 / RP2350' },
  { id: 'samd', label: 'SAMD' },
  { id: 'stm32', label: 'STM32' },
  { id: 'avr', label: 'Arduino AVR / megaAVR' },
  { id: 'sam', label: 'Arduino SAM' },
  { id: 'renesas', label: 'Arduino Renesas' },
  { id: 'nrf52', label: 'nRF52' },
  { id: 'other', label: 'Other' },
]

const ESP32_VARIANT_FAMILY_IDS: readonly BuildTargetFamily[] = [
  'esp32-s2',
  'esp32-s3',
  'esp32-c3',
  'esp32-c6',
  'esp32-h2',
]

/** Controller family used by the Board node's first selector. ESP32 variants
 * stay separate because their pinouts and peripheral capabilities differ. */
export function boardProfileFamilyId(profile: PhysicalBoardProfile): string {
  const fqbn = profile.compatibleFqbns[0]?.toLowerCase() ?? ''
  if (fqbn.startsWith('esp32:')) {
    return ESP32_VARIANT_FAMILY_IDS.find((family) => profile.targetFamilies.includes(family)) ?? 'esp32'
  }
  if (fqbn.startsWith('esp8266:')) return 'esp8266'
  if (fqbn.startsWith('teensy:')) return 'teensy'
  if (fqbn.startsWith('rp2040:') || fqbn.includes('nanorp2040')) return 'rp'
  if (fqbn.startsWith('stmicroelectronics:stm32:')) return 'stm32'
  if (fqbn.includes(':samd:')) return 'samd'
  if (fqbn.includes(':sam:')) return 'sam'
  if (fqbn.includes('renesas_uno')) return 'renesas'
  if (fqbn.includes(':nrf52:') || fqbn.includes('nrf52840') || fqbn.includes('nano33ble')) return 'nrf52'
  if (fqbn.includes(':avr:') || fqbn.includes(':megaavr:')) return 'avr'
  return 'other'
}

/** Only expose families that currently contain at least one physical board. */
export const BOARD_PROFILE_FAMILIES: readonly BoardProfileFamily[] =
  BOARD_PROFILE_FAMILY_DEFINITIONS.filter((family) =>
    BOARD_PROFILES.some((profile) => boardProfileFamilyId(profile) === family.id))

export function boardProfilesForFamily(familyId: string): PhysicalBoardProfile[] {
  return BOARD_PROFILES.filter((profile) => boardProfileFamilyId(profile) === familyId)
}

/**
 * Profiles that bring out header pins but can give no positive pin advice for
 * them — a data gap to fill upstream in the board asset, or in
 * `boardPinSafetyOverrides.ts` when the asset cannot carry it.
 *
 * Two shapes of gap, and the second one hid for as long as it existed: a
 * profile whose safety data lists no known-good pin, and a profile carrying no
 * safety data *at all*. Only the first was reported, so the CYD — the one
 * board in the catalogue whose package has no `pinSafetySummary` — read as
 * complete while `assignPartPins` silently fell through to the chip-level GPIO
 * table and offered pins the board does not bring out.
 */
export function lacksPinAdvice(profile: PhysicalBoardProfile): boolean {
  // A board such as MatrixPortal can intentionally expose no general-purpose
  // header rail. An empty allowlist is complete data in that case, not a gap.
  if ((profile.pins?.length ?? 0) === 0) return false
  return !profile.pinSafety || profile.pinSafety.safeGeneralPurpose.length === 0
}

export const UNLISTED_SAFETY_IDS: string[] = BOARD_PROFILES
  .filter(lacksPinAdvice)
  .map((p) => p.id)
  .sort()

export function boardProfileById(id: string): PhysicalBoardProfile | undefined {
  return BOARD_PROFILES.find((profile) => profile.id === id)
}

/**
 * The module's flash size in MB, when the chosen board profile records one.
 *
 * `undefined` means "nothing recorded" — the build then uses the PlatformIO
 * board id's own manifest, which is what every board without a documented
 * module size has always done. Never guessed: telling an N8 part it has 16MB
 * produces an image it cannot boot.
 */
export function selectedBoardFlashMb(nodes: readonly {
  data: { nodeType: string; properties: Record<string, unknown> }
}[]): number | undefined {
  return selectedPhysicalBoardProfile(nodes)?.memory?.flashMb
}

export interface BoardSelectionResolution {
  kind: 'stock' | 'custom' | 'none'
  profile?: PhysicalBoardProfile
  /** Always empty for a stock board. A custom board with definition issues
   *  may have no profile; it never falls back to another board. */
  issues: CustomBoardIssue[]
}

const NO_BOARD: BoardSelectionResolution = { kind: 'none', issues: [] }

/** Resolve a Board node's properties to the stock or project-custom board. */
export function resolveBoardSelection(properties: Record<string, unknown>): BoardSelectionResolution {
  const profileId = properties.profileId
  if (profileId === CUSTOM_BOARD_PROFILE_ID) {
    return { kind: 'custom', ...resolveCustomBoard(properties.customBoard, boardProfileById) }
  }
  if (typeof profileId !== 'string' || !profileId) return NO_BOARD
  return { kind: 'stock', profile: boardProfileById(profileId), issues: [] }
}

export function selectedBoardResolution(nodes: readonly {
  data: { nodeType?: unknown; properties?: unknown }
}[]): BoardSelectionResolution {
  const board = nodes.find((node) => node.data.nodeType === 'Board')
  const properties = board?.data.properties
  if (!properties || typeof properties !== 'object') return NO_BOARD
  return resolveBoardSelection(properties as Record<string, unknown>)
}

/** The board chosen on the active graph: a stock profile or the project's
 *  custom board, resolved. Stable for unchanged Board properties, so it is
 *  safe inside store selectors. */
export function selectedPhysicalBoardProfile(nodes: readonly {
  data: { nodeType?: unknown; properties?: unknown }
}[]): PhysicalBoardProfile | undefined {
  return selectedBoardResolution(nodes).profile
}

export function compatibleBoardProfilesForFqbn(fqbn: string): PhysicalBoardProfile[] {
  const targetFamily = targetFamilyFromFqbn(fqbn)
  return BOARD_PROFILES.filter((profile) =>
    profile.compatibleFqbns.includes(fqbn) || profile.targetFamilies.includes(targetFamily))
}

export function isBoardProfileCompatibleWithFqbn(profileId: string | undefined, fqbn: string): boolean {
  const profile = profileId ? boardProfileById(profileId) : undefined
  return !!profile && boardProfileMatchesFqbn(profile, fqbn)
}

/** Whether a resolved profile (stock or custom) builds for this upload target. */
export function boardProfileMatchesFqbn(profile: PhysicalBoardProfile, fqbn: string): boolean {
  if (profile.compatibleFqbns.includes(fqbn)) return true
  return profile.targetFamilies.includes(targetFamilyFromFqbn(fqbn))
}

/** What the board's pin data rests on, for printed and exported records. A
 *  custom board is the user's own schematic and never claims verification. */
export function boardDataProvenance(profile: PhysicalBoardProfile): string {
  return profile.custom
    ? `${profile.sourceSummary}; build settings from ${profile.custom.referenceLabel}`
    : profile.confidence.replace(/-/g, ' ')
}

export function boardPinForGpio(
  profile: PhysicalBoardProfile | undefined,
  gpio: number,
): PhysicalBoardPinProfile | undefined {
  return profile?.pins?.find((pin) => pin.gpio === gpio)
}

/**
 * Whether `gpio` is usable on this board, and why not when it isn't.
 *
 * Returns `unknown` — never `safe` — for a profile with no `pinSafety`, so a
 * board that hasn't been imported yet can't be mistaken for one that has been
 * checked. Callers should treat `unknown` as "fall back to chip-level rules".
 */
export function boardPinVerdict(
  profile: PhysicalBoardProfile | undefined,
  gpio: number,
): BoardPinVerdict {
  const safety = profile?.pinSafety
  if (!safety) return { standing: 'unknown' }
  const reserved = safety.boardReservedOrNotExposed[gpio]
  if (reserved !== undefined) return { standing: 'reserved', reason: reserved }
  const caution = safety.useWithCaution[gpio]
  if (caution !== undefined) return { standing: 'caution', reason: caution }
  if (safety.safeGeneralPurpose.includes(gpio)) return { standing: 'safe' }
  return { standing: 'unknown' }
}

/** Every GPIO this profile names in a peripheral starting point. */
function peripheralPinEntries(pins: BoardPeripheralPins): Array<[string, number]> {
  const entries: Array<[string, number]> = []
  if (pins.inmp441) {
    entries.push(['INMP441 WS', pins.inmp441.wsLrclk])
    entries.push(['INMP441 SCK', pins.inmp441.sckBclk])
    entries.push(['INMP441 SD', pins.inmp441.sdDout])
  }
  if (pins.max98357) {
    entries.push(['MAX98357 BCLK', pins.max98357.bclk])
    entries.push(['MAX98357 LRC', pins.max98357.lrc])
    entries.push(['MAX98357 DIN', pins.max98357.din])
  }
  if (pins.fastLedData) entries.push(['FastLED data', pins.fastLedData.recommendedDefault])
  return entries
}

export function validateBoardProfiles(profiles: PhysicalBoardProfile[] = BOARD_PROFILES): string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  for (const profile of profiles) {
    if (ids.has(profile.id)) issues.push(`Duplicate board profile id "${profile.id}"`)
    ids.add(profile.id)
    if (!profile.previewSvg.trim()) issues.push(`${profile.id}: missing preview SVG`)
    if (profile.compatibleFqbns.length === 0) issues.push(`${profile.id}: missing compatible FQBNs`)
    if (profile.internalRamBudgetBytes !== undefined
      && (!Number.isInteger(profile.internalRamBudgetBytes) || profile.internalRamBudgetBytes <= 0)) {
      issues.push(`${profile.id}: internal RAM budget must be a positive whole number of bytes`)
    }
    for (const fqbn of profile.compatibleFqbns) {
      const family = targetFamilyFromFqbn(fqbn)
      if (!profile.targetFamilies.includes(family)) {
        issues.push(`${profile.id}: FQBN "${fqbn}" does not match target family list`)
      }
    }
    const anchorsById = new Map<string, PhysicalBoardPinAnchor>()
    for (const anchor of profile.pinAnchors ?? []) {
      if (anchorsById.has(anchor.id)) issues.push(`${profile.id}: duplicate pin anchor "${anchor.id}"`)
      anchorsById.set(anchor.id, anchor)
    }
    const pinIds = new Set<string>()
    for (const pin of profile.pins ?? []) {
      if (pinIds.has(pin.id)) issues.push(`${profile.id}: duplicate pin id "${pin.id}"`)
      if (!anchorsById.has(pin.anchorId)) issues.push(`${profile.id}: missing pin anchor "${pin.anchorId}" for pin "${pin.id}"`)
      pinIds.add(pin.id)
    }

    // A pin cannot be both freely usable and unreachable. Left unchecked this
    // reads as "safe" at every call site, which is the exact failure the
    // safety data exists to prevent.
    const safety = profile.pinSafety
    if (safety) {
      const exposedGpios = new Set(
        (profile.pins ?? []).flatMap((pin) => pin.gpio === undefined ? [] : [pin.gpio]))
      for (const gpio of safety.safeGeneralPurpose) {
        if ((profile.pins?.length ?? 0) > 0 && !exposedGpios.has(gpio)) {
          issues.push(`${profile.id}: GPIO${gpio} is marked safe but has no board pin`)
        }
        if (safety.boardReservedOrNotExposed[gpio] !== undefined) {
          issues.push(`${profile.id}: GPIO${gpio} is listed as both safe and board-reserved`)
        }
        if (safety.useWithCaution[gpio] !== undefined) {
          issues.push(`${profile.id}: GPIO${gpio} is listed as both safe and use-with-caution`)
        }
      }
      for (const gpio of Object.keys(safety.useWithCaution).map(Number)) {
        if (safety.boardReservedOrNotExposed[gpio] !== undefined) {
          issues.push(`${profile.id}: GPIO${gpio} is listed as both use-with-caution and board-reserved`)
        }
      }
    }

    // The peripheral starting points are handed out as working defaults, so
    // they have to actually work together on one board.
    if (profile.peripheralPins) {
      const entries = peripheralPinEntries(profile.peripheralPins)
      const seen = new Map<number, string>()
      for (const [role, gpio] of entries) {
        const taken = seen.get(gpio)
        if (taken) {
          issues.push(`${profile.id}: GPIO${gpio} is the starting point for both ${taken} and ${role}`)
        }
        seen.set(gpio, role)
        const verdict = boardPinVerdict(profile, gpio)
        if (verdict.standing === 'reserved') {
          issues.push(`${profile.id}: ${role} starts on GPIO${gpio}, which is board-reserved (${verdict.reason})`)
        }
        // Only meaningful against a real allowlist. Some boards ship a safety
        // section with cautions and reservations but no list of good pins —
        // there is nothing to check "unmentioned" against, and every pin would
        // be flagged. The gap itself is reported by UNLISTED_SAFETY_IDS.
        if (verdict.standing === 'unknown' && (safety?.safeGeneralPurpose.length ?? 0) > 0) {
          issues.push(`${profile.id}: ${role} starts on GPIO${gpio}, which the safety summary does not mention`)
        }
      }
    }
  }
  return issues
}

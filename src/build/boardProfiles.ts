import type { BuildTargetFamily } from './buildProfile'
import { targetFamilyFromFqbn } from './buildProfile'
import { BOARD_CAPABILITY_DATA } from './generated/boardCapabilityData'
import type {
  BoardCapabilityData,
  BoardPeripheralPins,
  BoardPinSafety,
  BoardRenderAsset,
} from './boardCapabilities'

// Re-exported so consumers keep importing board types from this one module.
export type { BoardCapabilityData, BoardPeripheralPins, BoardPinSafety, BoardRenderAsset }

export type BoardProfileConfidence = 'manufacturer-verified' | 'pinout-verified' | 'visual-match-only'
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
  processor?: string
  memory?: { flashMb: number; psramMb: number }
  pinSafety?: BoardPinSafety
  /** Prose safety commentary from the imported manifest. Displayed, never parsed. */
  safetyNotes?: string[]
  peripheralPins?: BoardPeripheralPins
  /** Present once the board has been imported from the Blender asset set;
   *  absent while the profile is still on the generated `previewSvg` placeholder. */
  render?: BoardRenderAsset
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
export const BOARD_PROFILES: PhysicalBoardProfile[] = AUTHORED_PROFILES.map((profile) => {
  const imported: BoardCapabilityData | undefined = BOARD_CAPABILITY_DATA[profile.id]
  if (!imported) return profile
  return {
    ...profile,
    processor: profile.processor ?? imported.processor,
    memory: profile.memory ?? imported.memory,
    pinSafety: profile.pinSafety ?? imported.pinSafety,
    peripheralPins: profile.peripheralPins ?? imported.peripheralPins,
    render: profile.render ?? imported.render,
    safetyNotes: profile.safetyNotes ?? imported.safetyNotes,
  }
})

/** Imported board ids that have no authored profile yet. */
export const UNMAPPED_CAPABILITY_IDS: string[] = Object.keys(BOARD_CAPABILITY_DATA)
  .filter((id) => !AUTHORED_PROFILES.some((profile) => profile.id === id))
  .sort()

/**
 * Profiles whose source manifest carries safety commentary but no list of
 * known-good pins. Their pins all report `unknown`, which is honest but means
 * the board can give no positive pin advice — a data gap to fill upstream in
 * the board asset, not something the app can infer.
 */
export const UNLISTED_SAFETY_IDS: string[] = BOARD_PROFILES
  .filter((p) => p.pinSafety && p.pinSafety.safeGeneralPurpose.length === 0)
  .map((p) => p.id)
  .sort()

export function boardProfileById(id: string): PhysicalBoardProfile | undefined {
  return BOARD_PROFILES.find((profile) => profile.id === id)
}

export function compatibleBoardProfilesForFqbn(fqbn: string): PhysicalBoardProfile[] {
  const targetFamily = targetFamilyFromFqbn(fqbn)
  return BOARD_PROFILES.filter((profile) =>
    profile.compatibleFqbns.includes(fqbn) || profile.targetFamilies.includes(targetFamily))
}

export function isBoardProfileCompatibleWithFqbn(profileId: string | undefined, fqbn: string): boolean {
  if (!profileId) return false
  const profile = boardProfileById(profileId)
  if (!profile) return false
  if (profile.compatibleFqbns.includes(fqbn)) return true
  return profile.targetFamilies.includes(targetFamilyFromFqbn(fqbn))
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
      for (const gpio of safety.safeGeneralPurpose) {
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

import type { BuildTargetFamily } from './buildProfile'
import { targetFamilyFromFqbn } from './buildProfile'

export type BoardProfileConfidence = 'manufacturer-verified' | 'pinout-verified' | 'visual-match-only'
export type BoardPinRole = 'gpio' | 'power-in' | 'power-out' | 'ground' | 'usb' | 'analog' | 'reserved'
export type BoardPinLabelAlign = 'left' | 'right' | 'top' | 'bottom'

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
  previewSvg: string
  notes: string[]
  caveats: string[]
  sourceSummary: string
  pinAnchors?: PhysicalBoardPinAnchor[]
  pins?: PhysicalBoardPinProfile[]
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
  gpio?: number,
  note?: string,
): PhysicalBoardPinProfile {
  return { id, label, role, anchorId, gpio, note }
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
  pin('j1-3', 'RST', 'reserved', 'j1-3', undefined, 'Board reset / EN'),
  pin('j1-4', 'GPIO4', 'gpio', 'j1-4', 4),
  pin('j1-5', 'GPIO5', 'gpio', 'j1-5', 5),
  pin('j1-6', 'GPIO6', 'gpio', 'j1-6', 6),
  pin('j1-7', 'GPIO7', 'gpio', 'j1-7', 7),
  pin('j1-8', 'GPIO15', 'gpio', 'j1-8', 15),
  pin('j1-9', 'GPIO16', 'gpio', 'j1-9', 16),
  pin('j1-10', 'GPIO17', 'gpio', 'j1-10', 17),
  pin('j1-11', 'GPIO18', 'gpio', 'j1-11', 18),
  pin('j1-12', 'GPIO8', 'gpio', 'j1-12', 8),
  pin('j1-13', 'GPIO3', 'gpio', 'j1-13', 3),
  pin('j1-14', 'GPIO46', 'gpio', 'j1-14', 46, 'Input-only / strapping pin'),
  pin('j1-15', 'GPIO9', 'gpio', 'j1-15', 9),
  pin('j1-16', 'GPIO10', 'gpio', 'j1-16', 10),
  pin('j1-17', 'GPIO11', 'gpio', 'j1-17', 11),
  pin('j1-18', 'GPIO12', 'gpio', 'j1-18', 12),
  pin('j1-19', 'GPIO13', 'gpio', 'j1-19', 13),
  pin('j1-20', 'GPIO14', 'gpio', 'j1-20', 14),
  pin('j1-21', '5V', 'power-in', 'j1-21'),
  pin('j1-22', 'GND', 'ground', 'j1-22'),
  pin('j3-1', 'GND', 'ground', 'j3-1'),
  pin('j3-2', 'TX / GPIO43', 'gpio', 'j3-2', 43, 'UART0 TX'),
  pin('j3-3', 'RX / GPIO44', 'gpio', 'j3-3', 44, 'UART0 RX'),
  pin('j3-4', 'GPIO1', 'gpio', 'j3-4', 1),
  pin('j3-5', 'GPIO2', 'gpio', 'j3-5', 2),
  pin('j3-6', 'GPIO42', 'gpio', 'j3-6', 42),
  pin('j3-7', 'GPIO41', 'gpio', 'j3-7', 41),
  pin('j3-8', 'GPIO40', 'gpio', 'j3-8', 40),
  pin('j3-9', 'GPIO39', 'gpio', 'j3-9', 39),
  pin('j3-10', 'GPIO38', 'gpio', 'j3-10', 38),
  pin('j3-11', 'GPIO37', 'gpio', 'j3-11', 37, 'Unavailable on octal flash/PSRAM variants'),
  pin('j3-12', 'GPIO36', 'gpio', 'j3-12', 36, 'Unavailable on octal flash/PSRAM variants'),
  pin('j3-13', 'GPIO35', 'gpio', 'j3-13', 35, 'Unavailable on octal flash/PSRAM variants'),
  pin('j3-14', 'GPIO0', 'gpio', 'j3-14', 0, 'Boot-strapping pin'),
  pin('j3-15', 'GPIO45', 'gpio', 'j3-15', 45, 'Strapping pin'),
  pin('j3-16', 'GPIO48', 'gpio', 'j3-16', 48, 'Also drives the on-board RGB LED'),
  pin('j3-17', 'GPIO47', 'gpio', 'j3-17', 47),
  pin('j3-18', 'GPIO21', 'gpio', 'j3-18', 21),
  pin('j3-19', 'GPIO20', 'gpio', 'j3-19', 20, 'Native USB D+'),
  pin('j3-20', 'GPIO19', 'gpio', 'j3-20', 19, 'Native USB D-'),
  pin('j3-21', 'GND', 'ground', 'j3-21'),
  pin('j3-22', 'GND', 'ground', 'j3-22'),
]

const XIAO_PIN_ANCHORS: PhysicalBoardPinAnchor[] = [
  ...verticalAnchors('left', 'left', ['5V', 'GND', '3V3', 'D0', 'D1', 'D2', 'D3'], 24, 92, 30),
  ...verticalAnchors('right', 'right', ['D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4'], 276, 92, 30),
  { id: 'bottom-1', x: 92, y: 344, labelAlign: 'bottom' },
  { id: 'bottom-2', x: 140, y: 344, labelAlign: 'bottom' },
  { id: 'bottom-3', x: 188, y: 344, labelAlign: 'bottom' },
  { id: 'bottom-4', x: 236, y: 344, labelAlign: 'bottom' },
]

const XIAO_PINS: PhysicalBoardPinProfile[] = [
  pin('left-1', '5V', 'power-in', 'left-1', undefined, 'USB VBUS'),
  pin('left-2', 'GND', 'ground', 'left-2'),
  pin('left-3', '3V3', 'power-out', 'left-3', undefined, 'Regulated 3.3 V output'),
  pin('left-4', 'D0 / GPIO1', 'gpio', 'left-4', 1),
  pin('left-5', 'D1 / GPIO2', 'gpio', 'left-5', 2),
  pin('left-6', 'D2 / GPIO3', 'gpio', 'left-6', 3),
  pin('left-7', 'D3 / GPIO4', 'gpio', 'left-7', 4),
  pin('right-1', 'D10 / GPIO9', 'gpio', 'right-1', 9),
  pin('right-2', 'D9 / GPIO8', 'gpio', 'right-2', 8),
  pin('right-3', 'D8 / GPIO7', 'gpio', 'right-3', 7),
  pin('right-4', 'D7 / GPIO44', 'gpio', 'right-4', 44, 'UART RX'),
  pin('right-5', 'D6 / GPIO43', 'gpio', 'right-5', 43, 'UART TX'),
  pin('right-6', 'D5 / GPIO6', 'gpio', 'right-6', 6, 'I2C SCL'),
  pin('right-7', 'D4 / GPIO5', 'gpio', 'right-7', 5, 'I2C SDA'),
  pin('bottom-1', 'GPIO42 / D11', 'gpio', 'bottom-1', 42, 'Sense expansion / mic CLK'),
  pin('bottom-2', 'GPIO41 / D12', 'gpio', 'bottom-2', 41, 'Sense expansion / mic DATA'),
  pin('bottom-3', 'GPIO40 / MTDO', 'gpio', 'bottom-3', 40),
  pin('bottom-4', 'GPIO39 / MTCK', 'gpio', 'bottom-4', 39),
]

export const BOARD_PROFILES: PhysicalBoardProfile[] = [
  {
    id: 'generic-esp32-s3-n16r8-44pin-dual-usbc',
    label: 'Generic ESP32-S3 N16R8, 44-pin dual USB-C',
    manufacturer: 'Generic / AliExpress',
    model: 'ESP32-S3 N16R8 44-pin dual USB-C',
    revision: 'seller variant 1005008201847680',
    targetFamilies: ['esp32-s3'],
    compatibleFqbns: ['esp32:esp32:esp32s3'],
    dimensionsMm: { width: 53, height: 28 },
    confidence: 'pinout-verified',
    previewSvg: boardSvg('Generic ESP32-S3 N16R8', '#ffd166', 'USB-C', 'Pinout verified'),
    notes: [
      'Use the physical board\'s 5VIN label for controller power discussions in Build Diagram.',
      'GPIO35, GPIO36, and GPIO37 are unavailable because octal PSRAM consumes them on N16R8 modules.',
    ],
    caveats: [
      'USB power sharing, 5VIN backfeed protection, regulator current, and jumper behaviour remain unverified.',
      'This reduced-confidence profile still needs a reviewed physical pin/anchor map before controller-side wiring can be drawn.',
    ],
    sourceSummary: 'Header map reviewed; power-path behaviour still treated as uncertain.',
  },
  {
    id: 'espressif-esp32-s3-devkitc-1',
    label: 'Espressif ESP32-S3-DevKitC-1',
    manufacturer: 'Espressif',
    model: 'ESP32-S3-DevKitC-1',
    revision: 'manufacturer profile',
    targetFamilies: ['esp32-s3'],
    compatibleFqbns: ['esp32:esp32:esp32s3'],
    dimensionsMm: { width: 54, height: 28 },
    confidence: 'manufacturer-verified',
    previewSvg: boardSvg('Espressif DevKitC-1', '#58d68d', 'USB', 'Manufacturer verified'),
    notes: [
      'Use the exact DevKitC-1 revision and memory variant when reviewing available pins.',
      'The official header tables expose both direct power pins and USB-powered entry paths.',
    ],
    caveats: [],
    sourceSummary: 'Official board family documentation reviewed for pinout and power-path expectations.',
    pinAnchors: DEVKITC_PIN_ANCHORS,
    pins: DEVKITC_PINS,
  },
  {
    id: 'seeed-xiao-esp32s3',
    label: 'Seeed Studio XIAO ESP32S3',
    manufacturer: 'Seeed Studio',
    model: 'XIAO ESP32S3',
    revision: 'manufacturer profile',
    targetFamilies: ['esp32-s3'],
    compatibleFqbns: ['esp32:esp32:esp32s3'],
    dimensionsMm: { width: 21, height: 18 },
    confidence: 'manufacturer-verified',
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
  }
  return issues
}

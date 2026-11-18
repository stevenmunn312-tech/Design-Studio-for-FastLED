export const BUILD_PROFILE_VERSION = 1 as const

export type BuildTargetFamily =
  | 'esp32-s3'
  | 'esp32'
  | 'esp32-s2'
  | 'esp32-c3'
  | 'esp32-c6'
  | 'esp32-h2'
  | 'esp8266'
  | 'rp2040'
  | 'teensy'
  | 'avr'
  | 'samd'
  | 'sam'
  | 'renesas'
  | 'nrf52'
  | 'unknown'

/**
 * The controller's own draw from the LED supply, one conservative figure per
 * family: the chip's peak transmit current with its radio running, taken from
 * the vendor datasheets and rounded up, plus the dev board's regulator and USB
 * bridge. Where some boards in a family carry a radio (Pico W, Uno R4 WiFi),
 * the figure assumes the radio. Displays, amplifiers and other peripherals on
 * the same rail are separate loads and are not counted here. The default
 * power cap subtracts it (`defaultPowerCapMa`).
 */
export const CONTROLLER_DRAW_MA: Readonly<Record<BuildTargetFamily, number>> = {
  // 802.11b transmit at full power: ESP32 240 mA, S2 310, S3 340, C3 335, C6 354.
  esp32: 250,
  'esp32-s2': 320,
  'esp32-s3': 350,
  'esp32-c3': 350,
  'esp32-c6': 360,
  // 802.15.4 / BLE transmit at +20 dBm.
  'esp32-h2': 150,
  // 802.11b transmit, 170 mA.
  esp8266: 200,
  // A Pico W's CYW43439 transmitting, on top of the RP2040.
  rp2040: 250,
  // Teensy 4.x at 600 MHz.
  teensy: 150,
  avr: 100,
  samd: 100,
  sam: 150,
  // The Uno R4 WiFi carries an ESP32-S3 radio module.
  renesas: 350,
  nrf52: 100,
  // Nothing known: the largest figure above.
  unknown: 360,
}

export type BuildSupplyFeedLocation = 'start' | 'end' | 'both-ends' | 'center' | 'custom'
export type BuildInstallationTopology = 'strip' | 'matrix' | 'panels' | 'custom'
export type BuildConductorMaterial = 'copper' | 'cca'
export type BuildExportMode = 'complete-build' | 'current-view'

export interface BuildOutputProfile {
  ledProfileId?: string
  physicalLengthMm?: number
  ledDensityPerMeter?: number
  pitchMm?: number
  feedCableLengthMm?: number
  intendedFeedLocation?: BuildSupplyFeedLocation
  topology?: BuildInstallationTopology
  desiredCurrentCapMa?: number
  manualInjectionPoints?: string[]
  notes?: string
}

export interface BuildControllerPowerProfile {
  preferredPath?: 'usb' | 'vin' | '5vin' | 'regulated-5v' | 'regulated-3v3'
  notes?: string
}

export interface BuildAssumptions {
  conductorMaterial?: BuildConductorMaterial
  allowedVoltageDropPercent?: number
  ambientC?: number
  bundledCircuits?: number
  supplyHeadroomPercent?: number
}

export interface BuildDoneState {
  fingerprint: string
  completedAt: number
  reason?: string
}

export interface BuildProfile {
  version: typeof BUILD_PROFILE_VERSION
  outputs?: Record<string, BuildOutputProfile>
  signalConditioning?: Record<string, boolean>
  controllerPower?: BuildControllerPowerProfile
  assumptions?: BuildAssumptions
  exportMode?: BuildExportMode
  visibility?: Record<string, boolean>
  done?: Record<string, BuildDoneState>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOutputProfile(value: unknown): BuildOutputProfile | undefined {
  if (!isObject(value)) return undefined
  const next: BuildOutputProfile = {}
  if (typeof value.ledProfileId === 'string' && value.ledProfileId.trim()) next.ledProfileId = value.ledProfileId
  if (typeof value.physicalLengthMm === 'number' && Number.isFinite(value.physicalLengthMm)) next.physicalLengthMm = value.physicalLengthMm
  if (typeof value.ledDensityPerMeter === 'number' && Number.isFinite(value.ledDensityPerMeter)) next.ledDensityPerMeter = value.ledDensityPerMeter
  if (typeof value.pitchMm === 'number' && Number.isFinite(value.pitchMm)) next.pitchMm = value.pitchMm
  if (typeof value.feedCableLengthMm === 'number' && Number.isFinite(value.feedCableLengthMm)) next.feedCableLengthMm = value.feedCableLengthMm
  if (typeof value.intendedFeedLocation === 'string') next.intendedFeedLocation = value.intendedFeedLocation as BuildSupplyFeedLocation
  if (typeof value.topology === 'string') next.topology = value.topology as BuildInstallationTopology
  if (typeof value.desiredCurrentCapMa === 'number' && Number.isFinite(value.desiredCurrentCapMa)) next.desiredCurrentCapMa = value.desiredCurrentCapMa
  if (Array.isArray(value.manualInjectionPoints)) {
    next.manualInjectionPoints = value.manualInjectionPoints.filter((entry): entry is string => typeof entry === 'string' && !!entry)
  }
  if (typeof value.notes === 'string' && value.notes.trim()) next.notes = value.notes
  return Object.keys(next).length > 0 ? next : undefined
}

function normalizeRecord<T>(
  value: unknown,
  normalizeEntry: (entry: unknown) => T | undefined,
): Record<string, T> | undefined {
  if (!isObject(value)) return undefined
  const next: Record<string, T> = {}
  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalizeEntry(entry)
    if (normalized !== undefined) next[key] = normalized
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeBooleanMap(value: unknown): Record<string, boolean> | undefined {
  if (!isObject(value)) return undefined
  const next: Record<string, boolean> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'boolean') next[key] = entry
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function normalizeDoneMap(value: unknown): Record<string, BuildDoneState> | undefined {
  if (!isObject(value)) return undefined
  const next: Record<string, BuildDoneState> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!isObject(entry)) continue
    if (typeof entry.fingerprint !== 'string' || !entry.fingerprint) continue
    if (typeof entry.completedAt !== 'number' || !Number.isFinite(entry.completedAt)) continue
    next[key] = {
      fingerprint: entry.fingerprint,
      completedAt: entry.completedAt,
      reason: typeof entry.reason === 'string' && entry.reason.trim() ? entry.reason : undefined,
    }
  }
  return Object.keys(next).length > 0 ? next : undefined
}

export function emptyBuildProfile(): BuildProfile {
  return { version: BUILD_PROFILE_VERSION }
}

export function ensureBuildProfile(profile: BuildProfile | undefined): BuildProfile {
  return profile ? normalizeBuildProfile(profile) ?? emptyBuildProfile() : emptyBuildProfile()
}

export function normalizeBuildProfile(value: unknown): BuildProfile | undefined {
  if (!isObject(value)) return undefined
  const next: BuildProfile = { version: BUILD_PROFILE_VERSION }
  next.outputs = normalizeRecord(value.outputs, normalizeOutputProfile)
  next.signalConditioning = normalizeBooleanMap(value.signalConditioning)
  if (isObject(value.controllerPower)) {
    next.controllerPower = {
      preferredPath: typeof value.controllerPower.preferredPath === 'string'
        ? value.controllerPower.preferredPath as BuildControllerPowerProfile['preferredPath']
        : undefined,
      notes: typeof value.controllerPower.notes === 'string' && value.controllerPower.notes.trim()
        ? value.controllerPower.notes
        : undefined,
    }
    if (Object.values(next.controllerPower).every((entry) => entry === undefined)) delete next.controllerPower
  }
  if (isObject(value.assumptions)) {
    next.assumptions = {
      conductorMaterial: typeof value.assumptions.conductorMaterial === 'string'
        ? value.assumptions.conductorMaterial as BuildConductorMaterial
        : undefined,
      allowedVoltageDropPercent: normalizeNumber(value.assumptions.allowedVoltageDropPercent),
      ambientC: normalizeNumber(value.assumptions.ambientC),
      bundledCircuits: normalizeNumber(value.assumptions.bundledCircuits),
      supplyHeadroomPercent: normalizeNumber(value.assumptions.supplyHeadroomPercent),
    }
    if (Object.values(next.assumptions).every((entry) => entry === undefined)) delete next.assumptions
  }
  if (value.exportMode === 'complete-build' || value.exportMode === 'current-view') {
    next.exportMode = value.exportMode
  }
  next.visibility = normalizeBooleanMap(value.visibility)
  next.done = normalizeDoneMap(value.done)
  return next
}

export function targetFamilyFromFqbn(fqbn: string): BuildTargetFamily {
  if (!fqbn) return 'unknown'
  const text = fqbn.toLowerCase()
  if (text.startsWith('esp32:') || text.includes('esp32')) {
    const boardId = text.split(':').at(-1) ?? text
    // The Arduino Nano ESP32's id names its u-blox NORA module, not the chip.
    if (/esp32s3|(?:^|[_-])s3(?:[_-]|$)/.test(boardId) || boardId === 'nano_nora') return 'esp32-s3'
    if (/esp32s2|(?:^|[_-])s2(?:[_-]|$)/.test(boardId)) return 'esp32-s2'
    if (/esp32c3|(?:^|[_-])c3(?:[_-]|$)/.test(boardId)) return 'esp32-c3'
    if (/esp32c6|(?:^|[_-])c6(?:[_-]|$)/.test(boardId)) return 'esp32-c6'
    if (/esp32h2|(?:^|[_-])h2(?:[_-]|$)/.test(boardId)) return 'esp32-h2'
    return 'esp32'
  }
  if (text.includes('esp8266')) return 'esp8266'
  if (text.includes('rpipico2') || text.includes('rp2040')) return 'rp2040'
  if (text.includes('teensy')) return 'teensy'
  if (text.includes(':avr:') || text.includes(':megaavr:')) return 'avr'
  if (text.includes(':samd:')) return 'samd'
  if (text.includes(':sam:')) return 'sam'
  if (text.includes('renesas_uno')) return 'renesas'
  if (text.includes(':nrf52:') || text.includes('nrf52840') || text.includes('nano33ble')) return 'nrf52'
  return 'unknown'
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
}

export function fingerprintValue(value: unknown): string {
  return stableStringify(value)
}

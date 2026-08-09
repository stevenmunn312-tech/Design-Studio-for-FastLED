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

export interface OwnedSupplyDeclaration {
  id: string
  label?: string
  voltage: number
  continuousCurrentMa: number
  wattage?: number
}

export interface OwnedWireDeclaration {
  id: string
  label?: string
  gaugeAwg?: number
  crossSectionMm2?: number
  conductorMaterial?: BuildConductorMaterial
}

export interface OwnedConnectorDeclaration {
  id: string
  label?: string
  continuousCurrentMa: number
}

export interface OwnedFuseDeclaration {
  id: string
  label?: string
  ratingMa: number
  fuseType?: string
}

export interface OwnedConverterDeclaration {
  id: string
  label?: string
  inputVoltage: number
  outputVoltage: number
  continuousCurrentMa: number
}

export interface BuildOwnedParts {
  supplies?: Record<string, OwnedSupplyDeclaration>
  wires?: Record<string, OwnedWireDeclaration>
  connectors?: Record<string, OwnedConnectorDeclaration>
  fuses?: Record<string, OwnedFuseDeclaration>
  converters?: Record<string, OwnedConverterDeclaration>
  supplyAssignments?: Record<string, string>
}

export interface BuildDoneState {
  fingerprint: string
  completedAt: number
  reason?: string
}

export interface BuildProfile {
  version: typeof BUILD_PROFILE_VERSION
  physicalBoardProfileId?: string
  outputs?: Record<string, BuildOutputProfile>
  controllerPower?: BuildControllerPowerProfile
  assumptions?: BuildAssumptions
  ownedParts?: BuildOwnedParts
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

function normalizeOwnedParts(value: unknown): BuildOwnedParts | undefined {
  if (!isObject(value)) return undefined
  const next: BuildOwnedParts = {}
  next.supplies = normalizeRecord(value.supplies, (entry) => {
    if (!isObject(entry)) return undefined
    const voltage = normalizeNumber(entry.voltage)
    const continuousCurrentMa = normalizeNumber(entry.continuousCurrentMa)
    if (voltage === undefined || continuousCurrentMa === undefined) return undefined
    return {
      id: typeof entry.id === 'string' && entry.id ? entry.id : '',
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label : undefined,
      voltage,
      continuousCurrentMa,
      wattage: normalizeNumber(entry.wattage),
    }
  })
  next.wires = normalizeRecord(value.wires, (entry) => {
    if (!isObject(entry)) return undefined
    return {
      id: typeof entry.id === 'string' && entry.id ? entry.id : '',
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label : undefined,
      gaugeAwg: normalizeNumber(entry.gaugeAwg),
      crossSectionMm2: normalizeNumber(entry.crossSectionMm2),
      conductorMaterial: typeof entry.conductorMaterial === 'string' ? entry.conductorMaterial as BuildConductorMaterial : undefined,
    }
  })
  next.connectors = normalizeRecord(value.connectors, (entry) => {
    if (!isObject(entry)) return undefined
    const continuousCurrentMa = normalizeNumber(entry.continuousCurrentMa)
    if (continuousCurrentMa === undefined) return undefined
    return {
      id: typeof entry.id === 'string' && entry.id ? entry.id : '',
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label : undefined,
      continuousCurrentMa,
    }
  })
  next.fuses = normalizeRecord(value.fuses, (entry) => {
    if (!isObject(entry)) return undefined
    const ratingMa = normalizeNumber(entry.ratingMa)
    if (ratingMa === undefined) return undefined
    return {
      id: typeof entry.id === 'string' && entry.id ? entry.id : '',
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label : undefined,
      ratingMa,
      fuseType: typeof entry.fuseType === 'string' && entry.fuseType.trim() ? entry.fuseType : undefined,
    }
  })
  next.converters = normalizeRecord(value.converters, (entry) => {
    if (!isObject(entry)) return undefined
    const inputVoltage = normalizeNumber(entry.inputVoltage)
    const outputVoltage = normalizeNumber(entry.outputVoltage)
    const continuousCurrentMa = normalizeNumber(entry.continuousCurrentMa)
    if (inputVoltage === undefined || outputVoltage === undefined || continuousCurrentMa === undefined) return undefined
    return {
      id: typeof entry.id === 'string' && entry.id ? entry.id : '',
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label : undefined,
      inputVoltage,
      outputVoltage,
      continuousCurrentMa,
    }
  })
  next.supplyAssignments = normalizeRecord(value.supplyAssignments, (entry) =>
    typeof entry === 'string' && entry ? entry : undefined)
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
  if (typeof value.physicalBoardProfileId === 'string' && value.physicalBoardProfileId.trim()) {
    next.physicalBoardProfileId = value.physicalBoardProfileId
  }
  next.outputs = normalizeRecord(value.outputs, normalizeOutputProfile)
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
  next.ownedParts = normalizeOwnedParts(value.ownedParts)
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
  if (text.includes('esp32s3')) return 'esp32-s3'
  if (text.includes('esp32s2')) return 'esp32-s2'
  if (text.includes('esp32c3')) return 'esp32-c3'
  if (text.includes('esp32c6')) return 'esp32-c6'
  if (text.includes('esp32h2')) return 'esp32-h2'
  if (text.includes('esp32')) return 'esp32'
  if (text.includes('esp8266')) return 'esp8266'
  if (text.includes('rpipico2') || text.includes('rp2040')) return 'rp2040'
  if (text.includes('teensy')) return 'teensy'
  if (text.includes(':avr:') || text.includes(':megaavr:')) return 'avr'
  if (text.includes(':samd:')) return 'samd'
  if (text.includes(':sam:')) return 'sam'
  if (text.includes('renesas_uno')) return 'renesas'
  if (text.includes(':nrf52:')) return 'nrf52'
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

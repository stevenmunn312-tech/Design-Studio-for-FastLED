// The generated "Parts for this node" list in a node's help page.
//
// What a node does stays hand-written in `reference/<category>.ts`: that is
// behaviour, and it changes only with an app release. Which parts a node can
// drive, and the facts about each, are data. They are read from every catalogue
// manifest whose `partTypes` name the node, so a part shows in help the day it
// is registered. See docs/plans/downloadable-parts.md, "Help".
//
// Everything here is plain text. A manifest's copy fields are never markup, so
// the view renders them as text nodes and this module only tidies whitespace
// and length.
import { PART_CATALOGUE, memoByCatalogue, type PartCatalogueEntry } from '../../build/parts/partCatalogue'
import { partTypeById } from '../../build/parts/partTypes'

export interface PartHelpEntry {
  partId: string
  label: string
  manufacturer?: string
  summary?: string
  wiringNote?: string
  logicVoltage?: string
  /** Short facts from the part's type block: channels, supply or load range, I2C addresses. */
  limits: string[]
}

const MAX_TEXT = 600

/** One line of plain text: control characters and runs of whitespace become single spaces. */
function plain(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (text === '') return undefined
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text
}

type Spec = Record<string, unknown>

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const text = (value: unknown): string | undefined => plain(value)
const count = (value: unknown, noun: string): string | undefined => {
  const n = num(value)
  return n === undefined ? undefined : `${n} ${noun}${n === 1 ? '' : 's'}`
}
const range = (low: unknown, high: unknown, unit: string): string | undefined => {
  const a = num(low)
  const b = num(high)
  if (a === undefined || b === undefined) return undefined
  return a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`
}
const addresses = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined
  const list = value.filter((item): item is number => Number.isInteger(item) && item >= 0 && item <= 0x7f)
  if (list.length === 0) return undefined
  return `I2C ${list.map((item) => `0x${item.toString(16).toUpperCase().padStart(2, '0')}`).join(', ')}`
}
const amps = (milliamps: unknown): string | undefined => {
  const value = num(milliamps)
  return value === undefined ? undefined : `${Math.round(value) / 1000} A`
}
const labelled = (label: string, value: string | undefined): string | undefined => (value === undefined ? undefined : `${label} ${value}`)

/**
 * Key limits for each type block, kept modest: how many channels, what supply
 * or load it takes, and which I2C addresses it answers on. A block with
 * nothing worth saying is simply absent.
 */
const LIMITS: Record<string, (spec: Spec) => Array<string | undefined>> = {
  relay: (s) => [count(s.channels, 'channel'), labelled('coil', text(s.coilVoltage)), text(s.contactRating)],
  mosfet: (s) => [count(s.channels, 'channel'), labelled('load supply', text(s.loadSupply)), labelled('up to', text(s.continuousCurrent))],
  driverChip: (s) => [count(s.channels, 'channel'), num(s.maxChannelCurrentMa) === undefined ? undefined : `${num(s.maxChannelCurrentMa)} mA per channel`],
  pwmDriver: (s) => [count(s.channels, 'channel'), addresses(s.i2cAddresses)],
  pdTrigger: (s) => {
    const volts = Array.isArray(s.selectableVoltagesV) ? s.selectableVoltagesV.filter((v): v is number => typeof v === 'number') : []
    return [volts.length ? `${volts.join(', ')} V` : undefined, num(s.maxPowerW) === undefined ? undefined : `up to ${num(s.maxPowerW)} W`]
  },
  powerConverter: (s) => [
    labelled('input', range(s.inputMinV, s.inputMaxV, 'V')),
    num(s.outputSetV) === undefined ? undefined : `${num(s.outputSetV)} V output`,
    labelled('up to', amps(s.continuousCurrentMa)),
  ],
  batteryCell: (s) => [
    num(s.nominalV) === undefined ? undefined : `${num(s.nominalV)} V nominal`,
    num(s.capacityMah) === undefined ? undefined : `${num(s.capacityMah)} mAh`,
  ],
  batteryModule: (s) => [num(s.series) === undefined ? undefined : `${num(s.series)}S`],
  powerMonitor: (s) => [
    addresses(s.i2cAddresses),
    num(s.busVoltageMaxV) === undefined ? undefined : `bus up to ${num(s.busVoltageMaxV)} V`,
    num(s.currentMaxA) === undefined ? undefined : `current up to ${num(s.currentMaxA)} A`,
  ],
  fan: (s) => [num(s.supplyVoltageV) === undefined ? undefined : `${num(s.supplyVoltageV)} V`, num(s.maxRpm) === undefined ? undefined : `up to ${num(s.maxRpm)} RPM`],
  buzzer: (s) => [s.type === 'active' || s.type === 'passive' ? `${s.type} buzzer` : undefined],
  distanceSensor: (s) => [range(s.minMm, s.maxMm, 'mm'), addresses(s.i2cAddresses)],
  presenceSensor: (s) => [num(s.maxRangeMeters) === undefined ? undefined : `range to ${num(s.maxRangeMeters)} m`],
  lightSensor: (s) => [addresses(s.i2cAddresses)],
  environmentSensor: (s) => [addresses(s.i2cAddresses)],
  motionVectorSensor: (s) => [addresses(s.i2cAddresses)],
  touchPad: (s) => [count(s.electrodes, 'electrode'), addresses(s.i2cAddresses)],
  display: (s) => {
    const size = Array.isArray(s.resolutionPx) && s.resolutionPx.length === 2 && s.resolutionPx.every((n) => typeof n === 'number') ? `${s.resolutionPx[0]}×${s.resolutionPx[1]}` : undefined
    const touch = text(s.touchController)
    return [size, touch ? `touch ${touch}` : undefined]
  },
  temperatureSensor: (s) => [range(s.temperatureMinC, s.temperatureMaxC, '°C')],
}

function limitsFor(nodeType: string, entry: PartCatalogueEntry): string[] {
  const block = partTypeById(nodeType)?.block
  const read = block ? LIMITS[block] : undefined
  const spec = block ? (entry as unknown as Record<string, unknown>)[block] : undefined
  if (!read || typeof spec !== 'object' || spec === null) return []
  return read(spec as Spec).filter((fact): fact is string => fact !== undefined)
}

function partTypesOf(entry: PartCatalogueEntry): readonly string[] {
  const named = (entry as { partTypes?: unknown }).partTypes
  return Array.isArray(named) ? named.filter((type): type is string => typeof type === 'string') : []
}

const entriesByType = memoByCatalogue(() => {
  const byType = new Map<string, PartCatalogueEntry[]>()
  for (const entry of Object.values(PART_CATALOGUE)) {
    for (const type of partTypesOf(entry)) byType.set(type, [...(byType.get(type) ?? []), entry])
  }
  return byType
})

function describe(nodeType: string, entry: PartCatalogueEntry): PartHelpEntry {
  const copy = (entry as { copy?: { summary?: unknown; wiringNote?: unknown } }).copy
  return {
    partId: entry.partId,
    label: plain(entry.label) ?? entry.partId,
    manufacturer: plain(entry.manufacturer),
    summary: plain(copy?.summary),
    wiringNote: plain(copy?.wiringNote),
    logicVoltage: plain(entry.logicVoltage),
    limits: limitsFor(nodeType, entry),
  }
}

const describedByType = memoByCatalogue(() => new Map<string, PartHelpEntry[]>())

/**
 * The parts a node type can drive, from the catalogue as it is now: bundled
 * first, then registered ones in registration order. Empty for a node that no
 * part names. The result is stable until the catalogue changes.
 */
export function partHelpEntries(nodeType: string): PartHelpEntry[] {
  const cache = describedByType()
  const known = cache.get(nodeType)
  if (known) return known
  const built = (entriesByType().get(nodeType) ?? []).map((entry) => describe(nodeType, entry))
  cache.set(nodeType, built)
  return built
}

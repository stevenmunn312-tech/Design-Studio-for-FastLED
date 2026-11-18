// Part manifest v1: everything the app knows about one physical part, as data.
//
// A manifest is the existing catalogue entry (../partCatalogue.ts) plus the
// fields that let a part travel on its own: its version, the part types it is
// written for, where it sits on the shelf, how far it has been checked and
// what each measured fact rests on. Bundled and downloaded parts are the same
// shape; only a downloaded one must be published (`reviewed` or `bench`), cite
// its sources, and name a type that is open to downloads.
//
// The validator is the only door: nothing reads a manifest it has not passed.

import type { PartCatalogueEntry } from '../partCatalogue'
import { partTypeById, partTypeDrivesDevice, type PartTypeDefinition } from '../partTypes'
import { keypadBlockIssue } from './keypadBlock'
import { DIMENSIONS_SPEC, LED_LAYOUT_SPEC, PART_BLOCK_KEYS, PART_BLOCK_SPECS, RENDER_SPEC } from './blockSpecs'
import { arr, checkField, int, num, obj, opt, str, type FieldSpec } from './fieldSpec'
import {
  isInterfaceId,
  isPinRole,
  isSupplyRail,
  isVerificationLevel,
  PART_MANIFEST_VERSION,
  type InterfaceId,
  type PinRole,
  type SupplyRail,
  type VerificationLevel,
} from './vocabulary'

export interface PartManifestSource {
  /** The manifest fields this reference supports, e.g. `dimensionsMm`, `pinLabelsLeftToRight`. */
  facts: string[]
  /** A datasheet or fabrication-print URL, or a citation a reviewer can follow. */
  ref: string
}

/** One pad's point on the part's own render, in render pixels from the top-left. */
export interface PartManifestPad {
  /** The pad's silkscreen; the same position in `pinLabelsLeftToRight` names it. */
  label: string
  xPx: number
  yPx: number
}

export interface PartManifestPin {
  /** The pad's silkscreen, exactly as printed. */
  label: string
  role: PinRole
  /** Which channel a per-channel pad belongs to, from 1. */
  channel?: number
}

/** Short shelf and help copy, plain text only. */
export interface PartManifestCopy {
  summary?: string
  wiringNote?: string
  hint?: string
  /**
   * The short name the Add Hardware menu and the part panel use, where the
   * manifest `label` is the full product name. Absent: the menu uses `label`.
   */
  optionLabel?: string
  /**
   * Where a bundled part sits among its type's menu rows, from 1. The first row
   * is the type's default module, so order is data, not file order. Read for
   * bundled parts only: a downloaded part always follows them, so it can never
   * displace the default.
   */
  optionOrder?: number
}

/** One node of the shelf category tree (the shape the signed index carries). */
export interface PartCategoryDefinition {
  /** Lowercase words joined by hyphens; permanent once released. */
  id: string
  label: string
  /** Position among siblings. */
  order: number
  parent: string | null
  /** Older ids that now resolve to this category, kept when one is split. */
  aliases?: string[]
}

export interface PartManifest extends PartCatalogueEntry {
  manifestVersion: number
  /** Raised on every published change; a save pins the revision it was built with. */
  revision: number
  /** Part type ids (node types) this part is written for, in preference order. */
  partTypes: string[]
  /** Shelf category ids from the index's category tree. */
  categories: string[]
  verification: VerificationLevel
  sources: PartManifestSource[]
  interfaces?: InterfaceId[]
  pins?: PartManifestPin[]
  copy?: PartManifestCopy
  pads?: PartManifestPad[]
  padHoleRadiusPx?: number
  supplyRail?: SupplyRail
  powerPadLabel?: string
}

export type ManifestOrigin = 'bundled' | 'downloaded'

export type PartManifestResult =
  | {
    status: 'ok'
    manifest: PartManifest
    /** The named types this app can use the part for, in the manifest's order. */
    usableTypes: PartTypeDefinition[]
  }
  /** Well formed, but written for a newer app: an unknown type, chip, word or format. */
  | { status: 'needs-newer-app'; partId: string | null; reasons: string[] }
  | { status: 'invalid'; partId: string | null; errors: string[] }

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_ID_LENGTH = 80

const COMMON_FIELDS: Record<string, FieldSpec> = {
  label: str({ nonEmpty: true, maxLength: 120 }),
  category: opt(str({ maxLength: 60 })),
  manufacturer: opt(str({ maxLength: 120 })),
  logicVoltage: opt(str({ maxLength: 400 })),
  dimensionsMm: DIMENSIONS_SPEC,
  pinLabelsLeftToRight: opt(arr(str({ maxLength: 40 }), 0, 128)),
  notes: opt(arr(str({ maxLength: 600 }), 0, 32)),
  ledLayout: opt(LED_LAYOUT_SPEC),
  render: opt(RENDER_SPEC),
  pads: opt(arr(obj({
    label: str({ nonEmpty: true, maxLength: 40 }),
    xPx: num({ min: 0, max: 8192 }),
    yPx: num({ min: 0, max: 8192 }),
  }), 0, 128)),
  padHoleRadiusPx: opt(num({ min: 0.1, max: 200 })),
  powerPadLabel: opt(str({ nonEmpty: true, maxLength: 40 })),
  revision: int(1, 1_000_000),
  sources: arr(obj({
    facts: arr(str({ nonEmpty: true, maxLength: 60 }), 1, 32),
    ref: str({ nonEmpty: true, maxLength: 500 }),
  }), 0, 64),
  copy: opt(obj({
    summary: opt(str({ maxLength: 300 })),
    wiringNote: opt(str({ maxLength: 600 })),
    hint: opt(str({ maxLength: 200 })),
    optionLabel: opt(str({ nonEmpty: true, maxLength: 120 })),
    optionOrder: opt(int(1, 999)),
  })),
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ID_LENGTH && ID_PATTERN.test(value)
}

/**
 * Problems with a manifest's measured pad points that the field shapes cannot
 * see: a pad outside the render it is measured on would draw a wire off the
 * board, and a list that does not follow the pin labels would attach each wire
 * to its neighbour.
 */
function padIssues(value: Record<string, unknown>): string[] {
  const pads = value.pads
  if (!Array.isArray(pads) || pads.length === 0) return []
  const issues: string[] = []
  const render = isPlainObject(value.render) ? value.render : null
  const width = render && typeof render.widthPx === 'number' ? render.widthPx : null
  const height = render && typeof render.heightPx === 'number' ? render.heightPx : null
  const labels = Array.isArray(value.pinLabelsLeftToRight) ? value.pinLabelsLeftToRight : null
  if (labels && labels.length !== pads.length) {
    issues.push(`pads: ${pads.length} points for ${labels.length} pin labels`)
  }
  pads.forEach((pad, index) => {
    if (!isPlainObject(pad) || typeof pad.xPx !== 'number' || typeof pad.yPx !== 'number') return
    if (labels && typeof pad.label === 'string' && labels[index] !== pad.label) {
      issues.push(`pads[${index}].label: expected "${String(labels[index])}"`)
    }
    if (width !== null && pad.xPx > width) issues.push(`pads[${index}].xPx: outside the ${width} px render`)
    if (height !== null && pad.yPx > height) issues.push(`pads[${index}].yPx: outside the ${height} px render`)
  })
  return issues
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Check `value` as a part manifest.
 *
 * `bundled` parts ship with the app and may use any known type. `downloaded`
 * parts must also be published, cite at least one source, and name a type
 * that is open to downloads and can drive the part's chip.
 */
export function validatePartManifest(value: unknown, origin: ManifestOrigin): PartManifestResult {
  if (!isPlainObject(value)) return { status: 'invalid', partId: null, errors: ['manifest: expected an object'] }
  const partId = isId(value.partId) ? value.partId : null
  const errors: string[] = []
  /** Words from a newer vocabulary: the whole part waits for a newer app. */
  const newerWords: string[] = []
  /** Types this app lacks or cannot use here: the part loads if another type fits. */
  const unusableTypes: string[] = []

  if (!partId) errors.push('partId: expected lowercase words joined by hyphens, at most 80 characters')

  const version = value.manifestVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    errors.push('manifestVersion: expected a whole number from 1')
  } else if (version > PART_MANIFEST_VERSION) {
    return { status: 'needs-newer-app', partId, reasons: [`manifest format ${version} is newer than ${PART_MANIFEST_VERSION}`] }
  }

  for (const [key, field] of Object.entries(COMMON_FIELDS)) errors.push(...checkField(field, value[key], key))

  if (!isVerificationLevel(value.verification)) errors.push('verification: expected drafted, reviewed or bench')

  const categories = value.categories
  if (!Array.isArray(categories) || categories.length > 16 || !categories.every(isId)) {
    errors.push('categories: expected up to 16 category ids')
  }

  if (value.interfaces !== undefined) {
    if (!Array.isArray(value.interfaces) || value.interfaces.length > 16) {
      errors.push('interfaces: expected a list of up to 16')
    } else {
      for (const id of value.interfaces) {
        if (typeof id !== 'string') errors.push('interfaces: expected interface ids')
        else if (!isInterfaceId(id)) newerWords.push(`interface "${id}" is not known to this version`)
      }
    }
  }

  if (value.pins !== undefined) {
    if (!Array.isArray(value.pins) || value.pins.length > 128) {
      errors.push('pins: expected a list of up to 128')
    } else {
      value.pins.forEach((pin, index) => {
        if (!isPlainObject(pin)) {
          errors.push(`pins[${index}]: expected an object`)
          return
        }
        errors.push(...checkField(str({ nonEmpty: true, maxLength: 40 }), pin.label, `pins[${index}].label`))
        errors.push(...checkField(opt(int(1, 64)), pin.channel, `pins[${index}].channel`))
        if (typeof pin.role !== 'string') errors.push(`pins[${index}].role: expected a pin role`)
        else if (!isPinRole(pin.role)) newerWords.push(`pin role "${pin.role}" is not known to this version`)
      })
    }
  }

  if (value.supplyRail !== undefined) {
    if (typeof value.supplyRail !== 'string') errors.push('supplyRail: expected a supply rail')
    else if (!isSupplyRail(value.supplyRail)) newerWords.push(`supply rail "${value.supplyRail}" is not known to this version`)
  }

  errors.push(...padIssues(value))

  for (const key of PART_BLOCK_KEYS) {
    if (value[key] !== undefined) errors.push(...checkField(PART_BLOCK_SPECS[key], value[key], key))
  }
  // Rules across a block's own fields, which the per-field shapes cannot say.
  if (value.keypad !== undefined && !errors.some((error) => error.startsWith('keypad'))) {
    const issue = keypadBlockIssue(value.keypad)
    if (issue) errors.push(`keypad: ${issue}`)
  }

  const typeIds = value.partTypes
  const usableTypes: PartTypeDefinition[] = []
  if (!Array.isArray(typeIds) || typeIds.length === 0 || typeIds.length > 8 || !typeIds.every((id) => typeof id === 'string')) {
    errors.push('partTypes: expected one to eight part type ids')
  } else {
    for (const id of typeIds as string[]) {
      const definition = partTypeById(id)
      if (!definition) {
        unusableTypes.push(`part type "${id}" is not known to this version`)
        continue
      }
      if (definition.block && !definition.blockOptional && value[definition.block] === undefined) {
        errors.push(`${definition.block}: required by part type ${definition.nodeType}`)
        continue
      }
      if (origin === 'downloaded' && !definition.downloadable) {
        unusableTypes.push(`part type "${id}" cannot take downloaded parts in this version`)
        continue
      }
      if (definition.block && !partTypeDrivesDevice(definition, value[definition.block])) {
        unusableTypes.push(`part type "${id}" cannot drive this part's chip in this version`)
        continue
      }
      if (!usableTypes.includes(definition)) usableTypes.push(definition)
    }
  }

  if (origin === 'downloaded') {
    if (value.verification === 'drafted') errors.push('verification: a drafted part is not published')
    if (Array.isArray(value.sources) && value.sources.length === 0) errors.push('sources: a published part cites its sources')
  }

  if (errors.length > 0) return { status: 'invalid', partId, errors }
  if (newerWords.length > 0) return { status: 'needs-newer-app', partId, reasons: newerWords }
  if (usableTypes.length === 0) return { status: 'needs-newer-app', partId, reasons: unusableTypes }
  return { status: 'ok', manifest: value as unknown as PartManifest, usableTypes }
}

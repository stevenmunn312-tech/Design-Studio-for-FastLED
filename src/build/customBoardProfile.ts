import { BOARD_GPIO_BY_FQBN, pinSupports, type BoardGpio, type PinNote } from '../state/boardGpio'
import {
  CUSTOM_BOARD_MAX_LABEL_LENGTH, CUSTOM_BOARD_MAX_PINS_PER_SIDE, customBoardAssignmentId, customBoardSlotLabel,
  newCustomBoardSlotId, parseCustomBoardDefinition,
  type CustomBoardDefinition, type CustomBoardIssue, type CustomBoardSlot,
} from '../state/customBoard'
import type { PhysicalBoardProfile, PhysicalBoardPinProfile } from './boardProfiles'
import { boardI2cDefault, type BoardI2cDefault } from './boardI2cDefaults'
import { customBoardGeometry } from './customBoardGeometry'
import { customBoardTemplate, type CustomBoardTemplate } from './customBoardTemplates'
import { customBoardSvg } from './customBoardSvg'

export interface CustomBoardResolution {
  profile?: PhysicalBoardProfile
  issues: CustomBoardIssue[]
}

/**
 * Keyed by the saved value itself. Store updates replace Board properties and
 * catalogue entries rather than mutating them, so identity is a sound key —
 * and store selectors need the same profile object back for an unchanged
 * definition. The reference is rechecked so a catalogue reload re-resolves.
 */
const cache = new WeakMap<object, {
  referenceId?: string
  reference?: PhysicalBoardProfile
  result: CustomBoardResolution
}>()

function gpioPolicy(definition: CustomBoardDefinition, template: CustomBoardTemplate, reference: PhysicalBoardProfile) {
  const table = BOARD_GPIO_BY_FQBN[template.capabilityFqbn]
  const notes = new Map(table.recommended.map((note) => [note.pin, note]))
  const gpioSlots = [...definition.leftPins, ...definition.rightPins].flatMap((slot) => slot.role === 'gpio' ? [slot] : [])
  const blocked: Record<number, string> = { ...template.blockedGpios }
  // If catalogue updates add an exclusion outside our reviewed classifications,
  // fail closed until it is classified. Never parse its prose to guess why.
  for (const pin of Object.keys(reference.pinSafety?.boardReservedOrNotExposed ?? {}).map(Number)) {
    blocked[pin] ??= 'The build template has an unclassified pin restriction; review is required.'
  }
  const maxPin = table.maxPin ?? 0
  // Every chip pin the definition does not offer is stated, so a part left on
  // one is told why rather than reading as an unknown pad.
  const unavailable: Record<number, string> = {}
  for (let pin = 0; pin <= maxPin; pin++) {
    const slot = gpioSlots.find((entry) => entry.gpio === pin)
    const reason = blocked[pin] ?? (!notes.has(pin) ? 'Not a supported Arduino GPIO on this module.'
      : !slot ? 'Not exposed by the custom board.' : !slot.enabled ? 'Disabled in the custom board.' : undefined)
    if (reason) unavailable[pin] = reason
  }
  const recommended: PinNote[] = []
  const issues: CustomBoardIssue[] = []
  for (const slot of gpioSlots) {
    if (blocked[slot.gpio] || !notes.has(slot.gpio)) {
      const reason = blocked[slot.gpio] ?? 'Not a supported Arduino GPIO on this module.'
      issues.push({ code: 'unsupported-gpio', path: `slots.${slot.id}.gpio`, scope: 'gpio', message: `GPIO${slot.gpio}: ${reason} Use a Reserved position for an unusable module pad.` })
    } else if (slot.enabled) {
      const note = notes.get(slot.gpio)!
      recommended.push({
        ...note,
        label: slot.label || undefined,
        // A stock board's own wiring (GPIO2's LED) is not a fact about a
        // custom PCB; the template's reviewed module caution replaces it.
        warning: template.cautionGpios[slot.gpio] ?? note.warning,
      })
    }
  }
  recommended.sort((left, right) => left.pin - right.pin)
  const gpio: BoardGpio = {
    recommended,
    maxPin,
    caution: Object.entries(unavailable).map(([pin, reason]) => ({ pin: Number(pin), note: reason, capabilities: [] })),
  }
  return { gpio, unavailable, issues }
}

function defaultI2c(definition: CustomBoardDefinition, gpio: BoardGpio): { bus?: BoardI2cDefault; issues: CustomBoardIssue[] } {
  const requested = definition.defaultI2c.mode === 'custom'
    ? { sda: { arduinoPin: definition.defaultI2c.sda }, scl: { arduinoPin: definition.defaultI2c.scl } }
    : boardI2cDefault(definition.referenceProfileId)
  const issues: CustomBoardIssue[] = []
  for (const role of ['sda', 'scl'] as const) {
    const pin = requested?.[role].arduinoPin
    const note = gpio.recommended.find((entry) => entry.pin === pin)
    if (!note || !pinSupports(note, 'digitalInput') || !pinSupports(note, 'digitalOutput')) {
      issues.push({
        code: 'invalid-i2c-pin', path: `defaultI2c.${role}`, scope: 'i2c',
        message: `Default I2C ${role.toUpperCase()}${pin === undefined ? '' : ` (GPIO${pin})`} needs an enabled, exposed input/output GPIO. Edit the bus or expose its pin.`,
      })
    }
  }
  // Stock physical aliases never take part in custom pad lookup: the pair is
  // found on this board by its Arduino number alone.
  return {
    bus: issues.length || !requested ? undefined : {
      sda: { arduinoPin: requested.sda.arduinoPin }, scl: { arduinoPin: requested.scl.arduinoPin },
    },
    issues,
  }
}

/**
 * The effective profile for a project's custom board.
 *
 * Build facts come from the reviewed reference template; pins, labels, power
 * pads and geometry come only from the definition. Integrated hardware,
 * renders, indicators and manufacturer verification are never inherited.
 * Callers must surface `issues` before deployment.
 */
export function resolveCustomBoard(
  value: unknown,
  referenceFor: (id: string) => PhysicalBoardProfile | undefined,
): CustomBoardResolution {
  const key = value !== null && typeof value === 'object' ? value : undefined
  const cached = key ? cache.get(key) : undefined
  if (cached && (cached.referenceId === undefined || referenceFor(cached.referenceId) === cached.reference)) {
    return cached.result
  }
  const remember = (result: CustomBoardResolution, referenceId?: string, reference?: PhysicalBoardProfile) => {
    if (key) cache.set(key, { referenceId, reference, result })
    return result
  }
  const parsed = parseCustomBoardDefinition(value)
  if (!parsed.ok) return remember({ issues: parsed.issues })
  const definition = parsed.definition
  const template = customBoardTemplate(definition.referenceProfileId)
  const reference = referenceFor(definition.referenceProfileId)
  if (!template || !reference) {
    return remember({
      issues: [{
        code: 'unsupported-template', path: 'referenceProfileId', scope: 'definition',
        message: 'This build template is not supported for custom boards. Edit the custom board and select a reviewed ESP32 or ESP32-S3 template.',
      }],
    }, definition.referenceProfileId, reference)
  }
  const policy = gpioPolicy(definition, template, reference)
  const bus = defaultI2c(definition, policy.gpio)
  const geometry = customBoardGeometry(definition)
  const pins = geometry.pads.map(({ slot }): PhysicalBoardPinProfile => ({
    id: slot.id,
    anchorId: slot.id,
    label: customBoardSlotLabel(slot),
    role: slot.role === 'gpio' ? 'gpio'
      : slot.role === 'supply' ? (slot.direction === 'input' ? 'power-in' : 'power-out')
        : slot.role === 'ground' ? 'ground' : 'reserved',
    gpio: slot.role === 'gpio' ? slot.gpio : undefined,
    availability: slot.role === 'gpio' && policy.unavailable[slot.gpio] ? 'unavailable' : undefined,
  }))
  const caution: Record<number, string> = {}
  const safe: number[] = []
  for (const note of policy.gpio.recommended) {
    const warning = note.warning ?? (!pinSupports(note, 'digitalOutput') ? 'Input-only GPIO; cannot drive outputs.' : undefined)
    if (warning) caution[note.pin] = warning
    else safe.push(note.pin)
  }
  const profile: PhysicalBoardProfile = {
    id: customBoardAssignmentId(definition),
    label: definition.name,
    manufacturer: 'User-defined',
    model: definition.name,
    revision: 'Schematic',
    targetFamilies: [...reference.targetFamilies],
    compatibleFqbns: [...reference.compatibleFqbns],
    processor: reference.processor,
    memory: reference.memory ? { ...reference.memory } : undefined,
    psramMode: reference.psramMode,
    internalRamBudgetBytes: reference.internalRamBudgetBytes,
    dimensionsMm: geometry.nominalDimensionsMm,
    confidence: 'user-defined',
    previewSvg: customBoardSvg(definition, bus.bus),
    sourceSummary: 'User-defined pinout — schematic',
    notes: [
      `Build settings inherited from ${reference.label}; confirm the custom board uses the equivalent processor and module.`,
      'Dimensions are a nominal schematic footprint, not measurements.',
    ],
    caveats: ['Supply pads are user-declared. Input voltage ratings, regulator capacity and protection are unverified.'],
    pins,
    pinAnchors: geometry.pads.map((pad) => ({ id: pad.slot.id, x: pad.x, y: pad.y, labelAlign: pad.side })),
    pinSafety: {
      safeGeneralPurpose: safe,
      useWithCaution: caution,
      boardReservedOrNotExposed: policy.unavailable,
    },
    custom: { definition, referenceLabel: reference.label, gpio: policy.gpio, defaultI2c: bus.bus },
  }
  const powerIssues: CustomBoardIssue[] = definition.controllerPower === 'unspecified'
    ? [{ code: 'unspecified-power', path: 'controllerPower', scope: 'power', message: 'Controller power is unresolved. Choose USB or external supply in the custom board setup.' }]
    : []
  return remember(
    { profile, issues: [...policy.issues, ...bus.issues, ...powerIssues] },
    definition.referenceProfileId,
    reference,
  )
}

const UNRESOLVED_DEFINITION: CustomBoardDefinition = {
  version: 1, id: 'unresolved', name: 'Custom board — needs repair', referenceProfileId: '',
  controllerPower: 'unspecified', defaultI2c: { mode: 'inherit' }, leftPins: [], rightPins: [],
}

/**
 * Stands in on the workbench while the project's custom board does not
 * resolve, so the board menu that repairs it stays reachable. Display only:
 * it is never the selected board, and its explicitly empty pool means nothing
 * can be allocated against it.
 */
export const UNRESOLVED_CUSTOM_BOARD_PROFILE: PhysicalBoardProfile = {
  id: 'custom:unresolved', label: UNRESOLVED_DEFINITION.name, manufacturer: 'User-defined',
  model: UNRESOLVED_DEFINITION.name, revision: 'Schematic', targetFamilies: [], compatibleFqbns: [],
  dimensionsMm: customBoardGeometry(UNRESOLVED_DEFINITION).nominalDimensionsMm, confidence: 'user-defined',
  previewSvg: customBoardSvg(UNRESOLVED_DEFINITION), notes: [], caveats: [],
  sourceSummary: 'User-defined pinout — schematic', pins: [], pinAnchors: [],
  pinSafety: { safeGeneralPurpose: [], useWithCaution: {}, boardReservedOrNotExposed: {} },
  custom: { definition: UNRESOLVED_DEFINITION, referenceLabel: '', gpio: { recommended: [], caution: [] } },
}

/**
 * Rows seeded from a template's own two-rail header, for the editor to review.
 *
 * Only facts the stock map states are copied: a pad's GPIO number, ground, and
 * the printed label. Supply pads and every pad without a GPIO number arrive
 * undefined with their label, because a voltage or a reset role read from a
 * silkscreen would be a guess. A pad the module cannot use is Reserved.
 * Undefined when the template has no two-rail map this layout can hold.
 */
export function customBoardRowsFromReference(
  reference: PhysicalBoardProfile,
): Pick<CustomBoardDefinition, 'leftPins' | 'rightPins'> | undefined {
  const template = customBoardTemplate(reference.id)
  const anchors = new Map((reference.pinAnchors ?? []).map((anchor) => [anchor.id, anchor.labelAlign]))
  const pins = reference.pins ?? []
  if (!template || pins.length === 0) return undefined
  if (pins.some((pin) => anchors.get(pin.anchorId) !== 'left' && anchors.get(pin.anchorId) !== 'right')) return undefined
  const seen = new Set<number>()
  const slot = (pin: PhysicalBoardPinProfile): CustomBoardSlot => {
    const id = newCustomBoardSlotId()
    const label = pin.label.slice(0, CUSTOM_BOARD_MAX_LABEL_LENGTH)
    if (pin.role === 'ground') return { id, role: 'ground', ...(/^GND$/i.test(label) ? {} : { label }) }
    if (pin.gpio !== undefined && (pin.role === 'gpio' || pin.role === 'analog')) {
      if (template.blockedGpios[pin.gpio] !== undefined) return { id, role: 'reserved', label }
      if (seen.has(pin.gpio)) return { id, role: 'undefined', label }
      seen.add(pin.gpio)
      return {
        id, role: 'gpio', gpio: pin.gpio, enabled: pin.availability !== 'unavailable',
        ...(label === `GPIO${pin.gpio}` ? {} : { label }),
      }
    }
    return { id, role: 'undefined', label }
  }
  const side = (name: 'left' | 'right') => pins.filter((pin) => anchors.get(pin.anchorId) === name).map(slot)
  const leftPins = side('left')
  const rightPins = side('right')
  if (leftPins.length > CUSTOM_BOARD_MAX_PINS_PER_SIDE || rightPins.length > CUSTOM_BOARD_MAX_PINS_PER_SIDE) return undefined
  return { leftPins, rightPins }
}

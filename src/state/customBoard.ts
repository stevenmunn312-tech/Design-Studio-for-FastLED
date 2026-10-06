/** Portable project data, separate from Upload's machine-local compile targets. */
export const CUSTOM_BOARD_PROFILE_ID = 'custom'
export const CUSTOM_BOARD_VERSION = 1
export const CUSTOM_BOARD_MAX_PINS_PER_SIDE = 40
export const CUSTOM_BOARD_MAX_LABEL_LENGTH = 48

export type CustomBoardSlot = { id: string; label?: string } & (
  | { role: 'gpio'; gpio: number; enabled: boolean }
  | { role: 'supply'; voltage: number; direction: 'input' | 'output' }
  | { role: 'ground' | 'reset' | 'reserved' | 'unconnected' | 'undefined' }
)

export interface CustomBoardDefinition {
  version: 1
  id: string
  name: string
  referenceProfileId: string
  controllerPower: 'usb' | 'external' | 'unspecified'
  defaultI2c: { mode: 'inherit' } | { mode: 'custom'; sda: number; scl: number }
  leftPins: CustomBoardSlot[]
  rightPins: CustomBoardSlot[]
}

export interface CustomBoardIssue {
  code: string
  path: string
  message: string
  /** Power readiness must not block unrelated numerical firmware assignments. */
  scope: 'definition' | 'gpio' | 'i2c' | 'power'
}

export type CustomBoardParseResult =
  | { ok: true; definition: CustomBoardDefinition; issues: [] }
  | { ok: false; issues: CustomBoardIssue[] }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

function text(value: unknown, limit: number, empty = false): value is string {
  return typeof value === 'string' && (empty || value.trim().length > 0)
    && value.length <= limit && !hasControlCharacter(value)
}

function identity(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
}

function pinNumber(value: unknown): value is number {
  // 255 is the unwired firmware sentinel, never a physical GPIO.
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 255
}

/** Validate without coercing, repairing or discarding the caller's saved data.
 * Template/capability checks belong to effective resolution, not the schema. */
export function parseCustomBoardDefinition(value: unknown): CustomBoardParseResult {
  const issues: CustomBoardIssue[] = []
  const issue = (path: string, message: string, code = 'invalid-definition') => {
    issues.push({ code, path, message, scope: 'definition' })
  }
  const keys = (entry: Record<string, unknown>, allowed: string[], path: string) => {
    if (Object.keys(entry).some((key) => !allowed.includes(key))) {
      issue(path, 'Unexpected fields in custom board data; review or recreate this definition.')
    }
  }
  if (!record(value)) {
    issue('customBoard', 'Custom board data is missing or malformed. Edit or recreate the custom board.', 'missing-definition')
    return { ok: false, issues }
  }
  if (value.version !== CUSTOM_BOARD_VERSION) {
    issue('version', 'Unsupported custom board version. Open it in a compatible Studio version or recreate it.', 'unsupported-version')
    return { ok: false, issues }
  }
  keys(value, ['version', 'id', 'name', 'referenceProfileId', 'controllerPower', 'defaultI2c', 'leftPins', 'rightPins'], 'customBoard')
  if (!identity(value.id)) issue('id', 'The board needs a stable ID of 1–80 letters, digits, underscores or hyphens.')
  if (!text(value.name, 80)) issue('name', 'Enter a board name of 1–80 characters without control characters.')
  if (!identity(value.referenceProfileId)) issue('referenceProfileId', 'Select a supported build template.')
  if (!['usb', 'external', 'unspecified'].includes(String(value.controllerPower))) {
    issue('controllerPower', 'Choose USB, external supply or unspecified controller power.')
  }
  const bus = value.defaultI2c
  if (!record(bus) || !['inherit', 'custom'].includes(String(bus.mode))) {
    issue('defaultI2c', 'Choose inherited I2C defaults or an explicit SDA/SCL pair.')
  } else {
    keys(bus, bus.mode === 'inherit' ? ['mode'] : ['mode', 'sda', 'scl'], 'defaultI2c')
    if (bus.mode === 'custom') {
      if (!pinNumber(bus.sda) || !pinNumber(bus.scl)) issue('defaultI2c', 'SDA and SCL must both be integer Arduino pin numbers below 255.')
      else if (bus.sda === bus.scl) issue('defaultI2c', 'SDA and SCL must use different GPIOs.')
    }
  }
  const ids = new Set<string>()
  const gpios = new Set<number>()
  let count = 0
  for (const side of ['leftPins', 'rightPins'] as const) {
    const slots = value[side]
    if (!Array.isArray(slots) || slots.length > CUSTOM_BOARD_MAX_PINS_PER_SIDE) {
      issue(side, `Use 0–${CUSTOM_BOARD_MAX_PINS_PER_SIDE} positions per side.`)
      continue
    }
    count += slots.length
    for (let index = 0; index < slots.length; index++) {
      const slot: unknown = slots[index]
      const path = `${side}.${index}`
      if (!record(slot)) {
        issue(path, 'Define this position or choose Unconnected.')
        continue
      }
      if (!identity(slot.id)) issue(`${path}.id`, 'Every position needs a valid stable ID.')
      else if (ids.has(slot.id)) issue(`${path}.id`, 'Position IDs must be unique across both headers.', 'duplicate-slot')
      else ids.add(slot.id)
      if (slot.label !== undefined && !text(slot.label, CUSTOM_BOARD_MAX_LABEL_LENGTH, true)) {
        issue(`${path}.label`, `Labels must be at most ${CUSTOM_BOARD_MAX_LABEL_LENGTH} characters without control characters.`)
      }
      const allowed = ['id', 'label', 'role']
      if (slot.role === 'gpio') {
        allowed.push('gpio', 'enabled')
        if (!pinNumber(slot.gpio)) issue(`${path}.gpio`, 'GPIO must be an integer Arduino pin number below 255.')
        else if (gpios.has(slot.gpio)) issue(`${path}.gpio`, `GPIO${slot.gpio} already has a position. Duplicate GPIO pads are not supported.`, 'duplicate-gpio')
        else gpios.add(slot.gpio)
        if (typeof slot.enabled !== 'boolean') issue(`${path}.enabled`, 'Choose whether this GPIO is enabled.')
      } else if (slot.role === 'supply') {
        allowed.push('voltage', 'direction')
        if (typeof slot.voltage !== 'number' || !Number.isFinite(slot.voltage) || slot.voltage <= 0 || slot.voltage > 48) {
          issue(`${path}.voltage`, 'Declare a supply voltage greater than 0 V and at most 48 V.')
        }
        if (slot.direction !== 'input' && slot.direction !== 'output') issue(`${path}.direction`, 'Choose supply input or output.')
      } else if (!['ground', 'reset', 'reserved', 'unconnected'].includes(String(slot.role))) {
        issue(`${path}.role`, 'Define this position or choose Unconnected.', 'undefined-slot')
      }
      keys(slot, allowed, path)
    }
  }
  if (count === 0) issue('leftPins', 'Define at least one physical position.')
  return issues.length ? { ok: false, issues } : { ok: true, definition: value as unknown as CustomBoardDefinition, issues: [] }
}

/** Layout and naming edits never change assignment ownership. */
export function customBoardAssignmentId(definition: Pick<CustomBoardDefinition, 'id' | 'referenceProfileId'>): string {
  return `custom:${definition.id}:${definition.referenceProfileId}`
}

export function newCustomBoardSlotId(): string {
  return crypto.randomUUID()
}

/** New drafts are deliberately incomplete; Apply requires every row to be defined. */
export function createCustomBoardDraft(referenceProfileId: string): CustomBoardDefinition {
  return {
    version: CUSTOM_BOARD_VERSION, id: crypto.randomUUID(), name: 'Custom board', referenceProfileId,
    controllerPower: 'unspecified', defaultI2c: { mode: 'inherit' },
    leftPins: [{ id: newCustomBoardSlotId(), role: 'undefined' }], rightPins: [],
  }
}

/**
 * A header with `count` positions. Rows are kept from the top, so shortening
 * removes the bottom rows and lengthening adds undefined rows there, each with
 * its own new identity.
 */
export function resizeCustomBoardSide(slots: readonly CustomBoardSlot[], count: number): CustomBoardSlot[] {
  const target = Math.max(0, Math.min(CUSTOM_BOARD_MAX_PINS_PER_SIDE, Math.floor(count)))
  if (target <= slots.length) return slots.slice(0, target)
  return [...slots, ...Array.from({ length: target - slots.length }, () => ({ id: newCustomBoardSlotId(), role: 'undefined' as const }))]
}

export function customBoardSlotLabel(slot: CustomBoardSlot): string {
  if (slot.role === 'gpio') {
    // A printed label that already names the GPIO (a stock "VP / GPIO36") is
    // shown as printed rather than repeating the number.
    if (!slot.label) return `GPIO${slot.gpio}`
    return new RegExp(`\\bGPIO${slot.gpio}\\b`).test(slot.label) ? slot.label : `${slot.label} / GPIO${slot.gpio}`
  }
  if (slot.role === 'supply') return `${slot.label ? `${slot.label} / ` : ''}${slot.voltage}V ${slot.direction === 'input' ? 'IN' : 'OUT'}`
  return slot.label || { ground: 'GND', reset: 'RESET', reserved: 'Reserved', unconnected: 'NC', undefined: 'Undefined' }[slot.role]
}

/**
 * Whether an issue stops Apply. An unresolved power method and inherited I2C
 * defaults the header does not carry are allowed while a design is drafted —
 * they are reported, not hidden — but an explicitly chosen SDA/SCL pair must
 * be one the board can use.
 */
export function customBoardIssueBlocksApply(issue: CustomBoardIssue, definition: Pick<CustomBoardDefinition, 'defaultI2c'>): boolean {
  if (issue.scope === 'power') return false
  if (issue.scope === 'i2c') return definition.defaultI2c.mode === 'custom'
  return true
}

import { describe, expect, it } from 'vitest'
import {
  BOARD_PROFILES,
  boardProfileById,
  boardPinVerdict,
  resolveBoardSelection,
  selectedBoardResolution,
  selectedPhysicalBoardProfile,
  validateBoardProfiles,
  type PhysicalBoardProfile,
} from '../boardProfiles'
import { profileI2cDefault } from '../boardI2cDefaults'
import {
  CUSTOM_BOARD_MAX_PINS_PER_SIDE,
  CUSTOM_BOARD_PROFILE_ID,
  createCustomBoardDraft,
  customBoardAssignmentId,
  customBoardIssueBlocksApply,
  customBoardSlotLabel,
  parseCustomBoardDefinition,
  resizeCustomBoardSide,
  type CustomBoardDefinition,
  type CustomBoardSlot,
} from '../customBoard'
import { customBoardRowsFromReference, resolveCustomBoard } from '../customBoardProfile'
import { customBoardEndpointFingerprint, customBoardGeometry, customBoardPowerPad } from '../customBoardGeometry'
import { customBoardSvg } from '../customBoardSvg'

const CLASSIC = 'esp32-generic-devkit-38pin'
const S3 = 'generic-esp32-s3-n16r8-44pin-dual-usbc'

let nextId = 0
const id = () => `slot-${++nextId}`
const gpio = (pin: number, label?: string, enabled = true): CustomBoardSlot => ({ id: id(), role: 'gpio', gpio: pin, enabled, ...(label ? { label } : {}) })
const ground = (): CustomBoardSlot => ({ id: id(), role: 'ground' })
const supply = (voltage: number, direction: 'input' | 'output', label?: string): CustomBoardSlot => ({ id: id(), role: 'supply', voltage, direction, ...(label ? { label } : {}) })

function definition(overrides: Partial<CustomBoardDefinition> = {}): CustomBoardDefinition {
  return {
    version: 1,
    id: 'board-a',
    name: 'Bench board',
    referenceProfileId: CLASSIC,
    controllerPower: 'usb',
    defaultI2c: { mode: 'inherit' },
    leftPins: [supply(3.3, 'output', '3V3'), gpio(16, 'D4'), gpio(17), gpio(21), gpio(22), ground()],
    rightPins: [supply(5, 'input', 'VIN'), gpio(4), gpio(34), gpio(1), ground()],
    ...overrides,
  }
}

function resolve(value: unknown) {
  return resolveCustomBoard(value, boardProfileById)
}

function boardNodes(properties: Record<string, unknown>) {
  return [{ data: { nodeType: 'Board', properties } }]
}

describe('custom board definition', () => {
  it('accepts a complete definition without changing it', () => {
    const value = definition()
    const parsed = parseCustomBoardDefinition(value)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.definition).toBe(value)
    expect(JSON.parse(JSON.stringify(value))).toEqual(value)
  })

  it('rejects unsupported versions, missing data and malformed slots', () => {
    expect(parseCustomBoardDefinition(undefined).ok).toBe(false)
    expect(parseCustomBoardDefinition({ ...definition(), version: 2 })).toMatchObject({ ok: false, issues: [{ code: 'unsupported-version' }] })
    const undefinedRow = parseCustomBoardDefinition(definition({ rightPins: [{ id: 'x', role: 'undefined' }] }))
    expect(undefinedRow).toMatchObject({ ok: false, issues: [{ code: 'undefined-slot', path: 'rightPins.0.role' }] })
    expect(parseCustomBoardDefinition({ ...definition(), extra: true }).ok).toBe(false)
    expect(parseCustomBoardDefinition(definition({ leftPins: [{ ...gpio(4), label: 'bad\u0007' }] })).ok).toBe(false)
    expect(parseCustomBoardDefinition(definition({ leftPins: [{ ...gpio(4), label: 'x'.repeat(49) }] })).ok).toBe(false)
    expect(parseCustomBoardDefinition(definition({ leftPins: [supply(60, 'input')] })).ok).toBe(false)
    expect(parseCustomBoardDefinition(definition({ leftPins: [gpio(255)] })).ok).toBe(false)
  })

  it('requires unique positions and refuses duplicate GPIO pads', () => {
    const shared = ground()
    expect(parseCustomBoardDefinition(definition({ leftPins: [shared], rightPins: [{ ...shared }] })))
      .toMatchObject({ ok: false, issues: [{ code: 'duplicate-slot' }] })
    expect(parseCustomBoardDefinition(definition({ leftPins: [gpio(4)], rightPins: [gpio(4)] })))
      .toMatchObject({ ok: false, issues: [{ code: 'duplicate-gpio' }] })
    // Repeated ground and supply pads are ordinary.
    expect(parseCustomBoardDefinition(definition({ leftPins: [ground(), ground()], rightPins: [supply(3.3, 'output'), supply(3.3, 'output')] })).ok).toBe(true)
  })

  it('bounds each side and requires at least one position overall', () => {
    const full = Array.from({ length: CUSTOM_BOARD_MAX_PINS_PER_SIDE }, ground)
    expect(parseCustomBoardDefinition(definition({ leftPins: full, rightPins: [] })).ok).toBe(true)
    expect(parseCustomBoardDefinition(definition({ leftPins: [...full, ground()], rightPins: [] })).ok).toBe(false)
    expect(parseCustomBoardDefinition(definition({ leftPins: [], rightPins: [] })).ok).toBe(false)
    expect(parseCustomBoardDefinition(definition({ leftPins: [], rightPins: [ground()] })).ok).toBe(true)
  })

  it('needs distinct SDA and SCL', () => {
    expect(parseCustomBoardDefinition(definition({ defaultI2c: { mode: 'custom', sda: 16, scl: 16 } })).ok).toBe(false)
  })

  it('resizes from the bottom of a header and starts new rows undefined', () => {
    const slots = [gpio(4), gpio(5), ground()]
    expect(resizeCustomBoardSide(slots, 2)).toEqual(slots.slice(0, 2))
    const grown = resizeCustomBoardSide(slots, 5)
    expect(grown.slice(0, 3)).toEqual(slots)
    expect(grown.slice(3).map((slot) => slot.role)).toEqual(['undefined', 'undefined'])
    expect(new Set(grown.map((slot) => slot.id)).size).toBe(5)
    expect(resizeCustomBoardSide(slots, 99)).toHaveLength(CUSTOM_BOARD_MAX_PINS_PER_SIDE)
  })

  it('starts new drafts deliberately incomplete', () => {
    const draft = createCustomBoardDraft(CLASSIC)
    expect(draft.controllerPower).toBe('unspecified')
    expect(parseCustomBoardDefinition(draft).ok).toBe(false)
  })
})

describe('custom board resolution', () => {
  it('inherits build settings from its template and nothing physical', () => {
    const reference = boardProfileById(S3)!
    const profile = resolve(definition({ referenceProfileId: S3, leftPins: [gpio(4), ground()], rightPins: [gpio(5)] })).profile!
    expect(profile.compatibleFqbns).toEqual(reference.compatibleFqbns)
    expect(profile.targetFamilies).toEqual(reference.targetFamilies)
    expect(profile.memory).toEqual(reference.memory)
    expect(profile.psramMode).toBe(reference.psramMode)
    expect(profile.internalRamBudgetBytes).toBe(reference.internalRamBudgetBytes)
    expect(profile.confidence).toBe('user-defined')
    expect(profile.render).toBeUndefined()
    expect(profile.peripheralPins).toBeUndefined()
    expect(profile.custom?.referenceLabel).toBe(reference.label)
    expect(profile.pins?.map((pin) => pin.id)).toEqual(profile.pinAnchors?.map((anchor) => anchor.id))
  })

  it('never enters or alters the stock catalogue', () => {
    const before = BOARD_PROFILES.length
    const profile = resolve(definition()).profile!
    expect(BOARD_PROFILES).toHaveLength(before)
    expect(boardProfileById(profile.id)).toBeUndefined()
    expect(boardProfileById(CUSTOM_BOARD_PROFILE_ID)).toBeUndefined()
  })

  it('keeps its assignment identity through layout edits but not a template change', () => {
    const base = definition()
    const moved = { ...base, name: 'Renamed', leftPins: [...base.leftPins].reverse() }
    expect(resolve(moved).profile!.id).toBe(resolve(base).profile!.id)
    expect(resolve(base).profile!.id).toBe(customBoardAssignmentId(base))
    expect(resolve({ ...base, referenceProfileId: 'esp32-devkit-v1-30pin-esp32d' }).profile!.id).not.toBe(resolve(base).profile!.id)
    expect(resolve(base).profile!.id).not.toBe(CLASSIC)
  })

  it('returns the same profile object for an unchanged definition', () => {
    const value = definition()
    expect(resolve(value).profile).toBe(resolve(value).profile)
    const nodes = boardNodes({ profileId: CUSTOM_BOARD_PROFILE_ID, customBoard: value })
    expect(selectedPhysicalBoardProfile(nodes)).toBe(selectedPhysicalBoardProfile(nodes))
  })

  it('reports an unresolved definition rather than falling back to another board', () => {
    const malformed = selectedBoardResolution(boardNodes({ profileId: CUSTOM_BOARD_PROFILE_ID, customBoard: { version: 1 } }))
    expect(malformed.kind).toBe('custom')
    expect(malformed.profile).toBeUndefined()
    expect(malformed.issues.length).toBeGreaterThan(0)
    const missing = selectedBoardResolution(boardNodes({ profileId: CUSTOM_BOARD_PROFILE_ID }))
    expect(missing).toMatchObject({ kind: 'custom', issues: [{ code: 'missing-definition' }] })
    expect(missing.profile).toBeUndefined()
    const unsupported = resolve(definition({ referenceProfileId: 'arduino-uno-r3' }))
    expect(unsupported).toMatchObject({ issues: [{ code: 'unsupported-template' }] })
    expect(unsupported.profile).toBeUndefined()
  })

  it('keeps stock selection and retains the custom definition beside it', () => {
    const value = definition()
    expect(resolveBoardSelection({ profileId: CLASSIC, customBoard: value })).toMatchObject({ kind: 'stock', issues: [] })
    expect(resolveBoardSelection({ profileId: CLASSIC, customBoard: value }).profile).toBe(boardProfileById(CLASSIC))
    expect(resolveBoardSelection({})).toMatchObject({ kind: 'none' })
  })

  it('exposes only defined, enabled and supported GPIOs', () => {
    const profile = resolve(definition({ leftPins: [gpio(16), gpio(17, undefined, false), gpio(6)], rightPins: [ground()] }))
    expect(profile.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-gpio', scope: 'gpio' }))
    const board = profile.profile!
    expect(board.custom!.gpio.recommended.map((note) => note.pin)).toEqual([16])
    expect(boardPinVerdict(board, 16).standing).toBe('safe')
    expect(boardPinVerdict(board, 17)).toEqual({ standing: 'reserved', reason: 'Disabled in the custom board.' })
    expect(boardPinVerdict(board, 18)).toEqual({ standing: 'reserved', reason: 'Not exposed by the custom board.' })
    expect(boardPinVerdict(board, 6).standing).toBe('reserved')
  })

  it('keeps boot, UART and input-only pins out of the automatic pool', () => {
    const board = resolve(definition()).profile!
    expect(board.pinSafety?.safeGeneralPurpose).toEqual([4, 16, 17, 21, 22])
    expect(boardPinVerdict(board, 1)).toMatchObject({ standing: 'caution', reason: expect.stringContaining('UART0') })
    expect(boardPinVerdict(board, 34)).toMatchObject({ standing: 'caution', reason: expect.stringContaining('Input-only') })
    expect(validateBoardProfiles([board])).toEqual([])
  })

  it('shows printed aliases while firmware keeps Arduino numbers', () => {
    const board = resolve(definition()).profile!
    expect(board.custom!.gpio.recommended.find((note) => note.pin === 16)?.label).toBe('D4')
    expect(board.pins?.find((pin) => pin.gpio === 16)?.label).toBe('D4 / GPIO16')
  })

  it('inherits the template I2C pair only when the header carries it', () => {
    const inherited = resolve(definition())
    expect(profileI2cDefault(inherited.profile)).toEqual({ sda: { arduinoPin: 21 }, scl: { arduinoPin: 22 } })
    const missing = resolve(definition({ leftPins: [gpio(16)], rightPins: [gpio(17)] }))
    expect(profileI2cDefault(missing.profile)).toBeUndefined()
    expect(missing.issues.filter((issue) => issue.scope === 'i2c')).toHaveLength(2)
    expect(missing.issues.every((issue) => !customBoardIssueBlocksApply(issue, definition()))).toBe(true)
  })

  it('uses an explicit SDA/SCL pair from its own enabled GPIOs', () => {
    const custom = definition({ defaultI2c: { mode: 'custom', sda: 16, scl: 17 } })
    expect(profileI2cDefault(resolve(custom).profile)).toEqual({ sda: { arduinoPin: 16 }, scl: { arduinoPin: 17 } })
    const inputOnly = definition({ defaultI2c: { mode: 'custom', sda: 34, scl: 17 } })
    const result = resolve(inputOnly)
    expect(profileI2cDefault(result.profile)).toBeUndefined()
    expect(result.issues.some((issue) => customBoardIssueBlocksApply(issue, inputOnly))).toBe(true)
  })

  it('reports an unchosen controller power method without blocking Apply', () => {
    const value = definition({ controllerPower: 'unspecified' })
    const power = resolve(value).issues.filter((issue) => issue.scope === 'power')
    expect(power).toHaveLength(1)
    expect(customBoardIssueBlocksApply(power[0], value)).toBe(false)
  })
})

describe('custom board geometry and SVG', () => {
  it.each([[15, 15], [19, 19], [22, 22], [12, 3], [0, 7], [1, 0]])('lays out %i/%i rails on one pitch', (left, right) => {
    const value = definition({ leftPins: Array.from({ length: left }, ground), rightPins: Array.from({ length: right }, ground) })
    const geometry = customBoardGeometry(value)
    expect(geometry.pads).toHaveLength(left + right)
    for (const pad of geometry.pads) {
      expect(pad.y).toBe(84 + ((pad.row - 1) * geometry.rowPitch))
      expect(pad.y).toBeLessThan(geometry.body.y + geometry.body.height)
      expect(Number.isFinite(pad.x) && Number.isFinite(pad.y)).toBe(true)
    }
    expect(geometry.height).toBe(128 + ((Math.max(1, left, right) - 1) * geometry.rowPitch))
    expect(geometry.nominalDimensionsMm.width / geometry.nominalDimensionsMm.height)
      .toBeCloseTo(geometry.width / geometry.height)
  })

  it('moves a pad endpoint when its row moves but not when its label changes', () => {
    const base = definition()
    const target = base.leftPins[1]
    const before = customBoardEndpointFingerprint(customBoardGeometry(base), target.id)
    const renamed = { ...base, leftPins: base.leftPins.map((slot) => slot.id === target.id ? { ...slot, label: 'IO16' } : slot) }
    expect(customBoardEndpointFingerprint(customBoardGeometry(renamed), target.id)).toBe(before)
    const moved = { ...base, leftPins: base.leftPins.filter((slot) => slot.id !== target.id), rightPins: [...base.rightPins, target] }
    expect(customBoardEndpointFingerprint(customBoardGeometry(moved), target.id)).not.toBe(before)
  })

  it('chooses power pads by declared role and voltage, never by label', () => {
    const value = definition({ leftPins: [supply(5, 'input', '3V3'), ground()], rightPins: [supply(3.3, 'output', 'VIN')] })
    const geometry = customBoardGeometry(value)
    expect(customBoardPowerPad(geometry, 'supply', 3.3, 'output')?.slot.id).toBe(value.rightPins[0].id)
    expect(customBoardPowerPad(geometry, 'ground')?.slot.id).toBe(value.leftPins[1].id)
    expect(customBoardPowerPad(customBoardGeometry(definition({ leftPins: [gpio(4)], rightPins: [] })), 'ground')).toBeUndefined()
  })

  it('escapes every user string and marks the bus functions on their pads', () => {
    const value = definition({
      name: '<script>alert(1)</script>',
      leftPins: [{ ...gpio(16), label: '"><img src=x onerror=1>' }, gpio(17)],
      defaultI2c: { mode: 'custom', sda: 16, scl: 17 },
    })
    const svg = customBoardSvg(value, resolve(value).profile!.custom!.defaultI2c)
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('<img')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toMatch(/GPIO16 · SDA/)
    expect(svg).toMatch(/GPIO17 · SCL/)
    expect(svg).toContain('User-defined pinout — schematic')
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelectorAll('[data-slot-id]')).toHaveLength(value.leftPins.length + value.rightPins.length)
  })
})

describe('copying a reference pin map', () => {
  it('copies GPIO numbers and ground, leaving supplies and unnumbered pads for review', () => {
    const reference = boardProfileById(CLASSIC)!
    const rows = customBoardRowsFromReference(reference)!
    expect(rows.leftPins).toHaveLength(19)
    expect(rows.rightPins).toHaveLength(19)
    const all = [...rows.leftPins, ...rows.rightPins]
    const gpioRows = all.filter((slot): slot is Extract<CustomBoardSlot, { role: 'gpio' }> => slot.role === 'gpio')
    expect(gpioRows.map((slot) => slot.gpio).sort((a, b) => a - b))
      .toEqual(reference.pins!.flatMap((pin) => pin.gpio !== undefined && ![6, 7, 8, 9, 10, 11].includes(pin.gpio) ? [pin.gpio] : []).sort((a, b) => a - b))
    expect(all.filter((slot) => slot.role === 'supply')).toHaveLength(0)
    expect(all.some((slot) => slot.role === 'undefined' && slot.label)).toBe(true)
    expect(all.filter((slot) => slot.role === 'reserved').length).toBeGreaterThan(0)
  })

  it('refuses a template with no two-rail map', () => {
    expect(customBoardRowsFromReference({ ...boardProfileById(CLASSIC)!, pins: [] } as PhysicalBoardProfile)).toBeUndefined()
  })
})

describe('custom board labels', () => {
  it('does not repeat a GPIO number the printed label already names', () => {
    expect(customBoardSlotLabel({ id: 'a', role: 'gpio', gpio: 36, enabled: true, label: 'VP / GPIO36' })).toBe('VP / GPIO36')
    expect(customBoardSlotLabel({ id: 'b', role: 'gpio', gpio: 3, enabled: true, label: 'GPIO36' })).toBe('GPIO36 / GPIO3')
    expect(customBoardSlotLabel({ id: 'c', role: 'gpio', gpio: 16, enabled: true, label: 'D4' })).toBe('D4 / GPIO16')
  })
})

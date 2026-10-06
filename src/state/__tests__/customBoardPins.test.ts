import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boardProfileById, selectedPhysicalBoardProfile, type PhysicalBoardProfile } from '../../build/boardProfiles'
import { resolveCustomBoard } from '../../build/customBoardProfile'
import { CUSTOM_BOARD_PROFILE_ID, type CustomBoardDefinition, type CustomBoardSlot } from '../customBoard'
import { assignPartPins, boardSparePins } from '../partPinAssignment'
import { nextFreeLedDataPin } from '../ledPinAssignment'
import { ASSIGNED_BOARD_KEY, ASSIGNED_PINS_KEY, retargetDefaultI2c, retargetHardwarePins, withAssignedPins } from '../pinRetarget'
import { controllerSettings } from '../controllerSettings'
import { useGraphStore, type StudioNode } from '../graphStore'
import { ROOT_BOARD_NODE_ID } from '../hardware'
import {
  findCustomBoardIssues,
  findDeployBlockingErrors,
  findExactBoardPinIssues,
  buildGraphDiagnostics,
  validateGraph,
} from '../../utils/validateGraph'

const CLASSIC_FQBN = 'esp32:esp32:esp32'
let nextId = 0
const slotId = () => `s${++nextId}`
const gpio = (pin: number, enabled = true): CustomBoardSlot => ({ id: slotId(), role: 'gpio', gpio: pin, enabled })
const ground = (): CustomBoardSlot => ({ id: slotId(), role: 'ground' })

function definition(overrides: Partial<CustomBoardDefinition> = {}): CustomBoardDefinition {
  return {
    version: 1, id: 'bench', name: 'Bench board', referenceProfileId: 'esp32-generic-devkit-38pin',
    controllerPower: 'usb', defaultI2c: { mode: 'inherit' },
    leftPins: [gpio(1), gpio(16), gpio(17), gpio(32), ground()],
    rightPins: [gpio(21), gpio(22), gpio(34), ground()],
    ...overrides,
  }
}

function customProfile(value: CustomBoardDefinition): PhysicalBoardProfile {
  return resolveCustomBoard(value, boardProfileById).profile!
}

function node(id: string, nodeType: string, properties: Record<string, unknown>): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: id, nodeType, category: 'input', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function board(value: unknown, profileId = CUSTOM_BOARD_PROFILE_ID): StudioNode {
  return node('board', 'Board', { profileId, customBoard: value })
}

describe('custom board pin allocation', () => {
  it('allocates only from the exposed pool, never the chip table', () => {
    const profile = customProfile(definition())
    const assigned = assignPartPins(profile, CLASSIC_FQBN, [], [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }])
    expect(assigned).toEqual({ ok: true, pins: { a: 16, b: 17, c: 21, d: 22 } })
    // GPIO1 (UART0) and GPIO34 (input-only) stay out of the automatic pool.
    const fifth = assignPartPins(profile, CLASSIC_FQBN, [], [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }, { key: 'e' }, { key: 'f' }])
    expect(fifth.ok).toBe(false)
  })

  it('keeps an empty or exhausted custom pool at zero', () => {
    const empty = customProfile(definition({ leftPins: [ground()], rightPins: [gpio(1)] }))
    const refused = assignPartPins(empty, CLASSIC_FQBN, [], [{ key: 'pin' }])
    expect(refused).toEqual({ ok: false, reason: expect.stringContaining('Edit the custom board') })
    expect(boardSparePins(empty, new Set())).toEqual([])
    expect(nextFreeLedDataPin(empty, [])).toBeNull()
    const full = customProfile(definition())
    const taken = [16, 17, 21, 22, 32].map((pin, index) => node(`b${index}`, 'ButtonInput', { pin }))
    expect(boardSparePins(full, new Set([16, 17, 21, 22, 32]))).toEqual([])
    expect(assignPartPins(full, CLASSIC_FQBN, taken, [{ key: 'pin' }]).ok).toBe(false)
    // A stock profile without safety data keeps its "unknown" meaning.
    expect(boardSparePins(undefined, new Set())).toBeNull()
  })

  it('places analog roles only on exposed ADC pins', () => {
    const profile = customProfile(definition())
    expect(assignPartPins(profile, CLASSIC_FQBN, [], [{ key: 'pot', capability: 'analogInput' }]))
      .toEqual({ ok: true, pins: { pot: 32 } })
  })

  it('starts LED data on the first free exposed pin', () => {
    expect(nextFreeLedDataPin(customProfile(definition()), [])).toBe(16)
  })

  it('does not move parts onto chip defaults the header lacks', () => {
    const profile = customProfile(definition())
    const sd = node('sd', 'SDCard', { sdCsPin: 10, sdSckPin: 12, sdMisoPin: 13, sdMosiPin: 11 })
    const rtc = node('rtc', 'RTCInput', { sdaPin: 8, sclPin: 9 })
    const result = retargetHardwarePins([sd, rtc], profile, CLASSIC_FQBN, 'previous-board')
    const props = (id: string) => result.nodes.find((entry) => entry.id === id)!.data.properties
    // The classic SD defaults (5/18/19/23) are not on this header.
    expect(props('sd')).toMatchObject({ sdCsPin: 10, sdSckPin: 12 })
    expect(props('rtc')).toMatchObject({ sdaPin: 21, sclPin: 22, [ASSIGNED_BOARD_KEY]: profile.id })
  })

  it('moves only app-placed I2C pins when the default pair changes', () => {
    const before = customProfile(definition())
    const after = customProfile(definition({ defaultI2c: { mode: 'custom', sda: 16, scl: 17 } }))
    expect(after.id).toBe(before.id)
    const appPlaced = node('rtc', 'RTCInput', withAssignedPins({}, { sdaPin: 21, sclPin: 22 }, before.id))
    const chosen = node('env', 'EnvironmentInput', {
      ...withAssignedPins({}, { sdaPin: 21, sclPin: 22 }, before.id), sdaPin: 32, sclPin: 22,
    })
    const unrelated = node('button', 'ButtonInput', withAssignedPins({}, { pin: 4 }, before.id))
    const result = retargetDefaultI2c([appPlaced, chosen, unrelated], after)
    expect(result.moved).toBe(2)
    const props = (id: string) => result.nodes.find((entry) => entry.id === id)!.data.properties
    expect(props('rtc')).toMatchObject({ sdaPin: 16, sclPin: 17 })
    expect(props('rtc')[ASSIGNED_PINS_KEY]).toEqual({ sdaPin: 16, sclPin: 17 })
    // The user's own SDA stays; only its untouched SCL follows the bus.
    expect(props('env')).toMatchObject({ sdaPin: 32, sclPin: 17 })
    expect(props('button')).toEqual(unrelated.data.properties)
  })
})

describe('custom board diagnostics', () => {
  it('blocks a part left on a removed GPIO and keeps its assignment', () => {
    const value = definition({ leftPins: [gpio(16), ground()] })
    const nodes = [board(value), node('button', 'ButtonInput', { pin: 17 })]
    const exact = findExactBoardPinIssues(nodes)
    expect(exact.errors).toEqual([expect.stringContaining('Not exposed by the custom board')])
    expect(findDeployBlockingErrors(nodes, [], CLASSIC_FQBN)).toEqual(expect.arrayContaining(exact.errors))
    expect(nodes[1].data.properties.pin).toBe(17)
  })

  it('blocks firmware for an unresolved definition in the gate and Graph Health alike', () => {
    // A part beside the Board, so Graph Health reports more than an empty graph.
    const nodes = [board({ version: 1, id: 'x' }), node('button', 'ButtonInput', { pin: 16 })]
    const custom = findCustomBoardIssues(nodes)
    expect(custom.errors.length).toBeGreaterThan(0)
    const gate = findDeployBlockingErrors(nodes, [], CLASSIC_FQBN)
    expect(gate).toEqual(expect.arrayContaining(custom.errors))
    expect(validateGraph(nodes, [], CLASSIC_FQBN).errors).toEqual(expect.arrayContaining(custom.errors))
    const health = buildGraphDiagnostics(nodes, [], { selectedFqbn: CLASSIC_FQBN })
    for (const message of custom.errors) {
      expect(health).toContainEqual(expect.objectContaining({ severity: 'error', message, action: 'open-board-settings' }))
    }
  })

  it('keeps an unresolved power method and I2C pair out of the firmware gate', () => {
    const nodes = [board(definition({ controllerPower: 'unspecified', rightPins: [ground()] }))]
    const custom = findCustomBoardIssues(nodes)
    expect(custom.errors).toEqual([])
    expect(custom.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Controller power is unresolved'),
      expect.stringContaining('Default I2C SDA'),
    ]))
    expect(findDeployBlockingErrors(nodes, [], CLASSIC_FQBN).filter((message) => message.startsWith('Custom board'))).toEqual([])
    expect(validateGraph(nodes, [], CLASSIC_FQBN).warnings).toEqual(expect.arrayContaining(custom.warnings))
  })

  it('inherits the template PSRAM policy through the resolved board', () => {
    const value = definition({ referenceProfileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc', leftPins: [gpio(4)], rightPins: [ground()] })
    expect(controllerSettings([board(value)])).toMatchObject({ usePsram: true, psramMode: 'opi' })
  })
})

describe('applyCustomBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.getState().loadGraph([], [])
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()
  })
  afterEach(() => { vi.useRealTimers() })

  const boardProps = () => useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'Board')!.data.properties

  it('saves and selects the definition as one undo step', () => {
    const before = boardProps().profileId
    const value = definition()
    expect(useGraphStore.getState().applyCustomBoard(ROOT_BOARD_NODE_ID, value)).toEqual({ ok: true })
    expect(boardProps()).toMatchObject({ profileId: CUSTOM_BOARD_PROFILE_ID, customBoard: value })
    expect(selectedPhysicalBoardProfile(useGraphStore.getState().nodes)?.label).toBe('Bench board')
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().undo()
    expect(boardProps().profileId).toBe(before)
    expect(boardProps().customBoard).toBeUndefined()
    useGraphStore.temporal.getState().redo()
    expect(boardProps()).toMatchObject({ profileId: CUSTOM_BOARD_PROFILE_ID, customBoard: value })
  })

  it('refuses an incomplete definition and changes nothing', () => {
    const before = boardProps()
    const result = useGraphStore.getState().applyCustomBoard(ROOT_BOARD_NODE_ID, definition({
      leftPins: [{ id: 'u', role: 'undefined' }],
    }))
    expect(result.ok).toBe(false)
    expect(boardProps()).toBe(before)
  })

  it('retains the definition while a stock board is selected', () => {
    const value = definition()
    useGraphStore.getState().applyCustomBoard(ROOT_BOARD_NODE_ID, value)
    useGraphStore.getState().selectBoardProfile(ROOT_BOARD_NODE_ID, 'esp32-devkit-v1-30pin-esp32d')
    expect(boardProps()).toMatchObject({ profileId: 'esp32-devkit-v1-30pin-esp32d', customBoard: value })
    useGraphStore.getState().selectBoardProfile(ROOT_BOARD_NODE_ID, CUSTOM_BOARD_PROFILE_ID)
    expect(selectedPhysicalBoardProfile(useGraphStore.getState().nodes)?.custom?.definition).toBe(value)
  })

  it('moves app-placed I2C pins with a changed bus in the same undo step', () => {
    const first = definition()
    useGraphStore.getState().applyCustomBoard(ROOT_BOARD_NODE_ID, first)
    const id = selectedPhysicalBoardProfile(useGraphStore.getState().nodes)!.id
    useGraphStore.setState((state) => ({
      nodes: [...state.nodes, node('rtc', 'RTCInput', withAssignedPins({}, { sdaPin: 21, sclPin: 22 }, id))],
    }))
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()
    useGraphStore.getState().applyCustomBoard(ROOT_BOARD_NODE_ID, { ...first, defaultI2c: { mode: 'custom', sda: 16, scl: 17 } })
    const rtc = () => useGraphStore.getState().nodes.find((entry) => entry.id === 'rtc')!.data.properties
    expect(rtc()).toMatchObject({ sdaPin: 16, sclPin: 17 })
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().undo()
    expect(rtc()).toMatchObject({ sdaPin: 21, sclPin: 22 })
    expect(boardProps().customBoard).toBe(first)
  })
})

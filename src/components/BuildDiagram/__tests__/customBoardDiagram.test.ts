import { describe, expect, it } from 'vitest'
import { boardProfileById, type PhysicalBoardProfile } from '../../../build/boards/boardProfiles'
import { buildBomRows } from '../../../build/buildExports'
import { ensureBuildProfile } from '../../../build/buildProfile'
import { customBoardGeometry } from '../../../build/boards/customBoardGeometry'
import { resolveCustomBoard } from '../../../build/boards/customBoardProfile'
import { calculateElectricalPlan } from '../../../build/power/electricalPlan'
import { buildHardwareManifest } from '../../../build/hardwareManifest'
import type { CustomBoardDefinition } from '../../../build/boards/customBoard'
import type { StudioNode } from '../../../state/graphStore'
import {
  CONTROLLER_SLOT_X,
  controllerConnectionPoint,
  controllerPowerPoint,
  customControllerLayout,
} from '../controllerGeometry'
import type { PhysicalDiagramConnection } from '../signalPresentation'

function definition(overrides: Partial<CustomBoardDefinition> = {}): CustomBoardDefinition {
  return {
    version: 1, id: 'bench', name: 'Bench board', referenceProfileId: 'esp32-generic-devkit-38pin',
    controllerPower: 'usb', defaultI2c: { mode: 'inherit' },
    leftPins: [
      { id: 'v33', role: 'supply', voltage: 3.3, direction: 'output', label: 'VIN' },
      { id: 'g16', role: 'gpio', gpio: 16, enabled: true },
      { id: 'gnd', role: 'ground' },
    ],
    rightPins: [
      { id: 'vin', role: 'supply', voltage: 5, direction: 'input', label: '5V' },
      { id: 'g17', role: 'gpio', gpio: 17, enabled: true },
    ],
    ...overrides,
  }
}

const board = (value = definition()): PhysicalBoardProfile => resolveCustomBoard(value, boardProfileById).profile!

const connection = (boardAnchorId: string | undefined): PhysicalDiagramConnection => ({
  id: `c-${boardAnchorId}`, itemId: 'item', boardAnchorId, pinLabel: 'GPIO16', useLabel: 'LED data',
} as unknown as PhysicalDiagramConnection)

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'input', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

describe('custom board on the Build Diagram', () => {
  it.each([[15, 15], [22, 22], [40, 2]])('fits a %i/%i schematic inside the controller slot', (left, right) => {
    const slot = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}`, role: 'ground' as const }))
    const layout = customControllerLayout(board(definition({ leftPins: slot('l', left), rightPins: slot('r', right) })))!
    expect(layout.x).toBeGreaterThanOrEqual(CONTROLLER_SLOT_X)
    expect(layout.x + layout.width).toBeLessThanOrEqual(CONTROLLER_SLOT_X + 184 + 0.001)
    expect(layout.y).toBeGreaterThanOrEqual(104 - 0.001)
    expect(layout.y + layout.height).toBeCloseTo(530)
  })

  it('ends each wire on the pad its slot names, with one transform', () => {
    const profile = board()
    const layout = customControllerLayout(profile)!
    const pad = customBoardGeometry(profile.custom!.definition).padsBySlotId.get('g17')!
    expect(controllerConnectionPoint(connection('g17'), 0, 1, profile)).toEqual({
      x: layout.x + (pad.x * layout.scale), y: layout.y + (pad.y * layout.scale), side: 'right', mapped: true,
    })
    // A pin the board does not carry is drawn as not on board, never invented.
    expect(controllerConnectionPoint(connection(undefined), 0, 1, profile).mapped).toBe(false)
  })

  it('takes power rails from declared roles and voltage, never labels', () => {
    const profile = board()
    const layout = customControllerLayout(profile)!
    const pads = customBoardGeometry(profile.custom!.definition).padsBySlotId
    // The pad printed VIN is the 3.3 V output; the one printed 5V is an input.
    expect(controllerPowerPoint('3v3', profile)).toMatchObject({ y: layout.y + (pads.get('v33')!.y * layout.scale), side: 'left' })
    expect(controllerPowerPoint('ground', profile)).toMatchObject({ y: layout.y + (pads.get('gnd')!.y * layout.scale) })
    expect(controllerPowerPoint('usb', profile)).toBeDefined()
    const noRails = board(definition({ controllerPower: 'external', leftPins: [{ id: 'g16', role: 'gpio', gpio: 16, enabled: true }], rightPins: [] }))
    expect(controllerPowerPoint('3v3', noRails)).toBeUndefined()
    expect(controllerPowerPoint('ground', noRails)).toBeUndefined()
    expect(controllerPowerPoint('usb', noRails)).toBeUndefined()
  })
})

describe('custom board electrical plan', () => {
  const output = () => node('out', 'MatrixOutput', { form: 'matrix', width: 8, height: 8, chipset: 'WS2812B', dataPin: 16 })
  const plan = (profile: PhysicalBoardProfile, nodes: StudioNode[] = [output()]) =>
    calculateElectricalPlan(buildHardwareManifest(nodes, [], 'esp32:esp32:esp32'), ensureBuildProfile({ version: 1 }), profile)

  it('states the declared power method and never invents USB-C', () => {
    expect(plan(board()).controllerPowerPath).toBe('USB power (user-declared, controller only)')
    expect(plan(board()).recommendations.join(' ')).not.toContain('USB-C')
    expect(plan(board(definition({ controllerPower: 'external' }))).controllerPowerPath)
      .toBe('External supply into 5V / 5V IN (user-declared; input rating unverified)')
  })

  it('leaves an unchosen power method unresolved without blocking anything else', () => {
    const result = plan(board(definition({ controllerPower: 'unspecified' })))
    expect(result.unresolved).toContain('Custom board: the controller power method is unresolved.')
    expect(result.powerReadyPasses).toBe(false)
    expect(result.blockers).toEqual([])
  })

  it('plans no converter into a user-declared input', () => {
    const buck = node('buck', 'PowerConverter', { partId: 'lm2596-buck-module', sourceVoltage: 12 })
    const result = plan(board(definition({ controllerPower: 'external' })), [output(), buck])
    expect(result.blockers.some((issue) => issue.id.endsWith(':custom-board-power-path'))).toBe(true)
  })

  it('records the schematic provenance on the parts list', () => {
    const profile = board()
    const manifest = buildHardwareManifest([output()], [], 'esp32:esp32:esp32')
    const rows = buildBomRows(manifest, plan(profile), ensureBuildProfile({ version: 1 }), profile)
    expect(rows[0]).toMatchObject({
      item: 'Bench board',
      specification: 'User-defined pinout — schematic; build settings from Generic ESP32 DevKit, 38-pin',
    })
  })
})

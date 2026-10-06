import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../../codegen/controlGraph'
import {
  peripheralGroundPadIndex, peripheralPowerNet, peripheralPowerPadIndex, peripheralSignalPadIndex,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { findPinConflicts } from '../../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { libraryDefaults, NODE_LIBRARY, gpioRequirementForProperty } from '../../nodeLibrary'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_OPTIONS } from '../../../build/parts/partOptions'
import {
  JOYSTICK_DEFAULT_DEADZONE, joystickAxis, joystickDeadzone, joystickSpec, KY023_PART_ID,
} from '../joystick'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

function stickGraph(properties: Record<string, unknown> = {}) {
  const nodes = [
    node('stick', 'JoystickInput', properties),
    node('map', 'MapRange', { inMin: -1, inMax: 1, outMin: 0, outMax: 1 }),
    node('fill', 'SolidColor'), node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('x', 'stick', 'x', 'map', 'value'),
    edge('amount', 'map', 'result', 'fade', 'fade'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the catalogued KY-023', () => {
  it('carries its pot value and switch sense, and orders the pads GND, +5V, VRx, VRy, SW', () => {
    expect(joystickSpec(KY023_PART_ID)).toMatchObject({ device: 'KY-023', axisPotOhms: 10000, switchActive: 'low' })
    expect(PART_OPTIONS.JoystickInput.options.map((option) => option.id)).toEqual([KY023_PART_ID])
    expect(partById(KY023_PART_ID)?.pinLabelsLeftToRight).toEqual(['GND', '+5V', 'VRx', 'VRy', 'SW'])
  })

  it('needs analog pins for the axes and a pull-up pin for the switch', () => {
    expect(gpioRequirementForProperty('JoystickInput', 'xPin', {})).toEqual({ capability: 'analogInput', pullup: false })
    expect(gpioRequirementForProperty('JoystickInput', 'yPin', {})).toEqual({ capability: 'analogInput', pullup: false })
    expect(gpioRequirementForProperty('JoystickInput', 'swPin', {})).toEqual({ capability: 'digitalInput', pullup: true })
  })
})

describe('the axis maths', () => {
  it('is 0 at rest, reaches the ends, and removes the dead zone', () => {
    expect(joystickAxis(0.5, 0.08)).toBe(0)
    expect(joystickAxis(0.5 + 0.03, 0.08)).toBe(0)
    expect(joystickAxis(1, 0.08)).toBe(1)
    expect(joystickAxis(0, 0.08)).toBe(-1)
    // Just past the dead zone the axis starts from 0, not from the dead zone's edge.
    expect(joystickAxis(0.5 + 0.041, 0.08)).toBeCloseTo((0.082 - 0.08) / 0.92, 6)
    expect(joystickAxis(9, 0.08)).toBe(1)
    expect(joystickAxis(-9, 0.08)).toBe(-1)
  })

  it('accepts only a dead zone below half travel', () => {
    expect(joystickDeadzone(0.2)).toBe(0.2)
    expect(joystickDeadzone(0)).toBe(0)
    for (const bad of [-0.1, 0.5, 2, NaN, '', undefined, 'x']) expect(joystickDeadzone(bad)).toBe(JOYSTICK_DEFAULT_DEADZONE)
  })
})

describe('joystick firmware', () => {
  it('emits the axis helper once, reads both ADC pins and pulls SW up', () => {
    const { nodes, edges } = stickGraph({ xPin: 32, yPin: 33, swPin: 25, deadzone: 0.1 })
    const sketch = generateCpp(nodes, edges)
    expect(sketch.match(/static float _joyAxis\(/g)).toHaveLength(1)
    expect(sketch).toContain('float n_stick_x = _joyAxis(analogRead(32), 0.100f);')
    expect(sketch).toContain('float n_stick_y = _joyAxis(analogRead(33), 0.100f);')
    expect(sketch).toContain('bool n_stick_pressed = digitalRead(25) == LOW;')
    expect(sketch).toContain('pinMode(25, INPUT_PULLUP);')
    expect(sketch).toContain('float v = (float)raw / 4095.0f * 2.0f - 1.0f;')
  })

  it('keeps a sketch without a joystick free of the helper', () => {
    const sketch = generateCpp([node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })],
      [edge('frame', 'fill', 'frame', 'out', 'frame')])
    expect(sketch).not.toContain('_joyAxis')
  })

  it('is available to the shared show/player control compiler', () => {
    const sensor = node('stick', 'JoystickInput', { xPin: 32, yPin: 33, swPin: 25 })
    const map = node('map', 'MapRange', { inMin: -1, inMax: 1, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('x', 'stick', 'x', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.helpers.join('\n')).toContain('static float _joyAxis(')
    expect(emitted.setup.join('\n')).toContain('pinMode(25, INPUT_PULLUP)')
    expect(emitted.loop.join('\n')).toContain('_joyAxis(analogRead(32)')
  })
})

describe('joystick wiring', () => {
  it('uses three GPIOs, flags a shared pin, and finds the supply, ground and signal pads', () => {
    const stick = node('stick', 'JoystickInput', { xPin: 32, yPin: 33, swPin: 25 })
    expect(collectPinUses([stick]).map((use) => [use.propertyKey, use.pin]))
      .toEqual([['xPin', 32], ['yPin', 33], ['swPin', 25]])
    expect(findPinConflicts([stick, node('other', 'JoystickInput', { xPin: 32, yPin: 34, swPin: 26 })]).length).toBeGreaterThan(0)
    expect(findPinConflicts([stick, node('other2', 'JoystickInput', { xPin: 34, yPin: 35, swPin: 26 })])).toEqual([])

    const [item] = buildHardwareManifest([stick], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(KY023_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'joystick-input', supported: true, facts: { supply: '3.3 V' } })
    // The board prints +5V, but 3.3 V keeps both axes inside the ADC range.
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('+5V')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('VRx')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('VRy')
    expect(pads[peripheralSignalPadIndex(item, 2)]).toBe('SW')
  })
})

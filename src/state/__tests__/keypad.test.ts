import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../codegen/controlGraph'
import {
  peripheralHasGround, peripheralPowerPadIndex, peripheralSignalPadIndex,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import { findPinConflicts } from '../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../graphStore'
import { libraryDefaults, NODE_LIBRARY, gpioRequirementForProperty } from '../nodeLibrary'
import { partById } from '../partCatalogue'
import { PART_OPTIONS } from '../partOptions'
import {
  KEYPAD_COL_KEYS, KEYPAD_KEY_COUNT, KEYPAD_LEGENDS, KEYPAD_PART_ID, KEYPAD_ROW_KEYS,
} from '../keypad'

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

const PINS = { row1Pin: 13, row2Pin: 14, row3Pin: 27, row4Pin: 26, col1Pin: 25, col2Pin: 33, col3Pin: 32, col4Pin: 4 }

function keypadGraph(properties: Record<string, unknown> = {}) {
  const nodes = [
    node('pad', 'KeypadInput', { ...PINS, ...properties }),
    node('map', 'MapRange', { inMin: 0, inMax: 15, outMin: 0, outMax: 1 }),
    node('fill', 'SolidColor'), node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('key', 'pad', 'key', 'map', 'value'),
    edge('amount', 'map', 'result', 'fade', 'fade'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the catalogued keypad', () => {
  it('orders the contacts R1 to R4 then C1 to C4, and prints the keys row by row', () => {
    expect(partById(KEYPAD_PART_ID)?.pinLabelsLeftToRight).toEqual(['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'])
    expect(PART_OPTIONS.KeypadInput.options.map((option) => option.id)).toEqual([KEYPAD_PART_ID])
    expect(KEYPAD_LEGENDS).toHaveLength(KEYPAD_KEY_COUNT)
    expect(KEYPAD_LEGENDS.join('')).toBe('123A456B789C*0#D')
  })

  it('reads rows through a pull-up and drives columns', () => {
    for (const key of KEYPAD_ROW_KEYS) {
      expect(gpioRequirementForProperty('KeypadInput', key, {})).toEqual({ capability: 'digitalInput', pullup: true })
    }
    for (const key of KEYPAD_COL_KEYS) {
      expect(gpioRequirementForProperty('KeypadInput', key, {})).toEqual({ capability: 'digitalOutput', pullup: false })
    }
  })
})

describe('keypad firmware', () => {
  it('emits the scan helper once, sets the pins and debounces over two reads', () => {
    const { nodes, edges } = keypadGraph()
    const sketch = generateCpp(nodes, edges)
    expect(sketch.match(/static int8_t _keypadScan\(/g)).toHaveLength(1)
    for (const pin of [13, 14, 27, 26]) expect(sketch).toContain(`pinMode(${pin}, INPUT_PULLUP);`)
    for (const pin of [25, 33, 32, 4]) expect(sketch).toContain(`pinMode(${pin}, INPUT);`)
    expect(sketch).toContain('_kpRows_pad[4] = {13, 14, 27, 26};')
    expect(sketch).toContain('_kpCols_pad[4] = {25, 33, 32, 4};')
    expect(sketch).toContain('found = (int8_t)(r * 4 + c)')
    expect(sketch).toContain('if (_kpNow_pad == _kpPrev_pad) _kpKey_pad = _kpNow_pad;')
    expect(sketch).toContain('float n_pad_key = _kpLast_pad;')
    expect(sketch).toContain('bool n_pad_pressed = _kpKey_pad >= 0;')
  })

  it('keeps a sketch without a keypad free of the helper', () => {
    const sketch = generateCpp([node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })],
      [edge('frame', 'fill', 'frame', 'out', 'frame')])
    expect(sketch).not.toContain('_keypadScan')
  })

  it('is available to the shared show/player control compiler', () => {
    const sensor = node('pad', 'KeypadInput', PINS)
    const map = node('map', 'MapRange', { inMin: 0, inMax: 15, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('key', 'pad', 'key', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.helpers.join('\n')).toContain('static int8_t _keypadScan(')
    expect(emitted.setup.join('\n')).toContain('pinMode(13, INPUT_PULLUP)')
    expect(emitted.loop.join('\n')).toContain('_keypadScan(_kpRows_pad, _kpCols_pad)')
  })
})

describe('keypad wiring', () => {
  it('claims eight GPIOs, flags a shared pin, and has no supply or ground to draw', () => {
    const pad = node('pad', 'KeypadInput', PINS)
    expect(collectPinUses([pad]).map((use) => [use.propertyKey, use.pin])).toEqual([
      ['row1Pin', 13], ['row2Pin', 14], ['row3Pin', 27], ['row4Pin', 26],
      ['col1Pin', 25], ['col2Pin', 33], ['col3Pin', 32], ['col4Pin', 4],
    ])
    expect(findPinConflicts([pad, node('other', 'KeypadInput', { ...PINS, col4Pin: 13 })]).length).toBeGreaterThan(0)

    const [item] = buildHardwareManifest([pad], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(KEYPAD_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'keypad-input', supported: true, facts: { keys: '16 (4 x 4)' } })
    expect(peripheralPowerPadIndex(item)).toBeNull()
    expect(peripheralHasGround(item)).toBe(false)
    KEYPAD_ROW_KEYS.forEach((_, index) => expect(pads[peripheralSignalPadIndex(item, index)]).toBe(`R${index + 1}`))
    KEYPAD_COL_KEYS.forEach((_, index) => expect(pads[peripheralSignalPadIndex(item, 4 + index)]).toBe(`C${index + 1}`))
  })

  it('leaves every other module\'s ground alone', () => {
    const [item] = buildHardwareManifest([node('pir', 'MotionInput', { pin: 14 })], [], 'esp32:esp32:esp32').primaryItems
    expect(peripheralHasGround(item)).toBe(true)
  })
})

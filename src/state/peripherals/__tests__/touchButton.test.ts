import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../../codegen/controlGraph'
import {
  peripheralGroundPadIndex, peripheralPowerNet, peripheralPowerPadIndex,
  peripheralSignalPadIndex,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { evaluateGraphFull } from '../../graphEvaluator'
import { useHardwareInputStore } from '../hardwareInputStore'
import { gpioRequirementForProperty, libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import { partById } from '../../../build/parts/partCatalogue'
import { touchButtonPressedLevel, touchButtonSpec } from '../touchButton'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

describe('the catalogued Grove Touch Sensor', () => {
  it('keeps the verified orientation and active-high contract together', () => {
    expect(partById('seeed-grove-touch-sensor')?.pinLabelsLeftToRight)
      .toEqual(['SIG', 'NC', 'VCC', 'GND'])
    expect(touchButtonSpec('seeed-grove-touch-sensor')).toMatchObject({
      device: 'TTP223-BA6', activeLevel: 'high', mode: 'momentary',
      supplyMinV: 2, supplyMaxV: 5.5, responseMinMs: 60, responseMaxMs: 220,
    })
    expect(touchButtonPressedLevel('seeed-grove-touch-sensor')).toBe('HIGH')
  })
})

describe('TouchButtonInput', () => {
  it('publishes the on-node touch simulator in preview', () => {
    const touch = node('touch-preview', 'TouchButtonInput')
    useHardwareInputStore.getState().setButton(touch.id, true)
    expect(evaluateGraphFull([touch], [], 0).outputs.get(touch.id)).toEqual({ touched: true })
  })

  it('uses a driven digital input with no internal pull-up', () => {
    const props = libraryDefaults('TouchButtonInput')
    expect(gpioRequirementForProperty('TouchButtonInput', 'pin', props))
      .toEqual({ capability: 'digitalInput', pullup: false })
  })

  it('generates the active-high read in normal and control-graph firmware', () => {
    const touch = node('touch', 'TouchButtonInput', { pin: 21 })
    const ocean = node('ocean', 'Pacifica')
    const fire = node('fire', 'Fire2012')
    const select = node('select', 'FrameSwitch')
    const out = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
    const edges = [
      edge('a', 'ocean', 'frame', 'select', 'a'),
      edge('b', 'fire', 'frame', 'select', 'b'),
      edge('sel', 'touch', 'touched', 'select', 'sel'),
      edge('out', 'select', 'frame', 'out', 'frame'),
    ]
    const sketch = generateCpp([touch, ocean, fire, select, out], edges)
    expect(sketch).toContain('pinMode(21, INPUT);')
    expect(sketch).toContain('bool n_touch_touched = digitalRead(21) == HIGH;')

    const graph = createControlGraph([touch], [])
    expect(graph.resolve('touch', 'touched', 'bool')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.setup.join('\n')).toContain('pinMode(21, INPUT);')
    expect(emitted.loop.join('\n')).toContain('bool n_touch_touched = digitalRead(21) == HIGH;')
  })

  it('claims SIG and draws it with 3.3 V and ground on the exact part', () => {
    const touch = node('touch', 'TouchButtonInput', { pin: 21 })
    expect(collectPinUses([touch]).map((use) => [use.propertyKey, use.pin]))
      .toEqual([['pin', 21]])
    const [item] = buildHardwareManifest([touch], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById('seeed-grove-touch-sensor')!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'touch-button-input',
      supported: true,
      facts: { partId: 'seeed-grove-touch-sensor', trigger: 'active-high', supplyVoltage: 3.3 },
    })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SIG')
  })
})

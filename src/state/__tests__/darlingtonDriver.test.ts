import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import {
  peripheralGroundPadIndex, peripheralPowerPadIndex, peripheralSignalPadIndex,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import { FIXTURE_PARTS } from '../../components/Hardware/hardwarePartCatalog'
import { findPinConflicts } from '../../utils/validateGraph'
import {
  DARLINGTON_PART_ID, darlingtonActiveHigh, darlingtonInputs, darlingtonPinKeys, darlingtonSpec,
} from '../darlingtonDriver'
import type { StudioEdge, StudioNode } from '../graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../nodeLibrary'
import { partById } from '../partCatalogue'
import { PART_OPTIONS } from '../partOptions'

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

/** A button drives channel 1 only; the other seven are left unwired. */
function driverGraph(properties: Record<string, unknown> = {}) {
  const nodes = [
    node('drv', 'DarlingtonDriverOutput', properties), node('btn', 'ButtonInput', { pin: 15 }),
    node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('frame', 'fill', 'frame', 'out', 'frame'),
    edge('c1', 'btn', 'pressed', 'drv', 'channel1'),
  ]
  return { nodes, edges }
}

describe('the catalogued ULN2803A', () => {
  it('carries an active-high eight-channel contract and its DIP-18 pinout in pin order', () => {
    expect(darlingtonSpec(DARLINGTON_PART_ID)).toMatchObject({
      device: 'ULN2803A', channels: 8, inputActiveLevel: 'high', maxOutputVoltageV: 50, maxChannelCurrentMa: 500,
    })
    expect(darlingtonActiveHigh(DARLINGTON_PART_ID)).toBe(true)
    expect(partById(DARLINGTON_PART_ID)?.pinLabelsLeftToRight).toEqual(
      ['1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', 'GND', 'COM', '8C', '7C', '6C', '5C', '4C', '3C', '2C', '1C'])
    expect(PART_OPTIONS.DarlingtonDriverOutput.options.map((option) => option.id)).toEqual([DARLINGTON_PART_ID])
    expect(FIXTURE_PARTS.find((entry) => entry.nodeType === 'DarlingtonDriverOutput')?.pinRequests?.map((request) => request.key))
      .toEqual(darlingtonPinKeys())
  })

  it('is a sink with eight boolean channels and eight default pins', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'DarlingtonDriverOutput')!
    expect(definition.outputs).toEqual([])
    expect(definition.inputs).toEqual(darlingtonInputs())
    expect(definition.inputs.every((port) => port.dataType === 'bool')).toBe(true)
    const pins = darlingtonPinKeys().map((key) => libraryDefaults('DarlingtonDriverOutput')[key])
    expect(new Set(pins).size).toBe(8)
  })
})

describe('Darlington driver firmware', () => {
  it('latches every input low before enabling it, then follows each channel', () => {
    const { nodes, edges } = driverGraph({ drive1Pin: 4, drive2Pin: 13 })
    const sketch = generateCpp(nodes, edges)
    expect(sketch.indexOf('digitalWrite(4, LOW);')).toBeLessThan(sketch.indexOf('pinMode(4, OUTPUT);'))
    expect(sketch).toMatch(/digitalWrite\(4, [^;]+ \? HIGH : LOW\);/)
    expect(sketch).toMatch(/digitalWrite\(13, false \? HIGH : LOW\);/)
    expect(sketch.match(/pinMode\(\d+, OUTPUT\);/g)?.length).toBeGreaterThanOrEqual(8)
  })

  it('keeps a sketch without the driver free of its pins', () => {
    const sketch = generateCpp([node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })],
      [edge('frame', 'fill', 'frame', 'out', 'frame')])
    expect(sketch).not.toContain('pinMode(33, OUTPUT);')
  })
})

describe('Darlington driver wiring', () => {
  it('claims eight pins, collides with another user of one, and draws the inputs and ground only', () => {
    const driver = node('drv', 'DarlingtonDriverOutput')
    expect(collectPinUses([driver]).map((use) => use.propertyKey)).toEqual(darlingtonPinKeys())
    expect(findPinConflicts([driver, node('b', 'BuzzerOutput', { sigPin: 4 })]).length).toBeGreaterThan(0)

    const [item] = buildHardwareManifest([driver], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(DARLINGTON_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'darlington-driver-output', supported: true,
      facts: { partId: DARLINGTON_PART_ID, channels: '8', inputActiveLevel: 'high', maxOutputVoltage: '50 V', maxChannelCurrent: '500 mA' },
    })
    // No controller supply: COM is the load supply's clamp return.
    expect(peripheralPowerPadIndex(item)).toBeNull()
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    for (let channel = 0; channel < 8; channel += 1) {
      expect(pads[peripheralSignalPadIndex(item, channel)]).toBe(`${channel + 1}B`)
    }
  })
})

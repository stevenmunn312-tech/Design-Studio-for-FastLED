import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../../codegen/controlGraph'
import {
  dataPullUp, peripheralGroundPadIndex, peripheralPadPoint, peripheralPowerNet,
  peripheralPowerPadIndex, peripheralSignalEndPoint, peripheralSignalPadIndex, PERIPHERAL_RENDER_H,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { findPinConflicts } from '../../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { libraryDefaults, NODE_LIBRARY, gpioRequirementForProperty } from '../../nodeLibrary'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_OPTIONS } from '../../../build/parts/partOptions'
import {
  DS18B20_PART_ID, formatPullUp, temperaturePreviewDefault, temperaturePreviewReading,
  temperatureSensorSpec,
} from '../temperatureSensor'

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

function probeGraph(properties: Record<string, unknown> = {}) {
  const nodes = [
    node('probe', 'TemperatureInput', properties),
    node('map', 'MapRange', { inMin: 0, inMax: 60, outMin: 0, outMax: 1 }),
    node('fill', 'SolidColor'), node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('temperature', 'probe', 'temperature', 'map', 'value'),
    edge('amount', 'map', 'result', 'fade', 'fade'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the catalogued DS18B20 probe', () => {
  it('carries its range and pull-up, and orders the wires so DATA is last', () => {
    expect(temperatureSensorSpec(DS18B20_PART_ID)).toMatchObject({
      device: 'DS18B20', interface: '1-Wire', temperatureMinC: -55, temperatureMaxC: 125, pullUpOhms: 4700,
    })
    expect(formatPullUp(4700)).toBe('4.7 kΩ')
    expect(PART_OPTIONS.TemperatureInput.options.map((option) => option.id)).toEqual([DS18B20_PART_ID])
    expect(partById(DS18B20_PART_ID)?.pinLabelsLeftToRight).toEqual(['VCC', 'GND', 'DATA'])
  })

  it('maps the preview slider across the probe range', () => {
    expect(temperaturePreviewReading(DS18B20_PART_ID, temperaturePreviewDefault(DS18B20_PART_ID))).toBeCloseTo(22, 6)
    expect(temperaturePreviewReading(DS18B20_PART_ID, 0)).toBe(-55)
    expect(temperaturePreviewReading(DS18B20_PART_ID, 1)).toBe(125)
    expect(temperaturePreviewReading(DS18B20_PART_ID, 7)).toBe(125)
  })

  it('needs an output-capable pin, since the bus is driven low and released', () => {
    expect(gpioRequirementForProperty('TemperatureInput', 'pin', {}))
      .toEqual({ capability: 'digitalOutput', pullup: false })
  })
})

describe('temperature firmware', () => {
  it('emits the 1-Wire helpers once and a non-blocking read per probe', () => {
    const { nodes, edges } = probeGraph({ pin: 4 })
    const sketch = generateCpp(nodes, edges)
    expect(sketch.match(/static bool _ds18Read\(/g)).toHaveLength(1)
    expect(sketch).not.toContain('#include <Wire.h>')
    expect(sketch).toContain('_ds18Start(4)')
    expect(sketch).toContain('_ds18Read(4, _ds18Value)')
    expect(sketch).toContain('>= 800')
    expect(sketch).toContain('crc != d[8]')
    expect(sketch).toContain('float n_probe_temperature = _ds18C_probe;')
    expect(sketch).toContain('bool n_probe_connected = _ds18Ok_probe;')
  })

  it('shares its helpers between two probes on different pins', () => {
    const { nodes, edges } = probeGraph({ pin: 4 })
    const sketch = generateCpp(
      [...nodes, node('probe2', 'TemperatureInput', { pin: 16 }), node('map2', 'MapRange')],
      [...edges, edge('temperature2', 'probe2', 'temperature', 'map2', 'value'),
        edge('amount2', 'map2', 'result', 'fade', 'fade')],
    )
    expect(sketch.match(/static bool _ds18Read\(/g)).toHaveLength(1)
    expect(sketch).toContain('_ds18Start(16)')
    expect(sketch).toContain('_ds18Pending_probe2')
  })

  it('is available to the shared show/player control compiler', () => {
    const sensor = node('probe', 'TemperatureInput', { pin: 4 })
    const map = node('map', 'MapRange', { inMin: 0, inMax: 60, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('temperature', 'probe', 'temperature', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.helpers.join('\n')).toContain('static bool _ds18Read(')
    expect(emitted.loop.join('\n')).toContain('_ds18Start(4)')
  })
})

describe('temperature wiring and the pull-up', () => {
  it('uses one GPIO, flags a shared pin, and finds the supply, ground and DATA pads', () => {
    const probe = node('probe', 'TemperatureInput', { pin: 4 })
    expect(collectPinUses([probe]).map((use) => [use.propertyKey, use.pin])).toEqual([['pin', 4]])
    expect(findPinConflicts([probe, node('probe2', 'TemperatureInput', { pin: 4 })]).length).toBeGreaterThan(0)
    expect(findPinConflicts([probe, node('probe3', 'TemperatureInput', { pin: 16 })])).toEqual([])

    const [item] = buildHardwareManifest([probe], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(DS18B20_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'temperature-input', supported: true, facts: { pullUp: '4.7 kΩ' } })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('DATA')
  })

  it('ends the DATA wire on the pull-up junction, below the probe and clear of the supply pads', () => {
    const probe = node('probe', 'TemperatureInput', { pin: 4 })
    const [item] = buildHardwareManifest([probe], [], 'esp32:esp32:esp32').primaryItems
    const layout = { x: 400, y: 300, item } as unknown as Parameters<typeof dataPullUp>[0]
    const pullUp = dataPullUp(layout)!
    expect(pullUp.signalIndex).toBe(0)
    expect(peripheralSignalEndPoint(layout, 0)).toEqual(pullUp.junction)
    expect(pullUp.dataPad).toEqual(peripheralPadPoint(layout, peripheralSignalPadIndex(item, 0)))
    expect(pullUp.y).toBeGreaterThan(layout.y + PERIPHERAL_RENDER_H)
    // DATA is the last pad, so the resistor runs right of it and crosses neither supply stub.
    const supplyPads = [peripheralPowerPadIndex(item)!, peripheralGroundPadIndex(item)]
      .map((index) => peripheralPadPoint(layout, index).x)
    for (const x of supplyPads) expect(x).toBeLessThan(pullUp.junction.x)
    expect(pullUp.resistorX).toBeGreaterThan(pullUp.junction.x)
    expect(pullUp.supply.x).toBeGreaterThan(pullUp.resistorX)
  })

  it('belongs only to the probe', () => {
    const [item] = buildHardwareManifest([node('rtc', 'EnvironmentInput')], [], 'esp32:esp32:esp32').primaryItems
    expect(dataPullUp({ x: 0, y: 0, item } as unknown as Parameters<typeof dataPullUp>[0])).toBeNull()
  })
})

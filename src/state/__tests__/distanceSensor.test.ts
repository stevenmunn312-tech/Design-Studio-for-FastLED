import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../codegen/controlGraph'
import {
  peripheralGroundPadIndex, peripheralPadPoint, peripheralPowerNet, peripheralPowerPadIndex,
  peripheralSignalEndPoint, peripheralSignalPadIndex, receiveDivider, PERIPHERAL_RENDER_H,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import { findDeployBlockingErrors, findPinConflicts } from '../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../graphStore'
import { libraryDefaults, NODE_LIBRARY, gpioRequirementForProperty } from '../nodeLibrary'
import { partById } from '../partCatalogue'
import { PART_OPTIONS } from '../partOptions'
import {
  distanceSensorAddress, distanceSensorAddressOptions, distancePreviewDefault, distancePreviewReading,
  distanceSensorPinKeys, distanceSensorSpec, distanceSensorTransport, HCSR04_PART_ID, VL53L0X_PART_ID, VL53L1X_PART_ID,
} from '../distanceSensor'
import { VL53L0X_VERSION, VL53L1X_VERSION } from '../../codegen/distanceSensorCpp'

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

function rangerGraph(properties: Record<string, unknown> = {}) {
  const nodes = [
    node('ranger', 'DistanceInput', properties),
    node('map', 'MapRange', { inMin: 100, inMax: 1500, outMin: 1, outMax: 0 }),
    node('fill', 'SolidColor'), node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('distance', 'ranger', 'distance', 'map', 'value'),
    edge('amount', 'map', 'result', 'fade', 'fade'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the catalogued HC-SR04', () => {
  it('carries its range, trigger pulse and 5 V echo, and orders the pads VCC, Trig, Echo, GND', () => {
    expect(distanceSensorSpec(HCSR04_PART_ID)).toMatchObject({
      device: 'HC-SR04', minMm: 20, maxMm: 4000, triggerPulseUs: 10, echoVolts: 5,
    })
    expect(PART_OPTIONS.DistanceInput.options.map((option) => option.id)).toEqual([HCSR04_PART_ID, VL53L0X_PART_ID, VL53L1X_PART_ID])
    expect(partById(HCSR04_PART_ID)?.pinLabelsLeftToRight).toEqual(['VCC', 'Trig', 'Echo', 'GND'])
  })

  it('maps the preview slider across the measuring window', () => {
    expect(distancePreviewReading(HCSR04_PART_ID, distancePreviewDefault(HCSR04_PART_ID))).toBeCloseTo(500, 6)
    expect(distancePreviewReading(HCSR04_PART_ID, 0)).toBe(20)
    expect(distancePreviewReading(HCSR04_PART_ID, 1)).toBe(4000)
    expect(distancePreviewReading(HCSR04_PART_ID, -3)).toBe(20)
  })

  it('needs Trig to output and Echo to read', () => {
    expect(gpioRequirementForProperty('DistanceInput', 'trigPin', {})).toEqual({ capability: 'digitalOutput', pullup: false })
    expect(gpioRequirementForProperty('DistanceInput', 'echoPin', {})).toEqual({ capability: 'digitalInput', pullup: false })
  })
})

describe('distance firmware', () => {
  it('emits the ranging helper once, sets both pins, and reads every 60 ms', () => {
    const { nodes, edges } = rangerGraph({ trigPin: 27, echoPin: 26 })
    const sketch = generateCpp(nodes, edges)
    expect(sketch.match(/static bool _sr04Measure\(/g)).toHaveLength(1)
    expect(sketch).toContain('pinMode(27, OUTPUT); digitalWrite(27, LOW);')
    expect(sketch).toContain('pinMode(26, INPUT);')
    expect(sketch).toContain('_sr04Measure(27, 26, 10, 24324, _sr04Value)')
    expect(sketch).toContain('>= 60')
    expect(sketch).toContain('mm = (float)width * 0.1715f;')
    expect(sketch).toContain('float n_ranger_distance = _sr04Mm_ranger;')
    expect(sketch).toContain('bool n_ranger_connected = _sr04Ok_ranger;')
    expect(sketch).not.toContain('#include <Wire.h>')
  })

  it('keeps a sketch without a ranger free of the helper', () => {
    const sketch = generateCpp([node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })],
      [edge('frame', 'fill', 'frame', 'out', 'frame')])
    expect(sketch).not.toContain('_sr04Measure')
  })

  it('is available to the shared show/player control compiler', () => {
    const sensor = node('ranger', 'DistanceInput', { trigPin: 27, echoPin: 26 })
    const map = node('map', 'MapRange', { inMin: 0, inMax: 4000, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('distance', 'ranger', 'distance', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.helpers.join('\n')).toContain('static bool _sr04Measure(')
    expect(emitted.setup.join('\n')).toContain('pinMode(27, OUTPUT)')
    expect(emitted.loop.join('\n')).toContain('_sr04Measure(27, 26, 10,')
  })
})

describe('distance wiring and the echo divider', () => {
  it('uses two GPIOs, flags a shared pin, and finds the supply, ground, Trig and Echo pads', () => {
    const ranger = node('ranger', 'DistanceInput', { trigPin: 27, echoPin: 26 })
    expect(collectPinUses([ranger]).map((use) => [use.propertyKey, use.pin]))
      .toEqual([['trigPin', 27], ['echoPin', 26]])
    expect(findPinConflicts([ranger, node('ranger2', 'DistanceInput', { trigPin: 27, echoPin: 25 })]).length).toBeGreaterThan(0)
    expect(findPinConflicts([ranger, node('ranger3', 'DistanceInput', { trigPin: 14, echoPin: 25 })])).toEqual([])

    const [item] = buildHardwareManifest([ranger], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(HCSR04_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'distance-input', supported: true, facts: { echoLevel: '5 V', echoDivider: '1 kΩ / 2 kΩ' } })
    expect(peripheralPowerNet(item)).toBe('v5')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('Trig')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('Echo')
  })

  it('ends the Echo wire on the divider junction, below the module', () => {
    const ranger = node('ranger', 'DistanceInput', { trigPin: 27, echoPin: 26 })
    const [item] = buildHardwareManifest([ranger], [], 'esp32:esp32:esp32').primaryItems
    const layout = { x: 400, y: 300, item } as unknown as Parameters<typeof receiveDivider>[0]
    const divider = receiveDivider(layout)!
    expect(divider.signalIndex).toBe(1)
    expect(peripheralSignalEndPoint(layout, 1)).toEqual(divider.junction)
    expect(divider.roPad).toEqual(peripheralPadPoint(layout, peripheralSignalPadIndex(item, 1)))
    expect(divider.y).toBeGreaterThan(layout.y + PERIPHERAL_RENDER_H)
    // Trig is a plain pad: nothing intercepts it.
    expect(peripheralSignalEndPoint(layout, 0)).toEqual(peripheralPadPoint(layout, peripheralSignalPadIndex(item, 0)))
  })
})

describe('the catalogued VL53L0X', () => {
  const props = { partId: VL53L0X_PART_ID, sdaPin: 21, sclPin: 22 }

  it('is an I2C module on 0x29 with its own range, and orders the pads VIN to SDA', () => {
    expect(distanceSensorSpec(VL53L0X_PART_ID)).toMatchObject({
      interface: 'I2C', minMm: 30, maxMm: 1200, i2cAddresses: [0x29], defaultI2cAddress: 0x29,
    })
    expect(distanceSensorTransport(VL53L0X_PART_ID)).toBe('i2c')
    expect(distanceSensorTransport(HCSR04_PART_ID)).toBe('pulse')
    expect(distanceSensorPinKeys(props)).toEqual(['sdaPin', 'sclPin'])
    expect(distanceSensorPinKeys({})).toEqual(['trigPin', 'echoPin'])
    expect(distanceSensorAddressOptions(VL53L0X_PART_ID)).toEqual(['0x29'])
    expect(distanceSensorAddress({ ...props, i2cAddress: '0x29' })).toBe(0x29)
    expect(distanceSensorAddress({ ...props, i2cAddress: '0x30' })).toBeNull()
    expect(distanceSensorAddress({})).toBeNull()
    expect(PART_OPTIONS.DistanceInput.options.map((option) => option.id)).toEqual([HCSR04_PART_ID, VL53L0X_PART_ID, VL53L1X_PART_ID])
    expect(partById(VL53L0X_PART_ID)?.pinLabelsLeftToRight).toEqual(['VIN', '2v8', 'GND', 'GPIO', 'SHDN', 'SCL', 'SDA'])
  })

  it('spans its own window in the preview and needs no GPIO capability', () => {
    expect(distancePreviewReading(VL53L0X_PART_ID, 1)).toBe(1200)
    expect(distancePreviewReading(VL53L0X_PART_ID, 0)).toBe(30)
    expect(distancePreviewDefault(VL53L0X_PART_ID)).toBeGreaterThan(0)
    expect(gpioRequirementForProperty('DistanceInput', 'sdaPin', props)).toBeNull()
    expect(gpioRequirementForProperty('DistanceInput', 'trigPin', {})).toMatchObject({ capability: 'digitalOutput' })
  })

  it('includes the pinned Pololu library, starts one I2C bus and drives the sensor through it', () => {
    const { nodes, edges } = rangerGraph(props)
    const sketch = generateCpp(nodes, edges)
    expect(VL53L0X_VERSION).toBe('1.3.1')
    expect(sketch).toContain('#include <Wire.h>')
    expect(sketch).toContain('#include <VL53L0X.h>')
    expect(sketch.match(/Wire\.begin\(/g)).toHaveLength(1)
    expect(sketch).toContain('static VL53L0X _vl_ranger;')
    expect(sketch).toContain('_vl_ranger.init()')
    expect(sketch).toContain('_vl_ranger.startContinuous()')
    expect(sketch).toContain('readRangeContinuousMillimeters()')
    expect(sketch).toContain('timeoutOccurred()')
    expect(sketch).toContain('>= 60')
    expect(sketch).toContain('float n_ranger_distance = _vlMm_ranger;')
    expect(sketch).toContain('bool n_ranger_connected = _vlOk_ranger;')
    // No ultrasonic helper and no Trig/Echo pins for an I2C module.
    expect(sketch).not.toContain('_sr04Measure')
    expect(sketch).not.toContain('pinMode(27, OUTPUT)')
  })

  it('keeps the ultrasonic sketch free of the laser library', () => {
    const { nodes, edges } = rangerGraph({ trigPin: 27, echoPin: 26 })
    expect(generateCpp(nodes, edges)).not.toContain('VL53L0X')
  })

  it('is available to the shared show/player control compiler with the library include', () => {
    const sensor = node('ranger', 'DistanceInput', props)
    const map = node('map', 'MapRange', { inMin: 0, inMax: 1200, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('distance', 'ranger', 'distance', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.includes).toContain('#include <VL53L0X.h>')
    expect(emitted.includes).toContain('#include <Wire.h>')
    expect(emitted.helpers.join('\n')).not.toContain('_sr04Measure')
    expect(emitted.loop.join('\n')).toContain('_vl_ranger.init()')
  })

  it('shares SDA/SCL, rejects an address it cannot take, and draws VIN from 3.3 V with no echo divider', () => {
    const ranger = node('ranger', 'DistanceInput', props)
    expect(collectPinUses([ranger]).map((use) => [use.propertyKey, use.pin])).toEqual([['sdaPin', 21], ['sclPin', 22]])
    expect(findDeployBlockingErrors([node('bad', 'DistanceInput', { ...props, i2cAddress: '0x30' })], [], 'esp32:esp32:esp32').join('\n'))
      .toContain('0x29')

    const [item] = buildHardwareManifest([ranger], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(VL53L0X_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'distance-input', supported: true, facts: { transport: 'i2c', i2cAddress: '0x29', distanceRange: '3 to 120 cm' },
    })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VIN')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SDA')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('SCL')
    expect(receiveDivider({ x: 0, y: 0, item } as unknown as Parameters<typeof receiveDivider>[0])).toBeNull()
  })
})

describe('the catalogued VL53L1X', () => {
  const props = { partId: VL53L1X_PART_ID, sdaPin: 21, sclPin: 22 }

  it('is an I2C module on 0x29 reaching 4 m, and orders the pads VIN to GPIO', () => {
    expect(distanceSensorSpec(VL53L1X_PART_ID)).toMatchObject({
      device: 'VL53L1X', interface: 'I2C', minMm: 30, maxMm: 4000, i2cAddresses: [0x29], defaultI2cAddress: 0x29,
    })
    expect(distanceSensorTransport(VL53L1X_PART_ID)).toBe('i2c')
    expect(distanceSensorAddress({ ...props, i2cAddress: '0x29' })).toBe(0x29)
    expect(distancePreviewReading(VL53L1X_PART_ID, 1)).toBe(4000)
    expect(partById(VL53L1X_PART_ID)?.pinLabelsLeftToRight).toEqual(['VIN', 'GND', 'SDA', 'SCL', 'XSHUT', 'GPIO'])
  })

  it('includes the pinned Pololu VL53L1X library, never the VL53L0X one, and reads without blocking', () => {
    const { nodes, edges } = rangerGraph(props)
    const sketch = generateCpp(nodes, edges)
    expect(VL53L1X_VERSION).toBe('1.3.1')
    expect(sketch).toContain('#include <Wire.h>')
    expect(sketch).toContain('#include <VL53L1X.h>')
    expect(sketch).not.toContain('VL53L0X')
    expect(sketch.match(/Wire\.begin\(/g)).toHaveLength(1)
    expect(sketch).toContain('static VL53L1X _vl_ranger;')
    expect(sketch).toContain('_vl_ranger.init()')
    expect(sketch).toContain('setDistanceMode(VL53L1X::Long)')
    expect(sketch).toContain('startContinuous(50)')
    expect(sketch).toContain('_vl_ranger.dataReady()')
    expect(sketch).toContain('_vl_ranger.read(false)')
    expect(sketch).toContain('range_status == VL53L1X::RangeValid')
    expect(sketch).toContain('float n_ranger_distance = _vlMm_ranger;')
    expect(sketch).toContain('bool n_ranger_connected = _vlOk_ranger;')
    expect(sketch).not.toContain('_sr04Measure')
  })

  it('keeps each laser library out of the other sensor\'s sketch', () => {
    const l0 = rangerGraph({ partId: VL53L0X_PART_ID, sdaPin: 21, sclPin: 22 })
    expect(generateCpp(l0.nodes, l0.edges)).not.toContain('VL53L1X')
  })

  it('is available to the shared show/player control compiler with the library include', () => {
    const sensor = node('ranger', 'DistanceInput', props)
    const map = node('map', 'MapRange', { inMin: 0, inMax: 4000, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('distance', 'ranger', 'distance', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.includes).toContain('#include <VL53L1X.h>')
    expect(emitted.includes).toContain('#include <Wire.h>')
    expect(emitted.includes).not.toContain('#include <VL53L0X.h>')
    expect(emitted.loop.join('\n')).toContain('_vl_ranger.dataReady()')
  })

  it('draws VIN from 3.3 V, GND, SDA and SCL, with no echo divider, and names its chip in a bad-address error', () => {
    const ranger = node('ranger', 'DistanceInput', props)
    expect(findDeployBlockingErrors([node('bad', 'DistanceInput', { ...props, i2cAddress: '0x30' })], [], 'esp32:esp32:esp32').join('\n'))
      .toContain('VL53L1X')
    const [item] = buildHardwareManifest([ranger], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(VL53L1X_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'distance-input', supported: true, facts: { transport: 'i2c', i2cAddress: '0x29', distanceRange: '3 to 400 cm' },
    })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VIN')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SDA')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('SCL')
    expect(receiveDivider({ x: 0, y: 0, item } as unknown as Parameters<typeof receiveDivider>[0])).toBeNull()
  })
})

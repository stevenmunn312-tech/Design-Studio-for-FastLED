import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../codegen/controlGraph'
import {
  peripheralGroundPadIndex, peripheralPowerNet, peripheralPowerPadIndex, peripheralSignalPadIndex,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import { findDeployBlockingErrors, findPinConflicts } from '../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../nodeLibrary'
import { partById } from '../partCatalogue'
import { PART_OPTIONS } from '../partOptions'
import {
  BME280_PART_ID, environmentAddress, environmentAddressOptions,
  environmentPreviewReading, environmentSensorSpec,
} from '../environmentSensor'

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

function environmentGraph(properties: Record<string, unknown> = {}) {
  const nodes = [
    node('weather', 'EnvironmentInput', properties),
    node('map', 'MapRange', { inMin: -40, inMax: 85, outMin: 0, outMax: 1 }),
    node('fill', 'SolidColor'), node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('temperature', 'weather', 'temperature', 'map', 'value'),
    edge('amount', 'map', 'result', 'fade', 'fade'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the catalogued BME280', () => {
  it('carries the address and three physical ranges used by the app', () => {
    expect(environmentSensorSpec(BME280_PART_ID)).toMatchObject({
      device: 'BME280', i2cAddresses: [0x76, 0x77], defaultI2cAddress: 0x77,
      temperatureMinC: -40, temperatureMaxC: 85,
      humidityMinPercent: 0, humidityMaxPercent: 100,
      pressureMinHpa: 300, pressureMaxHpa: 1100,
    })
    expect(environmentAddressOptions(BME280_PART_ID)).toEqual(['0x76', '0x77'])
    expect(PART_OPTIONS.EnvironmentInput.options.map((option) => option.id)).toEqual([BME280_PART_ID])
    expect(partById(BME280_PART_ID)?.pinLabelsLeftToRight)
      .toEqual(['VIN', '3Vo', 'GND', 'SCK', 'SDO', 'SDI', 'CS'])
  })

  it('accepts only the two SDO-selected addresses and maps preview sliders to units', () => {
    expect(environmentAddress({ partId: BME280_PART_ID, i2cAddress: '0x76' })).toBe(0x76)
    expect(environmentAddress({ partId: BME280_PART_ID, i2cAddress: '0x40' })).toBeNull()
    expect(environmentPreviewReading(BME280_PART_ID, 0.496, 0.5, 0.8915625)).toEqual({
      temperature: 22, humidity: 50, pressure: 1013.25,
    })
  })
})

describe('environment firmware', () => {
  it('starts one I2C bus and emits compensated temperature, humidity and pressure reads', () => {
    const { nodes, edges } = environmentGraph({ i2cAddress: '0x76' })
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('#include <Wire.h>')
    expect(sketch.indexOf('struct _Bme280Calibration;')).toBeGreaterThanOrEqual(0)
    expect(sketch.indexOf('struct _Bme280Calibration;')).toBeLessThan(sketch.indexOf('static bool _bmeBegin('))
    expect(sketch.match(/Wire\.begin\(/g)).toHaveLength(1)
    expect(sketch.match(/static bool _bmeMeasure\(/g)).toHaveLength(1)
    expect(sketch).toContain('_bmeBegin(0x76, _bmeCal_weather)')
    expect(sketch).toContain('_bmeMeasure(0x76, _bmeCal_weather, n_weather_temperature, n_weather_humidity, n_weather_pressure)')
    expect(sketch).toContain('pressureHpa = (p + (v1 + v2 + (float)c.p7) / 16.0f) / 100.0f;')
  })

  it('is available to the shared show/player control compiler', () => {
    const sensor = node('weather', 'EnvironmentInput', { sdaPin: 21, sclPin: 22 })
    const map = node('map', 'MapRange', { inMin: 0, inMax: 100, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('humidity', 'weather', 'humidity', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.includes).toContain('#include <Wire.h>')
    expect(emitted.setup.join('\n')).toContain('Wire.begin(21, 22);')
    expect(emitted.helpers.join('\n')).toContain('struct _Bme280Calibration')
    expect(emitted.loop.join('\n')).toContain('_bmeMeasure(0x77')
  })
})

describe('environment wiring and validation', () => {
  it('shares SDA/SCL, rejects duplicate or impossible addresses, and draws the exact pads', () => {
    const sensor = node('weather', 'EnvironmentInput', { sdaPin: 21, sclPin: 22 })
    const rtc = node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 21, sclPin: 22 })
    expect(collectPinUses([sensor]).map((use) => [use.propertyKey, use.pin]))
      .toEqual([['sdaPin', 21], ['sclPin', 22]])
    expect(findPinConflicts([sensor, rtc])).toEqual([])
    expect(findPinConflicts([sensor, node('weather2', 'EnvironmentInput')]).join('\n')).toContain('0x77')
    expect(findDeployBlockingErrors([node('bad', 'EnvironmentInput', { i2cAddress: '0x40' })], [], 'esp32:esp32:esp32').join('\n'))
      .toContain('answers only on 0x76, 0x77')

    const [item] = buildHardwareManifest([sensor], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(BME280_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'environment-input', supported: true, facts: { i2cAddress: '0x77' } })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VIN')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SDI')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('SCK')
  })
})

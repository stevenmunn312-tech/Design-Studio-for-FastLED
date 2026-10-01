import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import { peripheralPowerNet, peripheralPowerPadIndex, peripheralGroundPadIndex, peripheralSignalPadIndex } from '../../components/BuildDiagram/physicalDiagramLayout'
import { findDeployBlockingErrors, findI2cBusErrors } from '../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../graphStore'
import { NODE_LIBRARY, libraryDefaults, propertyOptions } from '../nodeLibrary'
import { partById } from '../partCatalogue'
import {
  INA226_PART_ID,
  powerMonitorAddress,
  POWER_MONITOR_DEFAULT_LIMIT_AMPS,
  powerMonitorAddressOptions,
  powerMonitorLimitAmps,
  powerMonitorPreviewReading,
  powerMonitorSpec,
} from '../powerMonitor'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType,
      nodeType,
      category: definition?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

/** A monitor whose watts dims an LED output, so codegen keeps it. */
function monitorGraph(monitorProps: Record<string, unknown> = {}) {
  const nodes = [
    node('mon', 'PowerMonitorInput', monitorProps),
    node('map', 'MapRange', { inMin: 0, inMax: 40, outMin: 1, outMax: 0 }),
    node('fill', 'SolidColor', { r: 255, g: 80, b: 0 }),
    node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('w', 'mon', 'watts', 'map', 'value'),
    edge('f', 'map', 'result', 'fade', 'fade'),
    edge('c', 'fill', 'frame', 'fade', 'frame'),
    edge('o', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the catalogued INA219', () => {
  it('carries the measuring contract the firmware and picker read', () => {
    const spec = powerMonitorSpec('adafruit-ina219-current-sensor')
    expect(spec).toMatchObject({ shuntOhms: 0.1, busVoltageMaxV: 26, currentMaxA: 3.2, defaultI2cAddress: 0x40 })
    expect(powerMonitorAddressOptions('adafruit-ina219-current-sensor')).toEqual(['0x40', '0x41', '0x44', '0x45'])
    expect(partById('adafruit-ina219-current-sensor')?.pinLabelsLeftToRight)
      .toEqual(['VIN', 'GND', 'SCL', 'SDA', 'VIN-', 'VIN+'])
  })

  it('accepts only an address its jumpers can select', () => {
    expect(powerMonitorAddress({ i2cAddress: '0x44' })).toBe(0x44)
    expect(powerMonitorAddress({})).toBe(0x40)
    expect(powerMonitorAddress({ i2cAddress: '0x42' })).toBeNull()
  })
})

describe('preview', () => {
  it('derives watts from the two sliders, across the part\'s own range', () => {
    const reading = powerMonitorPreviewReading('adafruit-ina219-current-sensor', 0.5, 0.25)
    expect(reading.volts).toBeCloseTo(13)
    expect(reading.amps).toBeCloseTo(0.8)
    expect(reading.watts).toBeCloseTo(13 * 0.8)
    expect(powerMonitorPreviewReading('adafruit-ina219-current-sensor', 2, -1)).toEqual({ volts: 26, amps: 0, watts: 0 })
  })
})

describe('firmware', () => {
  it('starts the one I2C bus, configures the monitor, and reads it each pass', () => {
    const { nodes, edges } = monitorGraph({ i2cAddress: '0x41' })
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('#include <Wire.h>')
    expect(sketch.match(/Wire\.begin\(/g)).toHaveLength(1)
    expect(sketch).toContain('_ina219Begin(0x41);')
    expect(sketch).toContain('_ina219Measure(0x41, 0.1000f, n_mon_volts, n_mon_amps);')
    expect(sketch).toContain('float n_mon_watts = n_mon_volts * n_mon_amps;')
    expect(sketch.indexOf('Wire.begin(')).toBeLessThan(sketch.indexOf('_ina219Begin(0x41);'))
  })

  it('emits the helpers once however many monitors there are', () => {
    const { nodes, edges } = monitorGraph()
    nodes.push(node('mon2', 'PowerMonitorInput', { i2cAddress: '0x45' }))
    edges.push(edge('w2', 'mon2', 'amps', 'fill', 'r'))
    const sketch = generateCpp(nodes, edges)
    expect(sketch.match(/static void _ina219Measure\(/g)).toHaveLength(1)
    expect(sketch).toContain('_ina219Begin(0x45);')
  })

  it('reads the two bytes in separate statements, since operand order is unspecified', () => {
    const sketch = generateCpp(monitorGraph().nodes, monitorGraph().edges)
    expect(sketch).not.toMatch(/Wire\.read\(\)[^;\n]*Wire\.read\(\)/)
  })
})

describe('bus and wiring', () => {
  it('claims SDA and SCL as I2C bus lines shared with the RTC', () => {
    const monitor = node('mon', 'PowerMonitorInput', { sdaPin: 21, sclPin: 22 })
    const rtc = node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 21, sclPin: 22 })
    expect(collectPinUses([monitor]).map((use) => [use.propertyKey, use.pin])).toEqual([['sdaPin', 21], ['sclPin', 22]])
    expect(findDeployBlockingErrors([monitor, rtc], [], 'esp32:esp32:esp32')).toEqual([])
  })

  it('refuses a monitor and an RTC on two different pairs, with no display involved', () => {
    const monitor = node('mon', 'PowerMonitorInput', { sdaPin: 21, sclPin: 22 })
    const rtc = node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 16, sclPin: 17 })
    const errors = findI2cBusErrors([monitor, rtc])
    expect(errors.join('\n')).toContain('one I2C bus')
    expect(findDeployBlockingErrors([monitor, rtc], [], 'esp32:esp32:esp32').join('\n')).toContain('one I2C bus')
  })

  it('refuses two monitors on the same address, and an address the board cannot select', () => {
    const a = node('a', 'PowerMonitorInput', { i2cAddress: '0x40' })
    const b = node('b', 'PowerMonitorInput', { i2cAddress: '0x40' })
    expect(findDeployBlockingErrors([a, b], [], 'esp32:esp32:esp32').length).toBeGreaterThan(0)
    const bad = node('c', 'PowerMonitorInput', { i2cAddress: '0x42' })
    expect(findI2cBusErrors([bad]).join('\n')).toContain('0x40, 0x41, 0x44, 0x45')
  })

  it('describes the part by its address and load-side limits', () => {
    const manifest = buildHardwareManifest([node('mon', 'PowerMonitorInput', { i2cAddress: '0x44' })], [], 'esp32:esp32:esp32')
    expect(manifest.primaryItems[0]).toMatchObject({
      kind: 'power-monitor-input',
      supported: true,
      facts: { partId: 'adafruit-ina219-current-sensor', i2cAddress: '0x44', busVoltageMax: '26 V', currentMax: '3.2 A' },
    })
  })

  it('draws supply, ground and bus to the header, and nothing to the load side', () => {
    const [item] = buildHardwareManifest([node('mon', 'PowerMonitorInput')], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById('adafruit-ina219-current-sensor')!.pinLabelsLeftToRight!
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VIN')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SDA')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('SCL')
  })

  it('powers VIN from the logic rail, because the bus pull-ups ride on it', () => {
    const [item] = buildHardwareManifest([node('mon', 'PowerMonitorInput')], [], 'esp32:esp32:esp32').primaryItems
    expect(peripheralPowerNet(item)).toBe('v3v3')
  })
})

describe('overcurrent', () => {
  it('accepts only a positive limit, else falls back to the default', () => {
    expect(powerMonitorLimitAmps(1.5)).toBe(1.5)
    expect(powerMonitorLimitAmps('2')).toBe(2)
    for (const bad of [0, -1, NaN, '', undefined, 'x']) expect(powerMonitorLimitAmps(bad)).toBe(POWER_MONITOR_DEFAULT_LIMIT_AMPS)
  })

  it('is a bool output beside volts, amps and watts, with a default limit', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'PowerMonitorInput')!
    expect(def.outputs.map((o) => [o.id, o.dataType])).toContainEqual(['overcurrent', 'bool'])
    expect(libraryDefaults('PowerMonitorInput').overcurrentAmps).toBe(POWER_MONITOR_DEFAULT_LIMIT_AMPS)
  })

  it('compares the measured amps against the limit in firmware', () => {
    const { nodes, edges } = monitorGraph({ overcurrentAmps: 1.2 })
    nodes.push(node('sw', 'PowerSwitchOutput'))
    edges.push(edge('oc', 'mon', 'overcurrent', 'sw', 'on'))
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('bool n_mon_overcurrent = n_mon_amps > 1.200f;')
  })
})

describe('the catalogued INA226', () => {
  const props = { partId: INA226_PART_ID }

  it('carries its 2 milliohm shunt, 36 V and 20 A limits, and sixteen addresses', () => {
    expect(powerMonitorSpec(INA226_PART_ID)).toMatchObject({
      device: 'INA226', shuntOhms: 0.002, busVoltageMaxV: 36, currentMaxA: 20, defaultI2cAddress: 0x40,
    })
    const options = powerMonitorAddressOptions(INA226_PART_ID)
    expect(options).toHaveLength(16)
    expect(options[0]).toBe('0x40')
    expect(options[15]).toBe('0x4F')
    expect(partById(INA226_PART_ID)?.pinLabelsLeftToRight).toEqual(['VCC', 'GND', 'SCL', 'SDA', 'ALE', 'VBS'])
  })

  it('offers each part its own addresses in the inspector, and accepts the wider range only on the INA226', () => {
    expect(propertyOptions('PowerMonitorInput', 'i2cAddress', props)).toHaveLength(16)
    expect(propertyOptions('PowerMonitorInput', 'i2cAddress', {})).toEqual(['0x40', '0x41', '0x44', '0x45'])
    expect(powerMonitorAddress({ ...props, i2cAddress: '0x4A' })).toBe(0x4a)
    expect(powerMonitorAddress({ i2cAddress: '0x4A' })).toBeNull()
  })

  it('spans its own range in the preview', () => {
    expect(powerMonitorPreviewReading(INA226_PART_ID, 1, 1)).toEqual({ volts: 36, amps: 20, watts: 720 })
  })

  it('emits only the INA226 driver, with its own scales, and talks to the chosen address', () => {
    const { nodes, edges } = monitorGraph({ ...props, i2cAddress: '0x4A' })
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('_ina226Begin(0x4A);')
    expect(sketch).toContain('_ina226Measure(0x4A, 0.0020f, n_mon_volts, n_mon_amps);')
    expect(sketch).toContain('(float)((uint16_t)bus) * 0.00125f')
    expect(sketch).toContain('* 0.0000025f) / shuntOhms')
    expect(sketch).not.toContain('_ina219')
    expect(sketch).not.toMatch(/Wire\.read\(\)[^;\n]*Wire\.read\(\)/)
  })

  it('emits each driver once when an INA219 and an INA226 share the bus', () => {
    const { nodes, edges } = monitorGraph()
    nodes.push(node('mon2', 'PowerMonitorInput', { ...props, i2cAddress: '0x41' }))
    edges.push(edge('w2', 'mon2', 'amps', 'fill', 'r'))
    const sketch = generateCpp(nodes, edges)
    expect(sketch.match(/static void _ina219Measure\(/g)).toHaveLength(1)
    expect(sketch.match(/static void _ina226Measure\(/g)).toHaveLength(1)
    expect(sketch).toContain('_ina219Begin(0x40);')
    expect(sketch).toContain('_ina226Begin(0x41);')
  })

  it('refuses a clash on the shared bus, rejects an address it cannot be strapped to, and powers VCC from 3.3 V', () => {
    const a = node('a', 'PowerMonitorInput', { ...props, i2cAddress: '0x44' })
    const b = node('b', 'PowerMonitorInput', { i2cAddress: '0x44' })
    expect(findDeployBlockingErrors([a, b], [], 'esp32:esp32:esp32').length).toBeGreaterThan(0)
    expect(findI2cBusErrors([node('c', 'PowerMonitorInput', { ...props, i2cAddress: '0x50' })]).join('\n')).toContain('0x4F')

    const [item] = buildHardwareManifest([node('mon', 'PowerMonitorInput', props)], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(INA226_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'power-monitor-input', supported: true,
      facts: { partId: INA226_PART_ID, i2cAddress: '0x40', busVoltageMax: '36 V', currentMax: '20 A', senseTerminals: 'IN+ from supply / IN- to load' },
    })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SDA')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('SCL')
  })
})

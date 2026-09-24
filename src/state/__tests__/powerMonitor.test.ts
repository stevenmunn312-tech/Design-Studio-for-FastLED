import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import { peripheralPowerNet, peripheralPowerPadIndex, peripheralGroundPadIndex, peripheralSignalPadIndex } from '../../components/BuildDiagram/physicalDiagramLayout'
import { findDeployBlockingErrors, findI2cBusErrors } from '../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { partById } from '../partCatalogue'
import {
  powerMonitorAddress,
  powerMonitorAddressOptions,
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

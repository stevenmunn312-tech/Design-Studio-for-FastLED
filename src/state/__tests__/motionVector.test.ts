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
  motionVectorAddress, motionVectorAddressOptions, motionVectorPreviewDefault, motionVectorPreviewReading,
  motionVectorSpec, MPU6050_PART_ID,
} from '../motionVector'

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

function tiltGraph(properties: Record<string, unknown> = {}) {
  const nodes = [
    node('imu', 'MotionVectorInput', properties),
    node('map', 'MapRange', { inMin: -1, inMax: 1, outMin: 0, outMax: 1 }),
    node('fill', 'SolidColor'), node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('ax', 'imu', 'accelX', 'map', 'value'),
    edge('amount', 'map', 'result', 'fade', 'fade'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the catalogued GY-521', () => {
  it('carries its addresses and full-scale ranges, and orders the pads VCC to INT', () => {
    expect(motionVectorSpec(MPU6050_PART_ID)).toMatchObject({
      device: 'MPU-6050', i2cAddresses: [0x68, 0x69], defaultI2cAddress: 0x68, accelRangeG: 2, gyroRangeDps: 250,
    })
    expect(motionVectorAddressOptions(MPU6050_PART_ID)).toEqual(['0x68', '0x69'])
    expect(PART_OPTIONS.MotionVectorInput.options.map((option) => option.id)).toEqual([MPU6050_PART_ID])
    expect(partById(MPU6050_PART_ID)?.pinLabelsLeftToRight)
      .toEqual(['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'])
  })

  it('accepts only the two AD0-selected addresses', () => {
    expect(motionVectorAddress({ partId: MPU6050_PART_ID, i2cAddress: '0x69' })).toBe(0x69)
    expect(motionVectorAddress({ partId: MPU6050_PART_ID })).toBe(0x68)
    expect(motionVectorAddress({ partId: MPU6050_PART_ID, i2cAddress: '0x40' })).toBeNull()
  })

  it('maps the preview sliders across full scale, starting flat with 1 g on Z', () => {
    expect(motionVectorPreviewReading(MPU6050_PART_ID, 'accelZ', motionVectorPreviewDefault(MPU6050_PART_ID, 'accelZ'))).toBeCloseTo(1, 6)
    expect(motionVectorPreviewReading(MPU6050_PART_ID, 'accelX', motionVectorPreviewDefault(MPU6050_PART_ID, 'accelX'))).toBeCloseTo(0, 6)
    expect(motionVectorPreviewReading(MPU6050_PART_ID, 'accelX', 0)).toBe(-2)
    expect(motionVectorPreviewReading(MPU6050_PART_ID, 'gyroY', 1)).toBe(250)
    expect(motionVectorPreviewReading(MPU6050_PART_ID, 'gyroY', 9)).toBe(250)
  })
})

describe('motion firmware', () => {
  it('starts one I2C bus, wakes the chip and reads one 14-byte burst', () => {
    const { nodes, edges } = tiltGraph({ i2cAddress: '0x69' })
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('#include <Wire.h>')
    expect(sketch.match(/Wire\.begin\(/g)).toHaveLength(1)
    expect(sketch.match(/static bool _mpuRead\(/g)).toHaveLength(1)
    expect(sketch).toContain('_mpuBegin(0x69, 0, 0)')
    expect(sketch).toContain('_mpuRead(0x69, 16384.0f, 131.072f, _mpuV_imu)')
    expect(sketch).toContain('Wire.write((uint8_t)0x3B)')
    expect(sketch).toContain('Wire.requestFrom((int)addr, 14) != 14')
    expect(sketch).toContain('_mpuWrite(addr, 0x6B, 0x01)')
    expect(sketch).toContain('float n_imu_accelX = _mpuV_imu[0]')
    expect(sketch).toContain('bool n_imu_connected = _mpuReady_imu;')
    expect(sketch.indexOf('Wire.begin(')).toBeLessThan(sketch.indexOf('_mpuBegin(0x69'))
  })

  it('reads the two bytes of each count in separate operations, since operand order is unspecified', () => {
    const sketch = generateCpp(tiltGraph().nodes, tiltGraph().edges)
    expect(sketch).not.toMatch(/Wire\.read\(\)[^;\n]*Wire\.read\(\)/)
  })

  it('keeps a sketch without the sensor free of the helper', () => {
    const sketch = generateCpp([node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })],
      [edge('frame', 'fill', 'frame', 'out', 'frame')])
    expect(sketch).not.toContain('_mpuRead')
  })

  it('is available to the shared show/player control compiler', () => {
    const sensor = node('imu', 'MotionVectorInput', { sdaPin: 21, sclPin: 22 })
    const map = node('map', 'MapRange', { inMin: -250, inMax: 250, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('gz', 'imu', 'gyroZ', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.includes).toContain('#include <Wire.h>')
    expect(emitted.setup.join('\n')).toContain('Wire.begin(21, 22);')
    expect(emitted.helpers.join('\n')).toContain('static bool _mpuRead(')
    expect(emitted.loop.join('\n')).toContain('_mpuBegin(0x68')
  })
})

describe('motion wiring and validation', () => {
  it('shares SDA/SCL, rejects an impossible address, and draws the exact pads', () => {
    const imu = node('imu', 'MotionVectorInput', { sdaPin: 21, sclPin: 22 })
    const rtc = node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 21, sclPin: 22 })
    expect(collectPinUses([imu]).map((use) => [use.propertyKey, use.pin])).toEqual([['sdaPin', 21], ['sclPin', 22]])
    // A DS3231 answers at 0x68, the same as the default MPU-6050: a real collision.
    expect(findPinConflicts([imu, rtc]).join('\n')).toContain('0x68')
    expect(findPinConflicts([node('imu2', 'MotionVectorInput', { i2cAddress: '0x69', sdaPin: 21, sclPin: 22 }), rtc])).toEqual([])
    expect(findDeployBlockingErrors([node('bad', 'MotionVectorInput', { i2cAddress: '0x40' })], [], 'esp32:esp32:esp32').join('\n'))
      .toContain('answers only on 0x68, 0x69')

    const [item] = buildHardwareManifest([imu], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(MPU6050_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'motion-vector-input', supported: true, facts: { i2cAddress: '0x68', accelRange: '±2 g' } })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SDA')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('SCL')
  })
})

import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../../codegen/controlGraph'
import {
  peripheralGroundPadIndex, peripheralPowerNet, peripheralPowerPadIndex, peripheralSignalPadIndex,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { findDeployBlockingErrors, findPinConflicts } from '../../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_OPTIONS } from '../../../build/parts/partOptions'
import {
  MPR121_PART_ID, touchPadAddress, touchPadAddressOptions, touchPadElectrodeCount, touchPadSpec, touchPadThreshold,
} from '../touchPad'

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

function padGraph(properties: Record<string, unknown> = {}) {
  const nodes = [
    node('pad', 'TouchPadInput', properties),
    node('map', 'MapRange', { inMin: 0, inMax: 11, outMin: 0, outMax: 1 }),
    node('fill', 'SolidColor'), node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('electrode', 'pad', 'electrode', 'map', 'value'),
    edge('amount', 'map', 'result', 'fade', 'fade'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the catalogued MPR121', () => {
  it('carries its addresses, electrode count and thresholds, and orders the pads Vin to ADDR', () => {
    expect(touchPadSpec(MPR121_PART_ID)).toMatchObject({
      device: 'MPR121', electrodes: 12, i2cAddresses: [0x5a, 0x5b, 0x5c, 0x5d], defaultI2cAddress: 0x5a,
      touchThreshold: 12, releaseThreshold: 6,
    })
    expect(touchPadElectrodeCount(MPR121_PART_ID)).toBe(12)
    expect(touchPadAddressOptions(MPR121_PART_ID)).toEqual(['0x5A', '0x5B', '0x5C', '0x5D'])
    expect(PART_OPTIONS.TouchPadInput.options.map((option) => option.id)).toEqual([MPR121_PART_ID])
    expect(partById(MPR121_PART_ID)?.pinLabelsLeftToRight)
      .toEqual(['Vin', '3Vo', 'GND', 'SCL', 'SDA', 'IRQ', 'ADDR'])
  })

  it('accepts only the four ADDR-selected addresses', () => {
    expect(touchPadAddress({ partId: MPR121_PART_ID, i2cAddress: '0x5C' })).toBe(0x5c)
    expect(touchPadAddress({ partId: MPR121_PART_ID })).toBe(0x5a)
    expect(touchPadAddress({ partId: MPR121_PART_ID, i2cAddress: '0x40' })).toBeNull()
  })

  it('reads thresholds as register values, clamped, falling back to the part\'s own', () => {
    expect(touchPadThreshold({}, 'touch')).toBe(12)
    expect(touchPadThreshold({}, 'release')).toBe(6)
    expect(touchPadThreshold({ touchThreshold: 40 }, 'touch')).toBe(40)
    expect(touchPadThreshold({ touchThreshold: 900 }, 'touch')).toBe(255)
    expect(touchPadThreshold({ releaseThreshold: 0 }, 'release')).toBe(1)
    expect(touchPadThreshold({ releaseThreshold: 'abc' }, 'release')).toBe(6)
  })
})

describe('touch pad firmware', () => {
  it('starts one I2C bus, configures the chip once and reads the two status bytes', () => {
    const { nodes, edges } = padGraph({ i2cAddress: '0x5B', touchThreshold: 20, releaseThreshold: 10 })
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('#include <Wire.h>')
    expect(sketch.match(/Wire\.begin\(/g)).toHaveLength(1)
    expect(sketch.match(/static bool _mprRead\(/g)).toHaveLength(1)
    expect(sketch).toContain('_mprBegin(0x5B, 20, 10)')
    expect(sketch).toContain('_mprRead(0x5B, &_mprBits_pad)')
    expect(sketch).toContain('Wire.requestFrom((int)addr, 2) != 2')
    expect(sketch).toContain('_mprWrite(addr, 0x80, 0x63)')
    expect(sketch).toContain('Wire.read() != 0x24')
    expect(sketch).toContain('_mprWrite(addr, 0x5E, 0x8F)')
    expect(sketch).toContain('float n_pad_electrode = _mprLast_pad;')
    expect(sketch).toContain('bool n_pad_touched = _mprN_pad > 0;')
    expect(sketch).toContain('bool n_pad_connected = _mprReady_pad;')
    expect(sketch.indexOf('Wire.begin(')).toBeLessThan(sketch.indexOf('_mprBegin(0x5B'))
  })

  it('reads the two bytes in separate operations, since operand order is unspecified', () => {
    const { nodes, edges } = padGraph()
    expect(generateCpp(nodes, edges)).not.toMatch(/Wire\.read\(\)[^;\n]*Wire\.read\(\)/)
  })

  it('keeps a sketch without the sensor free of the helper', () => {
    const sketch = generateCpp([node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })],
      [edge('frame', 'fill', 'frame', 'out', 'frame')])
    expect(sketch).not.toContain('_mprRead')
  })

  it('is available to the shared show/player control compiler', () => {
    const sensor = node('pad', 'TouchPadInput', { sdaPin: 21, sclPin: 22 })
    const map = node('map', 'MapRange', { inMin: 0, inMax: 11, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('electrode', 'pad', 'electrode', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.includes).toContain('#include <Wire.h>')
    expect(emitted.setup.join('\n')).toContain('Wire.begin(21, 22);')
    expect(emitted.helpers.join('\n')).toContain('static bool _mprRead(')
    expect(emitted.loop.join('\n')).toContain('_mprBegin(0x5A')
  })
})

describe('touch pad wiring and validation', () => {
  it('shares SDA/SCL, flags a repeated address, rejects an impossible one, and draws the exact pads', () => {
    const pad = node('pad', 'TouchPadInput', { sdaPin: 21, sclPin: 22 })
    expect(collectPinUses([pad]).map((use) => [use.propertyKey, use.pin])).toEqual([['sdaPin', 21], ['sclPin', 22]])
    // Two touch controllers strapped to the same address are a real collision on one bus.
    expect(findPinConflicts([pad, node('pad2', 'TouchPadInput', { sdaPin: 21, sclPin: 22 })]).join('\n')).toContain('0x5A')
    expect(findPinConflicts([pad, node('pad3', 'TouchPadInput', { i2cAddress: '0x5B', sdaPin: 21, sclPin: 22 })])).toEqual([])
    expect(findDeployBlockingErrors([node('bad', 'TouchPadInput', { i2cAddress: '0x40' })], [], 'esp32:esp32:esp32').join('\n'))
      .toContain('answers only on 0x5A, 0x5B, 0x5C, 0x5D')

    const [item] = buildHardwareManifest([pad], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(MPR121_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'touch-pad-input', supported: true, facts: { i2cAddress: '0x5A', electrodes: '12' } })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('Vin')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SDA')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('SCL')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import {
  peripheralGroundPadIndex, peripheralPowerNet, peripheralPowerPadIndex, peripheralSignalPadIndex,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import { FIXTURE_PARTS } from '../../components/Hardware/hardwarePartCatalog'
import { findDeployBlockingErrors, findPinConflicts } from '../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../nodeLibrary'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { useHardwareInputStore } from '../hardwareInputStore'
import { partById } from '../partCatalogue'
import { PART_OPTIONS } from '../partOptions'
import {
  PCA9685_PART_ID, pwmDriverAddress, pwmDriverAddressOptions, pwmDriverHz, pwmDriverInputs, pwmDriverPrescale,
  pwmDriverSpec,
} from '../pwmDriver'

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

/** A knob drives channels 0 and 3; every other channel is left unwired. */
function driverGraph(properties: Record<string, unknown> = {}) {
  const nodes = [
    node('pwm', 'PwmDriverOutput', properties), node('pot', 'PotInput', { pin: 34 }),
    node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('frame', 'fill', 'frame', 'out', 'frame'),
    edge('c0', 'pot', 'value', 'pwm', 'channel0'),
    edge('c3', 'pot', 'value', 'pwm', 'channel3'),
  ]
  return { nodes, edges }
}

describe('the catalogued PCA9685', () => {
  it('carries sixteen 12-bit channels, 0x40 to 0x6F and a 24 to 1526 Hz range', () => {
    expect(pwmDriverSpec(PCA9685_PART_ID)).toMatchObject({
      device: 'PCA9685', channels: 16, resolutionBits: 12, defaultI2cAddress: 0x40,
      oscillatorMHz: 25, minPwmHz: 24, maxPwmHz: 1526, defaultPwmHz: 1000,
    })
    const options = pwmDriverAddressOptions(PCA9685_PART_ID)
    expect(options).toHaveLength(48)
    expect([options[0], options[47]]).toEqual(['0x40', '0x6F'])
    expect(partById(PCA9685_PART_ID)?.pinLabelsLeftToRight).toEqual(['GND', 'OE', 'SCL', 'SDA', 'VCC', 'V+'])
    expect(PART_OPTIONS.PwmDriverOutput.options.map((option) => option.id)).toEqual([PCA9685_PART_ID])
    expect(FIXTURE_PARTS.find((entry) => entry.nodeType === 'PwmDriverOutput')?.pinFields?.map((field) => field.key))
      .toEqual(['sdaPin', 'sclPin'])
  })

  it('accepts only an address the part is offered on', () => {
    expect(pwmDriverAddress({ i2cAddress: '0x41' })).toBe(0x41)
    expect(pwmDriverAddress({})).toBe(0x40)
    expect(pwmDriverAddress({ i2cAddress: '0x70' })).toBeNull()
  })

  it('accepts complete hex or numeric addresses and refuses partial parses', () => {
    for (const i2cAddress of ['41', ' 0x41 ', 65]) expect(pwmDriverAddress({ i2cAddress })).toBe(0x41)
    for (const i2cAddress of ['0x41junk', '0x41.5', '0x41;evil()', true, {}, 65.5]) {
      expect(pwmDriverAddress({ i2cAddress })).toBeNull()
    }
  })

  it('clamps the frequency to the prescaler\'s reach and derives the register value from it', () => {
    expect(pwmDriverHz({})).toBe(1000)
    expect(pwmDriverHz({ pwmHz: 5 })).toBe(24)
    expect(pwmDriverHz({ pwmHz: 9000 })).toBe(1526)
    expect(pwmDriverPrescale({ pwmHz: 1000 })).toBe(5)
    expect(pwmDriverPrescale({ pwmHz: 50 })).toBe(121)
    expect(pwmDriverPrescale({ pwmHz: 24 })).toBe(253)
  })

  it('is a sink with sixteen float channels and I2C defaults', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'PwmDriverOutput')!
    expect(definition.outputs).toEqual([])
    expect(definition.inputs).toEqual(pwmDriverInputs(PCA9685_PART_ID))
    expect(definition.inputs).toHaveLength(16)
    expect(definition.inputs.every((port) => port.dataType === 'float')).toBe(true)
    expect(libraryDefaults('PwmDriverOutput')).toMatchObject({ partId: PCA9685_PART_ID, i2cAddress: '0x40', pwmHz: 1000 })
  })
})

describe('PWM driver firmware', () => {
  it('turns every retained channel fully off before putting the chip to sleep', () => {
    const { nodes, edges } = driverGraph()
    const sketch = generateCpp(nodes, edges)
    const begin = sketch.slice(sketch.indexOf('static bool _pcaBegin'), sketch.indexOf('static bool _pcaSet'))
    expect(begin).toContain('bool ok = _pcaWrite(addr, 0xFD, 0x10);')
    expect(begin.indexOf('0xFD, 0x10')).toBeLessThan(begin.indexOf('0x00, 0x10'))
    expect(begin).toContain('if (!ok) return false;')
  })

  it('starts one I2C bus, configures the chip once and writes only the wired channels', () => {
    const { nodes, edges } = driverGraph({ i2cAddress: '0x41', pwmHz: 1000 })
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('#include <Wire.h>')
    expect(sketch.match(/Wire\.begin\(/g)).toHaveLength(1)
    expect(sketch.match(/static bool _pcaSet\(/g)).toHaveLength(1)
    expect(sketch).toContain('_pcaBegin(0x41, 5)')
    expect(sketch).toContain('_pcaSet(0x41, 0, _pwmDuty_pwm_0)')
    expect(sketch).toContain('_pcaSet(0x41, 3, _pwmDuty_pwm_3)')
    expect(sketch).not.toContain('_pcaSet(0x41, 1,')
    expect(sketch).toContain('constrain(n_pot_value, 0.0f, 1.0f) * 4095.0f + 0.5f')
    expect(sketch).toContain('on = 0x1000')
    expect(sketch).toContain('off = 0x1000')
    expect(sketch.indexOf('Wire.begin(')).toBeLessThan(sketch.indexOf('_pcaBegin(0x41'))
  })

  it('keeps a sketch without the driver free of the helper', () => {
    const sketch = generateCpp([node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })],
      [edge('frame', 'fill', 'frame', 'out', 'frame')])
    expect(sketch).not.toContain('_pcaSet')
  })

  it('keeps separate driver state and frequencies on one shared bus and helper', () => {
    const { nodes, edges } = driverGraph()
    const sketch = generateCpp([...nodes, node('pwm2', 'PwmDriverOutput', { i2cAddress: '0x41', pwmHz: 50 })],
      [...edges, edge('c15', 'pot', 'value', 'pwm2', 'channel15')])
    expect(sketch.match(/static bool _pcaBegin\(/g)).toHaveLength(1)
    expect(sketch.match(/Wire\.begin\(/g)).toHaveLength(1)
    expect(sketch).toContain('_pcaBegin(0x40, 5)')
    expect(sketch).toContain('_pcaBegin(0x41, 121)')
    expect(sketch).toContain('_pwmLast_pwm2[15]')
    expect(sketch).toContain('_pcaSet(0x41, 15, _pwmDuty_pwm2_15)')
    expect(sketch).not.toContain('_pcaSet(0x41, 0,')
  })
})

describe('PWM driver preview', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useHardwareInputStore.setState({ pot: new Map() })
  })

  it('evaluates channels at preview cadence without changing the LED frame', () => {
    const { nodes, edges } = driverGraph()
    nodes.push(node('idle', 'Wave'))
    useHardwareInputStore.getState().setPot('pot', 0.25)
    const first = evaluateGraphFull(nodes, edges, 0, 8, 8, {}, false)
    const frame = structuredClone(first.frame)
    expect(first.outputs.get('pwm')).toEqual({})
    expect(first.outputs.get('pot')?.value).toBe(0.25)
    expect(first.outputs.has('idle')).toBe(false)
    expect(frame).not.toBeNull()
    useHardwareInputStore.getState().setPot('pot', 0.75)
    const second = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, false)
    expect(second.outputs.get('pot')?.value).toBe(0.75)
    expect(second.frame).toEqual(frame)
  })

  it('keeps the sink and its source hot even without an LED output', () => {
    const nodes = [node('pwm', 'PwmDriverOutput'), node('pot', 'PotInput')]
    const edges = [edge('c15', 'pot', 'value', 'pwm', 'channel15')]
    useHardwareInputStore.getState().setPot('pot', 1)
    const preview = evaluateGraphFull(nodes, edges, 0, 8, 8, {}, false)
    expect(preview.frame).toBeNull()
    expect(preview.outputs.get('pwm')).toEqual({})
    expect(preview.outputs.get('pot')?.value).toBe(1)
  })
})

describe('PWM driver wiring and validation', () => {
  it('uses the firmware address for collision detection, including defaults and unprefixed hex', () => {
    const driver = node('pwm', 'PwmDriverOutput')
    delete driver.data.properties.i2cAddress
    expect(findPinConflicts([driver, node('pwm2', 'PwmDriverOutput')]).join('\n')).toContain('0x40')
    expect(findPinConflicts([node('pwm', 'PwmDriverOutput', { i2cAddress: '41' }),
      node('pwm2', 'PwmDriverOutput', { i2cAddress: 65 })]).join('\n')).toContain('0x41')
    expect(findDeployBlockingErrors([node('bad', 'PwmDriverOutput', { i2cAddress: '0x41junk' })], [],
      'esp32:esp32:esp32').join('\n')).toContain('0x40 to 0x6F')
  })

  it('shares SDA/SCL, flags a repeated address, rejects an impossible one, and draws the exact pads', () => {
    const driver = node('pwm', 'PwmDriverOutput', { sdaPin: 21, sclPin: 22 })
    expect(collectPinUses([driver]).map((use) => [use.propertyKey, use.pin])).toEqual([['sdaPin', 21], ['sclPin', 22]])
    expect(findPinConflicts([driver, node('pwm2', 'PwmDriverOutput', { sdaPin: 21, sclPin: 22 })]).join('\n')).toContain('0x40')
    expect(findPinConflicts([driver, node('pwm3', 'PwmDriverOutput', { i2cAddress: '0x41', sdaPin: 21, sclPin: 22 })])).toEqual([])
    expect(findDeployBlockingErrors([node('bad', 'PwmDriverOutput', { i2cAddress: '0x70' })], [], 'esp32:esp32:esp32').join('\n'))
      .toContain('0x40 to 0x6F')

    const [item] = buildHardwareManifest([driver], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(PCA9685_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'pwm-driver-output', supported: true,
      facts: { partId: PCA9685_PART_ID, i2cAddress: '0x40', channels: '16', pwmHz: '1000 Hz' },
    })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SDA')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('SCL')
  })
})

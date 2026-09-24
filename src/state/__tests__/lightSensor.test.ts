import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../codegen/controlGraph'
import {
  peripheralGroundPadIndex, peripheralPowerNet, peripheralPowerPadIndex,
  peripheralSignalPadIndex,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import { findDeployBlockingErrors, findPinConflicts, validateGraph } from '../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../graphStore'
import { evaluateGraphFull } from '../graphEvaluator'
import { useHardwareInputStore } from '../hardwareInputStore'
import { gpioRequirementForProperty, isPropertyEnabled, libraryDefaults, NODE_LIBRARY } from '../nodeLibrary'
import { partById } from '../partCatalogue'
import { PART_OPTIONS } from '../partOptions'
import {
  BH1750_PART_ID, DEFAULT_LIGHT_SENSOR_PART_ID, LIGHT_SENSOR_MODULES,
  lightSensorAddress, lightSensorAddressOptions, lightSensorPinKeys, lightSensorPreviewReading,
} from '../lightSensor'

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

const bh1750 = (id = 'light', props: Record<string, unknown> = {}) =>
  node(id, 'LightInput', { partId: BH1750_PART_ID, ...props })

function lightGraph(sensor: StudioNode, port: 'level' | 'lux' = 'level') {
  const nodes = [
    sensor,
    node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }),
    node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('amount', sensor.id, port, 'fade', 'fade'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the light-sensor module list', () => {
  it('offers exactly the modules the generator can build, LDR first', () => {
    expect(LIGHT_SENSOR_MODULES[0].partId).toBe(DEFAULT_LIGHT_SENSOR_PART_ID)
    expect(PART_OPTIONS.LightInput.options.map((option) => option.id))
      .toEqual(LIGHT_SENSOR_MODULES.map((module) => module.partId))
  })

  it('reads the BH1750 address straps and range from its catalogue entry', () => {
    expect(partById(BH1750_PART_ID)?.lightSensor).toMatchObject({
      device: 'BH1750FVI', i2cAddresses: [0x23, 0x5c], defaultI2cAddress: 0x23, maxLux: 65535,
    })
    expect(partById(BH1750_PART_ID)?.pinLabelsLeftToRight)
      .toEqual(['VIN', '3Vo', 'GND', 'SCL', 'SDA', 'ADDR'])
    expect(lightSensorAddressOptions(BH1750_PART_ID)).toEqual(['0x23', '0x5C'])
  })

  it('accepts only an address the ADDR pin can select, and none for an LDR', () => {
    expect(lightSensorAddress({ partId: BH1750_PART_ID, i2cAddress: '0x5C' })).toBe(0x5c)
    expect(lightSensorAddress({ partId: BH1750_PART_ID, i2cAddress: '0x40' })).toBeNull()
    expect(lightSensorAddress({ partId: DEFAULT_LIGHT_SENSOR_PART_ID, i2cAddress: '0x23' })).toBeNull()
  })

  it('shows only the fields the chosen module has', () => {
    const ldr = libraryDefaults('LightInput')
    const digital = { ...ldr, partId: BH1750_PART_ID }
    expect(lightSensorPinKeys(ldr)).toEqual(['pin'])
    expect(lightSensorPinKeys(digital)).toEqual(['sdaPin', 'sclPin'])
    for (const key of ['sdaPin', 'sclPin', 'i2cAddress', 'maxLux']) {
      expect(isPropertyEnabled('LightInput', key, ldr), key).toBe(false)
      expect(isPropertyEnabled('LightInput', key, digital), key).toBe(true)
    }
    expect(isPropertyEnabled('LightInput', 'pin', ldr)).toBe(true)
    expect(isPropertyEnabled('LightInput', 'pin', digital)).toBe(false)
    // An LDR needs an ADC; an I2C pair is a bus, not an analog claim.
    expect(gpioRequirementForProperty('LightInput', 'pin', ldr)).toEqual({ capability: 'analogInput', pullup: false })
    expect(gpioRequirementForProperty('LightInput', 'sdaPin', digital)).toBeNull()
  })
})

describe('preview', () => {
  it('reports no lux for an LDR, which has no calibration', () => {
    expect(lightSensorPreviewReading(DEFAULT_LIGHT_SENSOR_PART_ID, 0.4)).toEqual({ level: 0.4, lux: 0 })
    expect(lightSensorPreviewReading(BH1750_PART_ID, 0.25, 2000)).toEqual({ level: 0.25, lux: 500 })
  })

  it('publishes the knob through the graph evaluator', () => {
    const sensor = bh1750('light-preview', { maxLux: 4000 })
    useHardwareInputStore.getState().setPot(sensor.id, 0.5)
    expect(evaluateGraphFull([sensor], [], 0).outputs.get(sensor.id)).toEqual({ level: 0.5, lux: 2000 })
  })
})

describe('firmware', () => {
  it('keeps the LDR on one analog read with Lux held at zero', () => {
    const { nodes, edges } = lightGraph(node('light', 'LightInput', { pin: 34 }))
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('float n_light_level = analogRead(34) / 4095.0f;')
    expect(sketch).toContain('float n_light_lux = 0.0f;')
    expect(sketch).not.toContain('_bh1750Begin')
  })

  it('starts Wire, powers the BH1750 on its address and scales Level by Max Lux', () => {
    const { nodes, edges } = lightGraph(bh1750('light', { i2cAddress: '0x5C', maxLux: 2000 }))
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('#include <Wire.h>')
    // No board is chosen here, so the bus starts on the core's default pins —
    // the same rule every other I2C part follows.
    expect(sketch).toContain('Wire.begin();')
    expect(sketch).toContain('_bh1750Begin(0x5C);')
    expect(sketch).toContain('_bh1750Read(0x5C, n_light_lux);')
    expect(sketch).toContain('float n_light_level = constrain(n_light_lux / 2000.0f, 0.0f, 1.0f);')
    expect(sketch.match(/static void _bh1750Begin\(/g)).toHaveLength(1)
  })

  it('is available to the shared show/player control compiler', () => {
    const sensor = bh1750('light', { sdaPin: 21, sclPin: 22 })
    const map = node('map', 'MapRange', { inMin: 0, inMax: 1000, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('lux', 'light', 'lux', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.includes).toContain('#include <Wire.h>')
    expect(emitted.setup.join('\n')).toContain('Wire.begin(21, 22);')
    expect(emitted.setup.join('\n')).toContain('_bh1750Begin(0x23);')
    expect(emitted.helpers.join('\n')).toContain('static bool _bh1750Read(')
    expect(emitted.loop.join('\n')).toContain('_bh1750Read(0x23, n_light_lux);')
  })
})

describe('validation and wiring', () => {
  it('claims SDA/SCL on the shared bus rather than an analog pin', () => {
    const sensor = bh1750('light', { sdaPin: 21, sclPin: 22 })
    expect(collectPinUses([sensor]).map((use) => [use.propertyKey, use.pin]))
      .toEqual([['sdaPin', 21], ['sclPin', 22]])
    const rtc = node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 21, sclPin: 22 })
    expect(findPinConflicts([sensor, rtc])).toEqual([])
  })

  it('refuses two sensors on one address, and an address ADDR cannot select', () => {
    const pair = [bh1750('a', { sdaPin: 21, sclPin: 22 }), bh1750('b', { sdaPin: 21, sclPin: 22 })]
    expect(findPinConflicts(pair).join('\n')).toContain('0x23')
    const strapped = [pair[0], bh1750('b', { sdaPin: 21, sclPin: 22, i2cAddress: '0x5C' })]
    expect(findPinConflicts(strapped)).toEqual([])

    const { nodes, edges } = lightGraph(bh1750('light', { i2cAddress: '0x40' }))
    expect(findDeployBlockingErrors(nodes, edges, 'esp32:esp32:esp32').join('\n'))
      .toContain('answers only on 0x23, 0x5C')
    expect(validateGraph(nodes, edges).errors.join('\n')).toContain('0x40')
  })

  it('draws the BH1750 from 3V3 with SDA and SCL on their own pads', () => {
    const sensor = bh1750('light', { sdaPin: 21, sclPin: 22 })
    const [item] = buildHardwareManifest([sensor], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(BH1750_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'light-input', supported: true, facts: { transport: 'i2c', calibrated: true } })
    // VIN is what the level shifter pulls the controller's SDA/SCL up to.
    expect(peripheralPowerNet(item)).toBe('v3v3')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VIN')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SDA')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('SCL')
  })
})

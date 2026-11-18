import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { controlInputCpp } from '../../../codegen/controlInputCpp'
import { sensorInputPartEntries } from '../../../components/Hardware/hardwarePartCatalog'
import { peripheralPowerNet } from '../../../components/BuildDiagram/physicalDiagramLayout'
import { outputSignalRange } from '../../../nodes/shared/signalRange'
import { findDeployBlockingErrors, validateGraph } from '../../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { evaluateGraphFull } from '../../graphEvaluator'
import { useHardwareInputStore } from '../hardwareInputStore'
import { gpioRequirementForProperty, libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import { PART_CATALOGUE, type PartCatalogueEntry } from '../../../build/parts/partCatalogue'
import { partOptionsFor, resolvePartIdentity } from '../../../build/parts/partOptions'
import {
  analogSensorEntries, analogSensorPreviewReading, analogSensorReading, analogSensorSpec, analogSensorSpecIssue,
  analogSensorVolts, formatAnalogSensorReading,
} from '../analogSensor'
import {
  digitalSensorEntries, digitalSensorPreviewReading, digitalSensorSpec, digitalSensorSpecIssue, digitalSensorUsesPullup,
} from '../digitalSensor'
import {
  registerSensorFixtures, TEST_FSR_ID, TEST_HALL_ID, TEST_REED_ID, TEST_SOIL_ID, unregisterSensorFixtures,
} from './sensorFixtures'

beforeAll(registerSensorFixtures)
afterAll(unregisterSensorFixtures)

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

function sensorGraph(sensor: StudioNode, port: 'active' | 'value') {
  const nodes = [
    sensor,
    node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }),
    node('fade', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 14 }),
  ]
  const edges = [
    edge('amount', sensor.id, port, 'fade', 'brightness'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

const digital = (partId: string, props: Record<string, unknown> = {}, id = 'sw') =>
  node(id, 'DigitalSensorInput', { partId, pin: 27, ...props })
const analog = (partId: string, props: Record<string, unknown> = {}, id = 'probe') =>
  node(id, 'AnalogSensorInput', { partId, pin: 34, ...props })

describe('the node types', () => {
  it('are input nodes with one output each, and no connected flag a plain part cannot report', () => {
    const digitalDefinition = NODE_LIBRARY.find((entry) => entry.type === 'DigitalSensorInput')
    const analogDefinition = NODE_LIBRARY.find((entry) => entry.type === 'AnalogSensorInput')
    expect(digitalDefinition).toMatchObject({ category: 'input', label: 'Digital Sensor', inputs: [], outputs: [{ id: 'active', dataType: 'bool' }] })
    expect(analogDefinition).toMatchObject({ category: 'input', label: 'Analog Sensor', inputs: [], outputs: [{ id: 'value', dataType: 'float' }] })
  })
})

describe('part blocks', () => {
  it('finds a digital or analog sensor only by its own block', () => {
    expect(digitalSensorSpec(TEST_REED_ID)).toMatchObject({ activeLevel: 'low', pullUp: 'internal', debounceMs: 20 })
    expect(digitalSensorSpec(TEST_SOIL_ID)).toBeNull()
    expect(analogSensorSpec(TEST_SOIL_ID)).toMatchObject({ unit: '%' })
    expect(analogSensorSpec(TEST_REED_ID)).toBeNull()
  })

  it('has no spec for an unknown part, and never another part\'s', () => {
    for (const unknown of ['no-such-part', '', undefined, null, 42]) {
      expect(digitalSensorSpec(unknown)).toBeNull()
      expect(analogSensorSpec(unknown)).toBeNull()
    }
  })

  it('refuses a block that breaks the rules, so a bad part reads as unavailable', () => {
    const bad = (extra: Partial<PartCatalogueEntry>): PartCatalogueEntry =>
      ({ partId: 'test-bad', label: 'Bad', dimensionsMm: { width: 1, height: 1 }, ...extra })
    PART_CATALOGUE['test-bad'] = bad({
      digitalSensor: { activeLevel: 'high', pullUp: 'internal', debounceMs: 0, activeLabel: 'a', idleLabel: 'b' },
    })
    try {
      expect(digitalSensorSpec('test-bad')).toBeNull()
      expect(digitalSensorEntries(PART_CATALOGUE).map((entry) => entry.partId)).not.toContain('test-bad')
    } finally {
      delete PART_CATALOGUE['test-bad']
    }
  })

  it('names why a digital block is unusable', () => {
    const ok = { activeLevel: 'low', pullUp: 'none', debounceMs: 0, activeLabel: 'On', idleLabel: 'Off' }
    expect(digitalSensorSpecIssue(ok)).toBeNull()
    expect(digitalSensorSpecIssue({ ...ok, activeLevel: 'sideways' })).toMatch(/activeLevel/)
    expect(digitalSensorSpecIssue({ ...ok, pullUp: 'pulldown' })).toMatch(/pullUp/)
    expect(digitalSensorSpecIssue({ ...ok, activeLevel: 'high', pullUp: 'internal' })).toMatch(/pull-up/)
    expect(digitalSensorSpecIssue({ ...ok, debounceMs: -1 })).toMatch(/debounceMs/)
    expect(digitalSensorSpecIssue({ ...ok, debounceMs: 1.5 })).toMatch(/debounceMs/)
    expect(digitalSensorSpecIssue({ ...ok, debounceMs: 5000 })).toMatch(/debounceMs/)
    expect(digitalSensorSpecIssue({ ...ok, supplyVolts: 0 })).toMatch(/supplyVolts/)
    expect(digitalSensorSpecIssue({ ...ok, activeLabel: '' })).toMatch(/activeLabel/)
    expect(digitalSensorSpecIssue({ ...ok, idleLabel: 'line\nbreak' })).toMatch(/idleLabel/)
    expect(digitalSensorSpecIssue(null)).not.toBeNull()
  })

  it('names why an analog block is unusable', () => {
    const ok = {
      unit: 'kPa', supplyVolts: 3.3, adcRange: { minVolts: 0, maxVolts: 3.3 },
      curve: [{ volts: 0, value: 0 }, { volts: 3, value: 100 }], outputMin: 0, outputMax: 100,
    }
    expect(analogSensorSpecIssue(ok)).toBeNull()
    expect(analogSensorSpecIssue({ ...ok, unit: '' })).toMatch(/unit/)
    expect(analogSensorSpecIssue({ ...ok, unit: 'far too long a unit' })).toMatch(/unit/)
    expect(analogSensorSpecIssue({ ...ok, supplyVolts: 30 })).toMatch(/supplyVolts/)
    expect(analogSensorSpecIssue({ ...ok, adcRange: { minVolts: 2, maxVolts: 1 } })).toMatch(/adcRange/)
    expect(analogSensorSpecIssue({ ...ok, adcRange: { minVolts: 0, maxVolts: 12 } })).toMatch(/adcRange/)
    expect(analogSensorSpecIssue({ ...ok, curve: [{ volts: 0, value: 0 }] })).toMatch(/^curve /)
    expect(analogSensorSpecIssue({ ...ok, outputMax: 0 })).toMatch(/outputMin/)
    expect(analogSensorSpecIssue({ ...ok, outputMax: Number.POSITIVE_INFINITY })).toMatch(/outputMin/)
    expect(analogSensorSpecIssue({ ...ok, decimals: 9 })).toMatch(/decimals/)
  })
})

describe('preview', () => {
  it('reads the toggle as the part being actuated, whatever level that is on the pin', () => {
    expect(digitalSensorPreviewReading(TEST_REED_ID, true)).toBe(true)
    expect(digitalSensorPreviewReading(TEST_HALL_ID, true)).toBe(true)
    expect(digitalSensorPreviewReading(TEST_REED_ID, false)).toBe(false)
    // A part that is not in the catalogue is never active.
    expect(digitalSensorPreviewReading('no-such-part', true)).toBe(false)
  })

  it('maps the slider across the part\'s ADC range, through its curve, into its window', () => {
    const soil = analogSensorSpec(TEST_SOIL_ID)!
    expect(analogSensorVolts(soil, 0)).toBe(0)
    expect(analogSensorVolts(soil, 1)).toBeCloseTo(3.3, 12)
    expect(analogSensorVolts(soil, 5)).toBeCloseTo(3.3, 12)
    // Below the curve's first point the value holds; wet is the low-voltage end.
    expect(analogSensorReading(soil, 0)).toBe(100)
    expect(analogSensorReading(soil, 1)).toBe(0)
    // 2.0 V is halfway between 1.2 V (100) and 2.8 V (0).
    expect(analogSensorReading(soil, 2.0 / 3.3)).toBeCloseTo(50, 9)
    expect(analogSensorPreviewReading(TEST_SOIL_ID, 2.0 / 3.3)).toBeCloseTo(50, 9)
    expect(analogSensorPreviewReading('no-such-part', 0.5)).toBe(0)
    expect(formatAnalogSensorReading(soil, 49.6)).toBe('50 %')
    expect(formatAnalogSensorReading(analogSensorSpec(TEST_FSR_ID)!, 2.5)).toBe('2.50 N')
  })

  it('holds the reading inside the part\'s output window', () => {
    const entry: PartCatalogueEntry = {
      partId: 'test-clamped', label: 'Clamped', dimensionsMm: { width: 1, height: 1 },
      analogSensor: {
        unit: 'x', supplyVolts: 3.3, adcRange: { minVolts: 0, maxVolts: 3 },
        curve: [{ volts: 0, value: -50 }, { volts: 3, value: 500 }], outputMin: 0, outputMax: 200,
      },
    }
    PART_CATALOGUE[entry.partId] = entry
    try {
      expect(analogSensorPreviewReading(entry.partId, 0)).toBe(0)
      expect(analogSensorPreviewReading(entry.partId, 1)).toBe(200)
    } finally {
      delete PART_CATALOGUE[entry.partId]
    }
  })

  it('publishes through the graph evaluator', () => {
    const reed = digital(TEST_REED_ID, {}, 'reed-preview')
    useHardwareInputStore.getState().setButton(reed.id, true)
    expect(evaluateGraphFull([reed], [], 0).outputs.get(reed.id)).toEqual({ active: true })
    useHardwareInputStore.getState().setButton(reed.id, false)
    expect(evaluateGraphFull([reed], [], 0).outputs.get(reed.id)).toEqual({ active: false })

    const soil = analog(TEST_SOIL_ID, {}, 'soil-preview')
    useHardwareInputStore.getState().setPot(soil.id, 0)
    expect(evaluateGraphFull([soil], [], 0).outputs.get(soil.id)).toEqual({ value: 100 })

    const missing = analog('no-such-part', {}, 'missing-preview')
    useHardwareInputStore.getState().setPot(missing.id, 0.5)
    expect(evaluateGraphFull([missing], [], 0).outputs.get(missing.id)).toEqual({ value: 0 })
  })

  it('tells Graph Health the real range of an analog reading', () => {
    expect(outputSignalRange('AnalogSensorInput', 'value', { partId: TEST_SOIL_ID })).toEqual({ min: 0, max: 100 })
    expect(outputSignalRange('AnalogSensorInput', 'value', { partId: 'no-such-part' })).toBeNull()
  })
})

describe('pins', () => {
  it('asks for an ADC pin for an analog sensor', () => {
    expect(gpioRequirementForProperty('AnalogSensorInput', 'pin', { partId: TEST_SOIL_ID }))
      .toEqual({ capability: 'analogInput', pullup: false })
  })

  it('asks for a pull-up only where the part\'s block says the controller supplies it', () => {
    expect(digitalSensorUsesPullup(TEST_REED_ID)).toBe(true)
    expect(digitalSensorUsesPullup(TEST_HALL_ID)).toBe(false)
    expect(digitalSensorUsesPullup('no-such-part')).toBe(false)
    expect(gpioRequirementForProperty('DigitalSensorInput', 'pin', { partId: TEST_REED_ID }))
      .toEqual({ capability: 'digitalInput', pullup: true })
    expect(gpioRequirementForProperty('DigitalSensorInput', 'pin', { partId: TEST_HALL_ID }))
      .toEqual({ capability: 'digitalInput', pullup: false })
  })

  it('claims one exclusive pin through the shared pin collector', () => {
    const reed = digital(TEST_REED_ID)
    const soil = analog(TEST_SOIL_ID)
    const uses = collectPinUses([reed, soil])
    expect(uses.map((use) => [use.nodeType, use.propertyKey, use.pin])).toEqual([
      ['DigitalSensorInput', 'pin', 27],
      ['AnalogSensorInput', 'pin', 34],
    ])
    expect(uses[0].requirement).toEqual({ capability: 'digitalInput', pullup: true })
    expect(uses[1].requirement).toEqual({ capability: 'analogInput', pullup: false })
  })

  it('reports a pull-up part on a pin with no pull-up', () => {
    // GPIO 34 is input-only on a classic ESP32: no internal pull-up.
    const { nodes, edges } = sensorGraph(digital(TEST_REED_ID, { pin: 34 }), 'active')
    expect(findDeployBlockingErrors(nodes, edges, 'esp32:esp32:esp32').join('\n'))
      .toContain('Digital Sensor signal pin uses pin 34, which has no internal pull-up')
    const fine = sensorGraph(digital(TEST_REED_ID, { pin: 27 }), 'active')
    expect(findDeployBlockingErrors(fine.nodes, fine.edges, 'esp32:esp32:esp32')).toEqual([])
    // The same pin is fine for a part that needs no pull-up.
    const hall = sensorGraph(digital(TEST_HALL_ID, { pin: 34 }), 'active')
    expect(findDeployBlockingErrors(hall.nodes, hall.edges, 'esp32:esp32:esp32')).toEqual([])
  })
})

describe('manifest', () => {
  it('describes each sensor from its part and supports it', () => {
    const items = buildHardwareManifest([digital(TEST_HALL_ID), analog(TEST_SOIL_ID)], [], 'esp32:esp32:esp32').items
    const hall = items.find((item) => item.kind === 'digital-sensor-input')
    const soil = items.find((item) => item.kind === 'analog-sensor-input')
    expect(hall).toMatchObject({ supported: true, title: 'Test Hall module', facts: { partId: TEST_HALL_ID, activeLevel: 'high', supplyVoltage: 5 } })
    expect(soil).toMatchObject({ supported: true, facts: { partId: TEST_SOIL_ID, unit: '%', supplyVoltage: 3.3 } })
    expect(hall && peripheralPowerNet(hall)).toBe('v5')
    expect(soil && peripheralPowerNet(soil)).toBe('v3v3')
  })

  it('marks a sensor whose part is missing as unsupported rather than substituting one', () => {
    const items = buildHardwareManifest([digital('no-such-part'), analog('')], [], 'esp32:esp32:esp32').items
    for (const kind of ['digital-sensor-input', 'analog-sensor-input'] as const) {
      const item = items.find((candidate) => candidate.kind === kind)
      expect(item, kind).toMatchObject({ supported: false })
      expect(item?.reasons?.[0], kind).toMatch(/not in the catalogue/)
    }
  })
})

describe('validation', () => {
  it('blocks the build on a part the catalogue does not have, and only then', () => {
    const missing = sensorGraph(digital('no-such-part'), 'active')
    expect(findDeployBlockingErrors(missing.nodes, missing.edges, 'esp32:esp32:esp32').join('\n'))
      .toContain('Digital sensor part is not available')
    expect(validateGraph(missing.nodes, missing.edges, 'esp32:esp32:esp32').errors.join('\n')).toContain('no-such-part')
    // A part of the other kind is not a digital sensor either.
    const wrongKind = sensorGraph(digital(TEST_SOIL_ID), 'active')
    expect(findDeployBlockingErrors(wrongKind.nodes, wrongKind.edges, 'esp32:esp32:esp32').join('\n'))
      .toContain('Digital sensor part is not available')
    const analogMissing = sensorGraph(analog(''), 'value')
    expect(findDeployBlockingErrors(analogMissing.nodes, analogMissing.edges, 'esp32:esp32:esp32').join('\n'))
      .toContain('Analog sensor part is not available')
    const present = sensorGraph(analog(TEST_SOIL_ID), 'value')
    expect(findDeployBlockingErrors(present.nodes, present.edges, 'esp32:esp32:esp32')).toEqual([])
  })
})

describe('firmware: digital', () => {
  it('reads a debounced active-low part through the controller pull-up', () => {
    const { nodes, edges } = sensorGraph(digital(TEST_REED_ID), 'active')
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('pinMode(27, INPUT_PULLUP);')
    expect(sketch).toContain('bool _dsNow_sw = digitalRead(27) == LOW;')
    expect(sketch).toContain('>= 20u')
    expect(sketch).toContain('bool n_sw_active = _dsStable_sw;')
  })

  it('reads a clean active-high part directly, with no pull-up and no debounce state', () => {
    const { nodes, edges } = sensorGraph(digital(TEST_HALL_ID), 'active')
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('pinMode(27, INPUT);')
    expect(sketch).toContain('bool n_sw_active = digitalRead(27) == HIGH;')
    expect(sketch).not.toContain('_dsStable_')
  })

  it('emits an unavailable part as an inactive reading naming the id, with no pin setup', () => {
    const { nodes, edges } = sensorGraph(digital('no-such-part'), 'active')
    const sketch = generateCpp(nodes, edges)
    // The reading is folded into the graph as a constant false, and nothing touches the pin.
    expect(sketch).not.toContain('pinMode(27')
    expect(sketch).not.toContain('digitalRead(27)')
    expect(controlInputCpp('DigitalSensorInput', 'sw', { partId: 'no-such-part', pin: 27 })?.loop)
      .toEqual(['  bool n_sw_active = false;  // part no-such-part is not in the catalogue'])
  })

  it('keeps a part id that could break out of a comment out of the sketch', () => {
    const { nodes, edges } = sensorGraph(digital('x\nint injected = 1;//'), 'active')
    const sketch = generateCpp(nodes, edges)
    expect(sketch).not.toContain('int injected')
  })
})

describe('firmware: analog', () => {
  it('reads the pin as a voltage, runs the part\'s curve and holds the output window', () => {
    const { nodes, edges } = sensorGraph(analog(TEST_SOIL_ID), 'value')
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('static const float _asVolts_probe[2] = { 1.2f, 2.8f };')
    expect(sketch).toContain('static const float _asValues_probe[2] = { 100.0f, 0.0f };')
    expect(sketch).toContain('_asPin_probe = analogRead(34) / DS_ANALOG_FULL_SCALE;')
    expect(sketch).toContain('float n_probe_value = constrain(_calCurve(_asVolts_probe, _asValues_probe, 2, 0.0f + _asPin_probe * 3.3f), 0.0f, 100.0f);')
    // One copy of the shared helper, whatever the number of sensors.
    expect(sketch.match(/static float _calCurve\(/g)).toHaveLength(1)
  })

  it('shares one helper across several sensors, each with its own table', () => {
    const { nodes, edges } = sensorGraph(analog(TEST_SOIL_ID), 'value')
    const second = analog(TEST_FSR_ID, { pin: 35 }, 'force')
    // A second dimmer between the first and the output, driven by the second sensor.
    const sketch = generateCpp(
      [...nodes, second, node('fade2', 'BrightnessMod')],
      [
        ...edges.filter((entry) => entry.id !== 'output'),
        edge('stage', 'fade', 'frame', 'fade2', 'frame'),
        edge('force-wire', 'force', 'value', 'fade2', 'brightness'),
        edge('output', 'fade2', 'frame', 'out', 'frame'),
      ],
    )
    expect(sketch.match(/static float _calCurve\(/g)).toHaveLength(1)
    expect(sketch).toContain('_asVolts_force[3] = { 0.3f, 1.3f, 3.0f }')
    expect(sketch).toContain('analogRead(35)')
  })

  it('emits an unavailable part as a zero reading with no pin read', () => {
    const { nodes, edges } = sensorGraph(analog('no-such-part'), 'value')
    const sketch = generateCpp(nodes, edges)
    expect(sketch).not.toContain('analogRead(34)')
    expect(controlInputCpp('AnalogSensorInput', 'probe', { partId: 'no-such-part', pin: 34 })?.loop)
      .toEqual(['  float n_probe_value = 0.0f;  // part no-such-part is not in the catalogue'])
  })

  it('is available to the fixed show controller through the same emitter', () => {
    const emission = controlInputCpp('AnalogSensorInput', 'probe', { partId: TEST_SOIL_ID, pin: 34 })
    expect(emission?.outputs).toEqual({ value: 'float' })
    expect(emission?.helpers?.[0]).toContain('_calCurve')
    const reed = controlInputCpp('DigitalSensorInput', 'sw', { partId: TEST_REED_ID, pin: 27 })
    expect(reed?.outputs).toEqual({ active: 'bool' })
    expect(reed?.setup).toEqual(['  pinMode(27, INPUT_PULLUP);'])
  })
})

describe('shelf and options', () => {
  it('offers exactly the catalogued parts that carry each block', () => {
    expect(partOptionsFor('DigitalSensorInput').map((option) => option.id)).toEqual([TEST_REED_ID, TEST_HALL_ID])
    expect(partOptionsFor('AnalogSensorInput').map((option) => option.id)).toEqual([TEST_SOIL_ID, TEST_FSR_ID])
    expect(analogSensorEntries(PART_CATALOGUE).map((entry) => entry.partId)).toEqual([TEST_SOIL_ID, TEST_FSR_ID])
  })

  it('resolves an unknown part to nothing, never to the first option', () => {
    expect(resolvePartIdentity('DigitalSensorInput', { partId: 'no-such-part' })).toBeNull()
    expect(resolvePartIdentity('AnalogSensorInput', { partId: '' })).toBeNull()
    expect(resolvePartIdentity('DigitalSensorInput', { partId: TEST_HALL_ID })?.option.label).toBe('Test Hall module')
  })

  it('builds a shelf row per part with the pin request its block needs', () => {
    const rows = sensorInputPartEntries()
    const byId = new Map(rows.map((row) => [row.partId, row]))
    expect(rows.map((row) => row.partId)).toEqual([TEST_REED_ID, TEST_HALL_ID, TEST_SOIL_ID, TEST_FSR_ID])
    expect(byId.get(TEST_REED_ID)).toMatchObject({
      nodeType: 'DigitalSensorInput', signalPort: 'active', dataType: 'bool',
      pinRequests: [{ key: 'pin', capability: 'pullup' }], properties: { partId: TEST_REED_ID },
      footprint: { width: 20, height: 10 },
    })
    expect(byId.get(TEST_HALL_ID)?.pinRequests).toEqual([{ key: 'pin' }])
    expect(byId.get(TEST_SOIL_ID)).toMatchObject({
      nodeType: 'AnalogSensorInput', signalPort: 'value', dataType: 'float',
      pinRequests: [{ key: 'pin', capability: 'analogInput' }],
    })
  })
})

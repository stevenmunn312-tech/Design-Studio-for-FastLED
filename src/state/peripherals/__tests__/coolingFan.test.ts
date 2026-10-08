import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_OPTIONS } from '../../../build/parts/partOptions'
import { generateCpp } from '../../../codegen/cppGenerator'
import {
  peripheralGroundPadIndex,
  peripheralPowerPadIndex,
  peripheralSignalPadIndex,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { FIXTURE_PARTS } from '../../../components/Hardware/hardwarePartCatalog'
import { buildGraphDiagnostics, findBoardCompatibilityErrors } from '../../../utils/validateGraph'
import type { StudioNode } from '../../graphStore'
import { evaluateGraphFull } from '../../graphEvaluator'
import { libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import {
  COOLING_FAN_PART_ID,
  coolingFanPreviewRpm,
  coolingFanSpec,
} from '../coolingFan'

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

describe('the catalogued Noctua cooling fan', () => {
  it('carries exact PWM, tachometer, supply, and mechanical facts', () => {
    expect(coolingFanSpec(COOLING_FAN_PART_ID)).toMatchObject({
      supplyVoltageV: 5,
      maxCurrentA: 0.07,
      maxRpm: 5000,
      minRpmAt20Percent: 1050,
      pwmHz: 25000,
      tachPulsesPerRevolution: 2,
    })
    expect(partById(COOLING_FAN_PART_ID)).toMatchObject({
      dimensionsMm: { width: 40, height: 40 },
      pinLabelsLeftToRight: ['GND', 'VCC', 'RPM', 'PWM'],
    })
    expect(PART_OPTIONS.CoolingFanOutput.options.map((option) => option.id)).toEqual([COOLING_FAN_PART_ID])
  })

  it('is one speed input plus measured RPM and Running outputs', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'CoolingFanOutput')!
    expect(definition.inputs.map((port) => [port.id, port.dataType])).toEqual([['speed', 'float']])
    expect(definition.outputs.map((port) => [port.id, port.dataType])).toEqual([
      ['rpm', 'float'], ['running', 'bool'],
    ])
    expect(libraryDefaults('CoolingFanOutput')).toMatchObject({
      partId: COOLING_FAN_PART_ID, pwmPin: 25, tachPin: 26, speed: 1,
    })
    expect(FIXTURE_PARTS.find((entry) => entry.nodeType === 'CoolingFanOutput')?.pinRequests).toEqual([
      { key: 'pwmPin', capability: 'digitalOutput' },
      { key: 'tachPin', capability: 'digitalInput' },
    ])
  })
})

describe('cooling fan preview and firmware', () => {
  it('estimates the documented 20% and maximum speeds in the browser', () => {
    expect(coolingFanPreviewRpm(COOLING_FAN_PART_ID, 0)).toBe(0)
    expect(coolingFanPreviewRpm(COOLING_FAN_PART_ID, 0.2)).toBe(1050)
    expect(coolingFanPreviewRpm(COOLING_FAN_PART_ID, 1)).toBe(5000)
    const output = evaluateGraphFull([node('fan', 'CoolingFanOutput', { speed: 0.2 })], [], 0).outputs.get('fan')
    expect(output).toMatchObject({ rpm: 1050, running: true })
  })

  it('starts off, drives 25 kHz PWM, counts falling tach edges, and publishes measured RPM', () => {
    const sketch = generateCpp([node('fan', 'CoolingFanOutput', { pwmPin: 27, tachPin: 14, speed: 0.5 })], [])
    const low = sketch.indexOf('digitalWrite(27, LOW);')
    const output = sketch.indexOf('pinMode(27, OUTPUT);')
    expect(low).toBeGreaterThan(-1)
    expect(output).toBeGreaterThan(low)
    expect(sketch).toContain('ledcAttach(27, 25000, 8);')
    expect(sketch).toContain('ledcSetup(0, 25000, 8);')
    expect(sketch).toContain('attachInterrupt(digitalPinToInterrupt(14), _fanTach_fan, FALLING);')
    expect(sketch).toContain('_fanCount_fan * 60000.0f) / (_fanElapsed_fan * 2.0f)')
    expect(sketch).toContain('float n_fan_rpm = _fanRpm_fan;')
    expect(sketch).toContain('bool n_fan_running = _fanRpm_fan > 0.5f;')
  })

  it('does not reuse a core-2 LEDC timer already assigned to another PWM frequency', () => {
    const sketch = generateCpp([
      node('switch', 'PowerSwitchOutput', {
        partId: 'lr7843-mosfet-module', signalPin: 25, on: true, level: 0.5,
      }),
      node('fan', 'CoolingFanOutput', { pwmPin: 27, tachPin: 14, speed: 0.5 }),
    ], [])
    expect(sketch).toContain('flsPwmBegin(25, 0, 500);')
    expect(sketch).toContain('ledcSetup(2, 25000, 8);')
    expect(sketch).toContain('ledcWrite(2, _fanDuty_fan);')
  })
})

describe('cooling fan wiring and board gate', () => {
  it('claims one output and one pulled-up input, and maps both rendered signal pads', () => {
    const fan = node('fan', 'CoolingFanOutput', { pwmPin: 27, tachPin: 14 })
    expect(collectPinUses([fan]).map((use) => [use.propertyKey, use.pin, use.requirement])).toEqual([
      ['pwmPin', 27, { capability: 'digitalOutput', pullup: false }],
      ['tachPin', 14, { capability: 'digitalInput', pullup: true }],
    ])
    const [item] = buildHardwareManifest([fan], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(COOLING_FAN_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'cooling-fan-output', supported: true,
      facts: { supply: '5 V', maxCurrent: '70 mA', pwm: '25 kHz active-high', maxRpm: '5000 rpm' },
    })
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('PWM')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('RPM')
  })

  it('allows ESP32-family boards and refuses other PWM implementations', () => {
    const fan = node('fan', 'CoolingFanOutput')
    expect(findBoardCompatibilityErrors([fan], 'esp32:esp32:esp32')).toEqual([])
    expect(findBoardCompatibilityErrors([fan], 'arduino:avr:uno')).toContain(
      'Cooling Fan firmware currently requires an ESP32-family board for its 25 kHz PWM output',
    )
    expect(buildGraphDiagnostics([fan], [], { selectedFqbn: 'arduino:avr:uno' })).toContainEqual(
      expect.objectContaining({
        category: 'board',
        title: 'Cooling fan is incompatible with the selected board',
        nodeIds: ['fan'],
      }),
    )
  })
})

import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import { controlGraphCpp, createControlGraph } from '../../codegen/controlGraph'
import {
  peripheralGroundPadIndex, peripheralPowerNet, peripheralPowerPadIndex,
  peripheralSignalPadIndex,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import { findDeployBlockingErrors, findPresenceSensorErrors } from '../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../graphStore'
import { evaluateGraphFull } from '../graphEvaluator'
import { useHardwareInputStore } from '../hardwareInputStore'
import { libraryDefaults, NODE_LIBRARY } from '../nodeLibrary'
import { partById } from '../partCatalogue'
import {
  presencePreviewKey, presencePreviewReading, presenceSensorSpec,
} from '../presenceSensor'

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

function presenceGraph(sensorProps: Record<string, unknown> = {}) {
  const nodes = [
    node('radar', 'PresenceInput', sensorProps),
    node('map', 'MapRange', { inMin: 0, inMax: 6, outMin: 0, outMax: 1 }),
    node('fill', 'SolidColor', { r: 255, g: 90, b: 0 }),
    node('fade', 'Fade'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('distance', 'radar', 'distance', 'map', 'value'),
    edge('amount', 'map', 'result', 'fade', 'fade'),
    edge('frame', 'fill', 'frame', 'fade', 'frame'),
    edge('output', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the catalogued HLK-LD2410C', () => {
  it('carries the UART and distance contract used by preview and firmware', () => {
    expect(presenceSensorSpec('hlk-ld2410c-presence-sensor')).toMatchObject({
      device: 'HLK-LD2410C', interface: 'UART', baud: 256000, gateMeters: 0.75, maxRangeMeters: 6,
    })
    expect(partById('hlk-ld2410c-presence-sensor')?.pinLabelsLeftToRight)
      .toEqual(['VCC', 'GND', 'OUT', 'RX', 'TX'])
  })
})

describe('preview', () => {
  it('combines moving and still targets and suppresses distance when nobody is present', () => {
    expect(presencePreviewReading('hlk-ld2410c-presence-sensor', false, false, 0.5))
      .toEqual({ presence: false, moving: false, still: false, distance: 0 })
    expect(presencePreviewReading('hlk-ld2410c-presence-sensor', true, false, 0.5))
      .toEqual({ presence: true, moving: true, still: false, distance: 3 })
    expect(presencePreviewReading('hlk-ld2410c-presence-sensor', false, true, 2).distance).toBe(6)
  })

  it('publishes the widget state through the graph evaluator', () => {
    const sensor = node('radar-preview', 'PresenceInput')
    const store = useHardwareInputStore.getState()
    store.setButton(presencePreviewKey(sensor.id, 'moving'), true)
    store.setButton(presencePreviewKey(sensor.id, 'still'), false)
    store.setPot(presencePreviewKey(sensor.id, 'distance'), 0.25)
    const reading = evaluateGraphFull([sensor], [], 0).outputs.get(sensor.id)
    expect(reading).toEqual({ presence: true, moving: true, still: false, distance: 1.5 })
  })
})

describe('firmware', () => {
  it('opens UART1 on the assigned receive pin and parses length-delimited reports', () => {
    const { nodes, edges } = presenceGraph({ rxPin: 21 })
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('Serial1.begin(256000, SERIAL_8N1, 21, -1);')
    expect(sketch).toContain('static const uint8_t _LD_HEAD[4] = {0xF4, 0xF3, 0xF2, 0xF1};')
    expect(sketch).toContain('if (_ldLen < 13 || _ldLen + 10 > sizeof(_ldFrame))')
    expect(sketch).toContain('if (_ldFrame[7] != 0xAA || _ldFrame[_ldLen + 4] != 0x55')
    expect(sketch).toContain('float n_radar_distance = n_radar_presence ? _ldDistanceCm / 100.0f : 0.0f;')
    expect(sketch).toContain('millis() - _ldLastFrameMs < 1000u')
  })

  it('emits one shared parser and rejects a second sensor before deployment', () => {
    const { nodes, edges } = presenceGraph()
    nodes.push(node('radar2', 'PresenceInput', { rxPin: 22 }))
    edges.push(edge('moving', 'radar2', 'moving', 'fade', 'enabled'))
    const sketch = generateCpp(nodes, edges)
    expect(sketch.match(/static void _ldPoll\(\)/g)).toHaveLength(1)
    expect(findPresenceSensorErrors(nodes, 'esp32:esp32:esp32').join('\n')).toContain('Only one radar')
  })

  it('is available to the shared show/player control compiler', () => {
    const sensor = node('radar', 'PresenceInput', { rxPin: 21 })
    const map = node('map', 'MapRange', { inMin: 0, inMax: 6, outMin: 0, outMax: 1 })
    const graph = createControlGraph([sensor, map], [edge('distance', 'radar', 'distance', 'map', 'value')])
    expect(graph.resolve('map', 'result', 'float')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    expect(emitted.setup.join('\n')).toContain('Serial1.begin(256000, SERIAL_8N1, 21, -1);')
    expect(emitted.helpers.join('\n')).toContain('static void _ldPoll()')
    expect(emitted.loop.join('\n')).toContain('float n_radar_distance')
  })
})

describe('validation and wiring', () => {
  it('requires an ESP32 and keeps UART1 clear of a DMX512 receiver', () => {
    const sensor = node('radar', 'PresenceInput')
    expect(findDeployBlockingErrors([sensor], [], 'arduino:avr:uno').join('\n'))
      .toContain('remappable ESP32 hardware UART')
    const dmx1 = node('dmx', 'DMXInput', { inputMode: 'DMX512', dmxPort: 1 })
    expect(findDeployBlockingErrors([sensor, dmx1], [], 'esp32:esp32:esp32').join('\n'))
      .toContain('both use UART1')
    const dmx2 = node('dmx', 'DMXInput', { inputMode: 'DMX512', dmxPort: 2 })
    expect(findPresenceSensorErrors([sensor, dmx2], 'esp32:esp32:esp32')).toEqual([])
  })

  it('claims one RX pin and draws 5 V, ground, and the sensor TX pad', () => {
    const sensor = node('radar', 'PresenceInput', { rxPin: 21 })
    expect(collectPinUses([sensor]).map((use) => [use.propertyKey, use.pin])).toEqual([['rxPin', 21]])
    const [item] = buildHardwareManifest([sensor], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById('hlk-ld2410c-presence-sensor')!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'presence-input', supported: true })
    expect(peripheralPowerNet(item)).toBe('v5')
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('TX')
  })
})

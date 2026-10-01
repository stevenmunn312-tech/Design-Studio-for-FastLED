import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import {
  peripheralGroundPadIndex, peripheralPowerPadIndex, peripheralSignalPadIndex,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import { FIXTURE_PARTS } from '../../components/Hardware/hardwarePartCatalog'
import { findPinConflicts } from '../../utils/validateGraph'
import { BUZZER_PART_ID, buzzerActiveHigh, buzzerSpec } from '../buzzer'
import type { StudioEdge, StudioNode } from '../graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../nodeLibrary'
import { partById } from '../partCatalogue'
import { PART_OPTIONS } from '../partOptions'

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

function buzzerGraph(properties: Record<string, unknown> = {}, wired = true) {
  const nodes = [
    node('buzz', 'BuzzerOutput', properties), node('btn', 'ButtonInput', { pin: 4 }),
    node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [edge('frame', 'fill', 'frame', 'out', 'frame')]
  if (wired) edges.push(edge('sound', 'btn', 'pressed', 'buzz', 'on'))
  return { nodes, edges }
}

describe('the catalogued KY-012', () => {
  it('carries an active, active-high drive contract and orders the pads GND, NC, SIG', () => {
    expect(buzzerSpec(BUZZER_PART_ID)).toMatchObject({ type: 'active', activeLevel: 'high', resonanceKHz: 2.5, maxCurrentMa: 30 })
    expect(buzzerActiveHigh(BUZZER_PART_ID)).toBe(true)
    expect(partById(BUZZER_PART_ID)?.pinLabelsLeftToRight).toEqual(['GND', 'NC', 'SIG'])
    expect(PART_OPTIONS.BuzzerOutput.options.map((option) => option.id)).toEqual([BUZZER_PART_ID])
    expect(FIXTURE_PARTS.find((entry) => entry.nodeType === 'BuzzerOutput')?.pinRequests)
      .toEqual([{ key: 'sigPin', capability: 'digitalOutput' }])
  })

  it('is a sink with one boolean Sound input and a default pin', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'BuzzerOutput')!
    expect(definition.inputs.map((port) => [port.id, port.dataType])).toEqual([['on', 'bool']])
    expect(definition.outputs).toEqual([])
    expect(libraryDefaults('BuzzerOutput')).toMatchObject({ partId: BUZZER_PART_ID, sigPin: 26 })
  })
})

describe('buzzer firmware', () => {
  it('latches the silent level before enabling the pin, then follows the input', () => {
    const { nodes, edges } = buzzerGraph({ sigPin: 27 })
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('digitalWrite(27, LOW);')
    expect(sketch).toContain('pinMode(27, OUTPUT);')
    expect(sketch.indexOf('digitalWrite(27, LOW);')).toBeLessThan(sketch.indexOf('pinMode(27, OUTPUT);'))
    expect(sketch).toMatch(/digitalWrite\(27, [^;]+ \? HIGH : LOW\);/)
  })

  it('stays silent when nothing is wired to Sound', () => {
    const { nodes, edges } = buzzerGraph({ sigPin: 27 }, false)
    expect(generateCpp(nodes, edges)).toMatch(/digitalWrite\(27, false \? HIGH : LOW\);/)
  })
})

describe('buzzer wiring', () => {
  it('claims its signal pin, collides with another user of it, and draws only SIG and GND', () => {
    const buzz = node('buzz', 'BuzzerOutput', { sigPin: 26 })
    expect(collectPinUses([buzz]).map((use) => [use.propertyKey, use.pin])).toEqual([['sigPin', 26]])
    expect(findPinConflicts([buzz, node('b2', 'BuzzerOutput', { sigPin: 26 })]).length).toBeGreaterThan(0)

    const [item] = buildHardwareManifest([buzz], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(BUZZER_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'buzzer-output', supported: true,
      facts: { partId: BUZZER_PART_ID, activeLevel: 'high', pitch: '2.5 kHz', maxCurrent: '30 mA' },
    })
    // No supply pad: the buzzer runs from its signal pin.
    expect(peripheralPowerPadIndex(item)).toBeNull()
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SIG')
  })
})

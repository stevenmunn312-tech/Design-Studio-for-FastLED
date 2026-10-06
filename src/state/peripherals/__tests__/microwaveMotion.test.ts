import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import {
  peripheralGroundPadIndex, peripheralPowerNet, peripheralPowerPadIndex, peripheralSignalPadIndex,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { INPUT_PARTS } from '../../../components/Hardware/hardwarePartCatalog'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_OPTIONS, resolvePartIdentity } from '../../../build/parts/partOptions'
import { partRenderForNodeType } from '../../../build/parts/partRenders'

const RCWL = 'rcwl-0516-microwave-motion-module'
const PIR = 'hc-sr501-pir-sensor'

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

describe('the motion sensor module choice', () => {
  it('offers the PIR first and the microwave radar second, and defaults to the PIR', () => {
    expect(PART_OPTIONS.MotionInput.options.map((option) => option.id)).toEqual([PIR, RCWL])
    expect(libraryDefaults('MotionInput').partId).toBe(PIR)
    expect(resolvePartIdentity('MotionInput', {})?.option.id).toBe(PIR)
    expect(resolvePartIdentity('MotionInput', { partId: RCWL })?.option.id).toBe(RCWL)
  })

  it('has a shelf entry for each module that names its part', () => {
    const entries = INPUT_PARTS.filter((entry) => entry.nodeType === 'MotionInput')
    expect(entries.map((entry) => entry.properties?.partId)).toEqual([PIR, RCWL])
  })

  it('shows each module\'s own picture', () => {
    expect(partRenderForNodeType('MotionInput', { partId: RCWL })?.src).toContain('rcwl-0516')
    expect(partRenderForNodeType('MotionInput', { partId: PIR })?.src).toContain('hc-sr501')
  })
})

describe('the catalogued RCWL-0516', () => {
  it('orders the pads 3V3, GND, OUT, VIN, CDS', () => {
    expect(partById(RCWL)?.pinLabelsLeftToRight).toEqual(['3V3', 'GND', 'OUT', 'VIN', 'CDS'])
    expect(partById(RCWL)?.dimensionsMm).toEqual({ width: 36, height: 17 })
  })
})

describe('microwave motion behaviour', () => {
  it('reads the same active-high digital input as the PIR, with no pull-up', () => {
    const sketch = generateCpp([
      node('radar', 'MotionInput', { partId: RCWL, pin: 14 }),
      node('fill', 'SolidColor'), node('gate', 'Fade'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ], [
      edge('m', 'radar', 'motion', 'gate', 'fade'),
      edge('frame', 'fill', 'frame', 'gate', 'frame'),
      edge('output', 'gate', 'frame', 'out', 'frame'),
    ])
    expect(sketch).toContain('pinMode(14, INPUT);')
    expect(sketch).toContain('bool n_radar_motion = digitalRead(14) == HIGH;')
  })

  it('claims one GPIO and draws the supply on VIN, not on the 3V3 output', () => {
    const radar = node('radar', 'MotionInput', { partId: RCWL, pin: 14 })
    expect(collectPinUses([radar]).map((use) => [use.propertyKey, use.pin])).toEqual([['pin', 14]])
    const [item] = buildHardwareManifest([radar], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(RCWL)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({ kind: 'motion-input', title: 'RCWL-0516 microwave motion sensor', facts: { partId: RCWL } })
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VIN')
    expect(peripheralPowerNet(item)).toBe('v5')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('OUT')
  })

  it('leaves the PIR\'s supply pad alone', () => {
    const pir = node('pir', 'MotionInput', { pin: 14 })
    const [item] = buildHardwareManifest([pir], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(PIR)!.pinLabelsLeftToRight!
    expect(item.facts.partId).toBe(PIR)
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
  })
})

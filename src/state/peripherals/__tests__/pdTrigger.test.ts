import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../../../build/boards/boardProfiles'
import { buildBomRows } from '../../../build/buildExports'
import { ensureBuildProfile } from '../../../build/buildProfile'
import { calculateElectricalPlan } from '../../../build/power/electricalPlan'
import { buildHardwareManifest } from '../../../build/hardwareManifest'
import { FIXTURE_PARTS } from '../../../components/Hardware/hardwarePartCatalog'
import { PD_TRIGGER_PART_ID, pdTriggerSpec, pdTriggerVoltage } from '../pdTrigger'
import type { StudioNode } from '../../graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_FIELDS } from '../../../build/parts/partFields'
import { PART_OPTIONS } from '../../../build/parts/partOptions'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'input', properties: { ...libraryDefaults(nodeType), ...properties }, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const output = () => node('out', 'MatrixOutput', { form: 'matrix', width: 15, height: 15, chipset: 'WS2812B', dataPin: 14 })
const trigger = (requestedVoltage: string | number = '12', id = 'pd') =>
  node(id, 'PdTriggerSource', { requestedVoltage })
const railConverter = (sourceVoltage = 12) =>
  node('rail', 'PowerConverter', { partId: 'mean-well-sd-100a-5', sourceVoltage })
const board = boardProfileById('espressif-esp32-s3-devkitc-1')

function planFor(nodes: StudioNode[]) {
  const manifest = buildHardwareManifest(nodes, [], 'esp32:esp32:esp32s3')
  return { manifest, plan: calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1 }), board) }
}

const warningIds = (nodes: StudioNode[]) => planFor(nodes).plan.warnings.map((warning) => warning.id)

describe('the catalogued ZY12PDN', () => {
  it('carries its selectable voltages, default and rating', () => {
    expect(pdTriggerSpec(PD_TRIGGER_PART_ID)).toMatchObject({
      selectableVoltagesV: [5, 9, 12, 15, 20], defaultVoltageV: 12, maxCurrentA: 5, maxPowerW: 100,
    })
    expect(partById(PD_TRIGGER_PART_ID)?.pinLabelsLeftToRight).toEqual(['VOUT+', 'VOUT-'])
    expect(PART_OPTIONS.PdTriggerSource.options.map((option) => option.id)).toEqual([PD_TRIGGER_PART_ID])
    expect(FIXTURE_PARTS.find((entry) => entry.nodeType === 'PdTriggerSource')?.pinRequests).toBeUndefined()
    expect(PART_FIELDS.PdTriggerSource[0]).toMatchObject({ key: 'requestedVoltage', kind: 'select', options: ['5', '9', '12', '15', '20'] })
  })

  it('is a config-only node that defaults to 12 V and accepts only a voltage it can request', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'PdTriggerSource')!
    expect([definition.inputs, definition.outputs]).toEqual([[], []])
    expect(libraryDefaults('PdTriggerSource')).toMatchObject({ partId: PD_TRIGGER_PART_ID, requestedVoltage: '12' })
    expect(pdTriggerVoltage({ requestedVoltage: '20' })).toBe(20)
    expect(pdTriggerVoltage({ requestedVoltage: 9 })).toBe(9)
    expect(pdTriggerVoltage({})).toBe(12)
    expect(pdTriggerVoltage({ requestedVoltage: '13' })).toBeNull()
  })
})

describe('the PD trigger in the manifest', () => {
  it('has no pins, states the requested voltage, and appears in the parts list', () => {
    const { manifest, plan } = planFor([output(), trigger('15')])
    const item = manifest.primaryItems.find((entry) => entry.kind === 'pd-trigger')!
    expect(item).toMatchObject({
      supported: true, facts: { partId: PD_TRIGGER_PART_ID, requestedVoltage: 15, maxCurrent: '5 A', maxPower: '100 W' },
    })
    expect(item.title).toBe('ZY12PDN USB-C PD trigger module')
    expect(buildBomRows(manifest, plan, ensureBuildProfile({ version: 1 }), board).map((row) => row.item)).toContain(item.title)
  })

  it('flags a voltage it cannot request', () => {
    const item = buildHardwareManifest([trigger('13')], [], 'esp32:esp32:esp32s3').items.find((entry) => entry.kind === 'pd-trigger')!
    expect(item.supported).toBe(false)
    expect(item.reasons?.join(' ')).toContain('13 V is not a voltage')
  })
})

describe('the PD trigger in the electrical plan', () => {
  it('is quiet when the converter is set to the voltage it requests', () => {
    expect(warningIds([output(), railConverter(12), trigger('12')])).not.toContain('pd-trigger-source-voltage')
  })

  it('warns when the converter is set to a different voltage', () => {
    const { plan } = planFor([output(), railConverter(12), trigger('20')])
    const warning = plan.warnings.find((entry) => entry.id === 'pd-trigger-source-voltage')
    expect(warning?.detail).toContain('request 20 V')
    expect(warning?.detail).toContain('LED rail converter is set to 12 V')
  })

  it('does nothing without a converter, and without a trigger', () => {
    expect(warningIds([output(), trigger('20')])).not.toContain('pd-trigger-source-voltage')
    expect(warningIds([output(), railConverter(12)])).not.toContain('pd-trigger-source-voltage')
  })

  it('warns when more than one trigger is on the bench', () => {
    expect(warningIds([output(), railConverter(12), trigger('12', 'pd1'), trigger('12', 'pd2')])).toContain('pd-trigger-count')
  })

  it('tells the user to set the voltage before connecting anything', () => {
    const { plan } = planFor([output(), railConverter(12), trigger('12')])
    expect(plan.recommendations.join('\n')).toContain('to 12 V with its button or solder pads before connecting')
  })
})

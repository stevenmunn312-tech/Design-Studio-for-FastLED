import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../boardProfiles'
import { buildBomRows, buildConnectionRows } from '../buildExports'
import { ensureBuildProfile } from '../buildProfile'
import { calculateElectricalPlan } from '../electricalPlan'
import { buildHardwareManifest } from '../hardwareManifest'
import type { StudioNode } from '../../state/graphStore'
import { partById } from '../../state/partCatalogue'
import { defaultSourceVoltageFor, deratedCurrentMa, inputCurrentForOutputMa } from '../../state/powerConverter'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'input', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const output = (width = 15, height = 15) => node('out', 'MatrixOutput', {
  form: 'matrix', width, height, chipset: 'WS2812B', dataPin: 14,
})
const converter = (partId = 'mean-well-sd-100a-5', sourceVoltage = 12, id = 'rail') =>
  node(id, 'PowerConverter', { partId, sourceVoltage })
const board = boardProfileById('espressif-esp32-s3-devkitc-1')

function planFor(nodes: StudioNode[]) {
  const manifest = buildHardwareManifest(nodes, [], 'esp32:esp32:esp32s3')
  return { manifest, plan: calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1 }), board) }
}

describe('Mean Well LED rail converters', () => {
  it('reads the two model ratings and the B-model ambient derating from the catalogue', () => {
    const a = partById('mean-well-sd-100a-5')!.powerConverter!
    const b = partById('mean-well-sd-100b-5')!.powerConverter!

    expect(a).toEqual(expect.objectContaining({ role: 'led-rail', inputMinV: 10, inputMaxV: 18, continuousCurrentMa: 18000, isolated: true }))
    expect(b).toEqual(expect.objectContaining({ role: 'led-rail', inputMinV: 20, inputMaxV: 36, continuousCurrentMa: 20000, isolated: true }))
    expect(deratedCurrentMa(a)).toBe(18000)
    expect(deratedCurrentMa(b)).toBe(17333)
    expect(defaultSourceVoltageFor('mean-well-sd-100a-5')).toBe(12)
    expect(defaultSourceVoltageFor('mean-well-sd-100b-5')).toBe(24)
  })

  it('packs LED feeds into one converter while its 40 C rating still has 20% headroom', () => {
    const { plan } = planFor([output(), converter()])
    const [supply] = plan.totals?.supplies ?? []

    expect(plan.blockers).toEqual([])
    expect(plan.totals?.supplies).toHaveLength(1)
    expect(supply.designCurrentMa).toBe(13500)
    expect(supply.recommendedCurrentMa).toBe(18000)
    expect(supply.converter).toEqual(expect.objectContaining({
      partId: 'mean-well-sd-100a-5',
      sourceVoltage: 12,
      plannedOutputCurrentMa: 16200,
      deratedCurrentMa: 18000,
      inputCurrentMa: inputCurrentForOutputMa(partById('mean-well-sd-100a-5')!.powerConverter!, 12, 16200),
      isolated: true,
    }))
    expect(plan.totals?.source).toEqual(expect.objectContaining({ voltage: 12, recommendedCurrentMa: 9000 }))
  })

  it('adds converters instead of exceeding one converter after headroom', () => {
    const { plan } = planFor([output(16, 16), converter()])

    expect(plan.totals?.supplies).toHaveLength(2)
    expect(plan.totals?.supplies.every((supply) =>
      supply.designCurrentMa * 1.2 <= (supply.converter?.deratedCurrentMa ?? 0))).toBe(true)
    expect(plan.totals?.supplies.every((supply) => supply.converter?.partId === 'mean-well-sd-100a-5')).toBe(true)
  })

  it('blocks invalid and inconsistent shared-source configurations', () => {
    const badRange = planFor([output(), converter('mean-well-sd-100b-5', 12)]).plan
    expect(badRange.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'power-converter:rail:source-voltage' }),
    ]))

    const mixed = planFor([
      output(),
      converter('mean-well-sd-100a-5', 12, 'rail-a'),
      converter('mean-well-sd-100b-5', 24, 'rail-b'),
    ]).plan
    expect(mixed.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'rail-converter-part-types' }),
      expect.objectContaining({ id: 'rail-converter-source-voltages' }),
    ]))
  })

  it('includes a same-voltage controller buck in the one upstream source budget', () => {
    const { plan } = planFor([
      output(),
      converter(),
      node('buck', 'PowerConverter', { partId: 'lm2596-buck-module', sourceVoltage: 12 }),
    ])
    const railInput = plan.totals!.supplies[0].converter!.inputCurrentMa

    expect(plan.blockers).toEqual([])
    expect(plan.totals?.source?.designCurrentMa).toBe(railInput + plan.controllerSupply!.inputCurrentMa)
    expect(plan.totals?.source?.recommendedCurrentMa).toBe(10000)
  })

  it('exports the source fuse, terminal order, earth bond and isolated-output bond', () => {
    const { manifest, plan } = planFor([output(), converter()])
    const rows = buildConnectionRows(manifest.primaryItems, plan, board)
    const label = partById('mean-well-sd-100a-5')!.label

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: '12 V DC source', to: expect.stringMatching(/input fuse$/) }),
      expect.objectContaining({ to: expect.stringContaining(label), toTerminal: '1 V+' }),
      expect.objectContaining({ from: '12 V DC source', fromTerminal: '-', toTerminal: '2 V-' }),
      expect.objectContaining({ from: 'Protective earth / metal enclosure', toTerminal: '3 FG' }),
      expect.objectContaining({ fromTerminal: '4-5 -V', purpose: expect.stringMatching(/bond to common ground/) }),
      expect.objectContaining({ fromTerminal: '6-7 +V', to: expect.stringMatching(/main fuse$/) }),
    ]))

    const bom = buildBomRows(manifest, plan, ensureBuildProfile({ version: 1 }), board)
    expect(bom).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: 'Recommended 12 V DC source', status: 'calculated' }),
      expect.objectContaining({ item: label, specification: expect.stringMatching(/40 C/) }),
      expect.objectContaining({ item: expect.stringMatching(/input fuse and holder$/), status: 'calculated' }),
      expect.objectContaining({ item: expect.stringMatching(/input conductors/), status: 'calculated' }),
    ]))
    expect(bom.filter((row) => row.item === label)).toHaveLength(1)
  })
})

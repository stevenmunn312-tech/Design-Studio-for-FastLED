import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../../boards/boardProfiles'
import { ensureBuildProfile } from '../../buildProfile'
import { calculateElectricalPlan } from '../electricalPlan'
import { buildHardwareManifest } from '../../hardwareManifest'
import type { StudioNode } from '../../../state/graphStore'
import { powerSupplyName, powerSupplyRating, powerSupplyRatingLabel, supplyForLoad } from '../../../state/peripherals/powerSupply'

function node(id: string, nodeType: string, properties: Record<string, unknown>, label?: string): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: label ?? nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const output = (id: string, extra: Record<string, unknown> = {}) =>
  node(id, 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: id === 'a' ? 14 : 15, ...extra })
const supply = (id: string, voltage: number, ratedCurrentA: number, label = 'Power Supply') =>
  node(id, 'PowerSupply', { voltage, ratedCurrentA }, label)

function plan(nodes: StudioNode[]) {
  const manifest = buildHardwareManifest(nodes, [], 'esp32:esp32:esp32s3')
  return calculateElectricalPlan(manifest, ensureBuildProfile(undefined), boardProfileById('espressif-esp32-s3-devkitc-1'))
}

describe('Power Supply', () => {
  it('holds a typed rating inside the field bounds and states its wattage', () => {
    expect(powerSupplyRating({ voltage: 5, ratedCurrentA: 10 })).toEqual({ voltage: 5, ratedCurrentA: 10, wattage: 50 })
    expect(powerSupplyRating({ voltage: 400, ratedCurrentA: 0 })).toEqual({ voltage: 48, ratedCurrentA: 0.5, wattage: 24 })
    expect(powerSupplyRating({})).toEqual({ voltage: 5, ratedCurrentA: 10, wattage: 50 })
    expect(powerSupplyRatingLabel(powerSupplyRating({ voltage: 12, ratedCurrentA: 2.5 }))).toBe('12 V 2.5 A (30 W)')
  })

  it('feeds a load from its chosen supply, else the first, including after that supply is removed', () => {
    const nodes = [supply('p1', 5, 10), supply('p2', 5, 20)]
    expect(supplyForLoad(nodes, { poweredBy: 'p2' })?.id).toBe('p2')
    expect(supplyForLoad(nodes, {})?.id).toBe('p1')
    expect(supplyForLoad(nodes, { poweredBy: 'gone' })?.id).toBe('p1')
    expect(supplyForLoad([], {})).toBeUndefined()
  })

  it('numbers supplies that share a label so each can be told apart', () => {
    const nodes = [supply('p1', 5, 10), supply('p2', 5, 10), supply('p3', 12, 5, 'Shelf PSU')]
    expect(nodes.map((entry) => powerSupplyName(nodes, entry))).toEqual(['Power Supply 1', 'Power Supply 2', 'Shelf PSU'])
  })

  it('reaches the manifest as a power-path item, and each LED output names its supply', () => {
    const manifest = buildHardwareManifest([supply('p1', 5, 10), output('a')], [], 'esp32:esp32:esp32s3')
    expect(manifest.primaryItems.find((item) => item.kind === 'power-supply')).toEqual(expect.objectContaining({
      id: 'power-supply:p1',
      facts: { voltage: 5, ratedCurrentMa: 10000, wattage: 50 },
    }))
    expect(manifest.primaryItems.find((item) => item.kind === 'matrix-output')?.facts.supplyItemId).toBe('power-supply:p1')
  })

  it('draws the LED zone on the user\'s supply', () => {
    const result = plan([supply('p1', 5, 10, 'Bench PSU'), output('a')])
    expect(result.totals?.supplies).toEqual([
      expect.objectContaining({
        ownedSupply: { itemId: 'power-supply:p1', title: 'Bench PSU', voltage: 5, ratedCurrentMa: 10000, wattage: 50 },
        outputIds: ['output:a'],
      }),
    ])
  })

  it('never puts outputs on different supplies into one zone', () => {
    const result = plan([
      supply('p1', 5, 10),
      supply('p2', 5, 10),
      output('a', { poweredBy: 'p1' }),
      output('b', { poweredBy: 'p2' }),
    ])
    const zones = result.totals?.supplies ?? []
    expect(zones.map((zone) => [zone.ownedSupply?.itemId, zone.outputIds])).toEqual([
      ['power-supply:p1', ['output:a']],
      ['power-supply:p2', ['output:b']],
    ])
  })

  it('blocks a supply whose voltage does not match the LEDs it powers', () => {
    const result = plan([supply('p1', 12, 5, '12 V supply'), output('a')])
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'output:a:supply-voltage', detail: expect.stringContaining('runs from 5 V, and 12 V supply is a 12 V supply') }),
    ]))
  })

  it('leaves the plan as it was with no supply on the bench', () => {
    const result = plan([output('a')])
    expect(result.totals?.supplies[0].ownedSupply).toBeUndefined()
    expect(result.blockers.some((issue) => issue.id.endsWith(':supply-voltage'))).toBe(false)
  })
})

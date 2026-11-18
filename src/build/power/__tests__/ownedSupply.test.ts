import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../../boards/boardProfiles'
import { ensureBuildProfile } from '../../buildProfile'
import { calculateElectricalPlan } from '../electricalPlan'
import { sizingCurrentMa, supplyCeilingMa } from '../supplyCeiling'
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

describe('supply ceiling', () => {
  it('holds a zone to the supply or limited converter feeding it, and to nothing otherwise', () => {
    expect(supplyCeilingMa({ ownedSupply: { ratedCurrentMa: 5000 } })).toBe(5000)
    expect(supplyCeilingMa({})).toBeNull()
    // A converter makes the rail, so it is the ceiling, not the supply upstream of it.
    expect(supplyCeilingMa({ ownedSupply: { ratedCurrentMa: 5000 }, converter: { ratedCurrentMa: 20000, outputCurrentLimit: 'fixed' } })).toBe(20000)
    expect(supplyCeilingMa({ converter: { ratedCurrentMa: 3000, outputCurrentLimit: 'none' } })).toBeNull()
    expect(supplyCeilingMa({ converter: { ratedCurrentMa: 3000, outputCurrentLimit: 'adjustable' } })).toBeNull()
    expect(sizingCurrentMa(15360, 5000)).toBe(5000)
    expect(sizingCurrentMa(15360, 30000)).toBe(15360)
    expect(sizingCurrentMa(15360, null)).toBe(15360)
  })

  it('sizes the main fuse, trunk and feeds to a 5 A supply on a 15 A load', () => {
    // 16 x 16 at 60 mA is 15.36 A at full white.
    const result = plan([supply('p1', 5, 5), output('a')])
    const [zone] = result.totals?.supplies ?? []
    expect(zone.designCurrentMa).toBe(15360)
    expect(zone.ceilingMa).toBe(5000)
    expect(zone.trunk).toEqual(expect.objectContaining({ designCurrentMa: 15360, sizingCurrentMa: 5000 }))
    // 75% loading: 5 A needs at least 6.67 A, so the 7.5 A standard rating.
    expect(zone.trunk.mainFuse.ratingMa).toBe(7500)
    const feeds = result.outputs[0].injections
    expect(feeds.map((feed) => feed.designCurrentMa)).toEqual([3840, 7680, 3840])
    expect(feeds.map((feed) => feed.sizingCurrentMa)).toEqual([3840, 5000, 3840])
    expect(feeds.every((feed) => (feed.fuse.ratingMa ?? 0) <= 7500)).toBe(true)
    expect(result.status).toBe('calculated')
    expect(result.unresolved).toEqual([])
  })

  it('sizes to full white when the supply is larger than the load, or when none is entered', () => {
    const large = plan([supply('p1', 5, 30), output('a')]).totals!.supplies[0]
    const none = plan([output('a')]).totals!.supplies[0]
    expect(large.trunk.sizingCurrentMa).toBe(15360)
    expect(none.ceilingMa).toBeUndefined()
    expect(none.trunk.sizingCurrentMa).toBe(15360)
    expect(large.trunk.mainFuse.ratingMa).toBe(none.trunk.mainFuse.ratingMa)
  })

  it('keeps everything on one supply in one zone, past the size of a recommended zone', () => {
    // Two 32 x 34 panels draw about 130 A, more than one recommended zone.
    const result = plan([
      supply('p1', 5, 200),
      output('a', { width: 32, height: 34 }),
      output('b', { width: 32, height: 34 }),
    ])
    expect(result.totals?.supplies).toHaveLength(1)
    expect(result.warnings.some((issue) => issue.id.endsWith(':supply-zone-cuts'))).toBe(false)
  })

  it('advises, without blocking, when one of several supplies is below its segment', () => {
    const result = plan([
      supply('p1', 5, 5, 'Small PSU'),
      supply('p2', 5, 20, 'Large PSU'),
      output('a', { poweredBy: 'p1' }),
      output('b', { poweredBy: 'p2' }),
    ])
    const advice = result.warnings.filter((issue) => issue.id.endsWith(':segment-undersized'))
    expect(advice).toEqual([expect.objectContaining({
      id: 'power-supply:p1:segment-undersized',
      severity: 'warning',
      detail: expect.stringContaining('Use a 5 V 20 A supply for this segment'),
    })])
    expect(result.blockers.filter((issue) => issue.id !== 'exact-board')).toEqual([])
    expect(result.status).toBe('calculated')
  })

  it('leaves a single undersized supply to the power cap rather than advising', () => {
    const result = plan([supply('p1', 5, 5), output('a')])
    expect(result.warnings.some((issue) => issue.id.endsWith(':segment-undersized'))).toBe(false)
  })

  it('checks a supply upstream of a rail converter against its source voltage and the converters\' draw', () => {
    const converter = node('rail', 'PowerConverter', { partId: 'mean-well-sd-100a-5', sourceVoltage: 12 })
    const small = plan([supply('p1', 12, 3, 'Wall adapter'), converter, output('a')])
    expect(small.totals?.source?.ownedSupply?.itemId).toBe('power-supply:p1')
    expect(small.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'power-supply:p1:source-undersized', severity: 'warning' }),
    ]))
    const wrongVoltage = plan([supply('p1', 24, 10, 'Shelf PSU'), converter, output('a')])
    expect(wrongVoltage.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'power-supply:p1:source-voltage', severity: 'blocking' }),
    ]))
  })
})

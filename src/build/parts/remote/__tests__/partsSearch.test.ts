// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildCategoryTree } from '../categories'
import type { IndexCategory, IndexPart } from '../indexSchema'
import { searchParts, tokenize } from '../search'

const cat = (id: string, label: string, parent: string | null, order = 0, aliases: string[] = []): IndexCategory => ({
  id,
  label,
  order,
  parent,
  aliases,
})

const part = (partId: string, over: Partial<IndexPart>): IndexPart => ({
  partId,
  revision: 1,
  partType: 'DistanceInput',
  label: partId,
  interfaces: [],
  chips: [],
  categories: [],
  verification: 'reviewed',
  package: { url: 'p', sha256: 'a'.repeat(64), bytes: 1 },
  ...over,
})

const categories = [
  cat('sensors', 'Sensors', null, 1),
  cat('distance', 'Distance', 'sensors', 1),
  cat('ultra', 'Ultrasonic', 'distance', 1),
  cat('tof', 'Time-of-flight (laser)', 'distance', 2, ['laser-old']),
  cat('audio', 'Audio', null, 0),
]

const parts = [
  part('hc-sr04', { label: 'HC-SR04 ultrasonic', manufacturer: 'Generic', interfaces: ['gpio'], categories: ['ultra'] }),
  part('vl53l0x', { label: 'VL53L0X', manufacturer: 'ST', interfaces: ['i2c'], chips: ['VL53L0X'], categories: ['laser-old'] }),
  part('inmp441', { label: 'INMP441 mic', partType: 'AudioInput', interfaces: ['i2s'], categories: ['audio'] }),
]

describe('category tree', () => {
  const tree = buildCategoryTree(categories, parts)

  it('orders roots and children, resolves aliases and counts descendants', () => {
    expect(tree.roots.map((n) => n.id)).toEqual(['audio', 'sensors'])
    expect(tree.byId.get('distance')!.children.map((n) => n.id)).toEqual(['ultra', 'tof'])
    expect(tree.resolve('laser-old')).toBe('tof')
    expect(tree.resolve('nope')).toBeNull()
    expect(tree.byId.get('tof')!.parts.map((p) => p.partId)).toEqual(['vl53l0x'])
    expect(tree.byId.get('sensors')!.totalParts).toBe(2)
    expect(tree.lineage('laser-old').map((n) => n.id)).toEqual(['tof', 'distance', 'sensors'])
  })

  it('survives cycles, unknown parents and duplicates', () => {
    const t = buildCategoryTree([
      cat('a', 'A', 'b'),
      cat('b', 'B', 'a'),
      cat('c', 'C', 'ghost'),
      cat('c', 'C again', null),
    ])
    expect(t.byId.size).toBe(3)
    expect(t.roots.length).toBeGreaterThan(0)
    expect(t.byId.get('c')!.label).toBe('C')
    expect(t.roots.some((r) => r.id === 'c')).toBe(true)
    for (const id of ['a', 'b']) expect(t.lineage(id).length).toBeLessThanOrEqual(2)
  })
})

describe('search', () => {
  const tree = buildCategoryTree(categories, parts)
  const ids = (q: string) => searchParts(parts, q, tree).map((p) => p.partId)

  it('tokenises', () => {
    expect(tokenize('  Time-of-Flight, VL53L0X ')).toEqual(['time', 'of', 'flight', 'vl53l0x'])
  })

  it('matches label, manufacturer, part type, interface and chip, case-insensitively', () => {
    expect(ids('HC-sr04')).toEqual(['hc-sr04'])
    expect(ids('st')).toContain('vl53l0x')
    expect(ids('audioinput')).toEqual(['inmp441'])
    expect(ids('I2C')).toEqual(['vl53l0x'])
    expect(ids('vl53')).toEqual(['vl53l0x'])
  })

  it('matches category labels and their ancestors, through aliases', () => {
    expect(ids('laser')).toEqual(['vl53l0x'])
    expect(ids('distance').sort()).toEqual(['hc-sr04', 'vl53l0x'])
    expect(ids('sensors').sort()).toEqual(['hc-sr04', 'vl53l0x'])
  })

  it('requires every token and returns everything for an empty query', () => {
    expect(ids('laser ultrasonic')).toEqual([])
    expect(ids('distance i2c')).toEqual(['vl53l0x'])
    expect(ids('   ')).toHaveLength(3)
  })

  it('works without a category tree', () => {
    expect(searchParts(parts, 'laser')).toEqual([])
  })
})

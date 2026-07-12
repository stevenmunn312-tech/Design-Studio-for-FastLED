import { describe, it, expect } from 'vitest'
import { buildXYTable, parseCustomXYMap, tileRotationAt } from '../xyLayout'

describe('buildXYTable', () => {
  it('returns null for a plain progressive matrix', () => {
    expect(buildXYTable(4, 4, {})).toBeNull()
    expect(buildXYTable(4, 4, { layout: 'matrix' })).toBeNull()
    expect(buildXYTable(4, 4, { layout: 'strip' })).toBeNull()
  })

  it('builds a zig-zag table for pixel serpentine', () => {
    const table = buildXYTable(4, 2, { serpentine: true })
    // Row 0 left-to-right, row 1 right-to-left.
    expect(table).toEqual([0, 1, 2, 3, 7, 6, 5, 4])
  })

  it('tiles a 2x2 panel grid in row-major chain order', () => {
    const table = buildXYTable(4, 4, { layout: 'panels', tilesX: 2, tilesY: 2 })
    expect(table).toEqual([0, 1, 4, 5, 2, 3, 6, 7, 8, 9, 12, 13, 10, 11, 14, 15])
  })

  it('chains panels in serpentine order when tileSerpentine is on', () => {
    const table = buildXYTable(4, 4, { layout: 'panels', tilesX: 2, tilesY: 2, tileSerpentine: true })
    // Second panel row (ty=1) reverses tile chain order: tile (1,1) then (0,1).
    expect(table!.slice(8)).toEqual([12, 13, 8, 9, 14, 15, 10, 11])
  })

  it('rotates an individual tile 90 degrees clockwise', () => {
    // Single 2x2 tile, rotated 90°: (0,0)->(1,0), (1,0)->(1,1), (0,1)->(0,0), (1,1)->(0,1)
    const table = buildXYTable(2, 2, { layout: 'panels', tilesX: 1, tilesY: 1, tileRotations: '90' })
    expect(table).toEqual([2, 0, 3, 1])
  })

  it('falls back to plain matrix wiring when tiles do not divide the grid evenly', () => {
    expect(buildXYTable(5, 5, { layout: 'panels', tilesX: 2, tilesY: 2 })).toBeNull()
  })

  it('uses a valid custom XY permutation as-is', () => {
    const map = [3, 2, 1, 0]
    expect(buildXYTable(2, 2, { layout: 'custom', customXYMap: JSON.stringify(map) })).toEqual(map)
  })

  it('falls back to matrix layout for an invalid custom XY map', () => {
    expect(buildXYTable(2, 2, { layout: 'custom', customXYMap: 'nonsense' })).toBeNull()
    expect(buildXYTable(2, 2, { layout: 'custom', customXYMap: '[0,1,2]' })).toBeNull() // wrong length
    expect(buildXYTable(2, 2, { layout: 'custom', customXYMap: '[0,0,1,2]' })).toBeNull() // not a permutation
    expect(buildXYTable(2, 2, { layout: 'custom', customXYMap: '' })).toBeNull()
  })
})

describe('parseCustomXYMap', () => {
  it('accepts a valid permutation', () => {
    expect(parseCustomXYMap('[1,0,3,2]', 4)).toEqual([1, 0, 3, 2])
  })
  it('rejects wrong length, duplicates, out-of-range values, and bad JSON', () => {
    expect(parseCustomXYMap('[0,1,2]', 4)).toBeNull()
    expect(parseCustomXYMap('[0,0,1,2]', 4)).toBeNull()
    expect(parseCustomXYMap('[0,1,2,9]', 4)).toBeNull()
    expect(parseCustomXYMap('{oops}', 4)).toBeNull()
    expect(parseCustomXYMap(undefined, 4)).toBeNull()
  })
})

describe('tileRotationAt', () => {
  it('reads comma-separated degrees by tile index, defaulting to 0', () => {
    const props = { tileRotations: '0,90,180,270' }
    expect(tileRotationAt(props, 0)).toBe(0)
    expect(tileRotationAt(props, 1)).toBe(90)
    expect(tileRotationAt(props, 2)).toBe(180)
    expect(tileRotationAt(props, 3)).toBe(270)
    expect(tileRotationAt(props, 4)).toBe(0)
    expect(tileRotationAt({ tileRotations: '45' }, 0)).toBe(0) // unrecognised value
  })
})

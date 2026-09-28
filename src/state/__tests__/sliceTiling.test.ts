import { describe, expect, it } from 'vitest'
import {
  buildSliceChildMatrices, parseSliceBits, resolveSlicePattern,
  SLICE_PRESET_NAMES, sliceBit, walkSliceLeaf,
} from '../sliceTiling'
import { evalSliceTiling } from '../../nodes/field/evaluate'
import { fanFold, hexCell, latticeCellValue, squareCell, triCell } from '../evaluator/lattice'
import { isPropertyEnabled, NODE_LIBRARY, propertyMeta } from '../nodeLibrary'

describe('slice tiling subdivision', () => {
  it('registers ordered property inputs and gates custom bit strings', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'SliceTiling')!
    expect(definition.inputs.map((input) => input.id)).toEqual(['cells', 'rotation', 'spin', 'warp', 'morph', 'edge'])
    expect(definition.propertyInputs).toEqual({
      cells: 'cells', rotation: 'rotation', spin: 'spin', warp: 'warp', morph: 'morph', edge: 'edge',
    })
    expect(definition.outputs.map((output) => output.id)).toEqual(['field', 'cell'])
    expect(propertyMeta('SliceTiling', 'seed')).toMatchObject({ min: 0, max: 9999, step: 1 })
    expect(isPropertyEnabled('SliceTiling', 'bits', { preset: 'pinwheel' })).toBe(false)
    expect(isPropertyEnabled('SliceTiling', 'bits', { preset: 'custom' })).toBe(true)
    expect(propertyMeta('SliceTiling', 'warp')).toMatchObject({ min: -1, max: 1 })
    expect(propertyMeta('SliceTiling', 'morph')).toMatchObject({ min: 0, max: 1 })
    expect(propertyMeta('SliceTiling', 'edge')).toMatchObject({ min: 0, max: 0.5 })
  })

  it('parses exact-depth hex strings and falls back to solid on invalid custom text', () => {
    expect([...parseSliceBits('a', 1)!]).toEqual([0x0a])
    expect(parseSliceBits('aa', 1)).toBeNull()
    const invalid = resolveSlicePattern('custom', 2, 'not hex', '')
    expect([...invalid.bits]).toEqual([0xff, 0xff])
    expect([...invalid.bitsB]).toEqual([0xff, 0xff])
  })

  it('ships deterministic bounded presets at every supported depth', () => {
    for (const preset of SLICE_PRESET_NAMES) for (const depth of [1, 2, 3]) {
      const a = resolveSlicePattern(preset, depth, '', '')
      const b = resolveSlicePattern(preset, depth, '', '')
      expect([...a.bits]).toEqual([...b.bits])
      expect([...a.bitsB]).toEqual([...b.bitsB])
      for (let leaf = 0; leaf < 4 ** depth; leaf++) {
        expect([0, 1]).toContain(sliceBit(a.bits, leaf))
        expect([0, 1]).toContain(sliceBit(a.bitsB, leaf))
      }
      const { field } = evalSliceTiling('hex', depth, 'dihedral', preset, '', '', 1.5, 0, 0, 0, 0.4, 0.03, 0, 12, 12)
      expect([...field].every((value) => value >= 0 && value <= 1)).toBe(true)
    }
  })

  it('warp zero is the exact midpoint quartering', () => {
    const matrices = buildSliceChildMatrices(0)
    expect(walkSliceLeaf([0.75, 0.125, 0.125], 1, matrices).leaf).toBe(0)
    expect(walkSliceLeaf([0.125, 0.75, 0.125], 1, matrices).leaf).toBe(1)
    expect(walkSliceLeaf([0.125, 0.125, 0.75], 1, matrices).leaf).toBe(2)
    expect(walkSliceLeaf([0.25, 0.375, 0.375], 1, matrices).leaf).toBe(3)
  })

  it('agrees with a direct leaf walk for a sampled pixel', () => {
    const W = 16, H = 16, x = 10, y = 8, depth = 2
    const cell = squareCell((x + 0.5 - W / 2) / W, (y + 0.5 - H / 2) / W)
    const folded = fanFold(cell.x, cell.y, 4, false)
    const sum = folded.x / (Math.SQRT1_2 * Math.cos(Math.PI / 4))
    const difference = folded.y / (Math.SQRT1_2 * Math.sin(Math.PI / 4))
    const direct = walkSliceLeaf([1 - sum, (sum - difference) / 2, (sum + difference) / 2], depth, buildSliceChildMatrices(0))
    const onlyDirectLeaf = (1n << BigInt(direct.leaf)).toString(16).padStart(4, '0')
    const { field } = evalSliceTiling('square', depth, 'rotational', 'custom', onlyDirectLeaf, '0000', 1, 0, 0, 0, 0, 0, 0, W, H)
    expect(field[y * W + x]).toBe(1)
  })

  it('responds to every wireable control and animates when spin is nonzero', () => {
    const render = (overrides: Partial<{
      cells: number; rotation: number; spin: number; warp: number; morph: number; edge: number; t: number
    }> = {}) => [...evalSliceTiling(
      'hex', 3, 'dihedral', 'braid', '', '', overrides.cells ?? 1.5,
      overrides.rotation ?? 0, overrides.spin ?? 0, overrides.warp ?? 0,
      overrides.morph ?? 0.2, overrides.edge ?? 0.03, overrides.t ?? 0, 16, 16,
    ).field]
    const base = render()
    for (const variant of [
      render({ cells: 2.3 }), render({ rotation: 27 }), render({ spin: 45, t: 1 }),
      render({ warp: 0.8 }), render({ morph: 0.8 }), render({ edge: 0.2 }),
    ]) expect(variant).not.toEqual(base)
  })
})

describe('slice tiling cell output', () => {
  const W = 16, H = 16
  const cellsOf = (lattice: string, overrides: Partial<{
    depth: number; preset: string; cells: number; rotation: number; warp: number; morph: number; edge: number; seed: number
  }> = {}) => [...evalSliceTiling(
    lattice, overrides.depth ?? 2, 'dihedral', overrides.preset ?? 'pinwheel', '', '',
    overrides.cells ?? 2.5, overrides.rotation ?? 0, 0, overrides.warp ?? 0,
    overrides.morph ?? 0, overrides.edge ?? 0.03, 0, W, H, overrides.seed ?? 7,
  ).cell]

  it('gives every pixel the value of the lattice polygon it falls in', () => {
    const finders = { hex: hexCell, square: squareCell, triangle: triCell } as const
    for (const [lattice, finder] of Object.entries(finders)) {
      const cell = cellsOf(lattice)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const polygon = finder((x + 0.5 - W / 2) * 2.5 / W, (y + 0.5 - H / 2) * 2.5 / W)
        expect(cell[y * W + x], `${lattice} ${x},${y}`).toBe(latticeCellValue(polygon, 7))
      }
      // Several polygons, each many pixels: a colour per cell, not per pixel.
      const distinct = new Set(cell).size
      expect(distinct, lattice).toBeGreaterThan(3)
      expect(distinct, lattice).toBeLessThan(W * H / 4)
      expect(cell.every((value) => value >= 0.25 && value < 1), lattice).toBe(true)
    }
  })

  it('ignores the slice pattern, and follows the lattice and the seed', () => {
    const base = cellsOf('hex')
    for (const variant of [
      cellsOf('hex', { depth: 3 }), cellsOf('hex', { preset: 'braid' }), cellsOf('hex', { warp: 0.8 }),
      cellsOf('hex', { morph: 0.6 }), cellsOf('hex', { edge: 0.3 }),
    ]) expect(variant).toEqual(base)
    for (const variant of [
      cellsOf('hex', { seed: 8 }), cellsOf('hex', { cells: 3.5 }), cellsOf('hex', { rotation: 30 }), cellsOf('triangle'),
    ]) expect(variant).not.toEqual(base)
  })
})

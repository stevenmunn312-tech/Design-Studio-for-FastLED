import { describe, expect, it } from 'vitest'
import { fanFold, hexCell, LATTICE_HASH_MULTIPLIERS, latticeCellValue, latticeHash, squareCell, triCell } from '../lattice'
import { LATTICE_HELPER_CPP } from '../../../codegen/helpers/latticeHelperCpp'

describe('lattice cell finders', () => {
  it('maps square and hex centres to zero local coordinates', () => {
    expect(squareCell(2, -3)).toMatchObject({ x: 0, y: 0, a: 2, b: -3 })
    expect(hexCell(2, 0)).toMatchObject({ x: 0, y: 0, a: 2, b: -1 })
  })

  it('maps the centres of both triangle orientations exactly once', () => {
    const up = triCell(0.5, Math.sqrt(3) / 6)
    const down = triCell(1, Math.sqrt(3) / 3)
    expect(up.x).toBeCloseTo(0)
    expect(up.y).toBeCloseTo(0)
    expect(up.flipped).toBe(false)
    expect(down.x).toBeCloseTo(0)
    expect(down.y).toBeCloseTo(0)
    expect(down.flipped).toBe(true)
  })

  it('assigns every sampled point to finite local coordinates', () => {
    for (const finder of [squareCell, hexCell, triCell]) {
      for (let y = -2; y <= 2; y += 0.07) for (let x = -2; x <= 2; x += 0.07) {
        const cell = finder(x, y)
        expect(Number.isFinite(cell.x) && Number.isFinite(cell.y)).toBe(true)
      }
    }
  })
})

describe('fanFold', () => {
  it('is idempotent for every supported polygon', () => {
    for (const sides of [3, 4, 6]) for (const dihedral of [false, true]) {
      for (let angle = -Math.PI; angle <= Math.PI; angle += 0.071) {
        const first = fanFold(Math.cos(angle), Math.sin(angle), sides, dihedral)
        const second = fanFold(first.x, first.y, sides, dihedral)
        expect(second.x).toBeCloseTo(first.x, 10)
        expect(second.y).toBeCloseTo(first.y, 10)
      }
    }
  })
})

describe('latticeHash', () => {
  // The sketch's `_latticeCellValue`, written as C evaluates it: every step
  // unsigned 32-bit, the top 24 bits kept.
  const u32 = (value: bigint) => ((value % 2n ** 32n) + 2n ** 32n) % 2n ** 32n
  const cBits = (a: number, b: number, seed: number) => {
    const [ma, mb, ms, mix] = LATTICE_HASH_MULTIPLIERS.map(BigInt)
    let h = u32(u32(BigInt(a)) * ma + u32(BigInt(b)) * mb + BigInt(seed) * ms)
    h = u32((h ^ (h >> 13n)) * mix)
    h ^= h >> 16n
    return h >> 8n
  }
  const cHash = (a: number, b: number, seed: number) => Number(cBits(a, b, seed)) / 16777216
  const cCellValue = (a: number, b: number, flipped: boolean, seed: number) =>
    Number(4194304n + ((cBits(a * 2 + (flipped ? 1 : 0), b, seed) * 3n) >> 2n)) / 16777216

  it('returns exactly what the sketch computes, negatives and large seeds included', () => {
    for (const seed of [0, 1, 7, 9999, 4294967295]) {
      for (let a = -40; a <= 40; a += 3) for (let b = -40; b <= 40; b += 7) {
        expect(latticeHash(a, b, seed), `${a},${b},${seed}`).toBe(cHash(a, b, seed))
      }
    }
  })

  it('stays in [0, 1) and exact in float32', () => {
    for (let a = -30; a <= 30; a++) for (let b = -30; b <= 30; b++) {
      const value = latticeHash(a, b, 3)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      expect(Math.fround(value)).toBe(value)
    }
  })

  it('gives each cell a value in [0.25, 1) exactly as the sketch does', () => {
    // Clear of the 0 an empty slice holds, so a cell multiplied into the
    // slice field never takes the empty slices' colour.
    for (const flipped of [false, true]) for (const seed of [0, 11, 4294967295]) {
      for (let a = -20; a <= 20; a += 2) for (let b = -20; b <= 20; b += 3) {
        const value = latticeCellValue({ x: 0, y: 0, a, b, flipped }, seed)
        expect(value, `${a},${b},${flipped},${seed}`).toBe(cCellValue(a, b, flipped, seed))
        expect(value).toBeGreaterThanOrEqual(0.25)
        expect(value).toBeLessThan(1)
        expect(Math.fround(value)).toBe(value)
      }
    }
  })

  it('tells the two triangles of one rhombus apart', () => {
    const up = triCell(0.5, Math.sqrt(3) / 6)
    const down = triCell(1, Math.sqrt(3) / 3)
    expect([up.a, up.b]).toEqual([down.a, down.b])
    expect(latticeCellValue(up, 0)).not.toBe(latticeCellValue(down, 0))
  })

  it('emits the multipliers it hashes with into the sketch helper', () => {
    for (const multiplier of LATTICE_HASH_MULTIPLIERS) expect(LATTICE_HELPER_CPP).toContain(`${multiplier}u`)
    expect(LATTICE_HELPER_CPP).toContain('return h>>8;')
    expect(LATTICE_HELPER_CPP).toContain('return (float)(4194304u+((bits*3u)>>2))/16777216.0f;')
  })
})

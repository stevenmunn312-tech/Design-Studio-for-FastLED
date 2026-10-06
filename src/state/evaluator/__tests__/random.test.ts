import { describe, expect, it } from 'vitest'
import { worleyHash } from '../random'
import { LATTICE_HASH_MULTIPLIERS, latticeHash } from '../lattice'
import { WORLEY_HASH_CPP } from '../../../codegen/helpers/latticeHelperCpp'

describe('worleyHash', () => {
  // The sketch's `_worleyHash`, written as C evaluates it: every step
  // unsigned 32-bit, the top 24 bits kept.
  const [ma, mb, ms, mix] = LATTICE_HASH_MULTIPLIERS.map(BigInt)
  const u32 = (value: bigint) => ((value % 2n ** 32n) + 2n ** 32n) % 2n ** 32n
  const cWorley = (x: number, y: number, seed: number) => {
    let h = u32(u32(BigInt(x)) * ma + u32(BigInt(y)) * mb + BigInt(seed) * ms)
    h = u32((h ^ (h >> 13n)) * mix)
    return Number((h ^ (h >> 16n)) >> 8n) / 16777216
  }

  it('returns exactly what the sketch computes, negative cells and every seed included', () => {
    for (const seed of [0, 1, 9, 9999, 4294967295]) {
      for (let x = -60; x <= 60; x += 3) for (let y = -60; y <= 60; y += 5) {
        expect(worleyHash(x, y, seed), `${x},${y},${seed}`).toBe(cWorley(x, y, seed))
        // Gabor noise and the audio-reactive shards also hash an offset cell.
        expect(worleyHash(x + 31, y - 17, seed), `${x + 31},${y - 17},${seed}`).toBe(cWorley(x + 31, y - 17, seed))
      }
    }
  })

  it('is the lattice hash, with no seed meaning seed 0', () => {
    for (let x = -9; x <= 9; x++) for (let y = -9; y <= 9; y++) {
      expect(worleyHash(x, y)).toBe(worleyHash(x, y, 0))
      expect(worleyHash(x, y, 77)).toBe(latticeHash(x, y, 77))
    }
  })

  it('stays in [0, 1) and exact in float32', () => {
    for (let x = -30; x <= 30; x++) for (let y = -30; y <= 30; y++) {
      const value = worleyHash(x, y, 5)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      expect(Math.fround(value)).toBe(value)
    }
  })

  it('emits the same unsigned arithmetic into the sketch', () => {
    const [a, b, s, m] = LATTICE_HASH_MULTIPLIERS
    expect(WORLEY_HASH_CPP).toContain('float _worleyHash(int x, int y, uint32_t seed) {')
    expect(WORLEY_HASH_CPP).toContain(`uint32_t h = (uint32_t)x * ${a}u + (uint32_t)y * ${b}u + seed * ${s}u;`)
    expect(WORLEY_HASH_CPP).toContain(`h = (h ^ (h >> 13)) * ${m}u;`)
    expect(WORLEY_HASH_CPP).toContain('return (float)((h ^ (h >> 16)) >> 8) / 16777216.0f;')
    // Multiplying before the cast overflows a signed int: undefined behaviour.
    expect(WORLEY_HASH_CPP).not.toMatch(/\(uint32_t\)\([xy] \*/)
  })
})

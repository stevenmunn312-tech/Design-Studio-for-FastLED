import { describe, expect, it } from 'vitest'
import {
  classicFormula, nextPatternIndex, patternPickNeedsTable, pickEntries, collectionProfiles,
} from '../patternPick'

const equal = pickEntries(collectionProfiles(['a', 'b', 'c'], {}))

describe('pattern pick', () => {
  it('keeps the classic draw when every weight is equal and the set is full', () => {
    const draws: number[] = []
    const rand = () => { draws.push(0.5); return 0.5 }
    expect(classicFormula(equal, { energy: null, section: null })).toBe(true)
    const picked = nextPatternIndex(equal, 0, { energy: null, section: null }, 'next', rand)
    expect(picked).toEqual({ index: (0 + 1 + Math.floor(0.5 * 2)) % 3, drew: true })
    expect(draws).toHaveLength(1)
    expect(patternPickNeedsTable([1, 1, 1], [[], [], []])).toBe(false)
    expect(patternPickNeedsTable([2, 2, 2], [[], [], []])).toBe(false)
  })

  it('never auto-picks a weight of 0 and skips it while walking', () => {
    const entries = pickEntries(collectionProfiles(['a', 'b', 'c'], { patternWeights: { b: 0 } }))
    const rand = () => 0
    expect(nextPatternIndex(entries, 0, { energy: null, section: null }, 'sequential', rand).index).toBe(2)
    expect(nextPatternIndex(entries, 2, { energy: null, section: null }, 'next', rand).index).not.toBe(1)
    expect(patternPickNeedsTable([1, 0, 1], [[], [], []])).toBe(true)
  })

  it('uses an energy tag only when the moment names a band', () => {
    const entries = pickEntries(collectionProfiles(['a', 'b'], { patternEnergy: { a: ['calm'], b: ['peak'] } }))
    const calm = nextPatternIndex(entries, 1, { energy: 'calm', section: null }, 'first', () => 0.99)
    expect(calm.index).toBe(0)
    expect(calm.drew).toBe(false)
  })
})

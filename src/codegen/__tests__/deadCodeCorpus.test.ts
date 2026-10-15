import { beforeAll, describe, expect, it } from 'vitest'
import { cppCode, unreachableCppUnits } from '../cppReachability'
import { foldConstants } from '../cppSpecialize'
import { deadCodeCorpus } from './deadCodeCorpus'

/*
 * Generated firmware carries nothing its graph cannot reach (D-09). Each
 * generator ends in the same pruning pass, so a finished sketch must already
 * be at that pass's fixed point: no file-scope unit unreachable from setup,
 * loop or a library callback, and no branch a constant still decides. A
 * helper emitted outside the pass, or a constant the pass cannot see through,
 * fails here rather than shipping.
 */
describe('dead code in the generated corpus', () => {
  let corpus: Record<string, string>
  beforeAll(() => { corpus = deadCodeCorpus() }, 120_000)

  it('covers every live example and each player and show variant', () => {
    expect(Object.keys(corpus).filter((name) => name.startsWith('normal-')).length).toBeGreaterThan(200)
    for (const kind of ['music-', 'performance-', 'slideshow-']) {
      expect(Object.keys(corpus).some((name) => name.startsWith(kind))).toBe(true)
    }
  })

  it('reaches every file-scope unit it emits', () => {
    const offenders = Object.entries(corpus).flatMap(([name, sketch]) =>
      unreachableCppUnits(sketch).map((unit) => `${name}: ${unit.names.join(', ') || sketch.slice(unit.start, unit.start + 40)}`))
    expect(offenders).toEqual([])
  })

  it('leaves no branch a constant decides', () => {
    const offenders = Object.entries(corpus).flatMap(([name, sketch]) => {
      const code = cppCode(sketch)
      const found = [
        ...code.match(/\bif\s*\(\s*(?:true|false|[01])\s*\)/g) ?? [],
        ...code.match(/\bswitch\s*\(\s*-?\d+\s*\)/g) ?? [],
        ...code.match(/[=(,]\s*\(?\s*(?:true|false)\s*\)?\s*\?/g) ?? [],
      ]
      if (foldConstants(sketch) !== sketch) found.push('foldConstants still changes it')
      return found.map((text) => `${name}: ${text}`)
    })
    expect(offenders).toEqual([])
  }, 60_000)
})

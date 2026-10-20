import { describe, expect, it } from 'vitest'
import {
  advanceSequence, asPatternSteps, blankSequenceCursor, storedPatternSteps, type PatternStep,
} from '../patternSequence'
import type { PickEntry } from '../patternPick'

const entries = (n: number, tags: Partial<PickEntry>[] = []): PickEntry[] =>
  Array.from({ length: n }, (_, i) => ({ weight: 1, energy: [], sections: [], ...tags[i] }))

const never = () => {
  throw new Error('drew a random number')
}

describe('pattern sequence', () => {
  it('opens on the first step it names', () => {
    const steps: PatternStep[] = [{ index: 3, hold: 2, transition: 'crossfade', transitionSec: 1 }]
    const opened = advanceSequence(steps, blankSequenceCursor(), entries(4), 0, 0, false, false, 0, never)
    expect(opened.cursor.patternIndex).toBe(3)
  })

  it('opens a tag step on the first eligible pattern without a draw, as the sketches do', () => {
    const steps: PatternStep[] = [{ sections: ['drop'], hold: 2, transition: 'crossfade', transitionSec: 1 }]
    const tagged = entries(3, [{ sections: ['verse'] }, { sections: ['drop'] }, { sections: ['drop'] }])
    const opened = advanceSequence(steps, blankSequenceCursor(), tagged, 0, 0, false, false, 0, never)
    expect(opened.cursor.patternIndex).toBe(1)
    const untagged = advanceSequence(steps, blankSequenceCursor(), entries(3), 0, 0, false, false, 0, never)
    expect(untagged.cursor.patternIndex).toBe(0)
  })

  it('follows a saved pattern through a reorder and picks by tag once it leaves', () => {
    const saved = [{ patternId: 'b', hold: 4, transition: 'wipe', transitionSec: 1 }]
    expect(asPatternSteps(saved, ['a', 'b', 'c'])[0].index).toBe(1)
    expect(asPatternSteps(saved, ['b', 'c', 'a'])[0].index).toBe(0)
    const gone = asPatternSteps(saved, ['a', 'c'])[0]
    expect(gone.index).toBeUndefined()
    expect(gone.patternId).toBe('b')
    // A raw index is not a saved form: it named a row, not a pattern.
    expect(asPatternSteps([{ index: 1, hold: 4 }], ['a', 'b'])[0].index).toBeUndefined()
  })

  it('stores what the lane editor resolved as group ids', () => {
    const steps: PatternStep[] = [
      { index: 2, hold: 4, transition: 'crossfade', transitionSec: 1 },
      { patternId: 'gone', hold: 2, transition: 'crossfade', transitionSec: 1 },
      { hold: 2, transition: 'crossfade', transitionSec: 1 },
    ]
    expect(storedPatternSteps(steps, ['a', 'b', 'c'])).toEqual([
      { patternId: 'c', hold: 4, transition: 'crossfade', transitionSec: 1 },
      { patternId: 'gone', hold: 2, transition: 'crossfade', transitionSec: 1 },
      { hold: 2, transition: 'crossfade', transitionSec: 1 },
    ])
  })
})

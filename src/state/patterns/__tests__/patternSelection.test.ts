import { describe, it, expect } from 'vitest'
import {
  blankPatternSelection,
  encoderSteps,
  updatePatternSelection,
  ENCODER_COUNTS_PER_STEP,
  ENCODER_RESEAT_COUNTS,
  type PatternSelectionState,
} from '../patternSelection'

const IDS = ['fire', 'rain', 'waves', 'noise']

/** A selection already playing `ids[index]`, as a show would leave it. */
function playing(ids: readonly string[], index: number): PatternSelectionState {
  const state = blankPatternSelection()
  updatePatternSelection(state, { ids, setActive: index })
  return state
}

describe('stepping', () => {
  it('starts on the first pattern', () => {
    const state = blankPatternSelection()
    const view = updatePatternSelection(state, { ids: IDS })
    expect(view).toMatchObject({ count: 4, activeIndex: 0, activeId: 'fire', activeChanged: 'none' })
  })

  // No confirm: choosing the next pattern is what plays it.
  it('moves the running pattern straight away', () => {
    const state = playing(IDS, 0)
    const view = updatePatternSelection(state, { ids: IDS, step: 2 })
    expect(view).toMatchObject({ activeId: 'waves', activeIndex: 2, activeChanged: 'step' })
  })

  it('steps back with a negative step', () => {
    const state = playing(IDS, 2)
    expect(updatePatternSelection(state, { ids: IDS, step: -1 })).toMatchObject({
      activeId: 'rain', activeChanged: 'step',
    })
  })

  it('reports no change without a step', () => {
    const state = playing(IDS, 1)
    expect(updatePatternSelection(state, { ids: IDS, step: 0 }).activeChanged).toBe('none')
  })
})

describe('wrapping', () => {
  it('wraps past the end and before the start', () => {
    const state = playing(IDS, 3)
    expect(updatePatternSelection(state, { ids: IDS, step: 1 }).activeIndex).toBe(0)
    expect(updatePatternSelection(state, { ids: IDS, step: -1 }).activeIndex).toBe(3)
  })

  it('wraps a step longer than the collection', () => {
    const state = playing(IDS, 0)
    expect(updatePatternSelection(state, { ids: IDS, step: 9 }).activeIndex).toBe(1)
    expect(updatePatternSelection(state, { ids: IDS, step: -9 }).activeIndex).toBe(0)
  })

  it('stays put with a single pattern', () => {
    const one = ['fire']
    const state = playing(one, 0)
    const view = updatePatternSelection(state, { ids: one, step: 5 })
    expect(view).toMatchObject({ activeIndex: 0, count: 1, activeChanged: 'none' })
  })
})

describe('empty collection', () => {
  it('reports nothing selected and ignores input', () => {
    const state = blankPatternSelection()
    const view = updatePatternSelection(state, { ids: [], step: 3 })
    expect(view).toMatchObject({ count: 0, activeIndex: -1, activeId: '', activeChanged: 'none' })
  })

  it('lands on the first pattern when a collection is filled', () => {
    const state = blankPatternSelection()
    updatePatternSelection(state, { ids: [] })
    expect(updatePatternSelection(state, { ids: IDS })).toMatchObject({ activeId: 'fire' })
  })
})

describe('the collection changing underneath', () => {
  // Identity, not position: dragging a pattern up the list must not change the
  // one on the LEDs.
  it('keeps playing the same pattern through a reorder', () => {
    const state = playing(IDS, 2)
    const reordered = ['waves', 'fire', 'rain', 'noise']
    const view = updatePatternSelection(state, { ids: reordered })
    expect(view.activeId).toBe('waves')
    expect(view.activeIndex).toBe(0)
    expect(view.activeChanged).toBe('none')
  })

  it('keeps playing the same pattern when one is added', () => {
    const state = playing(IDS, 1)
    const grown = ['fire', 'rain', 'waves', 'noise', 'plasma']
    expect(updatePatternSelection(state, { ids: grown })).toMatchObject({
      activeId: 'rain', activeIndex: 1, count: 5,
    })
  })

  it('keeps playing the same pattern when an earlier one is removed', () => {
    const state = playing(IDS, 2)
    const shrunk = ['rain', 'waves', 'noise']
    expect(updatePatternSelection(state, { ids: shrunk })).toMatchObject({
      activeId: 'waves', activeIndex: 1,
    })
  })

  // Position is the fallback the id cannot cover: the slot's new occupant is a
  // closer answer than dumping the show back at the top of the list.
  it('hands the slot to its new occupant when the playing pattern is removed', () => {
    const state = playing(IDS, 1)
    const shrunk = ['fire', 'waves', 'noise']
    expect(updatePatternSelection(state, { ids: shrunk })).toMatchObject({
      activeId: 'waves', activeIndex: 1,
    })
  })

  it('clamps to the last pattern when the tail is removed', () => {
    const state = playing(IDS, 3)
    const shrunk = ['fire', 'rain']
    expect(updatePatternSelection(state, { ids: shrunk })).toMatchObject({
      activeId: 'rain', activeIndex: 1,
    })
  })

  it('steps from the reconciled pattern', () => {
    const state = playing(IDS, 2)
    const reordered = ['waves', 'fire', 'rain', 'noise']
    expect(updatePatternSelection(state, { ids: reordered, step: 1 })).toMatchObject({ activeId: 'fire' })
  })

  it('reports nothing selected when the collection is emptied', () => {
    const state = playing(IDS, 2)
    expect(updatePatternSelection(state, { ids: [] })).toMatchObject({
      count: 0, activeIndex: -1, activeId: '',
    })
  })
})

describe('the show advancing on its own', () => {
  it('moves the cursor and says the show moved it', () => {
    const state = playing(IDS, 0)
    expect(updatePatternSelection(state, { ids: IDS, setActive: 2 })).toMatchObject({
      activeId: 'waves', activeChanged: 'show',
    })
  })

  // A press and an auto-advance landing on the same frame must not resolve by
  // whichever branch happens to run first: the press is applied last.
  it('applies a step after an advance on the same frame', () => {
    const state = playing(IDS, 0)
    const view = updatePatternSelection(state, { ids: IDS, setActive: 2, step: 1 })
    expect(view.activeId).toBe('noise')
    expect(view.activeChanged).toBe('step')
  })

  it('reports no change when the show re-asserts what is playing', () => {
    const state = playing(IDS, 2)
    expect(updatePatternSelection(state, { ids: IDS, setActive: 2 }).activeChanged).toBe('none')
  })

  it('clamps an out-of-range advance', () => {
    const state = playing(IDS, 0)
    expect(updatePatternSelection(state, { ids: IDS, setActive: 99 }).activeIndex).toBe(3)
    expect(updatePatternSelection(state, { ids: IDS, setActive: -5 }).activeIndex).toBe(0)
  })
})

describe('encoderSteps', () => {
  // A graph that loads with its encoder parked at 37 has not asked for
  // anything; treating that as travel scrolls the list on page open.
  it('never steps on the first reading', () => {
    const state = blankPatternSelection()
    expect(encoderSteps(state, 37)).toBe(0)
    expect(encoderSteps(state, 37)).toBe(0)
  })

  it('takes four counts to move one pattern', () => {
    const state = blankPatternSelection()
    encoderSteps(state, 0)
    expect(encoderSteps(state, 3)).toBe(0)
    expect(encoderSteps(state, ENCODER_COUNTS_PER_STEP)).toBe(1)
  })

  it('accumulates counts arriving one frame at a time', () => {
    const state = blankPatternSelection()
    encoderSteps(state, 0)
    let steps = 0
    for (let i = 1; i <= ENCODER_COUNTS_PER_STEP * 2; i++) steps += encoderSteps(state, i)
    expect(steps).toBe(2)
  })

  it('steps backwards on a falling count', () => {
    const state = blankPatternSelection()
    encoderSteps(state, 0)
    expect(encoderSteps(state, -ENCODER_COUNTS_PER_STEP)).toBe(-1)
  })

  it('honours a caller with its own counts per step', () => {
    const state = blankPatternSelection()
    encoderSteps(state, 0)
    expect(encoderSteps(state, 1, 1)).toBe(1)
  })

  // Reset On Press slams the running count to zero. Treating that as travel
  // would scroll the list by hundreds of patterns from a single press.
  it('treats a large jump as a re-seat rather than travel', () => {
    const state = blankPatternSelection()
    encoderSteps(state, 0)
    expect(encoderSteps(state, ENCODER_RESEAT_COUNTS * 4)).toBe(0)
    expect(encoderSteps(state, ENCODER_RESEAT_COUNTS * 4 + ENCODER_COUNTS_PER_STEP)).toBe(1)
  })

  it('ignores a non-finite reading', () => {
    const state = blankPatternSelection()
    encoderSteps(state, 0)
    expect(encoderSteps(state, Number.NaN)).toBe(0)
    expect(encoderSteps(state, ENCODER_COUNTS_PER_STEP)).toBe(1)
  })

  it('drives the running pattern through updatePatternSelection', () => {
    const state = playing(IDS, 0)
    updatePatternSelection(state, { ids: IDS, encoder: 0 })
    const view = updatePatternSelection(state, { ids: IDS, encoder: ENCODER_COUNTS_PER_STEP * 2 })
    expect(view).toMatchObject({ activeIndex: 2, activeChanged: 'step' })
  })
})

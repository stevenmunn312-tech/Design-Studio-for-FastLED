import { describe, it, expect } from 'vitest'
import {
  blankPatternSelection,
  encoderSteps,
  updatePatternSelection,
  patternSelectionView,
  ENCODER_COUNTS_PER_STEP,
  ENCODER_RESEAT_COUNTS,
  PATTERN_BROWSE_TIMEOUT_MS,
  type PatternSelectionState,
} from '../patternSelection'

const IDS = ['fire', 'rain', 'waves', 'noise']

/** A selection already playing `ids[index]`, as a show would leave it. */
function playing(ids: readonly string[], index: number): PatternSelectionState {
  const state = blankPatternSelection()
  updatePatternSelection(state, { ids, nowMs: 0, setActive: index })
  return state
}

describe('active vs highlighted', () => {
  it('starts with both on the first pattern', () => {
    const state = blankPatternSelection()
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 0 })
    expect(view).toMatchObject({
      count: 4, activeIndex: 0, activeId: 'fire', highlightIndex: 0, highlightId: 'fire', browsing: false,
    })
  })

  // The whole point of the split: scrolling past a pattern must not play it,
  // or hunting for a name strobes the room on the way there.
  it('moves the highlight without changing what is playing', () => {
    const state = playing(IDS, 0)
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 100, step: 2 })
    expect(view.highlightId).toBe('waves')
    expect(view.activeId).toBe('fire')
    expect(view.browsing).toBe(true)
    expect(view.activeChanged).toBe('none')
  })

  it('commits the highlight on confirm', () => {
    const state = playing(IDS, 0)
    updatePatternSelection(state, { ids: IDS, nowMs: 100, step: 2 })
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 200, confirm: true })
    expect(view.activeId).toBe('waves')
    expect(view.activeChanged).toBe('confirm')
    expect(view.browsing).toBe(false)
  })

  it('reports no change when confirming what is already playing', () => {
    const state = playing(IDS, 1)
    updatePatternSelection(state, { ids: IDS, nowMs: 100, step: 1 })
    updatePatternSelection(state, { ids: IDS, nowMs: 150, step: -1 })
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 200, confirm: true })
    expect(view.activeId).toBe('rain')
    expect(view.activeChanged).toBe('none')
    expect(view.browsing).toBe(false)
  })
})

describe('browse timeout', () => {
  it('snaps the highlight back to what is playing when the window closes', () => {
    const state = playing(IDS, 0)
    updatePatternSelection(state, { ids: IDS, nowMs: 1000, step: 3 })
    expect(patternSelectionView(state, IDS).highlightId).toBe('noise')

    const view = updatePatternSelection(state, { ids: IDS, nowMs: 1000 + PATTERN_BROWSE_TIMEOUT_MS })
    expect(view.highlightId).toBe('fire')
    expect(view.browsing).toBe(false)
  })

  it('extends the window on every further turn', () => {
    const state = playing(IDS, 0)
    updatePatternSelection(state, { ids: IDS, nowMs: 0, step: 1 })
    updatePatternSelection(state, { ids: IDS, nowMs: 4000, step: 1 })
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 6000 })
    expect(view.browsing).toBe(true)
    expect(view.highlightId).toBe('waves')
  })
})

describe('wrapping', () => {
  it('wraps past the end and before the start', () => {
    const state = playing(IDS, 3)
    expect(updatePatternSelection(state, { ids: IDS, nowMs: 0, step: 1 }).highlightIndex).toBe(0)
    expect(updatePatternSelection(state, { ids: IDS, nowMs: 100, step: -1 }).highlightIndex).toBe(3)
  })

  it('wraps a step longer than the collection', () => {
    const state = playing(IDS, 0)
    expect(updatePatternSelection(state, { ids: IDS, nowMs: 0, step: 9 }).highlightIndex).toBe(1)
    expect(updatePatternSelection(state, { ids: IDS, nowMs: 100, step: -9 }).highlightIndex).toBe(0)
  })

  it('stays put with a single pattern', () => {
    const one = ['fire']
    const state = playing(one, 0)
    const view = updatePatternSelection(state, { ids: one, nowMs: 0, step: 5 })
    expect(view).toMatchObject({ activeIndex: 0, highlightIndex: 0, count: 1 })
  })
})

describe('empty collection', () => {
  it('reports nothing selected and ignores input', () => {
    const state = blankPatternSelection()
    const view = updatePatternSelection(state, { ids: [], nowMs: 0, step: 3, confirm: true })
    expect(view).toMatchObject({
      count: 0, activeIndex: -1, activeId: '', highlightIndex: -1, highlightId: '', activeChanged: 'none',
    })
  })

  it('lands on the first pattern when a collection is filled', () => {
    const state = blankPatternSelection()
    updatePatternSelection(state, { ids: [], nowMs: 0 })
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 100 })
    expect(view).toMatchObject({ activeId: 'fire', highlightId: 'fire' })
  })
})

describe('the collection changing underneath', () => {
  // Identity, not position: dragging a pattern up the list must not change the
  // one on the LEDs.
  it('keeps playing the same pattern through a reorder', () => {
    const state = playing(IDS, 2)
    const reordered = ['waves', 'fire', 'rain', 'noise']
    const view = updatePatternSelection(state, { ids: reordered, nowMs: 100 })
    expect(view.activeId).toBe('waves')
    expect(view.activeIndex).toBe(0)
    expect(view.activeChanged).toBe('none')
  })

  it('keeps playing the same pattern when one is added', () => {
    const state = playing(IDS, 1)
    const grown = ['fire', 'rain', 'waves', 'noise', 'plasma']
    expect(updatePatternSelection(state, { ids: grown, nowMs: 100 })).toMatchObject({
      activeId: 'rain', activeIndex: 1, count: 5,
    })
  })

  it('keeps playing the same pattern when an earlier one is removed', () => {
    const state = playing(IDS, 2)
    const shrunk = ['rain', 'waves', 'noise']
    expect(updatePatternSelection(state, { ids: shrunk, nowMs: 100 })).toMatchObject({
      activeId: 'waves', activeIndex: 1,
    })
  })

  // Position is the fallback the id cannot cover: the slot's new occupant is a
  // closer answer than dumping the show back at the top of the list.
  it('hands the slot to its new occupant when the playing pattern is removed', () => {
    const state = playing(IDS, 1)
    const shrunk = ['fire', 'waves', 'noise']
    expect(updatePatternSelection(state, { ids: shrunk, nowMs: 100 })).toMatchObject({
      activeId: 'waves', activeIndex: 1,
    })
  })

  it('clamps to the last pattern when the tail is removed', () => {
    const state = playing(IDS, 3)
    const shrunk = ['fire', 'rain']
    expect(updatePatternSelection(state, { ids: shrunk, nowMs: 100 })).toMatchObject({
      activeId: 'rain', activeIndex: 1,
    })
  })

  it('reconciles a highlight independently of what is playing', () => {
    const state = playing(IDS, 0)
    updatePatternSelection(state, { ids: IDS, nowMs: 100, step: 3 })
    const shrunk = ['fire', 'rain', 'waves']
    const view = updatePatternSelection(state, { ids: shrunk, nowMs: 200 })
    expect(view.activeId).toBe('fire')
    expect(view.highlightId).toBe('waves')
    expect(view.browsing).toBe(true)
  })

  it('reports nothing selected when the collection is emptied', () => {
    const state = playing(IDS, 2)
    expect(updatePatternSelection(state, { ids: [], nowMs: 100 })).toMatchObject({
      count: 0, activeIndex: -1, activeId: '',
    })
  })
})

describe('the show advancing on its own', () => {
  it('drags the highlight along while nobody is browsing', () => {
    const state = playing(IDS, 0)
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 100, setActive: 2 })
    expect(view).toMatchObject({ activeId: 'waves', highlightId: 'waves', activeChanged: 'show' })
  })

  it('leaves the highlight alone while browsing', () => {
    const state = playing(IDS, 0)
    updatePatternSelection(state, { ids: IDS, nowMs: 100, step: 1 })
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 200, setActive: 3 })
    expect(view).toMatchObject({ activeId: 'noise', highlightId: 'rain', browsing: true })
  })

  // A press and an auto-advance landing on the same frame must not resolve by
  // whichever branch happens to run first.
  it('lets a confirm win over an advance on the same frame', () => {
    const state = playing(IDS, 0)
    updatePatternSelection(state, { ids: IDS, nowMs: 100, step: 1 })
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 200, setActive: 3, confirm: true })
    expect(view.activeId).toBe('rain')
    expect(view.activeChanged).toBe('confirm')
  })

  it('reports no change when the show re-asserts what is playing', () => {
    const state = playing(IDS, 2)
    expect(updatePatternSelection(state, { ids: IDS, nowMs: 100, setActive: 2 }).activeChanged).toBe('none')
  })

  it('clamps an out-of-range advance', () => {
    const state = playing(IDS, 0)
    expect(updatePatternSelection(state, { ids: IDS, nowMs: 100, setActive: 99 }).activeIndex).toBe(3)
    expect(updatePatternSelection(state, { ids: IDS, nowMs: 200, setActive: -5 }).activeIndex).toBe(0)
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

  it('drives the highlight through updatePatternSelection', () => {
    const state = playing(IDS, 0)
    updatePatternSelection(state, { ids: IDS, nowMs: 0, encoder: 0 })
    const view = updatePatternSelection(state, { ids: IDS, nowMs: 100, encoder: ENCODER_COUNTS_PER_STEP * 2 })
    expect(view.highlightIndex).toBe(2)
    expect(view.activeIndex).toBe(0)
  })
})

// The one definition of *which pattern* is showing.
//
// Four things need to agree about this and none of them can see each other: an
// encoder turning on a panel, the OLED browser drawing what it selected, the
// generative show advancing on its own, and the SD player doing the same on a
// device with no app attached. Written four times these would disagree about
// the two questions that actually bite — what happens at the end of the list,
// and what happens when the collection changes underneath you.
//
// There is one cursor, the pattern that is running. Previous, Next and an
// encoder move it directly: choosing the next pattern shows the next pattern
// on the LEDs, with nothing to confirm. A panel names and pictures what is
// running because that is the only pattern there is to show.
//
// Everything here is pure: state is passed in and mutated in place, never read
// from a store, so the same rules can be tested without a graph and reused by a
// generator.

/**
 * Quadrature counts per detent on a typical KY-040.
 *
 * The generated decoder counts every A/B transition, so one physical click of
 * the shaft is four counts. Stepping per count would scroll four patterns per
 * click, which reads as a broken encoder rather than a fast one.
 *
 * Note this is *not* the unit the browser's encoder body produces — that one is
 * a mouse drag. Callers convert their own source, which is why the divisor is
 * an argument rather than baked into the step.
 */
export const ENCODER_COUNTS_PER_STEP = 4

/**
 * A jump larger than this is a re-seat, not motion.
 *
 * An encoder with Reset On Press slams its running count to zero, and a counter
 * that wraps does something similar. Treating either as travel would scroll the
 * list by hundreds of patterns from a single press.
 */
export const ENCODER_RESEAT_COUNTS = 64

/**
 * Where a cursor points, held as both identity and position.
 *
 * Both are needed, and each covers the other's blind spot when the collection
 * changes: the id survives a reorder, so dragging a pattern up the list does
 * not change what is playing; the index survives a deletion, so removing the
 * running pattern hands the slot to whatever took its place rather than
 * dumping you back at the top.
 */
export interface PatternCursor {
  /** Pattern group id, or '' when the collection is empty. */
  id: string
  /** Position in the collection, or -1 when the collection is empty. */
  index: number
}

export interface PatternSelectionState {
  active: PatternCursor
  encoderSeen: boolean
  encoderLast: number
  /** Counts not yet worth a step, kept so slow turns still accumulate. */
  encoderCarry: number
}

/** What a display, a show, or a generator reads back. */
export interface PatternSelectionView {
  count: number
  activeIndex: number
  activeId: string
  /**
   * What moved the active pattern this update, for a caller that must react:
   * a user's step (Previous, Next, an encoder) or the show's own advance.
   */
  activeChanged: 'none' | 'step' | 'show'
}

export interface PatternSelectionInput {
  /** The collection, in order. */
  ids: readonly string[]
  /** Discrete steps from buttons. Positive moves down the list. */
  step?: number
  /** A running encoder count, in that encoder's own units. */
  encoder?: number | null
  /** Counts per selection step for this encoder. */
  encoderCountsPerStep?: number
  /** The show's own advance, by index. Ignored while it matches. */
  setActive?: number | null
}

/**
 * What a Music Player publishes on its `patternSelect` port.
 *
 * The whole selection, not a cursor: a panel needs the names to print and the
 * ids to bake thumbnails against, and taking both from here is what stops it
 * needing its own wire to the collection. One player, one selection, however
 * many panels are reading it.
 */
export interface PatternSelectValue {
  /** The collection in order, so a reader can bake or resolve against it. */
  ids: readonly string[]
  names: readonly string[]
  activeIndex: number
  count: number
}

export function blankPatternSelectValue(): PatternSelectValue {
  return { ids: [], names: [], activeIndex: -1, count: 0 }
}

/** Whether a port value is a published selection. */
export function isPatternSelect(value: unknown): value is PatternSelectValue {
  return !!value && typeof value === 'object'
    && Array.isArray((value as PatternSelectValue).ids)
    && typeof (value as PatternSelectValue).activeIndex === 'number'
}

export function blankPatternCursor(): PatternCursor {
  return { id: '', index: -1 }
}

export function blankPatternSelection(): PatternSelectionState {
  return {
    active: blankPatternCursor(),
    encoderSeen: false,
    encoderLast: 0,
    encoderCarry: 0,
  }
}

/**
 * Point a cursor back at something real after the collection changed.
 *
 * Exported because it is the collection-change rule itself, and anything
 * holding a pattern across frames needs it — a running show's transition target
 * as much as the selection itself.
 *
 * A collection with the same id twice resolves to its first occurrence, so the
 * answer is at least deterministic; the editor does not produce one.
 */
export function reconcilePatternCursor(cursor: PatternCursor, ids: readonly string[]): void {
  if (ids.length === 0) {
    cursor.id = ''
    cursor.index = -1
    return
  }
  const found = cursor.id ? ids.indexOf(cursor.id) : -1
  if (found >= 0) {
    cursor.index = found
    return
  }
  const index = Math.min(Math.max(0, cursor.index < 0 ? 0 : cursor.index), ids.length - 1)
  cursor.index = index
  cursor.id = ids[index]
}

function pointAt(cursor: PatternCursor, ids: readonly string[], index: number): void {
  cursor.index = index
  cursor.id = ids[index]
}

/**
 * A running encoder count turned into whole selection steps.
 *
 * The first reading is never a step: a graph that loads with its encoder parked
 * at 37 has not asked for anything, and treating that as travel would scroll the
 * list the moment the page opened.
 */
export function encoderSteps(
  state: PatternSelectionState,
  position: number,
  countsPerStep = ENCODER_COUNTS_PER_STEP,
): number {
  if (!Number.isFinite(position)) return 0
  if (!state.encoderSeen) {
    state.encoderSeen = true
    state.encoderLast = position
    state.encoderCarry = 0
    return 0
  }
  const delta = position - state.encoderLast
  state.encoderLast = position
  if (Math.abs(delta) > ENCODER_RESEAT_COUNTS) {
    state.encoderCarry = 0
    return 0
  }
  const per = countsPerStep > 0 ? countsPerStep : 1
  state.encoderCarry += delta
  const steps = Math.trunc(state.encoderCarry / per)
  state.encoderCarry -= steps * per
  return steps
}

/**
 * One update of the selection, in the order the rules have to happen.
 *
 * Reconcile first, because every rule below it needs a cursor that points at
 * something real. Then the show's advance, then the user's steps — so a press
 * and an auto-advance landing on the same frame resolve in the user's favour
 * rather than by whichever ran first.
 */
export function updatePatternSelection(
  state: PatternSelectionState,
  input: PatternSelectionInput,
): PatternSelectionView {
  const ids = input.ids
  let activeChanged: PatternSelectionView['activeChanged'] = 'none'

  reconcilePatternCursor(state.active, ids)

  if (ids.length > 0 && input.setActive != null && Number.isFinite(input.setActive)) {
    const index = Math.min(Math.max(0, Math.round(input.setActive)), ids.length - 1)
    if (state.active.index !== index || state.active.id !== ids[index]) {
      pointAt(state.active, ids, index)
      activeChanged = 'show'
    }
  }

  let steps = Math.trunc(Number(input.step ?? 0)) || 0
  if (input.encoder != null) {
    steps += encoderSteps(state, Number(input.encoder), input.encoderCountsPerStep)
  }
  if (ids.length > 0 && steps !== 0) {
    const n = ids.length
    // Wraps rather than stopping: a shaft that keeps turning at the end of the
    // list and does nothing feels broken, and an encoder has no ends to hit.
    const next = (((state.active.index + steps) % n) + n) % n
    if (next !== state.active.index || ids[next] !== state.active.id) {
      pointAt(state.active, ids, next)
      activeChanged = 'step'
    }
  }

  return { count: ids.length, activeIndex: state.active.index, activeId: state.active.id, activeChanged }
}

/** Read the selection without advancing it. */
export function patternSelectionView(
  state: PatternSelectionState,
  ids: readonly string[],
): PatternSelectionView {
  return {
    count: ids.length,
    activeIndex: state.active.index,
    activeId: state.active.id,
    activeChanged: 'none',
  }
}

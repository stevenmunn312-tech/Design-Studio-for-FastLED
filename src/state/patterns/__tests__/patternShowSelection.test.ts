// The generative show reading the shared selection contract.
//
// `patternSelection.test.ts` covers the rules themselves. These cover the
// wiring: a running Music Player must survive its collection being edited,
// which it did not before the contract existed — the show state was keyed on
// the pattern *count*, so adding or removing one restarted the show at a random
// pattern with a fresh dwell.
//
// Assertions are on the pattern *id* rather than the rendered colour wherever
// the point is identity. A reset that happens to land on the same index would
// satisfy a colour check by luck, which is how a test like this passes without
// testing anything.

import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateGraph, evaluateGraphFull, getPatternShowSelection, resetEvaluatorState, type AudioSignal } from '../../graphEvaluator'
import { musicPlayerTiming } from '../../player/musicPlayerTiming'
import { NODE_LIBRARY } from '../../nodeLibrary'
import type { StudioNode, StudioEdge } from '../../graphStore'
import type { PatternSelectValue } from '../patternSelection'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'show', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

/** A pattern group rendering one flat colour, so a frame names its pattern. */
function solidGroup(blue: number) {
  return {
    nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: blue }), node('go', 'GroupOutput', {})],
    edges: [edge('eg', 'sc', 'frame', 'go', 'frame')],
  }
}

const ALL = ['grp-a', 'grp-b', 'grp-c', 'grp-d']
const BLUE: Record<string, number> = { 'grp-a': 10, 'grp-b': 20, 'grp-c': 30, 'grp-d': 40 }
const GROUPS = Object.fromEntries(ALL.map((id) => [id, solidGroup(BLUE[id])]))

/** Run one frame of a Music Player over `ids`, returning its rendered blue. */
function runShow(ids: string[], t: number, props: Record<string, unknown> = {}, beat?: boolean): number {
  // A dwell far longer than the test holds the show on one pattern, so any
  // change of pattern is the collection edit rather than the show advancing.
  const collection = node('coll', 'PatternCollection', { patternIds: ids })
  const master = node('master', 'PatternMaster', { minTime: 9999, maxTime: 9999, transitionSec: 1, seed: 7, ...props })
  const out = node('out', 'MatrixOutput', {})
  const frame = evaluateGraph(
    [collection, master, out, ...(beat === undefined ? [] : [node('pulse', 'Compare', { a: beat ? 1 : 0, b: 0.5 })])],
    [
      edge('e1', 'coll', 'patternset', 'master', 'patternset'),
      edge('e2', 'master', 'frame', 'out', 'frame'),
      ...(beat === undefined ? [] : [edge('eb', 'pulse', 'result', 'master', 'beat')]),
    ],
    t, 4, 4, GROUPS,
  )
  return frame![0][0].b
}

/** The id the show is currently playing, from its live selection. */
function playingId(ids: string[]): string {
  return ids[getPatternShowSelection('master')!.currentIndex]
}

describe('beat-triggered pattern transitions', () => {
  beforeEach(() => resetEvaluatorState())
  const timing = { order: 'Sequential', beatTransitions: true, minTime: 2, maxTime: 2, transitionSec: 0 }
  const run = (seconds: number, beat: boolean, props = timing) => runShow(ALL, seconds * 60, props, beat)

  it('ignores early beats, waits past the cooldown, and requires a fresh edge', () => {
    run(0, false)
    run(1, true)
    run(3, true)
    expect(playingId(ALL)).toBe(ALL[0])
    run(4, false)
    expect(playingId(ALL)).toBe(ALL[0])
    run(4.1, true)
    expect(playingId(ALL)).toBe(ALL[1])
    run(8, true)
    expect(playingId(ALL)).toBe(ALL[1])
    run(8.1, false)
    run(8.2, true)
    expect(playingId(ALL)).toBe(ALL[2])
  })

  it('uses a random cooldown inside both bounds instead of advancing at minimum time', () => {
    const props = { ...timing, minTime: 2, maxTime: 6 }
    run(0, false, props)
    run(2, true, props)
    expect(playingId(ALL)).toBe(ALL[0])
    run(6, false, props)
    expect(playingId(ALL)).toBe(ALL[0])
    run(6.1, true, props)
    expect(playingId(ALL)).toBe(ALL[1])
  })

  it('starts the next cooldown after the transition finishes', () => {
    const props = { ...timing, transitionSec: 1 }
    run(0, false, props)
    run(2, true, props)
    expect(getPatternShowSelection('master')!.transitioning).toBe(true)
    run(2.1, false, props)
    run(2.5, true, props)
    run(3, false, props)
    expect(playingId(ALL)).toBe(ALL[1])
    run(4.5, true, props)
    expect(getPatternShowSelection('master')!.transitioning).toBe(false)
    run(5, false, props)
    run(5.1, true, props)
    expect(getPatternShowSelection('master')!.transitioning).toBe(true)
  })

  it('uses timed changes when disabled even with a wired beat', () => {
    const props = { ...timing, beatTransitions: false }
    run(0, false, props)
    run(1, true, props)
    expect(playingId(ALL)).toBe(ALL[0])
    run(2, false, props)
    expect(playingId(ALL)).toBe(ALL[1])
  })

  it('breaks up timed changes with dwells and bursts', () => {
    const gaps = (props: Record<string, unknown>) => {
      resetEvaluatorState()
      const changes: number[] = []
      let playing = ''
      for (let s = 0; s <= 240; s += 0.25) {
        run(s, false, props as typeof timing)
        if (playingId(ALL) !== playing) { playing = playingId(ALL); changes.push(s) }
      }
      return changes.slice(1).map((at, i) => at - changes[i])
    }
    const steady = { ...timing, beatTransitions: false, order: 'Random' }
    expect(new Set(gaps(steady))).toEqual(new Set([2]))
    const varied = gaps({ ...steady, dwellsAndBursts: true })
    // A dwell holds twice Max Time; a burst changes again half a second on.
    // Eight changes a burst add many short gaps, so a normal hold is no longer
    // most of them. It still outnumbers the long dwells.
    expect(varied).toContain(4)
    expect(varied).toContain(0.5)
    const normal = varied.filter((gap) => gap === 2).length
    expect(normal).toBeGreaterThan(varied.filter((gap) => gap === 4).length)
    expect(normal).toBeGreaterThan(varied.length / 3)
  })

  it('holds indefinitely without a beat source', () => {
    runShow(ALL, 0, timing)
    runShow(ALL, 100 * 60, timing)
    expect(playingId(ALL)).toBe(ALL[0])
  })

  it('restarts cooldown after seeking backward', () => {
    run(0, false)
    run(4, true)
    run(1, false)
    run(2, true)
    expect(playingId(ALL)).toBe(ALL[1])
    run(3, false)
    run(3.1, true)
    expect(playingId(ALL)).toBe(ALL[2])
  })

  it.each([false, true])('uses Audio beats unless Beat is wired (override %s)', (wired) => {
    const nodes = [
      node('coll', 'PatternCollection', { patternIds: ALL }),
      node('master', 'PatternMaster', timing), node('out', 'MatrixOutput'),
      node('mic', 'MicInput'), node('audio', 'Audio', { sourceId: 'mic' }),
      node('pulse', 'Compare', { a: 0, b: 0.5 }),
    ]
    const edges = [
      edge('patterns', 'coll', 'patternset', 'master', 'patternset'),
      edge('out', 'master', 'frame', 'out', 'frame'),
      edge('audio', 'audio', 'audio', 'master', 'audio'),
      ...(wired ? [edge('beat', 'pulse', 'result', 'master', 'beat')] : []),
    ]
    const frame = (seconds: number, beat: boolean) => {
      const audio: AudioSignal = {
        active: true, micActive: true, nativeFastLed: true, beat,
        micBass: 0, micMids: 0, micTreble: 0, spectrum: [], detectorSpectrum: [],
      }
      evaluateGraph(nodes, edges, seconds * 60, 4, 4, GROUPS, '', new Set(), {}, audio, true, nodes)
    }
    frame(0, false)
    frame(3, true)
    expect(playingId(ALL)).toBe(ALL[wired ? 0 : 1])
  })

  it('normalizes invalid timing and a maximum below the minimum', () => {
    expect(musicPlayerTiming({ minTime: 5, maxTime: 2, transitionSec: -1 })).toEqual({
      minTime: 5, maxTime: 5, transitionSec: 0, beatTransitions: false,
      energyPacing: false, dwellsAndBursts: false,
    })
    expect(musicPlayerTiming({ minTime: NaN, maxTime: Infinity }).minTime).toBe(4)
    expect(musicPlayerTiming({ minTime: NaN, maxTime: Infinity }).maxTime).toBe(12)
  })
})

describe('a running show whose collection is edited', () => {
  beforeEach(() => resetEvaluatorState())

  it('renders the pattern its selection names', () => {
    runShow(ALL, 0)
    expect(runShow(ALL, 0.05)).toBe(BLUE[playingId(ALL)])
  })

  it('keeps playing the same pattern when one is appended', () => {
    const short = ['grp-a', 'grp-b']
    runShow(short, 0)
    const before = playingId(short)
    runShow([...short, 'grp-c'], 0.05)
    expect(playingId([...short, 'grp-c'])).toBe(before)
  })

  it('keeps playing the same pattern when the collection is reordered', () => {
    runShow(ALL, 0)
    const before = playingId(ALL)
    const reordered = [...ALL].reverse()
    runShow(reordered, 0.05)
    expect(playingId(reordered)).toBe(before)
  })

  it('keeps playing the same pattern when a different one is removed', () => {
    runShow(ALL, 0)
    const before = playingId(ALL)
    const survivors = ALL.filter((id) => id !== ALL[(ALL.indexOf(before) + 1) % ALL.length])
    runShow(survivors, 0.05)
    expect(playingId(survivors)).toBe(before)
  })

  it('does not restart the dwell when the collection changes', () => {
    const short = ['grp-a', 'grp-b']
    runShow(short, 0)
    const before = playingId(short)
    runShow([...short, 'grp-c', 'grp-d'], 2)
    // Still holding the pattern it started on, two seconds into a 9999s dwell.
    expect(playingId([...short, 'grp-c', 'grp-d'])).toBe(before)
    expect(getPatternShowSelection('master')!.transitioning).toBe(false)
  })

  // Identity cannot answer this one — the pattern is gone. Position does: the
  // slot's new occupant is closer than dropping back to the top of the list.
  it('hands the slot to its new occupant when the playing pattern is removed', () => {
    runShow(ALL, 0)
    const before = playingId(ALL)
    const survivors = ALL.filter((id) => id !== before)
    const expected = survivors[Math.min(ALL.indexOf(before), survivors.length - 1)]
    runShow(survivors, 0.05)
    expect(playingId(survivors)).toBe(expected)
  })
})

describe('stepping a running show', () => {
  beforeEach(() => resetEvaluatorState())

  /** One frame with Next held or released, returning the LEDs and the named pattern. */
  function step(tick: number, held: boolean) {
    const nodes = [
      node('coll', 'PatternCollection', { patternIds: ALL }),
      node('master', 'PatternMaster', { order: 'Sequential', minTime: 9999, maxTime: 9999, transitionSec: 1, seed: 7 }),
      node('out', 'MatrixOutput', {}),
      node('next', 'Compare', { a: held ? 1 : 0, b: 0.5 }),
    ]
    const edges = [
      edge('e1', 'coll', 'patternset', 'master', 'patternset'),
      edge('e2', 'master', 'frame', 'out', 'frame'),
      edge('e3', 'next', 'result', 'master', 'patternNext'),
    ]
    const outputs = evaluateGraphFull(nodes, edges, tick, 4, 4, GROUPS).outputs.get('master')!
    const selection = (outputs.display as { selection: PatternSelectValue }).selection
    return {
      blue: (outputs.frame as { b: number }[][])[0][0].b,
      named: ALL[selection.activeIndex],
      show: getPatternShowSelection('master')!,
    }
  }

  // A single press while holding gets the show's own transition, and the
  // panel names where the LEDs are heading from the moment they set off.
  it('transitions to the next pattern on a press, naming it at once', () => {
    step(0, false)
    const pressed = step(60, true)
    expect(pressed.show.transitioning).toBe(true)
    expect(ALL[pressed.show.currentIndex]).toBe(ALL[0])
    expect(ALL[pressed.show.nextIndex]).toBe(ALL[1])
    expect(pressed.named).toBe(ALL[1])

    const settled = step(180, false)
    expect(settled.show.transitioning).toBe(false)
    expect(settled.blue).toBe(BLUE[ALL[1]])
    expect(settled.named).toBe(ALL[1])
  })

  // Stepping fast lands on each pattern in turn rather than queueing
  // transitions the fixture is still working through.
  it('cuts straight to the new pattern on a press mid-transition', () => {
    step(0, false)
    step(60, true)
    step(64, false)
    const cut = step(68, true)
    expect(cut.show.transitioning).toBe(false)
    expect(ALL[cut.show.currentIndex]).toBe(ALL[2])
    expect(cut.named).toBe(ALL[2])
    expect(cut.blue).toBe(BLUE[ALL[2]])
  })

  it('keeps the stepped pattern for a whole dwell', () => {
    step(0, false)
    step(60, true)
    step(64, false)
    step(68, true)
    expect(step(600, false).named).toBe(ALL[2])
  })
})

describe('Music Player pattern order', () => {
  beforeEach(() => resetEvaluatorState())

  it('starts at the first collection entry, follows its order and wraps', () => {
    const ids = ['grp-c', 'grp-a', 'grp-d', 'grp-b']
    const props = { order: 'Sequential', minTime: 1, maxTime: 1, transitionSec: 0 }
    for (let i = 0; i <= ids.length; i++) {
      const blue = runShow(ids, i * 1.1 * 60, props)
      expect(playingId(ids)).toBe(ids[i % ids.length])
      expect(blue).toBe(BLUE[ids[i % ids.length]])
    }
  })

  it('preserves the active pattern and dwell when switching order, then advances sequentially', () => {
    const props = { minTime: 1, maxTime: 1, transitionSec: 0 }
    runShow(ALL, 0, props)
    const before = playingId(ALL)
    runShow(ALL, 0.5 * 60, { ...props, order: 'Sequential' })
    expect(playingId(ALL)).toBe(before)
    runShow(ALL, 1.1 * 60, { ...props, order: 'Sequential' })
    expect(playingId(ALL)).toBe(ALL[(ALL.indexOf(before) + 1) % ALL.length])
  })

  it.each([undefined, 'Random', 'invalid'])('plays randomly without immediate repeats for order %s', (order) => {
    const props = { order, minTime: 1, maxTime: 1, transitionSec: 0 }
    runShow(ALL, 0, props)
    let before = playingId(ALL)
    const visited: string[] = []
    for (let i = 1; i <= 12; i++) {
      runShow(ALL, i * 1.1 * 60, props)
      const after = playingId(ALL)
      expect(after).not.toBe(before)
      visited.push(after)
      before = after
    }
    // Random playback must offer jumps as well as never repeating immediately.
    expect(visited.some((id, i) => i > 0 && id !== ALL[(ALL.indexOf(visited[i - 1]) + 1) % ALL.length])).toBe(true)
  })

  it.each(['Random', 'Sequential'])('keeps a single-pattern collection playing in %s mode', (order) => {
    const props = { order, minTime: 1, maxTime: 1, transitionSec: 0 }
    runShow(['grp-c'], 0, props)
    expect(runShow(['grp-c'], 10 * 60, props)).toBe(BLUE['grp-c'])
    expect(playingId(['grp-c'])).toBe('grp-c')
  })
})

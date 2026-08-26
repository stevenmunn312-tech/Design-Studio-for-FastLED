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
import { evaluateGraph, getPatternShowSelection, resetEvaluatorState } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { StudioNode, StudioEdge } from '../graphStore'

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
function runShow(ids: string[], t: number): number {
  // A dwell far longer than the test holds the show on one pattern, so any
  // change of pattern is the collection edit rather than the show advancing.
  const collection = node('coll', 'PatternCollection', { patternIds: ids })
  const master = node('master', 'PatternMaster', { minTime: 9999, maxTime: 9999, transitionSec: 1, seed: 7 })
  const out = node('out', 'MatrixOutput', {})
  const frame = evaluateGraph(
    [collection, master, out],
    [
      edge('e1', 'coll', 'patternset', 'master', 'patternset'),
      edge('e2', 'master', 'frame', 'out', 'frame'),
    ],
    t, 4, 4, GROUPS,
  )
  return frame![0][0].b
}

/** The id the show is currently playing, from its live selection. */
function playingId(ids: string[]): string {
  return ids[getPatternShowSelection('master')!.currentIndex]
}

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

  it('reports a highlight alongside the playing pattern', () => {
    runShow(ALL, 0)
    const view = getPatternShowSelection('master')!
    expect(view.highlightIndex).toBe(view.currentIndex)
    expect(view.browsing).toBe(false)
  })
})

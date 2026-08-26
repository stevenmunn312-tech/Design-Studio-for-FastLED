// The player owns the selection, not the panel.
//
// The first build put Select and Confirm on the Info Display and let it keep
// its own cursor. It drew correctly and modelled the wrong thing: confirming
// changed what the panel *said* while the LEDs carried on with the show's own
// rotation. These pin the fix — one cursor, on the player, reached through
// Player Controls, which is where physical inputs become intent.

import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { ENCODER_COUNTS_PER_STEP, type PatternSelectValue } from '../patternSelection'
import type { StudioNode, StudioEdge } from '../graphStore'
import { useHardwareInputStore } from '../hardwareInputStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'show', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

const solid = (blue: number) => ({
  nodes: [node('c', 'SolidColor', { r: 0, g: 0, b: blue }), node('o', 'GroupOutput')],
  edges: [edge('e', 'c', 'frame', 'o', 'frame')],
})
const IDS = ['a', 'b', 'c', 'd']
const GROUPS = Object.fromEntries(IDS.map((id, i) => [id, solid(30 + i * 40)]))

/** Collection -> player -> output, with Player Controls in front of the player. */
function build(controlProps: Record<string, unknown> = {}) {
  const nodes = [
    node('coll', 'PatternCollection', { patternIds: IDS }),
    node('ctl', 'PlayerControls', { debounceMs: 0, ...controlProps }),
    node('master', 'PatternMaster', { minTime: 9999, maxTime: 9999, transitionSec: 0, seed: 5 }),
    node('out', 'MatrixOutput', {}),
    node('enc', 'EncoderInput', { pinA: 1, pinB: 2, pinSW: 3 }),
    node('btn', 'ButtonInput', { pin: 4 }),
  ]
  const edges = [
    edge('e1', 'coll', 'patternset', 'master', 'patternset'),
    edge('e2', 'ctl', 'controls', 'master', 'controls'),
    edge('e3', 'master', 'frame', 'out', 'frame'),
    edge('e4', 'enc', 'position', 'ctl', 'patternSelect'),
    edge('e5', 'btn', 'pressed', 'ctl', 'patternConfirm'),
  ]
  return { nodes, edges }
}

const run = (nodes: StudioNode[], edges: StudioEdge[], t: number) =>
  evaluateGraphFull(nodes, edges, t, 4, 4, GROUPS)

const selectOf = (nodes: StudioNode[], edges: StudioEdge[], t: number) =>
  run(nodes, edges, t).outputs.get('master')?.patternSelect as PatternSelectValue

const turn = (counts: number) =>
  useHardwareInputStore.getState().setEncoder('enc', { position: counts })
const press = (down: boolean) => useHardwareInputStore.getState().setButton('btn', down)

describe('the player publishes the selection', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useHardwareInputStore.setState({ button: new Map(), pot: new Map(), encoder: new Map() })
  })

  it('carries the collection, the names and both cursors', () => {
    const { nodes, edges } = build()
    const value = selectOf(nodes, edges, 0)
    expect(value.ids).toEqual(IDS)
    expect(value.count).toBe(4)
    expect(value.activeIndex).toBeGreaterThanOrEqual(0)
    expect(value.highlightIndex).toBe(value.activeIndex)
    expect(value.browsing).toBe(false)
  })

  it('publishes nothing selectable for an empty collection', () => {
    const nodes = [
      node('coll', 'PatternCollection', { patternIds: [] }),
      node('master', 'PatternMaster', {}),
      node('out', 'MatrixOutput', {}),
    ]
    const edges = [
      edge('e1', 'coll', 'patternset', 'master', 'patternset'),
      edge('e3', 'master', 'frame', 'out', 'frame'),
    ]
    expect(selectOf(nodes, edges, 0)).toMatchObject({ count: 0, activeIndex: -1 })
  })
})

describe('an encoder through Player Controls', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useHardwareInputStore.setState({ button: new Map(), pot: new Map(), encoder: new Map() })
  })

  it('moves the highlight without changing what is playing', () => {
    const { nodes, edges } = build()
    turn(0)
    const before = selectOf(nodes, edges, 0)

    turn(ENCODER_COUNTS_PER_STEP * 2)
    const after = selectOf(nodes, edges, 0.1)

    expect(after.highlightIndex).not.toBe(before.highlightIndex)
    expect(after.activeIndex).toBe(before.activeIndex)
    expect(after.browsing).toBe(true)
  })

  // The whole point of the refactor: the player owns the cursor, so confirming
  // moves what is *running*, not only what the panel says.
  it('commits the highlight on a confirm press', () => {
    const { nodes, edges } = build()
    turn(0)
    const before = selectOf(nodes, edges, 0)

    turn(ENCODER_COUNTS_PER_STEP * 2)
    const browsing = selectOf(nodes, edges, 0.1)
    expect(browsing.activeIndex).toBe(before.activeIndex)

    press(true)
    const committed = selectOf(nodes, edges, 0.2)
    expect(committed.activeIndex).toBe(browsing.highlightIndex)
    expect(committed.browsing).toBe(false)
  })

  it('does not step on the first reading, whatever the knob was parked at', () => {
    const { nodes, edges } = build()
    turn(37)
    const first = selectOf(nodes, edges, 0)
    expect(first.highlightIndex).toBe(first.activeIndex)
  })
})

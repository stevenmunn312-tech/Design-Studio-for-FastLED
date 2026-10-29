import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../../../state/graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { collectionProfiles } from '../../../state/patterns/patternPick'
import type { StudioNode, StudioEdge } from '../../../state/graphStore'

// Wrap the collection-profile resolver so a frame can be asked how often the
// Music Player read its wired collection: it needs the answer for the pick
// table and the energy-band switch, which are the same answer.
vi.mock('../../../state/patterns/patternPick', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../state/patterns/patternPick')>()
  return { ...actual, collectionProfiles: vi.fn(actual.collectionProfiles) }
})

function node(id: string, type: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === type)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: type, nodeType: type, category: definition?.category ?? 'graph',
    properties: { ...libraryDefaults(type), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${target}`, source, sourceHandle, target, targetHandle })

afterEach(() => resetEvaluatorState())

describe('Music Player collection profiles', () => {
  it('resolves the wired collection once per frame', () => {
    const group = (blue: number) => ({ nodes: [node('solid', 'SolidColor', { r: 0, g: 0, b: blue }), node('go', 'GroupOutput')],
      edges: [edge('solid', 'frame', 'go', 'frame')] })
    const groups = { a: group(10), b: group(20) }
    const nodes = [node('pc', 'PatternCollection', { patternIds: ['a', 'b'] }),
      node('player', 'PatternMaster', { order: 'Sequential', minTime: 1, maxTime: 1, transitionSec: 0, beatTransitions: false }),
      node('out', 'MatrixOutput')]
    const edges = [edge('pc', 'patternset', 'player', 'patternset'), edge('player', 'frame', 'out', 'frame')]
    const spy = vi.mocked(collectionProfiles)
    spy.mockClear()
    evaluateGraphFull(nodes, edges, 0, 4, 4, groups, true, true, '', null, 0)
    const perFrame = spy.mock.calls.length
    spy.mockClear()
    evaluateGraphFull(nodes, edges, 60, 4, 4, groups, true, true, '', null, 60)
    expect(spy.mock.calls.length).toBe(perFrame)
    expect(perFrame).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import {
  activePatternGroupIdFromPreview,
  activeStagePatternEngineId,
  activeStagePatternName,
  libraryLookup,
} from '../stagePatternName'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studio',
    position: { x: 0, y: 0 },
    data: { nodeType, label: nodeType, properties },
  } as StudioNode
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle }
}

const nodes = [
  node('collection', 'PatternCollection', { patternIds: ['group-a', 'group-b'] }),
  node('show', 'PatternSlideshow'),
  node('output', 'MatrixOutput'),
]
const edges = [
  edge('collection-show', 'collection', 'patternset', 'show', 'patternset'),
  edge('show-output', 'show', 'frame', 'output', 'frame'),
]
const graphs = {
  'group-a': { id: 'group-a', name: 'Polar Bloom', sourcePatternId: 'pattern-a' },
  'group-b': { id: 'group-b', name: 'Prism Storm', sourcePatternId: 'pattern-b' },
}
const library = libraryLookup([
  { id: 'pattern-a', name: 'Polar Bloom' },
  { id: 'pattern-b', name: 'Prism Storm' },
])

describe('Stage pattern name', () => {
  it('reads the active group from the published show selection', () => {
    const outputs = new Map<string, Record<string, unknown>>([
      ['show', { patternSelect: {
        ids: ['group-a', 'group-b'],
        names: ['Polar Bloom', 'Prism Storm'],
        activeIndex: 1,
        highlightIndex: 1,
        count: 2,
        browsing: false,
      } }],
    ])

    expect(activeStagePatternEngineId(nodes, edges, 'output')).toBe('show')
    expect(activePatternGroupIdFromPreview(outputs, 'show')).toBe('group-b')
    expect(activeStagePatternName(
      nodes,
      edges,
      graphs,
      library.ids,
      library.nameCounts,
      null,
      0,
      'output',
      activePatternGroupIdFromPreview(outputs, 'show'),
    )).toBe('Prism Storm')
  })

  it('falls back to the first pattern until a live selection is published', () => {
    expect(activeStagePatternName(
      nodes,
      edges,
      graphs,
      library.ids,
      library.nameCounts,
      null,
      0,
      'output',
      null,
    )).toBe('Polar Bloom')
  })
})

import { describe, expect, it } from 'vitest'
import { sequenceTableCpp } from '../player/patternSequenceCpp'
import { generateShowSketch } from '../showGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { PatternStep } from '../../state/patterns/patternSequence'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/graphEvaluator'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'pattern',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const groups: GroupRegistry = {
  g0: { nodes: [node('a', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')], edges: [edge('a', 'frame', 'go', 'frame')] },
  g1: { nodes: [node('b', 'Rainbow'), node('go', 'GroupOutput')], edges: [edge('b', 'frame', 'go', 'frame')] },
} as unknown as GroupRegistry

const step = (index: number): PatternStep => ({ index, hold: 1, transitionSec: 0, transition: 'cut' })

describe('sequence step table', () => {
  it('counts more than 255 steps without wrapping', () => {
    const steps = Array.from({ length: 300 }, (_, i) => step(i % 2))
    const table = sequenceTableCpp(steps)
    expect(table).toContain('static const uint16_t SEQ_COUNT = 300;')
    expect(table).not.toContain('uint8_t SEQ_COUNT')
  })

  it('walks the show sequence with a 16-bit step cursor', () => {
    const sequence = [
      { patternId: 'g0', hold: 4, transitionSec: 1, transition: 'crossfade' },
      { patternId: 'g1', hold: 4, transitionSec: 1, transition: 'crossfade' },
    ]
    const nodes = [
      node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1, order: 'Sequence', sequence }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ]
    const sketch = generateShowSketch(nodes, [edge('pc', 'patternset', 'pm', 'patternset'), edge('pm', 'frame', 'out', 'frame')], groups)
    expect(sketch).toContain('static const uint16_t SEQ_COUNT = 2;')
    expect(sketch).toContain('static uint16_t seqStep = 0;')
    expect(sketch).toContain('seqStep = (uint16_t)(nextStep % SEQ_COUNT);')
    expect(sketch).toContain('seqStep = (uint16_t)((seqStep + 1) % SEQ_COUNT);')
    expect(sketch).not.toMatch(/uint8_t seqStep|\(uint8_t\)\(\(seqStep/)
  })
})

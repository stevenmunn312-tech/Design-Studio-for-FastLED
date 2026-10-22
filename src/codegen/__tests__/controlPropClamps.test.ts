import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { createControlGraph, controlGraphCpp } from '../controlGraph'
import { generateCpp } from '../cppGenerator'

// Unwired properties fold to literals in the firmware. A saved value outside
// the node's range, or a non-number, has to land on a literal the C++ can run.

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'signal',
      properties: { ...libraryDefaults(nodeType), ...props },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

function edge(id: string, source: string, target: string, sh: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

function pulseDividerCpp(divideBy: number): string {
  const nodes = [
    node('lfo', 'LFO'),
    node('trd', 'Trigger', { triggerOp: 'pulseDivider', divideBy }),
    node('bg', 'SolidColor', { r: 255, g: 255, b: 255 }),
    node('bm', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 }),
  ]
  const edges = [
    edge('t0', 'lfo', 'trd', 'value', 'trigger'),
    edge('t1', 'bg', 'bm', 'frame', 'frame'),
    edge('t2', 'trd', 'bm', 'out', 'brightness'),
    edge('t3', 'bm', 'out', 'frame', 'frame'),
  ]
  return generateCpp(nodes, edges)
}

describe('Trigger pulse divider', () => {
  it('caps divideBy at the uint8_t counter so the output can still fire', () => {
    expect(pulseDividerCpp(300)).toContain('_trC_trd >= 255')
    expect(pulseDividerCpp(4)).toContain('_trC_trd >= 4')
  })
})

describe('Noise signal octaves', () => {
  // The control graph hands a timed node its saved properties as they are, so
  // a non-numeric octave count reaches the emitter.
  it('falls back to one octave for a non-numeric value on the control graph', () => {
    const graph = createControlGraph([node('sig', 'NoiseSignal', { octaves: 'abc' })], [])
    expect(graph.resolve('sig', 'value', 'float')).not.toBeNull()
    const loop = controlGraphCpp(graph).loop.join('\n')
    expect(loop).not.toContain('NaN')
    expect(loop).toContain('_o < 1;')
  })
})

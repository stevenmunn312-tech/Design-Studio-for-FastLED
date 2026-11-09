import { describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { trebleSparksFadeBy } from '../trebleSparks'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category, properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

describe('Treble Sparks fade', () => {
  it('lets sparks linger when the treble is quiet and keeps them crisp when it is loud', () => {
    // The preview once kept more as treble fell while the sketch kept less.
    const quiet = 256 - trebleSparksFadeBy(0)
    const loud = 256 - trebleSparksFadeBy(1)
    expect(quiet).toBeGreaterThan(loud)
    expect(quiet / 256).toBeCloseTo(0.74, 2)
    expect(loud / 256).toBeCloseTo(0.58, 2)
  })

  it('emits the same fade amount the preview uses', () => {
    const cpp = generateCpp([
      node('ts', 'TrebleSparks', 'audioReactive', { treble: 0.25, density: 0.5 }),
      node('out', 'MatrixOutput', 'output', { width: 8, height: 8 }),
    ], [{ id: 'e', source: 'ts', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' } as unknown as StudioEdge])
    const match = cpp.match(/fadeToBlackBy\(\w+, NUM_LEDS, \(uint8_t\)\((\d+) - \(1\.0f - \(constrain\(_t, 0\.0f, 1\.0f\)\)\) \* (\d+)\)\);/)
    expect(match).not.toBeNull()
    const [, loudBy, span] = match!.map(Number)
    for (const level of [0, 0.25, 0.5, 1]) {
      expect(Math.trunc(loudBy - (1 - level) * span)).toBe(trebleSparksFadeBy(level))
    }
  })
})

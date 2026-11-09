import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY } from '../../state/nodeLibrary'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [] },
  } as unknown as StudioNode
}

const sketch = (nodeType: string, category: string, props: Record<string, unknown> = {}) => generateCpp([
  node('p', nodeType, category, props),
  node('out', 'MatrixOutput', 'output', { width: 8, height: 8 }),
], [{ id: 'e', source: 'p', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' } as unknown as StudioEdge])

describe('boot entropy', () => {
  it('seeds FastLED random at boot so a free-running pattern differs after each power-up', () => {
    const cpp = sketch('Confetti', 'pattern', { seed: 0 })
    expect(cpp).toMatch(/random8\(|random16\(/)
    const setup = cpp.slice(cpp.indexOf('void setup() {'))
    expect(setup).toContain('random16_add_entropy(esp_random());')
    expect(cpp).toContain('#include <esp_random.h>')
    // The include comes before anything that calls esp_random().
    expect(cpp.indexOf('#include <esp_random.h>')).toBeLessThan(cpp.indexOf('void setup() {'))
  })

  it('keeps a fixed seed repeatable: a seeded node draws from its own generator', () => {
    const cpp = sketch('Confetti', 'pattern', { seed: 7 })
    expect(cpp).toContain('static uint32_t _rng_p=7u;')
    expect(cpp).not.toContain('random16_add_entropy')
  })

  it('adds nothing to a sketch that calls no random generator', () => {
    const cpp = sketch('Rainbow', 'pattern')
    expect(cpp).not.toContain('random16_add_entropy')
    expect(cpp).not.toContain('esp_random')
  })
})

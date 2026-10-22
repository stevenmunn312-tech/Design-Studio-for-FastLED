import { describe, it, expect } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import type { StudioNode, StudioEdge } from '../../../state/graphStore'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const wire = { id: 'e', source: 'p', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' } as unknown as StudioEdge

describe('Particles spawn counts', () => {
  // The preview spawns Math.round(rate * k) a frame; truncating dropped one
  // whenever the fraction passed a half (11 rather than 12 sparkles, say).
  it.each([
    ['sparkle', '_rate*WIDTH*0.8f'],
    ['confetti', '_rate*4'],
    ['waterfall', '_rate*3'],
  ])('%s rounds its spawn count as the preview does', (particleType, product) => {
    const cpp = generateCpp([node('p', 'Particles', 'pattern', { particleType }), node('out', 'MatrixOutput', 'output', { width: 16, height: 16 })], [wire])
    expect(cpp).toContain(`int _sp=max(1,(int)floorf(${product}+0.5f));`)
  })
})

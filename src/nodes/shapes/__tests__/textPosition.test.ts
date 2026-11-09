import { describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [] },
  } as unknown as StudioNode
}

const edge = (id: string, source: string, sh: string, target: string, th: string) =>
  ({ id, source, target, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

describe('Text position above 1', () => {
  // The preview reads a value above 1 as a pixel position (normalizedCenterAxis),
  // as Shape and the analog clock do on the board. Text treated it as a
  // fraction in firmware, so a wired x of 6 put the text far off-screen.
  const sketch = (props: Record<string, unknown>, wireY: boolean) => generateCpp([
    node('tx', 'Text', 'pattern', { text: 'HI', ...props }),
    node('w', 'Wave', 'signal'),
    node('out', 'MatrixOutput', 'output', { width: 16, height: 8 }),
  ], [
    edge('e1', 'tx', 'frame', 'out', 'frame'),
    ...(wireY ? [edge('e2', 'w', 'result', 'tx', 'y')] : []),
  ])
  const line = (cpp: string, name: string) => cpp.split('\n').find((l) => l.includes(`int ${name} = (int)`))!

  it('resolves a literal pixel position at generation time', () => {
    const sx = line(sketch({ x: 5 }, false), '_sx_0')
    expect(sx).not.toContain('> 1.0f ?')
    const run = compileCppSnippet([sx], ['WIDTH', '_tn_tx_0'], ['_sx_0'])
    // Centred on pixel 5: a 7-pixel run starts at floor(5 - 3.5) = 1.
    expect(run(0, { WIDTH: 16, _tn_tx_0: 7 })._sx_0).toBe(1)
  })

  it('keeps a literal fraction unchanged', () => {
    expect(line(sketch({ x: 0.5 }, false), '_sx_0')).not.toContain('> 1.0f ?')
  })

  it('tests a wired value in the sketch', () => {
    const sy = line(sketch({}, true), '_sy')
    expect(sy).toContain('> 1.0f ?')
    const name = sy.match(/\(\(([A-Za-z_]\w*)\) > 1\.0f \?/)![1]
    const run = compileCppSnippet([sy], ['HEIGHT', name], ['_sy'])
    // A 5-pixel-high line centred on pixel 6 starts at floor(6 - 2.5) = 3.
    expect(run(0, { HEIGHT: 8, [name]: 6 })._sy).toBe(3)
    // Half way down an 8-row matrix is a fraction, as before.
    expect(run(0, { HEIGHT: 8, [name]: 0.5 })._sy).toBe(Math.floor(0.5 - 3.5 + 0.5 * (7 + 7) - 2.5))
  })
})

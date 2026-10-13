import { describe, expect, it } from 'vitest'
import { sanitizeWorkspacePayload } from '../workspacePayload'

const node = (id: string) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: id, nodeType: 'Rainbow', category: 'pattern', properties: {}, inputs: [], outputs: [] },
})

describe('sanitizeWorkspacePayload', () => {
  it('drops an edge missing a handle instead of loading it as a silent no-op', () => {
    // The evaluator ignores an edge without both handles, so keeping one here
    // would leave the downstream port on its default with nothing reported.
    const sanitized = sanitizeWorkspacePayload({
      nodes: [node('a'), node('b')],
      edges: [
        { id: 'ok', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'frame' },
        { id: 'no-target-handle', source: 'a', target: 'b', sourceHandle: 'out' },
        { id: 'null-source-handle', source: 'a', target: 'b', sourceHandle: null, targetHandle: 'frame' },
      ],
    })!
    expect(sanitized.workspace.edges.map((edge) => edge.id)).toEqual(['ok'])
    expect(sanitized.dropped).toBe(2)
  })
})

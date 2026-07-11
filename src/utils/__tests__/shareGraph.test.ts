import { describe, it, expect, afterEach } from 'vitest'
import { buildShareUrl, readSharedWorkspace, clearShareHash } from '../shareGraph'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

const workspace = {
  nodes: [{ id: 'n1', type: 'studioNode', position: { x: 0, y: 0 }, data: { nodeType: 'SolidColor', category: 'pattern', label: 'Solid', properties: {} } }] as unknown as StudioNode[],
  edges: [] as StudioEdge[],
  graphData: {},
  graphs: {},
  activeGraphId: 'root',
}

afterEach(() => clearShareHash())

describe('shareGraph', () => {
  it('round-trips a workspace through the URL hash', () => {
    const url = buildShareUrl(workspace)
    const hash = new URL(url).hash
    window.location.hash = hash

    const decoded = readSharedWorkspace()
    expect(decoded).toEqual(workspace)
  })

  it('returns null when there is no share hash', () => {
    clearShareHash()
    expect(readSharedWorkspace()).toBeNull()
  })

  it('returns null for a corrupt share hash', () => {
    window.location.hash = 'share=not-valid-compressed-data'
    expect(readSharedWorkspace()).toBeNull()
  })
})

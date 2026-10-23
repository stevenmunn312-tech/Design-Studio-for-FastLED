import { describe, expect, it } from 'vitest'
import { withFreshBoardLink } from '../boardLinkCopy'
import { boardLinkSettings } from '../boardLinkKey'
import { ROOT_GRAPH_ID, type StudioNode } from '../../graphStore'
import type { PersistedWorkspace } from '../../workspacePersistence'

/*
 * A copied project gets its own board link id, so its boards and the
 * original's never accept each other's frames. See docs/design/board-links.md.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const linkIdOf = (nodes: readonly StudioNode[]) =>
  boardLinkSettings(nodes.find((entry) => entry.id === 'board-root')?.data.properties).linkId

describe('withFreshBoardLink', () => {
  it('gives a linked copy a new id on the primary Board and leaves the original alone', () => {
    const original: PersistedWorkspace = {
      nodes: [node('board-root', 'Board', { linkId: '0a1b2c3d', linkChannel: 6 }), node('board-2', 'Board'), node('p', 'Rainbow')],
      edges: [],
    }
    const fresh = withFreshBoardLink(original)!
    expect(fresh.linkId).toMatch(/^[0-9a-f]{8}$/)
    expect(fresh.linkId).not.toBe('0a1b2c3d')
    expect(linkIdOf(fresh.workspace.nodes)).toBe(fresh.linkId)
    // The channel is a setting, not identity: it travels with the copy.
    expect(fresh.workspace.nodes[0].data.properties.linkChannel).toBe(6)
    expect(linkIdOf(original.nodes)).toBe('0a1b2c3d')
  })

  it('finds the root graph while a pattern group is open', () => {
    const workspace = {
      nodes: [node('inner', 'Rainbow')],
      edges: [],
      activeGraphId: 'group-1',
      graphData: { [ROOT_GRAPH_ID]: { nodes: [node('board-root', 'Board', { linkId: '0a1b2c3d' })], edges: [] } },
    } as unknown as PersistedWorkspace
    const fresh = withFreshBoardLink(workspace)!
    expect(linkIdOf(fresh.workspace.graphData![ROOT_GRAPH_ID].nodes)).toBe(fresh.linkId)
    expect(fresh.workspace.nodes).toBe(workspace.nodes)
  })

  it('changes nothing for a project with no link yet', () => {
    expect(withFreshBoardLink({ nodes: [node('board-root', 'Board')], edges: [] })).toBeNull()
  })
})

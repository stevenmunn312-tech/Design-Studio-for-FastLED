import { describe, it, expect } from 'vitest'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import {
  boardIdOf,
  boardMembership,
  boardNodesIn,
  boardPartition,
  findCrossBoardIssues,
  isBoardAttachedNodeType,
  primaryBoardId,
} from '../boardPartition'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(source: string, target: string): StudioEdge {
  return { id: `e-${source}-${target}`, source, target, sourceHandle: 'out', targetHandle: 'in' } as StudioEdge
}

const ids = (nodes: readonly StudioNode[]) => nodes.map((n) => n.id)

describe('boardPartition — board identity', () => {
  it('lists boards with the primary first whatever the root order', () => {
    const nodes = [node('board-2', 'Board'), node('p', 'SolidColor'), node('board-root', 'Board')]
    expect(ids(boardNodesIn(nodes))).toEqual(['board-root', 'board-2'])
    expect(primaryBoardId(nodes)).toBe('board-root')
  })

  it('takes the first Board as primary when none is board-root', () => {
    const nodes = [node('b1', 'Board'), node('b2', 'Board')]
    expect(primaryBoardId(nodes)).toBe('b1')
    expect(primaryBoardId([])).toBe('board-root')
  })

  it('reads a part boardId, falling back to the primary when it names no Board', () => {
    const boards = new Set(['board-root', 'board-2'])
    expect(boardIdOf(node('o', 'MatrixOutput', { boardId: 'board-2' }), 'board-root', boards)).toBe('board-2')
    expect(boardIdOf(node('o', 'MatrixOutput', { boardId: 'board-9' }), 'board-root', boards)).toBe('board-root')
    expect(boardIdOf(node('o', 'MatrixOutput'), 'board-root', boards)).toBe('board-root')
    expect(boardIdOf(node('o', 'MatrixOutput', { boardId: 7 }), 'board-root', boards)).toBe('board-root')
  })

  it('attaches parts and outputs but not the Board or signal nodes', () => {
    expect(isBoardAttachedNodeType('MatrixOutput')).toBe(true)
    expect(isBoardAttachedNodeType('PotInput')).toBe(true)
    expect(isBoardAttachedNodeType('SDCard')).toBe(true)
    expect(isBoardAttachedNodeType('EthernetModule')).toBe(true)
    expect(isBoardAttachedNodeType('TransportDisplay')).toBe(true)
    expect(isBoardAttachedNodeType('Board')).toBe(false)
    expect(isBoardAttachedNodeType('SolidColor')).toBe(false)
    expect(isBoardAttachedNodeType('Group')).toBe(false)
  })
})

describe('boardPartition — single board', () => {
  it('partitions a one-board project to the whole graph', () => {
    const nodes = [
      node('board-root', 'Board'),
      node('p', 'SolidColor'),
      node('o', 'MatrixOutput'),
      node('orphan', 'Rainbow'),
      node('pot', 'PotInput'),
    ]
    const edges = [edge('p', 'o')]
    const part = boardPartition(nodes, edges, 'board-root')
    expect(part.board?.id).toBe('board-root')
    expect(ids(part.nodes)).toEqual(ids(nodes))
    expect(part.edges).toEqual(edges)
    expect(findCrossBoardIssues(nodes, edges)).toEqual([])
  })

  it('returns the whole graph with no board when the graph has none', () => {
    const nodes = [node('p', 'SolidColor'), node('o', 'MatrixOutput')]
    const part = boardPartition(nodes, [], 'board-root')
    expect(part.board).toBeNull()
    expect(ids(part.nodes)).toEqual(['p', 'o'])
  })
})

describe('boardPartition — two boards', () => {
  const nodes = [
    node('board-root', 'Board'),
    node('board-2', 'Board'),
    node('shared', 'SolidColor'),
    node('onlyA', 'Rainbow'),
    node('onlyB', 'Noise'),
    node('orphan', 'Plasma'),
    node('outA', 'MatrixOutput'),
    node('outB', 'MatrixOutput', { boardId: 'board-2' }),
    node('potB', 'PotInput', { boardId: 'board-2' }),
    node('sdA', 'SDCard'),
    node('group', 'Group'),
  ]
  const edges = [
    edge('shared', 'outA'),
    edge('shared', 'outB'),
    edge('onlyA', 'outA'),
    edge('onlyB', 'outB'),
    edge('group', 'onlyB'),
  ]

  it('splits outputs and parts by attachment', () => {
    const a = boardPartition(nodes, edges, 'board-root')
    const b = boardPartition(nodes, edges, 'board-2')
    expect(ids(a.nodes)).toContain('outA')
    expect(ids(a.nodes)).toContain('sdA')
    expect(ids(a.nodes)).not.toContain('outB')
    expect(ids(a.nodes)).not.toContain('potB')
    expect(ids(a.nodes)).not.toContain('board-2')
    expect(ids(b.nodes)).toEqual(['board-2', 'shared', 'onlyB', 'orphan', 'outB', 'potB', 'group'])
  })

  it('lands a shared pattern in both partitions and a private one in its own', () => {
    const a = boardPartition(nodes, edges, 'board-root')
    const b = boardPartition(nodes, edges, 'board-2')
    expect(ids(a.nodes)).toContain('shared')
    expect(ids(b.nodes)).toContain('shared')
    expect(ids(a.nodes)).toContain('onlyA')
    expect(ids(b.nodes)).not.toContain('onlyA')
    expect(ids(a.nodes)).not.toContain('onlyB')
    // A group is a signal node like any other: it follows its wire.
    expect(ids(b.nodes)).toContain('group')
    expect(ids(a.nodes)).not.toContain('group')
  })

  it('keeps only the edges whose both ends are inside', () => {
    const a = boardPartition(nodes, edges, 'board-root')
    expect(a.edges.map((e) => e.id)).toEqual(['e-shared-outA', 'e-onlyA-outA'])
    const b = boardPartition(nodes, edges, 'board-2')
    expect(b.edges.map((e) => e.id)).toEqual(['e-shared-outB', 'e-onlyB-outB', 'e-group-onlyB'])
  })

  it('gives a node no board reaches to every board', () => {
    expect(ids(boardPartition(nodes, edges, 'board-root').nodes)).toContain('orphan')
    expect(ids(boardPartition(nodes, edges, 'board-2').nodes)).toContain('orphan')
    expect([...boardMembership(nodes, edges).get('orphan')!]).toEqual(['board-root', 'board-2'])
  })

  it('follows a part downstream, so a sink it feeds is that board\'s', () => {
    const withSpeed = [...nodes, node('speed', 'MasterSpeed')]
    const wired = [...edges, edge('potB', 'speed')]
    expect(ids(boardPartition(withSpeed, wired, 'board-2').nodes)).toContain('speed')
    expect(ids(boardPartition(withSpeed, wired, 'board-root').nodes)).not.toContain('speed')
  })

  it('falls back to the primary for a boardId naming a missing Board', () => {
    const withStray = [...nodes, node('outStray', 'MatrixOutput', { boardId: 'board-9' })]
    const a = boardPartition(withStray, edges, 'board-root')
    expect(ids(a.nodes)).toContain('outStray')
    expect(ids(boardPartition(withStray, edges, 'board-2').nodes)).not.toContain('outStray')
    // Asking for the missing board reads as asking for the primary.
    expect(boardPartition(withStray, edges, 'board-9').board?.id).toBe('board-root')
  })

  it('reports a wire from one board part to a pattern only another board shows', () => {
    const wired = [...edges, edge('potB', 'onlyA')]
    const issues = findCrossBoardIssues(nodes, wired)
    expect(issues).toEqual([{
      sourceNodeId: 'potB', targetNodeId: 'outA', sourceBoardId: 'board-2', targetBoardId: 'board-root',
    }])
    // The far side of the wire is not pulled into the primary's partition.
    expect(ids(boardPartition(nodes, wired, 'board-root').nodes)).not.toContain('potB')
  })

  it('reports a part feeding a pattern another board also shows', () => {
    const wired = [...edges, edge('potB', 'shared')]
    expect(findCrossBoardIssues(nodes, wired)).toEqual([{
      sourceNodeId: 'potB', targetNodeId: 'outA', sourceBoardId: 'board-2', targetBoardId: 'board-root',
    }])
    // The pot is board-2's, and the primary's partition stops at it.
    expect(ids(boardPartition(nodes, wired, 'board-root').nodes)).not.toContain('potB')
    expect(ids(boardPartition(nodes, wired, 'board-2').nodes)).toContain('potB')
  })

  it('does not report two boards showing one pattern', () => {
    expect(findCrossBoardIssues(nodes, edges)).toEqual([])
  })

  it('returns the same partition for the same root arrays', () => {
    const first = boardMembership(nodes, edges)
    expect(boardMembership(nodes, edges)).toBe(first)
    expect(boardMembership([...nodes], edges)).not.toBe(first)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore, ROOT_GRAPH_ID, clearStashedGraphHistory, rootGraphNodes, boardPartitionOf } from '../graphStore'
import type { StudioNode, StudioEdge } from '../graphStore'
import { NODE_LIBRARY } from '../nodeLibrary'
import { useUiStore } from '../uiStore'
import { ROOT_BOARD_NODE_ID } from '../../build/hardware'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'pattern', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

function reset(nodes: StudioNode[] = [], edges: StudioEdge[] = []) {
  useGraphStore.setState({
    nodes, edges, selectedNodeId: null, clipboard: null,
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    graphData: {},
    buildProfile: undefined,
    trusted: true,
    performanceDeck: { pins: [], scenes: [], midiBindings: [], keyBindings: [] },
    displayDocuments: {},
    panicActive: false,
    panicRestoreValues: null,
  })
  useUiStore.setState({ activeBoardId: ROOT_BOARD_NODE_ID })
  clearStashedGraphHistory()
}

const boards = () => rootGraphNodes(useGraphStore.getState()).filter((n) => n.data.nodeType === 'Board')
const boardProps = (id: string) => boards().find((n) => n.id === id)?.data.properties as Record<string, unknown> | undefined

describe('graphStore — multi-board', () => {
  beforeEach(() => reset())

  it('keeps an extra Board on load and normalises it like the primary', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin', brightness: 90 }),
      node('board-2', 'Board', { profileId: '', clockSync: 'nonsense', usePsram: true }),
      node('p', 'SolidColor'),
    ], [])
    const second = boards().find((n) => n.id === 'board-2')
    expect(boards().map((n) => n.id)).toEqual(['board-root', 'board-2'])
    expect(second?.hidden).toBe(true)
    expect(second?.selectable).toBe(false)
    expect(second?.draggable).toBe(false)
    const props = second?.data.properties as Record<string, unknown>
    expect(props.profileId).toBe('esp32-generic-devkit-38pin')
    expect(props.clockSync).toBe('off')
    expect(props.brightness).toBe(128)
    expect(props.usePsram).toBeUndefined()
    expect(boardProps('board-root')?.brightness).toBe(90)
    expect(boardProps('board-root')?.clockSync).toBe('off')
    // Loading lands on the primary board.
    expect(useUiStore.getState().activeBoardId).toBe('board-root')
  })

  it('addBoard takes the smallest free id and follows a leading primary', () => {
    useGraphStore.getState().loadGraph([node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' })], [])
    expect(useGraphStore.getState().addBoard()).toBe('board-2')
    expect(useGraphStore.getState().addBoard()).toBe('board-3')
    expect(boardProps('board-2')?.clockSync).toBe('off')
    expect(boards().find((n) => n.id === 'board-3')?.hidden).toBe(true)

    useGraphStore.getState().setBoardClockSync(true)
    expect(boardProps('board-root')?.clockSync).toBe('leader')
    expect(boardProps('board-2')?.clockSync).toBe('follower')
    expect(boardProps('board-3')?.clockSync).toBe('follower')

    expect(useGraphStore.getState().addBoard('esp32-generic-devkit-38pin')).toBe('board-4')
    expect(boardProps('board-4')?.clockSync).toBe('follower')

    useGraphStore.getState().setBoardClockSync(false)
    expect(boards().every((n) => n.data.properties.clockSync === 'off')).toBe(true)

    useGraphStore.getState().removeBoard('board-2')
    expect(useGraphStore.getState().addBoard()).toBe('board-2')
  })

  it('removeBoard takes the board, its parts and their wires, and refuses the primary', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('board-2', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('p', 'SolidColor'),
      node('outA', 'MatrixOutput'),
      node('outB', 'MatrixOutput', { boardId: 'board-2' }),
      node('potB', 'PotInput', { boardId: 'board-2' }),
    ], [
      edge('e1', 'p', 'color', 'outA', 'frame'),
      edge('e2', 'p', 'color', 'outB', 'frame'),
    ])
    useUiStore.getState().setActiveBoardId('board-2')

    useGraphStore.getState().removeBoard('board-root')
    expect(boards().map((n) => n.id)).toEqual(['board-root', 'board-2'])

    useGraphStore.getState().removeBoard('board-2')
    const ids = useGraphStore.getState().nodes.map((n) => n.id)
    expect(ids).toEqual(['board-root', 'p', 'outA'])
    expect(useGraphStore.getState().edges.map((e) => e.id)).toEqual(['e1'])
    // The active board cannot stay on a board that is gone.
    expect(useUiStore.getState().activeBoardId).toBe('board-root')
  })

  it('addNode stamps boardId only when a non-primary board is active', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('board-2', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
    ], [])

    useGraphStore.getState().addNode(node('pot1', 'PotInput'))
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'pot1')?.data.properties.boardId).toBeUndefined()

    useUiStore.getState().setActiveBoardId('board-2')
    useGraphStore.getState().addNode(node('pot2', 'PotInput'))
    useGraphStore.getState().addNode(node('pat', 'SolidColor'))
    useGraphStore.getState().addNode(node('pot3', 'PotInput', { boardId: 'board-root' }))
    const props = (id: string) => useGraphStore.getState().nodes.find((n) => n.id === id)?.data.properties
    expect(props('pot2')?.boardId).toBe('board-2')
    expect(props('pat')?.boardId).toBeUndefined()
    expect(props('pot3')?.boardId).toBe('board-root')

    // A stale active board (no such Board node) stamps nothing.
    useUiStore.getState().setActiveBoardId('board-9')
    useGraphStore.getState().addNode(node('pot4', 'PotInput'))
    expect(props('pot4')?.boardId).toBeUndefined()
  })

  it('stamps a network endpoint added to the root graph, not one inside a group', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('board-2', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
    ], [])
    useUiStore.getState().setActiveBoardId('board-2')
    useGraphStore.getState().addNode(node('remote', 'WebRemoteInput'))
    useGraphStore.getState().addNode(node('stream', 'StreamOutput'))
    const rootProps = (id: string) => rootGraphNodes(useGraphStore.getState()).find((n) => n.id === id)?.data.properties
    expect(rootProps('remote')?.boardId).toBe('board-2')
    expect(rootProps('stream')?.boardId).toBe('board-2')

    // Inside a group, with the two boards stashed in the root graph.
    const { nodes, edges } = useGraphStore.getState()
    useGraphStore.setState({ activeGraphId: 'group-1', nodes: [], edges: [], graphData: { [ROOT_GRAPH_ID]: { nodes, edges } } })
    expect(boards()).toHaveLength(2)
    useGraphStore.getState().addNode(node('dmx', 'DMXInput'))
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'dmx')?.data.properties.boardId).toBeUndefined()
  })

  it('removeBoard moves the network endpoints on it to the primary, keeping their wires', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('board-2', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('outA', 'MatrixOutput'),
      node('ddp', 'DdpInput', { boardId: 'board-2' }),
      node('dmx', 'DMXInput', { boardId: 'board-root' }),
    ], [edge('e1', 'ddp', 'frame', 'outA', 'frame')])
    useGraphStore.getState().removeBoard('board-2')
    const props = (id: string) => useGraphStore.getState().nodes.find((n) => n.id === id)?.data.properties
    expect(useGraphStore.getState().nodes.map((n) => n.id)).toEqual(['board-root', 'outA', 'ddp', 'dmx'])
    expect(props('ddp') && 'boardId' in props('ddp')!).toBe(false)
    expect(props('dmx')?.boardId).toBe('board-root')
    expect(useGraphStore.getState().edges.map((e) => e.id)).toEqual(['e1'])
  })

  it('a one-board project never stamps, so its save reads as before', () => {
    useGraphStore.getState().loadGraph([node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' })], [])
    useUiStore.getState().setActiveBoardId('board-root')
    useGraphStore.getState().addNode(node('pot1', 'PotInput'))
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'pot1')?.data.properties.boardId).toBeUndefined()
  })

  it('the partition selector is stable across unrelated store updates', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('board-2', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('p', 'SolidColor'),
      node('outB', 'MatrixOutput', { boardId: 'board-2' }),
    ], [edge('e1', 'p', 'color', 'outB', 'frame')])

    const first = boardPartitionOf(useGraphStore.getState(), 'board-2')
    expect(first.board?.id).toBe('board-2')
    expect(first.nodes.map((n) => n.id)).toEqual(['board-2', 'p', 'outB'])

    useGraphStore.setState({ selectedNodeId: 'p', clipboard: null })
    expect(boardPartitionOf(useGraphStore.getState(), 'board-2')).toBe(first)
    // Another board's partition is cached on its own.
    expect(boardPartitionOf(useGraphStore.getState(), 'board-root')).not.toBe(first)
    expect(boardPartitionOf(useGraphStore.getState(), 'board-2')).toBe(first)

    useGraphStore.getState().addNode(node('q', 'Rainbow'))
    const after = boardPartitionOf(useGraphStore.getState(), 'board-2')
    expect(after).not.toBe(first)
    // A node no board reaches lands in every partition.
    expect(after.nodes.map((n) => n.id)).toEqual(['board-2', 'p', 'outB', 'q'])
  })
})

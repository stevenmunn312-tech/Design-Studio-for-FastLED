import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useGraphStore, ROOT_GRAPH_ID, clearStashedGraphHistory, rootGraphNodes } from '../graphStore'
import type { StudioNode, StudioEdge } from '../graphStore'
import { NODE_LIBRARY } from '../nodeLibrary'
import { useUiStore } from '../uiStore'
import { useBoardLinkKeyStore } from '../peripherals/boardLinkKey'
import { ROOT_BOARD_NODE_ID } from '../../build/hardware'

/*
 * The board link's id and key: made together by the edit that first links two
 * boards, never by a load, kept out of undo history, and remade on request by
 * `renewBoardLinkKey`. See docs/design/board-links.md.
 */

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

const PROFILE = { profileId: 'esp32-generic-devkit-38pin' }

// Board 1 plays the show; Board 2 has an encoder.
const nodes = (primary: Record<string, unknown> = {}) => [
  node('board-root', 'Board', { ...PROFILE, ...primary }),
  node('board-2', 'Board', PROFILE),
  node('player', 'PatternMaster'),
  node('leds', 'MatrixOutput'),
  node('enc', 'EncoderInput', { boardId: 'board-2' }),
  node('pat', 'SolidColor'),
]
const local = [edge('e-leds', 'player', 'frame', 'leds', 'frame')]
const crossing = edge('e-link', 'enc', 'position', 'player', 'volume')
const crossing2 = edge('e-link-2', 'enc', 'pressed', 'player', 'next')

const primaryProps = () => rootGraphNodes(useGraphStore.getState())
  .find((n) => n.id === 'board-root')?.data.properties as Record<string, unknown>
const keyCount = () => Object.keys(useBoardLinkKeyStore.getState().byLinkId).length
const addEdges = (...added: StudioEdge[]) =>
  useGraphStore.setState((s) => ({ edges: [...s.edges, ...added] }))

function reset() {
  useGraphStore.setState({
    nodes: [], edges: [], selectedNodeId: null, clipboard: null,
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    graphData: {},
    trusted: true,
    displayDocuments: {},
  })
  useUiStore.setState({ activeBoardId: ROOT_BOARD_NODE_ID })
  useBoardLinkKeyStore.setState({ byLinkId: {} })
  localStorage.clear()
  clearStashedGraphHistory()
  useGraphStore.temporal.getState().clear()
}

describe('board link id and key', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reset()
  })
  afterEach(() => vi.useRealTimers())

  it('gives the project an id and a key when a wire first crosses boards', () => {
    useGraphStore.getState().loadGraph(nodes(), local)
    expect(primaryProps().linkId).toBeUndefined()

    addEdges(edge('e-pat', 'pat', 'color', 'player', 'palette'))
    expect(primaryProps().linkId).toBeUndefined()

    addEdges(crossing)
    const linkId = primaryProps().linkId as string
    expect(linkId).toMatch(/^[0-9a-f]{8}$/)
    expect(useBoardLinkKeyStore.getState().byLinkId[linkId]).toMatch(/^[0-9a-f]{32}$/)
    expect(keyCount()).toBe(1)

    // A second linked wire changes neither.
    addEdges(crossing2)
    expect(primaryProps().linkId).toBe(linkId)
    expect(keyCount()).toBe(1)
  })

  it('never assigns on a load, even to a linked project without an id', () => {
    useGraphStore.getState().loadGraph(nodes(), [...local, crossing])
    expect(primaryProps().linkId).toBeUndefined()
    expect(keyCount()).toBe(0)

    // Nor on a later edit: the link was already there, so the repair is the
    // user's to make, through validation.
    addEdges(crossing2)
    useGraphStore.setState((s) => ({ edges: s.edges.filter((e) => e.id !== 'e-link-2') }))
    expect(primaryProps().linkId).toBeUndefined()
    expect(keyCount()).toBe(0)
  })

  it('leaves a loaded id that has no key on this machine keyless', () => {
    useGraphStore.getState().loadGraph(nodes({ linkId: 'abcdef01' }), local)
    addEdges(crossing)
    expect(primaryProps().linkId).toBe('abcdef01')
    expect(keyCount()).toBe(0)
  })

  it('assigns nothing in a one-board project', () => {
    useGraphStore.getState().loadGraph(nodes().filter((n) => n.id !== 'board-2'), local)
    addEdges(crossing)
    expect(primaryProps().linkId).toBeUndefined()
    expect(keyCount()).toBe(0)
  })

  it('rides on the edit that made the link, so undo takes it and redrawing reuses it', () => {
    useGraphStore.getState().loadGraph(nodes(), local)
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()
    addEdges(crossing)
    vi.advanceTimersByTime(400)
    const linkId = primaryProps().linkId as string
    expect(linkId).toBeTruthy()
    // One step for the wire; the id made no step of its own.
    expect(useGraphStore.temporal.getState().pastStates).toHaveLength(1)

    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().edges.map((e) => e.id)).toEqual(['e-leds'])
    expect(primaryProps().linkId).toBeUndefined()

    useGraphStore.temporal.getState().redo()
    expect(primaryProps().linkId).toBe(linkId)

    useGraphStore.temporal.getState().undo()
    addEdges(crossing2)
    expect(primaryProps().linkId).toBe(linkId)
    expect(keyCount()).toBe(1)
  })

  it('renewBoardLinkKey makes a fresh key for the existing id', () => {
    useGraphStore.getState().loadGraph(nodes({ linkId: 'abcdef01' }), [...local, crossing])
    const returned = useGraphStore.getState().renewBoardLinkKey()
    expect(returned).toBe('abcdef01')
    const first = useBoardLinkKeyStore.getState().byLinkId.abcdef01
    expect(first).toMatch(/^[0-9a-f]{32}$/)

    useGraphStore.getState().renewBoardLinkKey()
    expect(useBoardLinkKeyStore.getState().byLinkId.abcdef01).not.toBe(first)
    expect(primaryProps().linkId).toBe('abcdef01')
  })

  it('renewBoardLinkKey gives a project with no id one, with its key', () => {
    useGraphStore.getState().loadGraph(nodes(), [...local, crossing])
    const linkId = useGraphStore.getState().renewBoardLinkKey()
    expect(linkId).toMatch(/^[0-9a-f]{8}$/)
    expect(primaryProps().linkId).toBe(linkId)
    expect(useBoardLinkKeyStore.getState().byLinkId[linkId]).toMatch(/^[0-9a-f]{32}$/)
  })

  it('drops a malformed id and a bad channel on load', () => {
    useGraphStore.getState().loadGraph(nodes({ linkId: 'NOT-HEX', linkChannel: 40 }), local)
    expect(primaryProps().linkId).toBeUndefined()
    expect(primaryProps().linkChannel).toBe(1)
  })
})

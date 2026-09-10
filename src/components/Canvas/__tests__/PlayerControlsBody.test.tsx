import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlayerControlsBody from '../PlayerControlsBody'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { ROOT_GRAPH_ID, useGraphStore, type StudioEdge, type StudioNode } from '../../../state/graphStore'
import { PLAYER_CONTROL_ADD_HANDLE } from '../../../state/playerControlAssignments'

vi.mock('@xyflow/react', () => ({ useUpdateNodeInternals: () => () => {} }))

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType, category: def.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th }) as unknown as StudioEdge

/** A button mid-drop on the trailing socket, waiting to be named. */
function pending(sourceDataType: 'bool' | 'float') {
  useGraphStore.setState({
    pendingControlAssignment: {
      nodeId: 'controls',
      connection: {
        source: 'button', sourceHandle: 'pressed',
        target: 'controls', targetHandle: PLAYER_CONTROL_ADD_HANDLE,
      },
      sourceDataType,
    },
    activeGraphId: ROOT_GRAPH_ID,
  } as never)
}

describe('PlayerControlsBody picker', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
  })

  it('offers only what the chain it feeds can act on', () => {
    // The bundle lands on an LED output, which has a blackout and a dimmer and
    // no transport at all. Offering Play / Pause here mints a port, accepts a
    // wire, passes validation and does nothing.
    useGraphStore.getState().loadGraph(
      [node('button', 'ButtonInput'), node('controls', 'PlayerControls'), node('out', 'MatrixOutput')],
      [edge('chain', 'controls', 'controls', 'out', 'controls')],
    )
    pending('bool')

    render(<PlayerControlsBody nodeId="controls" />)

    expect(screen.getByRole('button', { name: /LED On \/ Off/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Brightness Up/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Play \/ Pause/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Previous Pattern/ })).toBeNull()
  })

  it('offers everything while the Controls output goes nowhere', () => {
    useGraphStore.getState().loadGraph(
      [node('button', 'ButtonInput'), node('controls', 'PlayerControls')],
      [],
    )
    pending('bool')

    render(<PlayerControlsBody nodeId="controls" />)

    expect(screen.getByRole('button', { name: /Play \/ Pause/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /LED On \/ Off/ })).toBeTruthy()
  })

  it('follows a chained Player Controls to the destination at its end', () => {
    useGraphStore.getState().loadGraph(
      [
        node('button', 'ButtonInput'), node('controls', 'PlayerControls'),
        node('downstream', 'PlayerControls'), node('show', 'PatternSlideshow'),
      ],
      [
        edge('link', 'controls', 'controls', 'downstream', 'controlsIn'),
        edge('chain', 'downstream', 'controls', 'show', 'controls'),
      ],
    )
    pending('bool')

    render(<PlayerControlsBody nodeId="controls" />)

    expect(screen.getByRole('button', { name: /Next Pattern/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Play \/ Pause/ })).toBeNull()
  })

  it('refuses a second job to a control that already has one', () => {
    // Reported from the bench: after giving a button Brightness Up, the same
    // button could be dropped again and given Brightness Down — +step and
    // -step in the same frame, netting to nothing.
    useGraphStore.getState().loadGraph(
      [node('button', 'ButtonInput'), node('controls', 'PlayerControls', { controls: ['brightnessUp'] }),
        node('out', 'MatrixOutput')],
      [
        edge('job', 'button', 'pressed', 'controls', 'brightnessUp'),
        edge('chain', 'controls', 'controls', 'out', 'controls'),
      ],
    )
    pending('bool')

    render(<PlayerControlsBody nodeId="controls" />)

    expect(screen.queryByRole('button', { name: /Brightness Down/ })).toBeNull()
    expect(screen.getByText('Already assigned')).toBeTruthy()
    expect(screen.getByText(/This control already has a job on this node/)).toBeTruthy()
  })

  it('still offers the rest to a different control', () => {
    useGraphStore.getState().loadGraph(
      [node('one', 'ButtonInput'), node('two', 'ButtonInput'),
        node('controls', 'PlayerControls', { controls: ['brightnessUp'] }), node('out', 'MatrixOutput')],
      [
        edge('job', 'one', 'pressed', 'controls', 'brightnessUp'),
        edge('chain', 'controls', 'controls', 'out', 'controls'),
      ],
    )
    useGraphStore.setState({
      pendingControlAssignment: {
        nodeId: 'controls',
        connection: { source: 'two', sourceHandle: 'pressed', target: 'controls', targetHandle: PLAYER_CONTROL_ADD_HANDLE },
        sourceDataType: 'bool',
      },
      activeGraphId: ROOT_GRAPH_ID,
    } as never)

    render(<PlayerControlsBody nodeId="controls" />)
    expect(screen.getByRole('button', { name: /Brightness Down/ })).toBeTruthy()
  })

  it('says what an edge is and what a position is', () => {
    useGraphStore.getState().loadGraph([node('controls', 'PlayerControls')], [])
    pending('float')

    render(<PlayerControlsBody nodeId="controls" />)

    expect(screen.getByRole('button', { name: /Volume/ })
      .textContent).toBe('VolumeHolds its position, 0 to 1')
    expect(screen.getByRole('button', { name: /Pattern Selection/ })
      .textContent).toBe('Pattern SelectionTurn — one detent per pattern')
  })

  it('explains a chain whose destination has nothing left of this kind', () => {
    // An LED output's one continuous control is its dimmer, and this node has
    // already been given it — so the honest answer names the destination
    // rather than claiming every continuous function is taken.
    useGraphStore.getState().loadGraph(
      [node('controls', 'PlayerControls', { controls: ['brightness'] }), node('out', 'MatrixOutput')],
      [edge('chain', 'controls', 'controls', 'out', 'controls')],
    )
    pending('float')

    render(<PlayerControlsBody nodeId="controls" />)

    expect(screen.getByText(/Nothing this chain reaches takes a continuous control/)).toBeTruthy()
  })
})

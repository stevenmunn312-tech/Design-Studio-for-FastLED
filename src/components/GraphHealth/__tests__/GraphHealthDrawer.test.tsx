import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor, within } from '@testing-library/react'
import GraphHealthDrawer from '../GraphHealthDrawer'
import { ROOT_GRAPH_ID, useGraphStore, type StudioEdge, type StudioNode } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(source: string, target: string): StudioEdge {
  return { id: `e-${source}-${target}`, source, target, sourceHandle: 'value', targetHandle: 'frame' } as StudioEdge
}

describe('GraphHealthDrawer', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([
      node('random', 'Random', { min: 0, max: 'bad expression' }),
      node('out', 'MatrixOutput', { width: 8, height: 8 }),
    ], [edge('random', 'out')], {
      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    })
    useUiStore.setState({
      graphHealthOpen: true,
      fitViewRequest: { nonce: 0 },
      statusText: 'Ready',
      statusLevel: 'idle',
      workspaceMode: 'graph',
      designWorkspaceView: { kind: 'graph' },
    })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
  })

  it('locates the affected node and frames it on the canvas', () => {
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Random has an invalid expression').closest('article')
    expect(card).not.toBeNull()

    fireEvent.click(within(card!).getByRole('button', { name: 'Locate node' }))

    expect(useGraphStore.getState().selectedNodeId).toBe('random')
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 1, nodeIds: ['random'] })
  })

  // The drawer is open in Hardware and Upload as well, where the canvas is
  // unmounted: locating there framed a view the user was not looking at.
  it('returns to the graph workspace when located from another workspace', () => {
    useUiStore.setState({ workspaceMode: 'upload', hardwarePaneTab: 'upload' })
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Random has an invalid expression').closest('article')

    fireEvent.click(within(card!).getByRole('button', { name: 'Locate node' }))

    expect(useUiStore.getState().workspaceMode).toBe('graph')
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 1, nodeIds: ['random'] })
  })

  // Same for the display editor, which is a sub-view of Graph rather than a
  // workspace of its own — the canvas is equally absent underneath it.
  it('leaves the display editor when located from it', () => {
    useUiStore.setState({ workspaceMode: 'graph', designWorkspaceView: { kind: 'display', displayId: 'panel-1' } })
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Random has an invalid expression').closest('article')

    fireEvent.click(within(card!).getByRole('button', { name: 'Locate node' }))

    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'graph' })
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 1, nodeIds: ['random'] })
  })

  it('rechecks continuously after a property fix', async () => {
    const { getByText, queryByText } = render(<GraphHealthDrawer />)
    expect(getByText('Random has an invalid expression')).toBeTruthy()

    useGraphStore.getState().updateNodeProperty('random', 'max', 1)

    await waitFor(() => expect(queryByText('Random has an invalid expression')).toBeNull())
    expect(getByText('Signal path is healthy')).toBeTruthy()
  })

  it('offers the board picker for an incompatible microphone', () => {
    const openBoardPopup = vi.fn()
    useGraphStore.getState().loadGraph([
      node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 2 }),
    ], [edge('mic', 'out')])
    useUploadStore.setState({ selectedFqbn: 'arduino:avr:uno', openBoardPopup })

    const { getByRole } = render(<GraphHealthDrawer />)
    fireEvent.click(getByRole('button', { name: 'Choose board' }))

    expect(openBoardPopup).toHaveBeenCalledOnce()
  })
})

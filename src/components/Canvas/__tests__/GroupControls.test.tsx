import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import GroupControls from '../GroupControls'
import { useGraphStore, ROOT_GRAPH_ID } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { useUiStore } from '../../../state/uiStore'
import type { StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, selected = false): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    selected,
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'pattern', properties: {},
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function reset(nodes: StudioNode[] = []) {
  useGraphStore.setState({
    nodes, edges: [], selectedNodeId: null,
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    graphData: {},
  } as unknown as Partial<ReturnType<typeof useGraphStore.getState>>)
}

describe('GroupControls — Ctrl/Cmd+G', () => {
  beforeEach(() => {
    reset([node('a', 'Rainbow', true), node('b', 'Fire', true)])
  })

  it('opens the create-group dialog when nodes are selected', () => {
    render(<GroupControls />)
    fireEvent.keyDown(window, { key: 'g', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: 'Create group' })).toBeTruthy()
  })

  it('does nothing when no nodes are selected', () => {
    reset([node('a', 'Rainbow', false)])
    render(<GroupControls />)
    fireEvent.keyDown(window, { key: 'g', ctrlKey: true })
    expect(screen.queryByRole('dialog', { name: 'Create group' })).toBeNull()
  })

  it('ignores the shortcut while typing in a text field', () => {
    render(
      <>
        <input data-testid="text-field" />
        <GroupControls />
      </>,
    )
    const input = screen.getByTestId('text-field')
    input.focus()
    fireEvent.keyDown(input, { key: 'g', ctrlKey: true })
    expect(screen.queryByRole('dialog', { name: 'Create group' })).toBeNull()
  })

  it('also opens on Cmd+G (metaKey)', () => {
    render(<GroupControls />)
    fireEvent.keyDown(window, { key: 'g', metaKey: true })
    expect(screen.getByRole('dialog', { name: 'Create group' })).toBeTruthy()
  })
})

describe('GroupControls — status after grouping', () => {
  const createGroup = async () => {
    render(<GroupControls />)
    fireEvent.click(screen.getByText(/Group \d/))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create Group' })) })
    return useUiStore.getState().statusText
  }

  it('counts the nodes it grouped and names the Audio it left outside', async () => {
    reset([node('a', 'Rainbow', true), node('b', 'Fire', true), node('au', 'Audio', true)])
    const text = await createGroup()
    expect(text).toMatch(/^Grouped 2 nodes into “New Group”/)
    expect(text).toContain('Left out Audio')
    expect(useGraphStore.getState().nodes.some((n) => n.id === 'au')).toBe(true)
  })

  it('says nothing was grouped when only scene sources are selected', async () => {
    reset([node('au', 'Audio', true)])
    const text = await createGroup()
    expect(text).toMatch(/^Nothing to group: Audio/)
    expect(useGraphStore.getState().nodes.some((n) => n.data.nodeType === 'Group')).toBe(false)
  })
})

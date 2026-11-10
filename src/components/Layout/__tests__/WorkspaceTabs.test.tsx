import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import WorkspaceTabs from '../WorkspaceTabs'
import { useGraphStore, type StudioNode } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'

function node(id: string, nodeType: string): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties: {}, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

describe('WorkspaceTabs', () => {
  beforeEach(() => {
    useUiStore.setState({ workspaceMode: 'graph', hardwarePaneTab: 'hardware' })
    useGraphStore.setState({ nodes: [], edges: [] } as never)
  })

  it('offers the four workspaces in build order and lands a session on the graph', () => {
    render(<WorkspaceTabs />)
    // The sequence the work is actually done in: name the hardware, write the
    // effect, flash it, then take the wiring diagram to the bench.
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent))
      .toEqual(['Hardware', 'Graph', 'Upload', 'Build Diagram'])
    expect(screen.getByRole('tab', { name: 'Graph' }).getAttribute('aria-selected')).toBe('true')
  })

  it('tells the hardware pane which half to show', () => {
    render(<WorkspaceTabs />)
    act(() => { screen.getByRole('tab', { name: 'Upload' }).click() })
    expect(useUiStore.getState().workspaceMode).toBe('upload')
    // Hardware and Upload share one pane, so selecting the tab has to carry
    // through to the half it renders.
    expect(useUiStore.getState().hardwarePaneTab).toBe('upload')

    act(() => { screen.getByRole('tab', { name: 'Graph' }).click() })
    expect(useUiStore.getState().workspaceMode).toBe('graph')
    expect(useUiStore.getState().hardwarePaneTab).toBe('upload')
  })

  const updated = () => screen.getAllByRole('tab')
    .filter((tab) => tab.textContent?.includes('updated'))
    .map((tab) => tab.textContent?.replace(/ — updated$/, ''))

  it('announces every workspace a part added elsewhere changes', () => {
    useUiStore.setState({ workspaceMode: 'hardware' })
    render(<WorkspaceTabs />)
    expect(screen.queryByText(/updated/)).toBeNull()

    // Adding hardware puts a node on the Graph, a module on the wiring sheet
    // and a peripheral in the sketch — none of which is on screen.
    act(() => { useGraphStore.setState({ nodes: [node('btn', 'ButtonBank')] } as never) })
    expect(updated()).toEqual(['Graph', 'Upload', 'Build Diagram'])
  })

  it('announces only the graph for a pattern node, which changes nothing on the bench', () => {
    useUiStore.setState({ workspaceMode: 'upload' })
    render(<WorkspaceTabs />)
    act(() => { useGraphStore.setState({ nodes: [node('fire', 'Fire')] } as never) })
    expect(updated()).toEqual(['Graph'])
  })

  it('stays quiet about the workspace already being looked at', () => {
    render(<WorkspaceTabs />)
    act(() => { useGraphStore.setState({ nodes: [node('fire', 'Fire')] } as never) })
    // Editing the graph while looking at it is not news.
    expect(screen.queryByText(/updated/)).toBeNull()
  })

  it('counts parts on the root graph while a pattern group is open', () => {
    useUiStore.setState({ workspaceMode: 'graph' })
    useGraphStore.setState({ activeGraphId: 'group-1', nodes: [], graphData: { root: { nodes: [], edges: [] } } } as never)
    render(<WorkspaceTabs />)
    // A part added from the bench lands on the root graph, not the open group.
    act(() => { useGraphStore.setState({ graphData: { root: { nodes: [node('btn', 'ButtonBank')], edges: [] } } } as never) })
    expect(updated()).toEqual(['Hardware', 'Upload', 'Build Diagram'])
  })
})

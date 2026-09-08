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

  it('offers the four workspaces and lands a session on the graph', () => {
    render(<WorkspaceTabs />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent))
      .toEqual(['Hardware', 'Build Diagram', 'Graph', 'Upload'])
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

  it('announces the graph when a part added elsewhere puts a node in it', () => {
    useUiStore.setState({ workspaceMode: 'hardware' })
    render(<WorkspaceTabs />)
    expect(screen.queryByText(/updated/)).toBeNull()

    // Adding hardware creates a node on a workspace nobody is looking at.
    act(() => { useGraphStore.setState({ nodes: [node('btn', 'ButtonInput')] } as never) })
    expect(screen.getByRole('tab', { name: /Graph/ }).textContent).toContain('updated')
  })

  it('stays quiet about the workspace already being looked at', () => {
    render(<WorkspaceTabs />)
    act(() => { useGraphStore.setState({ nodes: [node('btn', 'ButtonInput')] } as never) })
    // Editing the graph while looking at it is not news.
    expect(screen.queryByText(/updated/)).toBeNull()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import MenuBar from '../MenuBar'
import { useGraphStore } from '../../../state/graphStore'
import { useProjectStore } from '../../../state/projectStore'
import { useUiStore } from '../../../state/uiStore'
import { useAudioStore } from '../../../state/audioStore'
import { useShowPlayback } from '../../../state/showPlayback'
import type { SavedProject } from '../../../state/projectStore'

function project(id: string, name: string, nodeId: string, updatedAt: number): SavedProject {
  return {
    id,
    name,
    createdAt: updatedAt - 1000,
    updatedAt,
    workspace: {
      nodes: [{
        id: nodeId,
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: { label: 'SolidColor', nodeType: 'SolidColor', category: 'pattern', properties: {}, inputs: [], outputs: [] },
      }] as never[],
      edges: [],
    },
  }
}

describe('MenuBar file menu', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null, graphData: {}, graphs: { root: { id: 'root', name: 'Main' } }, activeGraphId: 'root' })
    useUiStore.setState({
      helpOpen: false,
      recoverOpen: false,
      templatesOpen: false,
      projectsOpen: false,
      performanceMode: false,
      stageMode: false,
      uiEffectsEnabled: true,
      signalPathDimEnabled: true,
      preview3d: false,
      previewStyle: 'standard',
      reducedMotion: false,
      highContrast: false,
      theme: 'dark',
    })
    useAudioStore.setState({ micActive: false, active: false })
    useShowPlayback.setState({ playing: false, nodeId: null, show: null, posMs: 0, useGroupInputs: false })
  })

  it('shows a File dropdown with project actions and recents', () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const pg = project('pg', 'pg', 'pg-node', 100)
    useProjectStore.setState({ projects: [alpha, pg], currentProjectId: alpha.id })

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))

    expect(getByRole('menu', { name: 'File' })).toBeTruthy()
    expect(getByText('New Project')).toBeTruthy()
    expect(getByText('Open Project…')).toBeTruthy()
    expect(getByText('Save As…')).toBeTruthy()
    expect(getByText('Recent Projects')).toBeTruthy()
    expect(getByText('pg')).toBeTruthy()
  })

  it('opens a recent project directly from the File menu', () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const pg = project('pg', 'pg', 'pg-node', 100)
    useProjectStore.setState({ projects: [alpha, pg], currentProjectId: alpha.id })
    useGraphStore.setState({
      nodes: [{
        id: 'scratch',
        type: 'studioNode',
        position: { x: 10, y: 10 },
        data: { label: 'Noise', nodeType: 'Noise', category: 'pattern', properties: {}, inputs: [], outputs: [] },
      }] as never[],
      edges: [],
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))
    fireEvent.click(getByText('pg'))

    expect(useProjectStore.getState().currentProjectId).toBe(pg.id)
    expect(useGraphStore.getState().nodes.map((node) => node.id)).toEqual(['pg-node'])
    expect(useProjectStore.getState().projects.find((entry) => entry.id === alpha.id)?.workspace.nodes.map((node) => node.id)).toEqual(['scratch'])
  })
})

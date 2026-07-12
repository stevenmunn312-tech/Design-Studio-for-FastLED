import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
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
    delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker
    vi.restoreAllMocks()
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

  it('creates a default New Project when no project is open', () => {
    useProjectStore.setState({ projects: [], currentProjectId: '' })
    useGraphStore.setState({
      nodes: [],
      edges: [],
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))
    fireEvent.click(getByText('New Project'))

    const current = useProjectStore.getState().projects.find((entry) => entry.id === useProjectStore.getState().currentProjectId)
    expect(current?.name).toBe('New Project')
    expect(useGraphStore.getState().nodes).toEqual([])
  })

  it('asks to save before creating a new project when one is open', () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    useProjectStore.setState({ projects: [alpha], currentProjectId: alpha.id })
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
    fireEvent.click(getByText('New Project'))

    expect(confirmSpy).toHaveBeenCalledWith(
      'Save current project "alpha" before creating a new project?\n\nPress OK to save first, or Cancel to continue without saving.'
    )
    const current = useProjectStore.getState().projects.find((entry) => entry.id === useProjectStore.getState().currentProjectId)
    expect(current?.name).toBe('New Project')
    expect(useProjectStore.getState().projects.find((entry) => entry.id === alpha.id)?.workspace.nodes.map((node) => node.id)).toEqual(['scratch'])
    expect(useGraphStore.getState().nodes).toEqual([])
  })

  it('opens a project file through the native picker', async () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const pg = project('pg', 'pg', 'pg-node', 100)
    useProjectStore.setState({ projects: [alpha], currentProjectId: alpha.id })
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

    ;(window as Window & { showOpenFilePicker?: () => Promise<Array<{ name: string; getFile: () => Promise<File> }>> }).showOpenFilePicker = vi.fn().mockResolvedValue([{
      name: 'pg.fastled-project.json',
      getFile: async () => new File([JSON.stringify(pg)], 'pg.fastled-project.json', { type: 'application/json' }),
    }])

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))
    fireEvent.click(getByText('Open Project…'))

    await waitFor(() => {
      expect(useProjectStore.getState().currentProjectId).toBe(pg.id)
    })
    expect(useGraphStore.getState().nodes.map((node) => node.id)).toEqual(['pg-node'])
    expect(useProjectStore.getState().projects.find((entry) => entry.id === alpha.id)?.workspace.nodes.map((node) => node.id)).toEqual(['scratch'])
  })

  it('saves a copy through the native save dialog', async () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    let written = ''
    useProjectStore.setState({ projects: [alpha], currentProjectId: alpha.id })
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

    ;(window as Window & { showSaveFilePicker?: () => Promise<{ name: string; createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker = vi.fn().mockResolvedValue({
      name: 'pg-copy.fastled-project.json',
      createWritable: async () => ({
        write: async (data: string) => { written = data },
        close: async () => {},
      }),
    })

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))
    fireEvent.click(getByText('Save As…'))

    await waitFor(() => {
      expect(useProjectStore.getState().currentProjectId).not.toBe(alpha.id)
    })

    const current = useProjectStore.getState().projects.find((entry) => entry.id === useProjectStore.getState().currentProjectId)
    expect(current?.name).toBe('pg-copy')
    expect(current?.workspace.nodes.map((node) => node.id)).toEqual(['scratch'])
    expect(useProjectStore.getState().projects.find((entry) => entry.id === alpha.id)?.workspace.nodes.map((node) => node.id)).toEqual(['scratch'])
    expect(JSON.parse(written)).toMatchObject({
      name: 'pg-copy',
      workspace: {
        nodes: [{ id: 'scratch' }],
      },
    })
  })
})

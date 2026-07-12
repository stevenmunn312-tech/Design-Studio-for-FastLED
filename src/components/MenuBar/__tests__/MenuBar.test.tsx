import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import MenuBar from '../MenuBar'
import { useGraphStore } from '../../../state/graphStore'
import { useProjectStore } from '../../../state/projectStore'
import { useUiStore } from '../../../state/uiStore'
import { useAudioStore } from '../../../state/audioStore'
import { useShowPlayback } from '../../../state/showPlayback'
import type { SavedProject } from '../../../state/projectStore'

const defaultRequestNewProjectDecision = useUiStore.getState().requestNewProjectDecision
const defaultResolveNewProjectDecision = useUiStore.getState().resolveNewProjectDecision

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

function mockSavePicker(filename: string, onWrite?: (data: string) => void) {
  ;(window as Window & {
    showSaveFilePicker?: () => Promise<{
      name: string
      createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
    }>
  }).showSaveFilePicker = vi.fn().mockResolvedValue({
    name: filename,
    createWritable: async () => ({
      write: async (data: string) => { onWrite?.(data) },
      close: async () => {},
    }),
  })
}

describe('MenuBar file menu', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null, graphData: {}, graphs: { root: { id: 'root', name: 'Main' } }, activeGraphId: 'root' })
    useGraphStore.temporal.getState().clear()
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
      newProjectPrompt: { open: false, projectName: '' },
      requestNewProjectDecision: defaultRequestNewProjectDecision,
      resolveNewProjectDecision: defaultResolveNewProjectDecision,
    })
    useAudioStore.setState({ micActive: false, active: false })
    useShowPlayback.setState({ playing: false, nodeId: null, show: null, posMs: 0, useGroupInputs: false })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker
  })

  it('shows a File dropdown with project actions and recents', () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const pg = project('pg', 'pg', 'pg-node', 100)
    useProjectStore.setState({ projects: [alpha, pg], currentProjectId: alpha.id, recentProjectIds: [] })

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))

    expect(getByRole('menu', { name: 'File' })).toBeTruthy()
    expect(getByText('New Project')).toBeTruthy()
    expect(getByText('Open Project…')).toBeTruthy()
    expect(getByText('Save As…')).toBeTruthy()
    expect(getByText('Recent Projects')).toBeTruthy()
    expect(getByText('No recent projects yet')).toBeTruthy()
  })

  it('opens a recent project directly from the File menu', () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const pg = project('pg', 'pg', 'pg-node', 100)
    useProjectStore.setState({ projects: [alpha, pg], currentProjectId: alpha.id, recentProjectIds: [pg.id] })
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
    expect(useProjectStore.getState().recentProjectIds).toEqual([alpha.id])
  })

  it('creates a default New Project through the save dialog when no project is open', async () => {
    useProjectStore.setState({ projects: [], currentProjectId: '' })
    useGraphStore.setState({
      nodes: [],
      edges: [],
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    mockSavePicker('New Project.fastled-project.json')

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))
    fireEvent.click(getByText('New Project'))

    await waitFor(() => {
      expect(useProjectStore.getState().currentProjectId).not.toBe('')
    })
    const current = useProjectStore.getState().projects.find((entry) => entry.id === useProjectStore.getState().currentProjectId)
    expect(current?.name).toBe('New Project')
    expect(useGraphStore.getState().nodes).toEqual([])
  })

  it('supports the yes path before creating a new project', async () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const requestNewProjectDecision = vi.fn().mockResolvedValue('yes')
    useUiStore.setState({ requestNewProjectDecision })
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
    mockSavePicker('New Project.fastled-project.json')

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))
    fireEvent.click(getByText('New Project'))

    await waitFor(() => {
      expect(useProjectStore.getState().currentProjectId).not.toBe(alpha.id)
    })
    expect(requestNewProjectDecision).toHaveBeenCalledWith('alpha')
    const current = useProjectStore.getState().projects.find((entry) => entry.id === useProjectStore.getState().currentProjectId)
    expect(current?.name).toBe('New Project')
    expect(useProjectStore.getState().projects.find((entry) => entry.id === alpha.id)?.workspace.nodes.map((node) => node.id)).toEqual(['scratch'])
    expect(useGraphStore.getState().nodes).toEqual([])
  })

  it('supports the no path before creating a new project', async () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const requestNewProjectDecision = vi.fn().mockResolvedValue('no')
    useUiStore.setState({ requestNewProjectDecision })
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
    mockSavePicker('New Project(1).fastled-project.json')

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))
    fireEvent.click(getByText('New Project'))

    await waitFor(() => {
      expect(useProjectStore.getState().currentProjectId).not.toBe(alpha.id)
    })
    expect(requestNewProjectDecision).toHaveBeenCalledWith('alpha')
    const current = useProjectStore.getState().projects.find((entry) => entry.id === useProjectStore.getState().currentProjectId)
    expect(current?.name).toBe('New Project(1)')
    expect(useProjectStore.getState().projects.find((entry) => entry.id === alpha.id)?.workspace.nodes.map((node) => node.id)).toEqual(['alpha-node'])
    expect(useGraphStore.getState().nodes).toEqual([])
  })

  it('supports the cancel path before creating a new project', () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const requestNewProjectDecision = vi.fn().mockResolvedValue('cancel')
    useUiStore.setState({ requestNewProjectDecision })
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

    expect(requestNewProjectDecision).toHaveBeenCalledWith('alpha')
    expect(useProjectStore.getState().currentProjectId).toBe(alpha.id)
    expect(useGraphStore.getState().nodes.map((node) => node.id)).toEqual(['scratch'])
    expect((window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker).toBeUndefined()
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
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      name: 'pg-copy.fastled-project.json',
      createWritable: async () => ({
        write: async (data: string) => { written = data },
        close: async () => {},
      }),
    })
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

    ;(window as Window & { showSaveFilePicker?: typeof showSaveFilePicker }).showSaveFilePicker = showSaveFilePicker

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
    expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({
      suggestedName: 'alpha Copy.fastled-project.json',
      types: [{
        description: 'FastLED Studio Project',
        accept: { 'application/json': ['.fastled-project.json'] },
      }],
    }))
    expect(JSON.parse(written)).toMatchObject({
      name: 'pg-copy',
      workspace: {
        nodes: [{ id: 'scratch' }],
      },
    })
  })
})

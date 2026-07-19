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
      evaluationRunning: true,
      stageMode: false,
      uiEffectsEnabled: true,
      signalPathDimEnabled: true,
      preview3d: false,
      previewStyle: 'standard',
      reducedMotion: false,
      highContrast: false,
      theme: 'dark',
      newProjectPrompt: { open: false, projectName: '', actionLabel: 'creating a new project', destinationLabel: 'a new blank project' },
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
    expect(getByText('Open Project File…')).toBeTruthy()
    expect(getByText('Save Project File As…')).toBeTruthy()
    expect(getByText('Recent Projects')).toBeTruthy()
    expect(getByText('No recent projects yet')).toBeTruthy()
  })

  it('offers a persistent Start button outside the File menu', () => {
    const { getByRole } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'Open start gallery' }))
    expect(useUiStore.getState().templatesOpen).toBe(true)
  })

  it('pauses and resumes graph evaluation from the main workflow controls', () => {
    const { getByRole } = render(<MenuBar />)

    fireEvent.click(getByRole('button', { name: 'Pause graph evaluation' }))
    expect(useUiStore.getState().evaluationRunning).toBe(false)
    expect(getByRole('button', { name: 'Resume graph evaluation' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(getByRole('button', { name: 'Resume graph evaluation' }))
    expect(useUiStore.getState().evaluationRunning).toBe(true)
  })

  it('keeps preview controls mounted while stage mode is active', () => {
    useUiStore.setState({ stageMode: true })

    const { getByRole } = render(<MenuBar />)

    expect(getByRole('button', { name: 'Toggle stage mode' }).getAttribute('aria-pressed')).toBe('true')
    expect(getByRole('button', { name: 'Toggle 3D preview' })).toBeTruthy()
    expect(getByRole('button', { name: 'Toggle microphone preview input' })).toBeTruthy()
  })

  it('moves appearance toggles into a compact View menu', () => {
    const { getByRole, getByText, queryByRole } = render(<MenuBar />)

    expect(queryByRole('button', { name: 'Toggle high contrast' })).toBeNull()
    expect(queryByRole('button', { name: 'Toggle reduced motion' })).toBeNull()

    fireEvent.click(getByRole('button', { name: 'View menu' }))

    expect(getByRole('menu', { name: 'View' })).toBeTruthy()
    expect(getByText('☾ Theme: Dark')).toBeTruthy()
    expect(getByText('○ Motion: Full')).toBeTruthy()
    expect(getByText('○ Contrast: Standard')).toBeTruthy()
    expect(getByText('✓ UI FX: On')).toBeTruthy()
    expect(getByText('✓ Signal dimming: On')).toBeTruthy()
  })

  it('opens Help on the About tab from the View menu', () => {
    const { getByRole } = render(<MenuBar />)

    fireEvent.click(getByRole('button', { name: 'View menu' }))
    fireEvent.click(getByRole('menuitem', { name: 'ℹ About Design Studio for FastLED' }))

    expect(useUiStore.getState().helpOpen).toBe(true)
    expect(useUiStore.getState().helpTab).toBe('about')
    expect(getByRole('button', { name: 'View menu' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('still toggles view preferences from the View menu', () => {
    const { getByRole } = render(<MenuBar />)

    fireEvent.click(getByRole('button', { name: 'View menu' }))
    fireEvent.click(getByRole('menuitemcheckbox', { name: '○ Contrast: Standard' }))

    expect(useUiStore.getState().highContrast).toBe(true)
    expect(getByRole('button', { name: 'View menu' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('supports roving keyboard focus inside menus', async () => {
    const { getByRole } = render(<MenuBar />)
    const fileButton = getByRole('button', { name: 'File menu' })

    fireEvent.click(fileButton)
    const menu = getByRole('menu', { name: 'File' })

    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('New Project')
    })

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('Open Project File…')

    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement?.textContent).toBe('New Project')

    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement?.textContent).toBe('Recover Snapshot…')

    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(fileButton.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(fileButton)
  })

  it('opens a recent project directly from the File menu', async () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const pg = project('pg', 'pg', 'pg-node', 100)
    const requestNewProjectDecision = vi.fn().mockResolvedValue('yes')
    useUiStore.setState({ requestNewProjectDecision })
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

    await waitFor(() => {
      expect(useProjectStore.getState().currentProjectId).toBe(pg.id)
    })
    expect(useGraphStore.getState().nodes.map((node) => node.id)).toEqual(['pg-node'])
    expect(useProjectStore.getState().projects.find((entry) => entry.id === alpha.id)?.workspace.nodes.map((node) => node.id)).toEqual(['scratch'])
    expect(useProjectStore.getState().recentProjectIds).toEqual([alpha.id])
    expect(requestNewProjectDecision).toHaveBeenCalledWith('alpha', 'continuing', 'project "pg"')
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
    expect(requestNewProjectDecision).toHaveBeenCalledWith('alpha', 'creating a new project', 'a new blank project')
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
    expect(requestNewProjectDecision).toHaveBeenCalledWith('alpha', 'creating a new project', 'a new blank project')
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

    expect(requestNewProjectDecision).toHaveBeenCalledWith('alpha', 'creating a new project', 'a new blank project')
    expect(useProjectStore.getState().currentProjectId).toBe(alpha.id)
    expect(useGraphStore.getState().nodes.map((node) => node.id)).toEqual(['scratch'])
    expect((window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker).toBeUndefined()
  })

  it('opens a project file through the native picker', async () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const pg = project('pg', 'pg', 'pg-node', 100)
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

    ;(window as Window & { showOpenFilePicker?: () => Promise<Array<{ name: string; getFile: () => Promise<File> }>> }).showOpenFilePicker = vi.fn().mockResolvedValue([{
      name: 'pg.fastled-project.json',
      getFile: async () => new File([JSON.stringify(pg)], 'pg.fastled-project.json', { type: 'application/json' }),
    }])

    const { getByRole, getByText } = render(<MenuBar />)
    fireEvent.click(getByRole('button', { name: 'File menu' }))
    fireEvent.click(getByText('Open Project File…'))

    await waitFor(() => {
      expect(useProjectStore.getState().currentProjectId).toBe(pg.id)
    })
    expect(requestNewProjectDecision).toHaveBeenCalledWith('alpha', 'continuing', 'project "pg"')
    expect(useGraphStore.getState().nodes.map((node) => node.id)).toEqual(['pg-node'])
    expect(useProjectStore.getState().projects.find((entry) => entry.id === alpha.id)?.workspace.nodes.map((node) => node.id)).toEqual(['scratch'])
  })

  it('supports cancel before opening a recent project', () => {
    const alpha = project('alpha', 'alpha', 'alpha-node', 200)
    const pg = project('pg', 'pg', 'pg-node', 100)
    const requestNewProjectDecision = vi.fn().mockResolvedValue('cancel')
    useUiStore.setState({ requestNewProjectDecision })
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

    expect(requestNewProjectDecision).toHaveBeenCalledWith('alpha', 'continuing', 'project "pg"')
    expect(useProjectStore.getState().currentProjectId).toBe(alpha.id)
    expect(useGraphStore.getState().nodes.map((node) => node.id)).toEqual(['scratch'])
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
    fireEvent.click(getByText('Save Project File As…'))

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
        description: 'Design Studio for FastLED Project',
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

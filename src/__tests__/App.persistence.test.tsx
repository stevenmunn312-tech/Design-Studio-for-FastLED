import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { buildShareUrl, clearShareHash } from '../utils/shareGraph'
import { useProjectStore } from '../state/projectStore'
import { useGraphStore } from '../state/graphStore'
import type { StudioNode } from '../state/graphStore'
import { useUiStore } from '../state/uiStore'
import { waitForMusicLibraryRestore } from '../state/player/musicLibraryPersistence'
import App from '../App'

// The bootstrap under test lives in App's effects; the workspaces, panels and
// canvas it also mounts are stubbed out because none of them take part.
const blank = vi.hoisted(() => () => ({ default: () => null }))
vi.mock('../components/MenuBar/MenuBar', blank)
vi.mock('../components/Sidebar/Sidebar', blank)
vi.mock('../components/Canvas/NodeGraphCanvas', blank)
vi.mock('../components/Preview/LEDPreview', blank)
vi.mock('../components/StatusBar/StatusBar', blank)
vi.mock('../components/TrustBanner/TrustBanner', blank)
vi.mock('../components/GraphHealth/GraphHealthDrawer', blank)
vi.mock('../components/PerformanceDeck/PerformanceDeckMidiBridge', blank)
vi.mock('../components/Layout/WorkspaceTabs', blank)
vi.mock('../components/DisplayEditor/LiveTouchScreen', blank)
vi.mock('../components/FirstProject/FirstProjectGuide', blank)
vi.mock('../components/Layout/PanelResizeHandle', () => ({ PanelResizeHandle: () => null }))
vi.mock('../utils/trustPrompt', () => ({ promptTrustIfNeeded: vi.fn(async () => {}) }))
vi.mock('../state/player/musicLibraryPersistence', async (importOriginal) => ({
  ...await importOriginal<typeof import('../state/player/musicLibraryPersistence')>(),
  waitForMusicLibraryRestore: vi.fn(async () => {}),
  isMusicLibraryRestoring: () => false,
}))

function node(id: string): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: 'SolidColor', nodeType: 'SolidColor', category: 'pattern', properties: {}, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

// Every root graph carries a Board node once loaded; only the authored nodes
// say whose workspace this is.
const authoredIds = (nodes: StudioNode[] | undefined) =>
  (nodes ?? []).filter((entry) => entry.data.nodeType !== 'Board').map((entry) => entry.id)

const projectActions = {
  saveCurrentWorkspace: useProjectStore.getState().saveCurrentWorkspace,
  createProject: useProjectStore.getState().createProject,
}
const uiSetStatus = useUiStore.getState().setStatus

describe('App project persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(waitForMusicLibraryRestore).mockImplementation(async () => {})
    useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [], ...projectActions })
    useGraphStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useGraphStore.temporal.getState().clear()
    useUiStore.setState({ lastStartChoice: 'blank', templatesOpen: false, projectsOpen: false })
  })
  afterEach(() => {
    clearShareHash()
    useProjectStore.setState(projectActions)
    useUiStore.setState({ setStatus: uiSetStatus })
  })

  it('opens a share link into a new project and leaves the open project untouched', async () => {
    const mine = useProjectStore.getState().createProject('Mine', { nodes: [node('mine')], edges: [] })
    window.location.hash = new URL(buildShareUrl({
      nodes: [node('shared')],
      edges: [],
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })).hash
    const setStatus = vi.fn()
    useUiStore.setState({ setStatus })

    render(<App />)
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(expect.stringMatching(/Share link opened/), expect.anything()))

    const state = useProjectStore.getState()
    const untouched = state.projects.find((project) => project.id === mine.id)
    expect(untouched?.workspace.nodes.map((entry) => entry.id)).toEqual(['mine'])
    const current = state.projects.find((project) => project.id === state.currentProjectId)
    expect(current?.id).not.toBe(mine.id)
    expect(authoredIds(current?.workspace.nodes)).toEqual(['shared'])
    expect(current?.workspace.trusted).toBe(false)
    expect(authoredIds(useGraphStore.getState().nodes)).toEqual(['shared'])
  })

  it('ignores Ctrl+S until the saved workspace has been installed', async () => {
    const mine = useProjectStore.getState().createProject('Mine', { nodes: [node('mine')], edges: [] })
    let finishRestore: () => void = () => {}
    vi.mocked(waitForMusicLibraryRestore).mockImplementation(() => new Promise<void>((resolve) => {
      finishRestore = resolve
    }))
    const save = vi.fn(projectActions.saveCurrentWorkspace)
    useProjectStore.setState({ saveCurrentWorkspace: save })

    const setStatus = vi.fn()
    useUiStore.setState({ setStatus })

    render(<App />)
    // The graph store still holds its module defaults: nothing from disk has
    // been installed yet, so a save now would replace the project with an
    // empty graph stamped newer than the real file.
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(save).not.toHaveBeenCalled()
    expect(setStatus).toHaveBeenCalledWith(expect.stringMatching(/nothing saved/i), 'info')
    expect(useProjectStore.getState().projects.find((project) => project.id === mine.id)?.workspace.nodes).toHaveLength(1)

    // The bootstrap asks for the restore a microtask after render returns, so
    // the release waits for the request it answers.
    await waitFor(() => expect(waitForMusicLibraryRestore).toHaveBeenCalled())
    finishRestore()
    await waitFor(() => expect(authoredIds(useGraphStore.getState().nodes)).toEqual(['mine']))
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      expect(save).toHaveBeenCalled()
    })
    expect(authoredIds(useProjectStore.getState().projects.find((project) => project.id === mine.id)?.workspace.nodes)).toEqual(['mine'])
  })
})

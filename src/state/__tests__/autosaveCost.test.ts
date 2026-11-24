import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { blankWorkspace, captureWorkspace, ownedWorkspace, type PersistedWorkspace } from '../workspacePersistence'
import type { StudioNode } from '../graphStore'

// An autosave copies and serialises the open project on the main thread, so
// it does each once (docs/development/testing/performance-profile.md).

const node = (id: string, properties: Record<string, unknown> = {}): StudioNode => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { nodeType: 'Noise', label: id, category: 'pattern', properties, inputs: [], outputs: [] },
} as unknown as StudioNode)

describe('ownedWorkspace', () => {
  it('takes a freshly captured workspace as it is, once', () => {
    const captured = captureWorkspace({ nodes: [node('a')], edges: [] })
    expect(ownedWorkspace(captured)).toBe(captured)
    // Still held by the caller, so a second taker gets a copy of its own.
    const second = ownedWorkspace(captured)
    expect(second).not.toBe(captured)
    expect(second).toEqual(captured)
  })

  it('copies a workspace that did not come from a capture', () => {
    const workspace: PersistedWorkspace = { nodes: [node('a')], edges: [] }
    const owned = ownedWorkspace(workspace)
    expect(owned).not.toBe(workspace)
    expect(owned.nodes[0]).not.toBe(workspace.nodes[0])
    expect(owned).toEqual(workspace)
  })
})

describe('project storage text', () => {
  const KEY = 'design-studio-for-fastled.projects.v1'
  const SNAPSHOT_KEY = 'design-studio-for-fastled.current-workspace.v1'

  beforeAll(async () => { await import('../projectStore') }, 60_000)

  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('holds exactly what serialising the store would', async () => {
    const { useProjectStore } = await import('../projectStore')
    const store = useProjectStore.getState()
    store.createProject('Lamp', { nodes: [node('a', { speed: 2 })], edges: [] })
    store.createProject('Empty', blankWorkspace())
    useProjectStore.getState().saveCurrentWorkspace({ nodes: [node('b', { text: 'a "quoted"   line' })], edges: [] })

    const state = useProjectStore.getState()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(JSON.parse(JSON.stringify({
      currentProjectId: state.currentProjectId,
      projects: state.projects,
      recentProjectIds: state.recentProjectIds,
    })))
    const current = state.projects.find((project) => project.id === state.currentProjectId)!
    const snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY)!) as { projectId: string; name: string; workspace: PersistedWorkspace }
    expect(snapshot.projectId).toBe(current.id)
    expect(snapshot.name).toBe(current.name)
    expect(snapshot.workspace).toEqual(JSON.parse(JSON.stringify(current.workspace)))
  })

  it('serialises a project that did not change only once', async () => {
    const { useProjectStore } = await import('../projectStore')
    const big = { nodes: [node('kept', { marker: 'kept-project' })], edges: [] }
    useProjectStore.getState().createProject('Kept', big)
    useProjectStore.getState().createProject('Edited', blankWorkspace())

    const stringify = vi.spyOn(JSON, 'stringify')
    useProjectStore.getState().saveCurrentWorkspace({ nodes: [node('edit')], edges: [] })
    const calls = stringify.mock.calls.map(([value]) => value)
    stringify.mockRestore()
    const reserialised = calls.filter((value) => JSON.stringify(value)?.includes('kept-project'))

    expect(reserialised).toEqual([])
    // And the text written still carries it.
    expect(localStorage.getItem(KEY)).toContain('kept-project')
  })
})

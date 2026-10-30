import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedProject } from '../projectStore'
import type { StudioNode } from '../graphStore'

vi.mock('../../utils/backendClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../utils/backendClient')>(),
  listProjects: vi.fn(),
  saveProjectToDisk: vi.fn(),
}))

function project(patternCount: number, updatedAt: number): SavedProject {
  return {
    id: 'collection-project', name: 'Collection', createdAt: 1, updatedAt,
    workspace: {
      nodes: [{
        id: 'collection', type: 'studioNode', position: { x: 0, y: 0 },
        data: {
          label: 'Pattern Collection', nodeType: 'PatternCollection', category: 'show',
          properties: { patternIds: Array.from({ length: patternCount }, (_, i) => `pattern-${i}`) },
          inputs: [], outputs: [],
        },
      } as StudioNode],
      edges: [],
    },
  }
}

describe('project pending-save replay', () => {
  beforeAll(async () => { await import('../projectStore') }, 60_000)
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubEnv('VITEST', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  async function loadPending(local: SavedProject, disk: SavedProject) {
    localStorage.setItem('design-studio-for-fastled.projects.v1', JSON.stringify({
      currentProjectId: local.id, projects: [local], recentProjectIds: [],
    }))
    localStorage.setItem('design-studio-for-fastled.projects-sync.v1', JSON.stringify({
      pendingUpserts: [local.id], pendingDeletes: [],
    }))
    const backend = await import('../../utils/backendClient')
    vi.mocked(backend.listProjects).mockResolvedValue([disk])
    vi.mocked(backend.saveProjectToDisk).mockResolvedValue(true)
    const { useProjectStore } = await import('../projectStore')
    await useProjectStore.getState().refreshFromDisk()
    return { backend, saved: useProjectStore.getState().projects[0] }
  }

  it.each([100, 200])('keeps 23 disk patterns instead of replaying a stale three-pattern cache (disk revision %i)', async (revision) => {
    const disk = project(23, revision)
    const { backend, saved } = await loadPending(project(3, 100), disk)
    expect(backend.saveProjectToDisk).not.toHaveBeenCalled()
    expect(saved).toEqual({ ...disk, diskBase: revision })
    expect(localStorage.getItem('design-studio-for-fastled.projects-sync.v1')).toBeNull()
  })

  it('still retries a genuinely newer browser workspace', async () => {
    const local = project(23, 200)
    const { backend, saved } = await loadPending(local, project(3, 100))
    expect(backend.saveProjectToDisk).toHaveBeenCalledExactlyOnceWith(local, { baseUpdatedAt: undefined })
    expect(saved).toEqual({ ...local, diskBase: 200 })
  })

  it('says so when a save reaches neither the helper nor the browser', async () => {
    const backend = await import('../../utils/backendClient')
    vi.mocked(backend.saveProjectToDisk).mockResolvedValue(false)
    const { useProjectStore } = await import('../projectStore')
    const { useUiStore } = await import('../uiStore')
    const created = useProjectStore.getState().createProject('Big', project(3, 1).workspace)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      useProjectStore.getState().saveCurrentWorkspace(project(23, 2).workspace)
      await vi.waitFor(() => expect(useUiStore.getState().statusText).toMatch(/^Not saved: the upload helper is offline/))
    } finally {
      setItem.mockRestore()
    }
    expect(useProjectStore.getState().currentProjectId).toBe(created.id)
  })

  // The helper refuses a save whose base is older than the file. Two autosaves
  // in flight together must not trip it: the second descends from the first.
  it('sends each save the base it was edited from, counting its own unacknowledged saves', async () => {
    const backend = await import('../../utils/backendClient')
    vi.mocked(backend.saveProjectToDisk).mockReturnValue(new Promise(() => {}))
    const { useProjectStore } = await import('../projectStore')
    useProjectStore.getState().createProject('Quick', project(1, 1).workspace)
    useProjectStore.getState().saveCurrentWorkspace(project(2, 1).workspace)
    const calls = vi.mocked(backend.saveProjectToDisk).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][1]?.baseUpdatedAt).toBeUndefined()
    expect(calls[1][1]?.baseUpdatedAt).toBe(calls[0][0].updatedAt)
    expect(calls[1][0]).not.toHaveProperty('diskBase')
  })

  // The 2026-10-30 loss: newer by its clock, but edited from an older save.
  it('keeps a stale-based browser workspace beside the file instead of over it', async () => {
    const local = { ...project(0, 900), diskBase: 50 }
    const disk = project(23, 100)
    const backend = (await loadPending(local, disk)).backend
    const { useProjectStore } = await import('../projectStore')
    const projects = useProjectStore.getState().projects
    expect(projects.find((entry) => entry.id === disk.id)?.workspace).toEqual(disk.workspace)
    expect(projects.map((entry) => entry.name)).toContain('Collection (browser copy)')
    expect(vi.mocked(backend.saveProjectToDisk).mock.calls.map(([saved]) => saved.id)).not.toContain(disk.id)
  })
})

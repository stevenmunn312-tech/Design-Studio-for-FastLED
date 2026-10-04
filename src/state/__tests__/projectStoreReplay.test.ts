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
    expect(saved).toEqual(disk)
    expect(localStorage.getItem('design-studio-for-fastled.projects-sync.v1')).toBeNull()
  })

  it('still retries a genuinely newer browser workspace', async () => {
    const local = project(23, 200)
    const { backend, saved } = await loadPending(local, project(3, 100))
    expect(backend.saveProjectToDisk).toHaveBeenCalledExactlyOnceWith(local)
    expect(saved).toEqual(local)
  })
})

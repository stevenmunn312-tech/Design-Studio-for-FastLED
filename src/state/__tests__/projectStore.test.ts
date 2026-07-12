import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersistedWorkspace } from '../workspacePersistence'
import type { StudioNode } from '../graphStore'

function node(id: string): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: 'SolidColor', nodeType: 'SolidColor', category: 'pattern', properties: {}, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function workspace(ids: string[]): PersistedWorkspace {
  return { nodes: ids.map(node), edges: [] }
}

async function freshStore() {
  vi.resetModules()
  return import('../projectStore')
}

describe('projectStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with no projects when storage is empty', async () => {
    const { useProjectStore } = await freshStore()
    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(0)
    expect(state.currentProjectId).toBe('')
  })

  it('never mints a project from the legacy single-workspace autosave slot, and clears it', async () => {
    localStorage.setItem('fastled-studio-graph', JSON.stringify(workspace(['a', 'b'])))
    const { useProjectStore } = await freshStore()
    expect(useProjectStore.getState().projects).toHaveLength(0)
    expect(useProjectStore.getState().currentProjectId).toBe('')
    expect(localStorage.getItem('fastled-studio-graph')).toBeNull()
  })

  it('saves the current workspace and persists it', async () => {
    const { useProjectStore } = await freshStore()
    useProjectStore.getState().createProject('Main', workspace(['seed']))
    useProjectStore.getState().saveCurrentWorkspace(workspace(['frame']))

    const current = useProjectStore.getState().projects.find((project) => project.id === useProjectStore.getState().currentProjectId)
    expect(current?.workspace.nodes.map((entry) => entry.id)).toEqual(['frame'])

    const raw = JSON.parse(localStorage.getItem('fastled-studio.projects.v1') ?? '{}') as { projects?: Array<{ workspace?: PersistedWorkspace }> }
    expect(raw.projects?.[0].workspace?.nodes).toHaveLength(1)
  })

  it('saving with no current project is a no-op instead of minting one', async () => {
    const { useProjectStore } = await freshStore()
    useProjectStore.getState().saveCurrentWorkspace(workspace(['frame']))
    expect(useProjectStore.getState().projects).toHaveLength(0)
    expect(useProjectStore.getState().currentProjectId).toBe('')
  })

  it('clones saved workspaces so later mutations do not rewrite the project snapshot', async () => {
    const { useProjectStore } = await freshStore()
    useProjectStore.getState().createProject('Main', workspace(['seed']))
    const draft = workspace(['frame'])

    useProjectStore.getState().saveCurrentWorkspace(draft)
    draft.nodes[0].id = 'mutated'
    draft.nodes.push(node('extra'))

    const current = useProjectStore.getState().projects.find((project) => project.id === useProjectStore.getState().currentProjectId)
    expect(current?.workspace.nodes.map((entry) => entry.id)).toEqual(['frame'])
  })

  it('creates, renames, switches, and deletes projects', async () => {
    const { useProjectStore } = await freshStore()
    const main = useProjectStore.getState().createProject('Main', workspace(['main']))

    const showA = useProjectStore.getState().createProject('Show A', workspace(['a']))
    expect(useProjectStore.getState().currentProjectId).toBe(showA.id)
    expect(useProjectStore.getState().projects.some((project) => project.id === showA.id)).toBe(true)

    useProjectStore.getState().renameProject(showA.id, 'Show Alpha')
    expect(useProjectStore.getState().projects.find((project) => project.id === showA.id)?.name).toBe('Show Alpha')

    const switched = useProjectStore.getState().switchProject(main.id)
    expect(switched?.id).toBe(main.id)
    expect(useProjectStore.getState().currentProjectId).toBe(main.id)

    const nextActive = useProjectStore.getState().deleteProject(main.id)
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(nextActive?.id).toBe(showA.id)
    expect(useProjectStore.getState().currentProjectId).toBe(showA.id)
  })

  it('upserts an explicitly opened project by id and makes it current', async () => {
    const { useProjectStore } = await freshStore()
    const alpha = useProjectStore.getState().createProject('Alpha', workspace(['old']))

    const imported = {
      ...alpha,
      name: 'pg',
      updatedAt: alpha.updatedAt + 5000,
      workspace: workspace(['pg']),
    }

    const opened = useProjectStore.getState().upsertProject(imported)

    expect(opened.id).toBe(alpha.id)
    expect(useProjectStore.getState().projects.filter((project) => project.id === alpha.id)).toHaveLength(1)
    expect(useProjectStore.getState().currentProjectId).toBe(alpha.id)
    expect(useProjectStore.getState().projects.find((project) => project.id === alpha.id)?.name).toBe('pg')
    expect(useProjectStore.getState().projects.find((project) => project.id === alpha.id)?.workspace.nodes.map((entry) => entry.id)).toEqual(['pg'])
  })

  it('deleting the last project leaves the workspace empty instead of minting a replacement', async () => {
    const { useProjectStore } = await freshStore()
    const only = useProjectStore.getState().createProject('Only', workspace(['x']))

    const nextActive = useProjectStore.getState().deleteProject(only.id)
    expect(nextActive).toBeNull()
    expect(useProjectStore.getState().projects).toHaveLength(0)
    expect(useProjectStore.getState().currentProjectId).toBe('')

    // A reload must not resurrect it from the current-workspace snapshot either.
    const reloaded = await freshStore()
    expect(reloaded.useProjectStore.getState().projects).toHaveLength(0)
    expect(reloaded.useProjectStore.getState().currentProjectId).toBe('')
  })

  it('persists upload targets per project', async () => {
    const { useProjectStore } = await freshStore()
    const mainId = useProjectStore.getState().createProject('Main', workspace(['main'])).id

    useProjectStore.getState().setProjectUploadTarget({
      selectedFqbn: 'esp32:esp32:esp32s3',
      selectedPort: 'COM7',
    })

    const showA = useProjectStore.getState().createProject('Show A', workspace(['a']), {
      uploadTarget: {
        selectedFqbn: 'rp2040:rp2040:rpipico',
        selectedPort: 'COM9',
      },
    })

    expect(showA.uploadTarget).toEqual({
      selectedFqbn: 'rp2040:rp2040:rpipico',
      selectedPort: 'COM9',
    })

    useProjectStore.getState().switchProject(mainId)
    expect(useProjectStore.getState().projects.find((project) => project.id === mainId)?.uploadTarget).toEqual({
      selectedFqbn: 'esp32:esp32:esp32s3',
      selectedPort: 'COM7',
    })

    const raw = JSON.parse(localStorage.getItem('fastled-studio.projects.v1') ?? '{}') as {
      projects?: Array<{ id: string; uploadTarget?: { selectedFqbn: string; selectedPort: string } }>
    }
    expect(raw.projects?.find((project) => project.id === showA.id)?.uploadTarget).toEqual({
      selectedFqbn: 'rp2040:rp2040:rpipico',
      selectedPort: 'COM9',
    })
  })

  it('restores the current project from the small hint key when the full project blob stops persisting', async () => {
    const first = await freshStore()
    const store = first.useProjectStore
    const mainId = store.getState().createProject('Main', workspace(['main'])).id
    const showA = store.getState().createProject('Show A', workspace(['a']))

    const realSetItem = Storage.prototype.setItem
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'fastled-studio.projects.v1') throw new Error('quota')
      return realSetItem.call(this, key, value)
    })

    store.getState().switchProject(mainId)

    setItemSpy.mockRestore()

    const second = await freshStore()
    expect(second.useProjectStore.getState().currentProjectId).toBe(mainId)
    expect(second.useProjectStore.getState().projects.some((project) => project.id === showA.id)).toBe(true)
  })

  it('restores the latest current-project workspace from the dedicated snapshot when the full project blob is stale', async () => {
    const { useProjectStore } = await freshStore()
    useProjectStore.getState().createProject('Main', workspace(['seed']))
    useProjectStore.getState().saveCurrentWorkspace(workspace(['old']))

    const realSetItem = Storage.prototype.setItem
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'fastled-studio.projects.v1') throw new Error('quota')
      return realSetItem.call(this, key, value)
    })

    useProjectStore.getState().saveCurrentWorkspace(workspace(['new']))

    setItemSpy.mockRestore()

    const reloaded = await freshStore()
    const current = reloaded.useProjectStore.getState().projects.find(
      (project) => project.id === reloaded.useProjectStore.getState().currentProjectId,
    )
    expect(current?.workspace.nodes.map((entry) => entry.id)).toEqual(['new'])
  })

  it('reconstructs the current project from the dedicated snapshot when it never reached the project blob', async () => {
    const initial = await freshStore()
    const store = initial.useProjectStore

    const realSetItem = Storage.prototype.setItem
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'fastled-studio.projects.v1') throw new Error('quota')
      return realSetItem.call(this, key, value)
    })

    const pg = store.getState().createProject('pg', workspace(['pg']))

    setItemSpy.mockRestore()

    const reloaded = await freshStore()
    expect(reloaded.useProjectStore.getState().currentProjectId).toBe(pg.id)
    expect(reloaded.useProjectStore.getState().projects.some((project) => project.id === pg.id && project.name === 'pg')).toBe(true)
    const current = reloaded.useProjectStore.getState().projects.find(
      (project) => project.id === reloaded.useProjectStore.getState().currentProjectId,
    )
    expect(current?.workspace.nodes.map((entry) => entry.id)).toEqual(['pg'])
  })

  it('never resurrects a project named Main under any load-failure combination', async () => {
    // Legacy key present + empty blob + no snapshot: the exact refresh state
    // that used to mint a fresh "Main" project on every reload.
    localStorage.setItem('fastled-studio-graph', JSON.stringify(workspace(['ancient'])))
    localStorage.setItem('fastled-studio.projects.v1', 'not json')
    const { useProjectStore } = await freshStore()
    expect(useProjectStore.getState().projects).toHaveLength(0)
    expect(useProjectStore.getState().currentProjectId).toBe('')
  })
})

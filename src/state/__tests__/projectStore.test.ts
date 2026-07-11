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

  it('starts with a default Main project when storage is empty', async () => {
    const { useProjectStore } = await freshStore()
    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(1)
    expect(state.projects[0].name).toBe('Main')
    expect(state.currentProjectId).toBe(state.projects[0].id)
  })

  it('migrates the legacy single-workspace autosave slot into the default project', async () => {
    localStorage.setItem('fastled-studio-graph', JSON.stringify(workspace(['a', 'b'])))
    const { useProjectStore } = await freshStore()
    const current = useProjectStore.getState().projects[0]
    expect(current.workspace.nodes).toHaveLength(2)
    expect(current.workspace.nodes.map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('saves the current workspace and persists it', async () => {
    const { useProjectStore } = await freshStore()
    useProjectStore.getState().saveCurrentWorkspace(workspace(['frame']))

    const current = useProjectStore.getState().projects.find((project) => project.id === useProjectStore.getState().currentProjectId)
    expect(current?.workspace.nodes.map((entry) => entry.id)).toEqual(['frame'])

    const raw = JSON.parse(localStorage.getItem('fastled-studio.projects.v1') ?? '{}') as { projects?: Array<{ workspace?: PersistedWorkspace }> }
    expect(raw.projects?.[0].workspace?.nodes).toHaveLength(1)
  })

  it('creates, renames, switches, and deletes projects while always keeping one active', async () => {
    const { useProjectStore } = await freshStore()
    useProjectStore.getState().saveCurrentWorkspace(workspace(['main']))

    const showA = useProjectStore.getState().createProject('Show A', workspace(['a']))
    expect(useProjectStore.getState().currentProjectId).toBe(showA.id)
    expect(useProjectStore.getState().projects.some((project) => project.id === showA.id)).toBe(true)

    useProjectStore.getState().renameProject(showA.id, 'Show Alpha')
    expect(useProjectStore.getState().projects.find((project) => project.id === showA.id)?.name).toBe('Show Alpha')

    const main = useProjectStore.getState().projects.find((project) => project.workspace.nodes.some((entry) => entry.id === 'main'))
    expect(main).toBeTruthy()
    const switched = useProjectStore.getState().switchProject(main!.id)
    expect(switched?.id).toBe(main!.id)
    expect(useProjectStore.getState().currentProjectId).toBe(main!.id)

    const nextActive = useProjectStore.getState().deleteProject(main!.id)
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(useProjectStore.getState().currentProjectId).toBe(nextActive.id)
  })

  it('persists upload targets per project', async () => {
    const { useProjectStore } = await freshStore()
    const mainId = useProjectStore.getState().currentProjectId

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
})

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

const mocks = vi.hoisted(() => ({
  checkBackend: vi.fn(),
  listPorts: vi.fn(),
  listCores: vi.fn(),
  uploadSketch: vi.fn(),
  uploadShow: vi.fn(),
  locateCli: vi.fn(),
  installCli: vi.fn(),
  installCore: vi.fn(),
  monitorSerial: vi.fn(),
  listProjects: vi.fn(),
  saveProjectToDisk: vi.fn(),
  deleteProjectFromDisk: vi.fn(),
}))

vi.mock('../../utils/backendClient', () => ({
  checkBackend: mocks.checkBackend,
  listPorts: mocks.listPorts,
  listCores: mocks.listCores,
  uploadSketch: mocks.uploadSketch,
  uploadShow: mocks.uploadShow,
  locateCli: mocks.locateCli,
  installCli: mocks.installCli,
  installCore: mocks.installCore,
  monitorSerial: mocks.monitorSerial,
  listProjects: mocks.listProjects,
  saveProjectToDisk: mocks.saveProjectToDisk,
  deleteProjectFromDisk: mocks.deleteProjectFromDisk,
}))

async function freshStores() {
  vi.resetModules()
  const projectStore = await import('../projectStore')
  const uploadStore = await import('../uploadStore')
  return { ...projectStore, ...uploadStore }
}

describe('uploadStore', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.listPorts.mockResolvedValue([])
    mocks.listCores.mockResolvedValue([])
    mocks.checkBackend.mockResolvedValue(null)
    mocks.uploadSketch.mockResolvedValue(undefined)
    mocks.uploadShow.mockResolvedValue(undefined)
    mocks.listProjects.mockResolvedValue(null)
    mocks.saveProjectToDisk.mockResolvedValue(false)
    mocks.deleteProjectFromDisk.mockResolvedValue(false)
  })

  it('tracks board and port per project when switching', async () => {
    const { useProjectStore, useUploadStore } = await freshStores()
    const mainId = useProjectStore.getState().createProject('Main', workspace(['main'])).id

    useUploadStore.getState().setSelectedFqbn('esp32:esp32:esp32s3')
    useUploadStore.getState().setSelectedPort('COM7')

    const showA = useProjectStore.getState().createProject('Show A', workspace(['a']), {
      uploadTarget: {
        selectedFqbn: 'rp2040:rp2040:rpipico',
        selectedPort: 'COM9',
      },
    })

    expect(useUploadStore.getState().selectedFqbn).toBe('rp2040:rp2040:rpipico')
    expect(useUploadStore.getState().selectedPort).toBe('COM9')

    useProjectStore.getState().switchProject(mainId)
    expect(useUploadStore.getState().selectedFqbn).toBe('esp32:esp32:esp32s3')
    expect(useUploadStore.getState().selectedPort).toBe('COM7')

    useProjectStore.getState().switchProject(showA.id)
    expect(useUploadStore.getState().selectedFqbn).toBe('rp2040:rp2040:rpipico')
    expect(useUploadStore.getState().selectedPort).toBe('COM9')
  })

  it('re-uploads the last cached sketch for the current project', async () => {
    const { useProjectStore, useUploadStore } = await freshStores()
    useProjectStore.getState().createProject('Main', workspace(['main']))
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false },
      selectedFqbn: 'esp32:esp32:esp32s3',
      selectedPort: 'COM7',
    })

    await useUploadStore.getState().runUpload('void loop() {}', 'PSRAM=opi')
    expect(mocks.uploadSketch).toHaveBeenCalledWith(
      'void loop() {}',
      'esp32:esp32:esp32s3:PSRAM=opi',
      'COM7',
      expect.any(Function),
    )

    mocks.uploadSketch.mockClear()
    await useUploadStore.getState().runLastUpload()
    expect(mocks.uploadSketch).toHaveBeenCalledWith(
      'void loop() {}',
      'esp32:esp32:esp32s3:PSRAM=opi',
      'COM7',
      expect.any(Function),
    )

    const other = useProjectStore.getState().createProject('Other', workspace(['b']))
    expect(other.id).toBe(useProjectStore.getState().currentProjectId)
    mocks.uploadSketch.mockClear()
    await useUploadStore.getState().runLastUpload()
    expect(mocks.uploadSketch).not.toHaveBeenCalled()
  })

  it('re-syncs the selected port when it disappears from a refresh (board re-enumerated on a new port)', async () => {
    const { useUploadStore } = await freshStores()
    mocks.listPorts.mockResolvedValueOnce([{ address: 'COM5', label: 'COM5', boards: [] }])
    await useUploadStore.getState().refreshPorts()
    expect(useUploadStore.getState().selectedPort).toBe('COM5')

    // The board was unplugged and replugged; it now enumerates on COM4 and
    // COM5 is gone. A stale `selectedPort` would otherwise keep uploads
    // silently targeting a port that no longer exists.
    mocks.listPorts.mockResolvedValueOnce([{ address: 'COM4', label: 'COM4', boards: [] }])
    await useUploadStore.getState().refreshPorts()
    expect(useUploadStore.getState().selectedPort).toBe('COM4')
  })
})

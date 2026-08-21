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
  copyToSdCard: vi.fn(),
  compileCheck: vi.fn(),
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
  copyToSdCard: mocks.copyToSdCard,
  compileCheck: mocks.compileCheck,
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
    mocks.copyToSdCard.mockResolvedValue(undefined)
    mocks.compileCheck.mockResolvedValue({ ok: true, overflow: false, target: '', flash: null, ram: null, error: null })
  })

  describe('show upload — serial vs card reader', () => {
    const showPayload = () => ({
      player: 'player-ino',
      files: [
        { path: '/music/Song.mp3', data: new Blob(['x'.repeat(64)]) },
        { path: '/shows/Song.show', data: new Blob(['y'.repeat(16)]) },
      ],
    })

    async function readyStore() {
      const { useProjectStore, useUploadStore } = await freshStores()
      useProjectStore.getState().createProject('Main', workspace(['main']))
      useUploadStore.setState({
        helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false },
        selectedFqbn: 'esp32:esp32:esp32s3',
        selectedPort: 'COM7',
      })
      return useUploadStore
    }

    it('sends the files over serial when no reader is available', async () => {
      const useUploadStore = await readyStore()
      await useUploadStore.getState().runShowUpload(showPayload())

      expect(mocks.copyToSdCard).not.toHaveBeenCalled()
      expect(mocks.uploadShow).toHaveBeenCalledTimes(1)
      expect(mocks.uploadShow.mock.calls[0][0].files).toHaveLength(2)
      expect(useUploadStore.getState().sdPrompt).toBeNull()
    })

    it('writes the card directly, then flashes with nothing left to transfer', async () => {
      const useUploadStore = await readyStore()
      useUploadStore.getState().setCardReader(true)

      const done = useUploadStore.getState().runShowUpload(showPayload())

      // Stage one: choose a drive.
      await vi.waitFor(() => expect(useUploadStore.getState().sdPrompt?.stage).toBe('insert'))
      expect(useUploadStore.getState().sdPrompt).toMatchObject({ fileCount: 2, totalBytes: 80 })
      useUploadStore.getState().resolveSdPrompt('E:\\')

      // Stage two: acknowledge the card is back before the flash.
      await vi.waitFor(() => expect(useUploadStore.getState().sdPrompt?.stage).toBe('reinsert'))
      expect(mocks.copyToSdCard).toHaveBeenCalledTimes(1)
      expect(mocks.copyToSdCard.mock.calls[0][0]).toMatchObject({ drive: 'E:\\' })
      expect(mocks.uploadShow).not.toHaveBeenCalled()   // not until the card is back
      useUploadStore.getState().resolveSdPrompt('')

      await done
      // The files are already on the card; sending them again over serial
      // would undo the entire point of the reader path.
      expect(mocks.uploadShow).toHaveBeenCalledTimes(1)
      expect(mocks.uploadShow.mock.calls[0][0].files).toEqual([])
      expect(useUploadStore.getState().sdPrompt).toBeNull()
    })

    it('checks the player fits before asking for the card', async () => {
      // The flash is last on this path, so without the check the user does two
      // card swaps and only then learns the design overflows DRAM. The live
      // capacity meter does not cover it — that measures the normal sketch,
      // not the player.
      const useUploadStore = await readyStore()
      useUploadStore.getState().setCardReader(true)
      mocks.compileCheck.mockResolvedValue({
        ok: false, overflow: true, target: '', flash: null, ram: null, error: null,
      })

      await useUploadStore.getState().runShowUpload(showPayload())

      expect(useUploadStore.getState().sdPrompt).toBeNull()
      expect(mocks.copyToSdCard).not.toHaveBeenCalled()
      expect(mocks.uploadShow).not.toHaveBeenCalled()
      expect(useUploadStore.getState().status).toMatchObject({ phase: 'error' })
      expect(useUploadStore.getState().log).toContain('will not fit')
    })

    it('serial uploads skip the pre-check — that path already builds first', async () => {
      const useUploadStore = await readyStore()
      await useUploadStore.getState().runShowUpload(showPayload())
      expect(mocks.compileCheck).not.toHaveBeenCalled()
    })

    it('a helper that vanishes mid-check does not block the upload', async () => {
      // The real build runs next and reports properly; refusing here would
      // turn a transient helper blip into a dead button.
      const useUploadStore = await readyStore()
      useUploadStore.getState().setCardReader(true)
      mocks.compileCheck.mockRejectedValue(new Error('offline'))

      const done = useUploadStore.getState().runShowUpload(showPayload())
      await vi.waitFor(() => expect(useUploadStore.getState().sdPrompt?.stage).toBe('insert'))
      useUploadStore.getState().resolveSdPrompt(null)
      await done
    })

    it('cancelling the card swap writes nothing and flashes nothing', async () => {
      // Falling back to serial here would silently do the slow thing the user
      // just declined, on hardware they may not have plugged in.
      const useUploadStore = await readyStore()
      useUploadStore.getState().setCardReader(true)

      const done = useUploadStore.getState().runShowUpload(showPayload())
      await vi.waitFor(() => expect(useUploadStore.getState().sdPrompt?.stage).toBe('insert'))
      useUploadStore.getState().resolveSdPrompt(null)
      await done

      expect(mocks.copyToSdCard).not.toHaveBeenCalled()
      expect(mocks.uploadShow).not.toHaveBeenCalled()
      expect(useUploadStore.getState().busy).toBe(false)
      expect(useUploadStore.getState().sdPrompt).toBeNull()
    })

    it('remembers the reader across reloads — it describes the desk, not the upload', async () => {
      const first = await readyStore()
      first.getState().setCardReader(true)

      const { useUploadStore: reloaded } = await freshStores()
      expect(reloaded.getState().cardReader).toBe(true)
    })
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
      undefined,
      // No board profile on this graph, so nothing overrides the board id's own
      // flash manifest — the behaviour every unrecorded board keeps.
      undefined,
    )

    mocks.uploadSketch.mockClear()
    await useUploadStore.getState().runLastUpload()
    expect(mocks.uploadSketch).toHaveBeenCalledWith(
      'void loop() {}',
      'esp32:esp32:esp32s3:PSRAM=opi',
      'COM7',
      expect.any(Function),
      undefined,
      // No board profile on this graph, so nothing overrides the board id's own
      // flash manifest — the behaviour every unrecorded board keeps.
      undefined,
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

describe('board catalogue covers the Board node', () => {
  it('offers an upload target for every physical board profile', async () => {
    // The Board node picks a *profile*; upload picks an FQBN. If a profile's
    // target is missing here, the board can be chosen on the canvas and then
    // not as an upload target — which reads as a broken board rather than a
    // gap between two lists.
    const { BOARDS } = await import('../uploadStore')
    const { BOARD_PROFILES } = await import('../../build/boardProfiles')
    const catalogue = new Set(BOARDS.map((b) => b.fqbn))

    const missing = BOARD_PROFILES
      .flatMap((p) => p.compatibleFqbns)
      .filter((fqbn) => !catalogue.has(fqbn))
    expect([...new Set(missing)]).toEqual([])
  })

  it('carries no duplicate FQBNs', async () => {
    const { BOARDS } = await import('../uploadStore')
    const fqbns = BOARDS.map((b) => b.fqbn)
    expect(new Set(fqbns).size).toBe(fqbns.length)
  })

  it('only declares PSRAM options the ESP32 core actually exposes', async () => {
    // Verified against `arduino-cli board details` per board. LOLIN S2 Mini and
    // LOLIN S3 carry PSRAM on the module but expose no PSRAM menu, so declaring
    // one would append an option the core rejects and break the upload.
    const { BOARDS } = await import('../uploadStore')
    const byFqbn = new Map(BOARDS.map((b) => [b.fqbn, b]))
    for (const fqbn of ['esp32:esp32:lolin_s2_mini', 'esp32:esp32:lolin_s3', 'esp32:esp32:nodemcu-32s']) {
      expect(byFqbn.get(fqbn)?.psram, fqbn).toBeUndefined()
    }
    expect(byFqbn.get('esp32:esp32:adafruit_feather_esp32s3')?.psram?.map((p) => p.opt))
      .toEqual(['PSRAM=opi', 'PSRAM=enabled'])
  })
})

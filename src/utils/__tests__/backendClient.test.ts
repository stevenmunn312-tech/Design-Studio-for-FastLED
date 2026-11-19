import { afterEach, describe, expect, it, vi } from 'vitest'
import { engineVersionNumber, saveProjectToDisk, saveProjectWithDialog, uploadShow } from '../backendClient'

describe('backendClient uploadShow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serializes the physical flash size and native-USB route in show metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await uploadShow({
      fqbn: 'esp32:esp32:esp32s3:PSRAM=opi',
      port: 'COM7',
      player: 'player-ino',
      files: [],
      flashMb: 16,
      usbCdcOnBoot: true,
    }, vi.fn())

    const body = fetchMock.mock.calls[0][1]?.body as FormData
    expect(JSON.parse(String(body.get('meta')))).toEqual({
      fqbn: 'esp32:esp32:esp32s3:PSRAM=opi',
      port: 'COM7',
      paths: [],
      flashMb: 16,
      usbCdcOnBoot: true,
    })
  })
})

describe('backendClient request timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // A helper that takes the connection and never answers counts as offline.
  it('gives up on a save the helper never answers', async () => {
    // Fake timers do not reach AbortSignal.timeout, so fire it by hand.
    const timer = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timer.signal)
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })))
    const saved = saveProjectToDisk({
      id: 'p', name: 'P', createdAt: 1, updatedAt: 1, workspace: { nodes: [], edges: [] },
    })
    expect(timeout).toHaveBeenCalledWith(15_000)
    timer.abort(new DOMException('timed out', 'TimeoutError'))
    await expect(saved).resolves.toBe(false)
  })
})

describe('backendClient saveProjectWithDialog', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Review 2026-11-18: the save that follows a Save As named no base, and the
  // helper refused it against the file the dialog had just written.
  it('takes the version the dialog wrote as the copy\'s disk base', async () => {
    const project = { id: 'p', name: 'Lamp', createdAt: 1, updatedAt: 500, workspace: { nodes: [], edges: [] } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, canceled: false, project })))
    await expect(saveProjectWithDialog(project)).resolves.toEqual({ ...project, diskBase: 500 })
  })
})

describe('engineVersionNumber', () => {
  it('keeps only the version from each tool banner', () => {
    expect(engineVersionNumber('fbuild 2.5.45')).toBe('2.5.45')
    expect(engineVersionNumber('arduino-cli  Version: 1.3.1 Commit: 08ff7e2b Date: 2025-08-28T12:00:00Z')).toBe('1.3.1')
    expect(engineVersionNumber('2.5.51')).toBe('2.5.51')
  })

  it('passes an unrecognised banner through and drops an empty one', () => {
    expect(engineVersionNumber('nightly')).toBe('nightly')
    expect(engineVersionNumber('  ')).toBeNull()
    expect(engineVersionNumber(null)).toBeNull()
  })
})

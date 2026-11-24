import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EMBED_PARAM, embedRequest } from '../embedMode'

describe('embed link', () => {
  it('reads the starter an embed link names', () => {
    expect(embedRequest('')).toBeNull()
    expect(embedRequest('?other=1')).toBeNull()
    expect(embedRequest('?starter=fire')).toBeNull()
    expect(embedRequest('?iframe=false')).toBeNull()
    expect(embedRequest('?iframe=true')).toBe('')
    expect(embedRequest('?iframe=true&starter=fire')).toBe('fire')
  })

  // index.html swaps localStorage for memory before any module loads, so it
  // cannot import the parameter's name; it must read the same one.
  it('is read by index.html under the same name', () => {
    const page = readFileSync('index.html', 'utf8')
    expect(page).toContain(`new URLSearchParams(location.search).get('${EMBED_PARAM}') === 'true'`)
    expect(page.indexOf("'localStorage'")).toBeLessThan(page.indexOf('type="module"'))
  })
})

describe('embedded demo and the upload helper', () => {
  // The cold import of the client is paid once, not inside the first test.
  beforeAll(async () => { await import('../backendClient') }, 60_000)

  afterEach(() => {
    vi.doUnmock('../embedMode')
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('never sends a request, and reads to callers as helper offline', async () => {
    vi.resetModules()
    vi.doMock('../embedMode', () => ({ EMBEDDED: true }))
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const client = await import('../backendClient')

    await expect(client.checkBackend()).resolves.toBeNull()
    await expect(client.listProjects()).resolves.toBeNull()
    await expect(client.listPorts()).resolves.toEqual([])
    await expect(client.uploadSketch('void setup() {}', 'esp32:esp32:esp32', 'COM1', vi.fn())).rejects.toThrow(/embedded demo/)
    expect(fetchMock).not.toHaveBeenCalled()
    // What an <audio> element or a download link would be pointed at.
    expect(new URL(client.BACKEND_URL).hostname).toBe('helper.invalid')
  })

  it('reaches the helper as before when the page is not embedded', async () => {
    vi.resetModules()
    vi.doMock('../embedMode', () => ({ EMBEDDED: false }))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, arduinoCli: true })))
    vi.stubGlobal('fetch', fetchMock)
    const client = await import('../backendClient')

    await expect(client.checkBackend()).resolves.toEqual({ ok: true, arduinoCli: true })
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${client.BACKEND_URL}/api/health`)
  })
})

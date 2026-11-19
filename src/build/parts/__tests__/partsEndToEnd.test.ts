// @vitest-environment jsdom
// Phase A proof: the real client, library and load path against a real HTTP
// server on 127.0.0.1, serving a site built by scripts/parts/sign.mjs with a
// throwaway key. Nothing here touches a fixed port, the Projects folder or a
// real key.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { URL as NodeURL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PART_CATALOGUE, partById, partOrigin, partRenderSrc, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../partCatalogue'
import { createPartsLibrary, installedState, resetPartsLibraryForTests, type PartsLibrary } from '../partsLibrary'
import { partTypeById } from '../partTypes'
import type { PartManifest } from '../manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../manifest/vocabulary'
import { createMemoryCache, PARTS_BASE_URL, searchParts, TRUSTED_KEYS, type IndexPart } from '../remote'
import { fakeWebp } from '../remote/__tests__/testKit'
import {
  collectSavedParts,
  overrideTrustedPartKeysForTests,
  resetSignedPartsForTests,
  signedEnvelopeFor,
} from '../signedParts'
import { buildShareUrl, readSharedWorkspace } from '../../../utils/shareGraph'
import { loadWorkspaceAfterParts, useGraphStore, type StudioNode } from '../../../state/graphStore'

const REPO = resolve(__dirname, '..', '..', '..', '..')
const SCRIPT = join(REPO, 'scripts', 'parts', 'sign.mjs')
const BASE_MONITOR = 'adafruit-ina219-current-sensor'
const W = 320
const H = 200
const work = mkdtempSync(join(tmpdir(), 'dsf-e2e-'))

const run = (...args: string[]) => {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`sign.mjs ${args[0]} failed: ${result.stderr}`)
  return result.stdout
}

function keypair(name: string): { keyId: string; keyPath: string; publicKey: string } {
  const keyPath = join(work, `${name}.pem`)
  const publicKey = /publicKey: (\S+)/.exec(run('keygen', keyPath))![1]
  return { keyId: name, keyPath, publicKey }
}

/** A real bundled manifest under a fresh id. */
function manifest(partId: string, revision: number, extra: Record<string, unknown> = {}): PartManifest {
  const entry = JSON.parse(JSON.stringify(PART_CATALOGUE[BASE_MONITOR])) as PartCatalogueEntry
  return {
    ...entry,
    partId,
    label: `E2E ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision,
    partTypes: ['PowerMonitorInput'],
    categories: ['monitors'],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    pads: [],
    render: { file: `Parts/${partId}.webp`, widthPx: W, heightPx: H },
    ...extra,
  } as unknown as PartManifest
}

interface Spec { partId: string; revision: number; extra?: Record<string, unknown>; picture?: number }

/** Sign `specs` into a static site under `dir` with `signer`, using the repo's tool. */
function buildSite(dir: string, specs: Spec[], signer: { keyId: string; keyPath: string }): void {
  const manifests = join(dir, '..', `${dir.split(/[\\/]/).pop()}-src`)
  rmSync(manifests, { recursive: true, force: true })
  mkdirSync(manifests, { recursive: true })
  writeFileSync(
    join(manifests, 'categories.json'),
    JSON.stringify([{ id: 'monitors', label: 'Monitors', order: 1, parent: null }]),
  )
  for (const spec of specs) {
    const name = `${spec.partId}-r${spec.revision}`
    writeFileSync(join(manifests, `${name}.json`), JSON.stringify(manifest(spec.partId, spec.revision, spec.extra)))
    // Each revision's picture differs by one byte so its hash differs.
    const picture = Buffer.from(fakeWebp(W, H))
    picture[picture.length - 1] = spec.picture ?? spec.revision
    writeFileSync(join(manifests, `${name}.webp`), picture)
  }
  run('index', manifests, '--out-dir', dir, '--key', signer.keyPath, '--key-id', signer.keyId)
}

interface Site {
  dir: string
  baseUrl: string
  requests: string[]
  tamper: Map<string, (bytes: Buffer) => Buffer>
  close(): Promise<void>
}

async function serve(dir: string): Promise<Site> {
  const requests: string[] = []
  const tamper = new Map<string, (bytes: Buffer) => Buffer>()
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '')
    requests.push(path)
    try {
      if (path.includes('..')) throw new Error('no')
      let bytes = readFileSync(join(dir, path))
      const change = tamper.get(path)
      if (change) bytes = change(bytes)
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': bytes.length })
      res.end(bytes)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return {
    dir,
    baseUrl: `http://127.0.0.1:${port}/`,
    requests,
    tamper,
    close: () => new Promise<void>((done) => {
      server.closeAllConnections()
      server.close(() => done())
    }),
  }
}

const flip = (at: number) => (bytes: Buffer): Buffer => {
  const copy = Buffer.from(bytes)
  copy[at] ^= 1
  return copy
}

const main = keypair('main-key')
const stranger = keypair('stranger-key')
const trusted = { keyId: main.keyId, publicKey: main.publicKey }

function library(site: { baseUrl: string }, cache = createMemoryCache(), keys = [trusted]): PartsLibrary {
  return createPartsLibrary({ baseUrl: site.baseUrl, cache, clientOptions: { trustedKeys: keys } })
}

function nodeFor(partId: string): StudioNode {
  return {
    id: `n-${partId}`, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: 'Monitor', nodeType: 'PowerMonitorInput', category: 'output', properties: { partId }, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const OPENED: Array<() => void> = []
const SITES: Site[] = []

beforeAll(() => {
  // jsdom has no object URLs; Node's are enough for a verified picture.
  const urlGlobal = globalThis.URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown }
  if (typeof urlGlobal.createObjectURL !== 'function') {
    urlGlobal.createObjectURL = (blob: Blob) => NodeURL.createObjectURL(blob as never)
    urlGlobal.revokeObjectURL = (url: string) => NodeURL.revokeObjectURL(url)
  }
})

beforeEach(() => {
  const definition = partTypeById('PowerMonitorInput') as { downloadable: boolean }
  const before = definition.downloadable
  definition.downloadable = true
  OPENED.push(() => { definition.downloadable = before })
  overrideTrustedPartKeysForTests([trusted])
  localStorage.clear()
  useGraphStore.setState({
    nodes: [], edges: [], selectedNodeId: null, graphData: {}, clipboard: null,
    graphs: { root: { id: 'root', name: 'Main' } }, activeGraphId: 'root',
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  while (OPENED.length > 0) OPENED.pop()!()
  overrideTrustedPartKeysForTests(null)
  resetRegisteredPartsForTests()
  resetSignedPartsForTests()
  resetPartsLibraryForTests(null)
  while (SITES.length > 0) await SITES.pop()!.close()
})

afterAll(() => rmSync(work, { recursive: true, force: true }))

async function newSite(name: string, specs: Spec[], signer = main): Promise<Site> {
  const dir = join(work, name)
  buildSite(dir, specs, signer)
  const site = await serve(dir)
  SITES.push(site)
  return site
}

describe('a signed site on a real local HTTP server', () => {
  it('runs the whole session: search, install, picture, save, reload, share, update, offline, uninstall', async () => {
    const site = await newSite('site', [
      { partId: 'e2e-alpha-monitor', revision: 1 },
      { partId: 'e2e-beta-monitor', revision: 1 },
      { partId: 'e2e-gamma-monitor', revision: 1 },
    ])
    const cache = createMemoryCache()
    const lib = library(site, cache)
    expect(lib.configured).toBe(true)

    // Fetch the index and search it.
    const loaded = await lib.loadIndex()
    expect(loaded).toMatchObject({ ok: true, source: 'network' })
    if (!loaded.ok) return
    expect(loaded.index.parts.map((p) => p.partId).sort()).toEqual(['e2e-alpha-monitor', 'e2e-beta-monitor', 'e2e-gamma-monitor'])
    expect(searchParts(loaded.index.parts, 'beta').map((p) => p.partId)).toEqual(['e2e-beta-monitor'])
    const alpha = loaded.index.parts.find((p) => p.partId === 'e2e-alpha-monitor') as IndexPart
    const beta = loaded.index.parts.find((p) => p.partId === 'e2e-beta-monitor') as IndexPart
    expect(installedState(alpha)).toBe('available')

    // A result row's picture verifies before it is shown, without installing.
    expect(await lib.renderBytes(alpha)).not.toBeNull()
    expect(partOrigin('e2e-alpha-monitor')).toBeUndefined()

    // Download and install; the picture is the verified bytes, as a blob URL.
    expect(await lib.install(alpha)).toEqual({ ok: true, status: 'added', partId: 'e2e-alpha-monitor', revision: 1 })
    expect(await lib.install(beta)).toMatchObject({ ok: true })
    expect(partOrigin('e2e-alpha-monitor')).toBe('downloaded')
    expect(installedState(alpha)).toBe('installed')
    expect(partRenderSrc('e2e-alpha-monitor')).toMatch(/^blob:/)

    // Collect into a workspace payload; it carries the signed envelope and revision.
    const nodes = [nodeFor('e2e-alpha-monitor')]
    const parts = collectSavedParts(nodes)
    expect(parts['e2e-alpha-monitor'].revision).toBe(1)
    expect(parts['e2e-alpha-monitor'].envelope).toBeDefined()
    expect(signedEnvelopeFor('e2e-alpha-monitor')).toBeDefined()
    expect(Object.keys(parts)).toEqual(['e2e-alpha-monitor'])

    // Reload through the real load path with a cleared registry and no cache.
    const saved = JSON.parse(JSON.stringify({ nodes, edges: [], parts })) as { nodes: StudioNode[]; edges: never[]; parts: typeof parts }
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    expect(partOrigin('e2e-alpha-monitor')).toBeUndefined()
    expect(await loadWorkspaceAfterParts(saved.nodes, saved.edges, saved as never)).toBe(true)
    expect(partOrigin('e2e-alpha-monitor')).toBe('downloaded')
    expect(useGraphStore.getState().nodes.map((n) => n.id)).toContain('n-e2e-alpha-monitor')

    // The next session: restore from the cache (offline-capable), same picture by pinned hash.
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    const before = site.requests.length
    expect(await library(site, cache).restoreInstalled()).toBe(2)
    expect(site.requests.length).toBe(before)
    expect(partRenderSrc('e2e-alpha-monitor')).toMatch(/^blob:/)

    // Share link carrying envelopes, opened by a receiver with an empty cache and registry.
    const link = buildShareUrl({ nodes, edges: [], parts } as never)
    window.location.hash = new NodeURL(link).hash
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    const receivedRequests = site.requests.length
    const received = readSharedWorkspace()
    expect(received).not.toBeNull()
    const receiver = library(site, createMemoryCache())
    expect(await receiver.resolveReferenced(received!.workspace.parts!)).toEqual([])
    expect(await loadWorkspaceAfterParts(received!.workspace.nodes, received!.workspace.edges, received!.workspace)).toBe(true)
    expect(partOrigin('e2e-alpha-monitor')).toBe('downloaded')
    expect(site.requests.length).toBe(receivedRequests)

    // A link too long to carry envelopes names parts by id and revision; the receiver fetches them.
    expect(await library(site, cache).restoreInstalled()).toBe(2)
    const padded = [nodeFor('e2e-alpha-monitor'), nodeFor('e2e-beta-monitor')]
    padded.forEach((n, i) => {
      ;(n.data.properties as Record<string, unknown>).note = Array.from({ length: 6000 }, (_, k) => ((k * 2654435761 + i * 40503) >>> 0).toString(36)).join(' ')
    })
    const bigParts = collectSavedParts(padded)
    const longLink = buildShareUrl({ nodes: padded, edges: [], parts: bigParts } as never)
    window.location.hash = new NodeURL(longLink).hash
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    const shared = readSharedWorkspace()
    expect(shared).not.toBeNull()
    const refs = shared!.workspace.parts!
    expect(Object.keys(refs).sort()).toEqual(['e2e-alpha-monitor', 'e2e-beta-monitor'])
    // The link is over the limit, so it carries no envelopes.
    expect(Object.values(refs).every((entry) => !entry.envelope)).toBe(true)
    const fresh = library(site, createMemoryCache())
    expect(await fresh.resolveReferenced(refs)).toEqual([])
    expect(partOrigin('e2e-alpha-monitor')).toBe('downloaded')
    expect(partOrigin('e2e-beta-monitor')).toBe('downloaded')
    // A revision the index does not offer stays unresolved, never guessed.
    expect(await fresh.resolveReferenced({ 'e2e-gamma-monitor': { revision: 9 } })).toEqual(['e2e-gamma-monitor'])

    // Back to the session library; the author publishes revision 2 of alpha and the app offers it.
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    expect(await lib.restoreInstalled()).toBe(2)
    buildSite(site.dir, [
      { partId: 'e2e-alpha-monitor', revision: 2 },
      { partId: 'e2e-beta-monitor', revision: 1 },
      { partId: 'e2e-gamma-monitor', revision: 1 },
    ], main)
    const refreshed = await lib.loadIndex({ refresh: true })
    expect(refreshed).toMatchObject({ ok: true, source: 'network' })
    if (!refreshed.ok) return
    const alpha2 = refreshed.index.parts.find((p) => p.partId === 'e2e-alpha-monitor') as IndexPart
    expect(alpha2.revision).toBe(2)
    expect(installedState(alpha2)).toBe('update')
    expect(installedState(refreshed.index.parts.find((p) => p.partId === 'e2e-beta-monitor') as IndexPart)).toBe('installed')
    const firstPicture = partRenderSrc('e2e-alpha-monitor')
    expect(await lib.install(alpha2)).toEqual({ ok: true, status: 'replaced', partId: 'e2e-alpha-monitor', revision: 2 })
    expect((partById('e2e-alpha-monitor') as unknown as { revision: number }).revision).toBe(2)
    expect(collectSavedParts(nodes)['e2e-alpha-monitor'].revision).toBe(2)
    expect(partRenderSrc('e2e-alpha-monitor')).toMatch(/^blob:/)
    expect(partRenderSrc('e2e-alpha-monitor')).not.toBe(firstPicture)
    expect(installedState(alpha2)).toBe('installed')

    // The server goes away mid-session: the cached, re-verified index is served.
    await site.close()
    SITES.splice(SITES.indexOf(site), 1)
    const offline = await lib.loadIndex({ refresh: true })
    expect(offline).toMatchObject({ ok: true, source: 'cache', refreshError: 'network' })
    if (offline.ok) expect(offline.index.parts).toHaveLength(3)
    // Installed parts and their pictures do not need it.
    expect(await lib.renderBytes(alpha2)).not.toBeNull()
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    expect(await library(site, cache).restoreInstalled()).toBe(2)
    expect(partOrigin('e2e-alpha-monitor')).toBe('downloaded')

    // Uninstall: gone for the session and the next one; a save made earlier still opens.
    expect(await lib.uninstall('e2e-beta-monitor')).toEqual({ ok: true, partId: 'e2e-beta-monitor' })
    expect(await lib.uninstall('e2e-alpha-monitor', { inUse: () => true })).toEqual({ ok: false, reason: 'in-use' })
    expect(partOrigin('e2e-beta-monitor')).toBeUndefined()
    expect(partRenderSrc('e2e-beta-monitor')).toBeNull()
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    expect(await library(site, cache).restoreInstalled()).toBe(1)
    expect(partOrigin('e2e-beta-monitor')).toBeUndefined()
  })
})

describe('what must not load', () => {
  it('refuses a package with one tampered byte, and installs nothing', async () => {
    const site = await newSite('tampered-package', [{ partId: 'e2e-bad-package', revision: 1 }])
    site.tamper.set('packages/e2e-bad-package@1.json', flip(60))
    const lib = library(site)
    const loaded = await lib.loadIndex()
    if (!loaded.ok) throw new Error('index should load')
    const outcome = await lib.install(loaded.index.parts[0])
    expect(outcome).toMatchObject({ ok: false, reason: 'unverified', detail: 'hash-mismatch' })
    expect(partOrigin('e2e-bad-package')).toBeUndefined()
  })

  it('refuses a tampered render: the part installs but draws its placeholder', async () => {
    const site = await newSite('tampered-render', [{ partId: 'e2e-bad-render', revision: 1 }])
    site.tamper.set('renders/e2e-bad-render@1.webp', flip(30))
    const lib = library(site)
    const loaded = await lib.loadIndex()
    if (!loaded.ok) throw new Error('index should load')
    expect(await lib.renderBytes(loaded.index.parts[0])).toBeNull()
    expect(await lib.install(loaded.index.parts[0])).toMatchObject({ ok: true })
    expect(partRenderSrc('e2e-bad-render')).toBeNull()
  })

  it('refuses an index signed by a key the app does not trust', async () => {
    const site = await newSite('untrusted', [{ partId: 'e2e-stranger', revision: 1 }], stranger)
    const lib = library(site)
    expect((await lib.loadIndex()).ok).toBe(false)
    // A package from that site fails too, even with a hand-built index entry.
    const entry = JSON.parse(readFileSync(join(site.dir, 'index.json'), 'utf8')) as { payload: string }
    const part = (JSON.parse(entry.payload) as { parts: IndexPart[] }).parts[0]
    expect(await lib.install(part)).toMatchObject({ ok: false, reason: 'unverified' })
    expect(partOrigin('e2e-stranger')).toBeUndefined()
  })

  it('keeps an old cached index when the site later serves one signed by a stranger', async () => {
    const good = await newSite('good-first', [{ partId: 'e2e-keeps', revision: 1 }])
    const cache = createMemoryCache()
    expect((await library(good, cache).loadIndex()).ok).toBe(true)
    const bad = await newSite('stranger-second', [{ partId: 'e2e-evil', revision: 1 }], stranger)
    const result = await library(bad, cache).loadIndex()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('cache')
      expect(result.index.parts.map((p) => p.partId)).toEqual(['e2e-keeps'])
    }
  })

  it('refuses a manifest written for a newer app, saying so', async () => {
    const site = await newSite('newer', [{ partId: 'e2e-future', revision: 1, extra: { manifestVersion: PART_MANIFEST_VERSION + 1 } }])
    const lib = library(site)
    const loaded = await lib.loadIndex()
    if (!loaded.ok) throw new Error('index should load')
    expect(await lib.install(loaded.index.parts[0])).toMatchObject({ ok: false, reason: 'needs-newer-app' })
    expect(partOrigin('e2e-future')).toBeUndefined()
  })

  it('with the server down and nothing cached, reports unavailable', async () => {
    const site = await newSite('down', [{ partId: 'e2e-down', revision: 1 }])
    await site.close()
    SITES.pop()
    expect(await library(site).loadIndex()).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('production stays dormant', () => {
  it('ships with no parts host and no trusted key, and a default library never makes a request', async () => {
    expect(PARTS_BASE_URL).toBe('')
    expect(TRUSTED_KEYS).toHaveLength(0)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const beacon = typeof navigator.sendBeacon === 'function' ? vi.spyOn(navigator, 'sendBeacon') : null

    const lib = createPartsLibrary({ cache: createMemoryCache() })
    expect(lib.configured).toBe(false)
    const entry: IndexPart = {
      partId: 'dormant', revision: 1, partTypes: ['PowerMonitorInput'], label: 'Dormant', interfaces: [], chips: [],
      categories: [], verification: 'reviewed',
      package: { url: 'packages/dormant@1.json', sha256: 'a'.repeat(64), bytes: 10 },
      render: { url: 'renders/dormant@1.webp', sha256: 'b'.repeat(64), bytes: 10, widthPx: 1, heightPx: 1 },
    }
    expect(await lib.loadIndex({ refresh: true })).toEqual({ ok: false, reason: 'not-configured' })
    expect(await lib.install(entry)).toEqual({ ok: false, reason: 'not-configured' })
    expect(await lib.resolveReferenced({ dormant: { revision: 1 } })).toEqual(['dormant'])
    expect(await lib.renderBytes(entry)).toBeNull()
    expect(await lib.restoreInstalled()).toBe(0)
    await lib.attachMissingRenders(null)

    // The app's load path with a saved part and no host.
    const nodes = [nodeFor('dormant')]
    await loadWorkspaceAfterParts(nodes, [], { parts: { dormant: { revision: 1 } } } as never)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
    if (beacon) expect(beacon).not.toHaveBeenCalled()
  })
})

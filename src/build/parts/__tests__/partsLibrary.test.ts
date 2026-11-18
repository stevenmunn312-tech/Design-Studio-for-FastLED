// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PART_CATALOGUE, partById, partOrigin, registerParts, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../partCatalogue'
import { createPartsLibrary, installedState, type PartsLibrary } from '../partsLibrary'
import { partTypeById } from '../partTypes'
import type { PartManifest } from '../manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../manifest/vocabulary'
import { createMemoryCache, type PartsCache } from '../remote'
import type { IndexPart } from '../remote'
import { BASE, fakeHost, makeSigner, sha256Hex, signEnvelope, type Hosted } from '../remote/__tests__/testKit'
import { overrideTrustedPartKeysForTests, resetSignedPartsForTests } from '../signedParts'

const BASE_MONITOR = 'adafruit-ina219-current-sensor'
const encoder = new TextEncoder()
const signer = makeSigner('lib-key')
const stranger = makeSigner('other-key')

function manifest(partId: string, revision = 1, extra: Record<string, unknown> = {}): PartManifest {
  const entry = PART_CATALOGUE[BASE_MONITOR] as PartCatalogueEntry
  return {
    ...(JSON.parse(JSON.stringify(entry)) as PartCatalogueEntry),
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision,
    partTypes: ['PowerMonitorInput'],
    categories: ['monitors'],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    ...extra,
  } as PartManifest
}

interface Published {
  host: Hosted
  entry: IndexPart
}

/** Host a signed package for `body` and describe it as an index entry. */
function publish(host: Hosted, partId: string, body: unknown, signers = [signer], revision = 1): Published {
  const bytes = encoder.encode(signEnvelope(JSON.stringify(body), signers))
  const url = `packages/${partId}@${revision}.json`
  host.files.set(`${BASE}${url}`, bytes)
  const entry: IndexPart = {
    partId,
    revision,
    partTypes: ['PowerMonitorInput'],
    label: `Test ${partId}`,
    interfaces: [],
    chips: [],
    categories: ['monitors'],
    verification: 'reviewed',
    package: { url, sha256: sha256Hex(bytes), bytes: bytes.length },
  }
  return { host, entry }
}

let cache: PartsCache
let host: Hosted

function library(over: { baseUrl?: string; cache?: PartsCache } = {}): PartsLibrary {
  return createPartsLibrary({
    baseUrl: over.baseUrl ?? BASE,
    cache: over.cache ?? cache,
    clientOptions: { fetch: host.fetch, trustedKeys: [signer.trusted] },
  })
}

const OPENED: Array<() => void> = []

beforeEach(() => {
  const definition = partTypeById('PowerMonitorInput') as { downloadable: boolean }
  const before = definition.downloadable
  definition.downloadable = true
  OPENED.push(() => { definition.downloadable = before })
  overrideTrustedPartKeysForTests([signer.trusted])
  cache = createMemoryCache()
  host = fakeHost()
})

afterEach(() => {
  while (OPENED.length > 0) OPENED.pop()!()
  overrideTrustedPartKeysForTests(null)
  resetRegisteredPartsForTests()
  resetSignedPartsForTests()
})

describe('with no parts host (production today)', () => {
  it('is not configured and never makes a request', async () => {
    const { entry } = publish(host, 'sig-monitor', manifest('sig-monitor'))
    const lib = library({ baseUrl: '' })
    expect(lib.configured).toBe(false)
    expect(await lib.loadIndex()).toEqual({ ok: false, reason: 'not-configured' })
    expect(await lib.install(entry)).toEqual({ ok: false, reason: 'not-configured' })
    expect(host.requests).toHaveLength(0)
    expect(partOrigin('sig-monitor')).toBeUndefined()
  })
})

describe('installing a part', () => {
  it('downloads, verifies, validates and registers it as downloaded', async () => {
    const { entry } = publish(host, 'sig-monitor', manifest('sig-monitor'))
    expect(installedState(entry)).toBe('available')
    const outcome = await library().install(entry)
    expect(outcome).toEqual({ ok: true, status: 'added', partId: 'sig-monitor', revision: 1 })
    expect(partOrigin('sig-monitor')).toBe('downloaded')
    expect(installedState(entry)).toBe('installed')
  })

  it('remembers it across sessions: a fresh registry restores it from the cache', async () => {
    const { entry } = publish(host, 'sig-monitor', manifest('sig-monitor'))
    await library().install(entry)
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    expect(partOrigin('sig-monitor')).toBeUndefined()
    // Offline, as at the start of a later session.
    host.files.clear()
    expect(await library().restoreInstalled()).toBe(1)
    expect(partOrigin('sig-monitor')).toBe('downloaded')
  })

  it('does not trust the stored copy: a tampered one is not restored', async () => {
    const { entry } = publish(host, 'sig-monitor', manifest('sig-monitor'))
    await library().install(entry)
    resetRegisteredPartsForTests()
    const forged = signEnvelope(JSON.stringify(manifest('sig-monitor', 9)), [stranger])
    await cache.set('installed:sig-monitor', encoder.encode(forged))
    expect(await library().restoreInstalled()).toBe(0)
    expect(partOrigin('sig-monitor')).toBeUndefined()
  })

  it('restores nothing, quietly, when nothing was installed', async () => {
    expect(await library().restoreInstalled()).toBe(0)
    expect(host.requests).toHaveLength(0)
  })
})

describe('refusing a part', () => {
  const refused = async (entry: IndexPart, id: string) => {
    const outcome = await library().install(entry)
    expect(partById(id)).toBeUndefined()
    expect(await cache.get(`installed:${id}`)).toBeNull()
    expect(await cache.get('installed-ids')).toBeNull()
    return outcome
  }

  it('rejects a package signed by a key the app does not trust', async () => {
    const { entry } = publish(host, 'sig-monitor', manifest('sig-monitor'), [stranger])
    expect(await refused(entry, 'sig-monitor')).toMatchObject({ ok: false, reason: 'unverified' })
  })

  it('rejects bytes that do not match the index hash', async () => {
    const { entry } = publish(host, 'sig-monitor', manifest('sig-monitor'))
    const tampered = encoder.encode(signEnvelope(JSON.stringify(manifest('sig-monitor', 2)), [signer]))
    host.files.set(`${BASE}${entry.package.url}`, tampered)
    expect(await refused({ ...entry, package: { ...entry.package, bytes: tampered.length } }, 'sig-monitor'))
      .toMatchObject({ ok: false, reason: 'unverified' })
  })

  it('rejects a signed manifest that fails validation', async () => {
    const bad = manifest('sig-monitor', 1, { dimensionsMm: 'wide' })
    const { entry } = publish(host, 'sig-monitor', bad)
    expect(await refused(entry, 'sig-monitor')).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('rejects a package that is a manifest for another part', async () => {
    const { entry } = publish(host, 'asked-for', manifest('something-else'))
    const outcome = await library().install(entry)
    expect(outcome).toMatchObject({ ok: false })
    expect(partById('something-else')).toBeUndefined()
    expect(partById('asked-for')).toBeUndefined()
  })

  it('reports a part written for a newer app and does not install it', async () => {
    const future = manifest('sig-monitor', 1, { manifestVersion: PART_MANIFEST_VERSION + 1 })
    const { entry } = publish(host, 'sig-monitor', future)
    const outcome = await refused(entry, 'sig-monitor')
    expect(outcome).toMatchObject({ ok: false, reason: 'needs-newer-app' })
  })

  it('reports a part whose type this app cannot take as needing a newer app', async () => {
    const { entry } = publish(host, 'sig-monitor', manifest('sig-monitor', 1, { partTypes: ['NoSuchType'] }))
    expect(await refused(entry, 'sig-monitor')).toMatchObject({ ok: false, reason: 'needs-newer-app' })
  })

  it('reports a failed download as a network problem', async () => {
    const { entry } = publish(host, 'sig-monitor', manifest('sig-monitor'))
    host.files.clear()
    expect(await refused(entry, 'sig-monitor')).toEqual({ ok: false, reason: 'network' })
  })

  it('never replaces a bundled part', async () => {
    const { entry } = publish(host, BASE_MONITOR, manifest(BASE_MONITOR, 99))
    expect(installedState(entry)).toBe('bundled')
    expect(await library().install(entry)).toMatchObject({ ok: false, reason: 'kept' })
    expect(partOrigin(BASE_MONITOR)).toBe('bundled')
  })

  it('does not offer a drafted part', async () => {
    const { entry } = publish(host, 'sig-monitor', manifest('sig-monitor'))
    expect(await library().install({ ...entry, verification: 'drafted' })).toEqual({ ok: false, reason: 'not-offered' })
  })
})

describe('revision updates', () => {
  it('offers a newer revision of an installed part and applies it only when asked', async () => {
    const first = publish(host, 'sig-monitor', manifest('sig-monitor', 1))
    await library().install(first.entry)
    const second = publish(host, 'sig-monitor', manifest('sig-monitor', 2), [signer], 2)

    // Seeing the newer index changes nothing.
    expect(installedState(second.entry)).toBe('update')
    expect((partById('sig-monitor') as PartManifest).revision).toBe(1)

    const outcome = await library().install(second.entry)
    expect(outcome).toEqual({ ok: true, status: 'replaced', partId: 'sig-monitor', revision: 2 })
    expect((partById('sig-monitor') as PartManifest).revision).toBe(2)
    expect(installedState(second.entry)).toBe('installed')

    // The newer copy is what the next session restores.
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    await library().restoreInstalled()
    expect((partById('sig-monitor') as PartManifest).revision).toBe(2)
  })
})

describe('catalogue reads', () => {
  it('registers through registerParts like any other downloaded part', () => {
    const [result] = registerParts([manifest('direct-monitor')], 'downloaded')
    expect(result.status).toBe('added')
  })
})

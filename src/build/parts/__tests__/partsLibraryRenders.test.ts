// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PART_CATALOGUE, partOrigin, partRenderSrc, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../partCatalogue'
import { createPartsLibrary, installedState, type PartsLibrary } from '../partsLibrary'
import { partTypeById } from '../partTypes'
import type { PartManifest } from '../manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../manifest/vocabulary'
import { createMemoryCache, type IndexPart, type PartsCache } from '../remote'
import { BASE, fakeHost, fakeWebp, makeSigner, sha256Hex, signEnvelope, type Hosted } from '../remote/__tests__/testKit'
import {
  collectSavedParts,
  overrideTrustedPartKeysForTests,
  registerEmbeddedParts,
  resetSignedPartsForTests,
  signedEnvelopeFor,
} from '../signedParts'
import { partRenderForNodeType } from '../partRenders'

const BASE_MONITOR = 'adafruit-ina219-current-sensor'
const encoder = new TextEncoder()
const signer = makeSigner('render-key')
const W = 320
const H = 200

function manifest(partId: string, revision = 1): PartManifest {
  const entry = JSON.parse(JSON.stringify(PART_CATALOGUE[BASE_MONITOR])) as PartCatalogueEntry
  return {
    ...entry,
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision,
    partTypes: ['PowerMonitorInput'],
    categories: ['monitors'],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    pads: [],
    render: { file: `Parts/${partId}.webp`, widthPx: W, heightPx: H },
  } as unknown as PartManifest
}

/** Host a signed package and (optionally) a render, and describe them as an index entry. */
function publish(
  host: Hosted,
  partId: string,
  revision = 1,
  render: Uint8Array | null = fakeWebp(W, H),
): IndexPart {
  const bytes = encoder.encode(signEnvelope(JSON.stringify(manifest(partId, revision)), [signer]))
  const url = `packages/${partId}@${revision}.json`
  host.files.set(`${BASE}${url}`, bytes)
  const entry: IndexPart = {
    partId, revision, partTypes: ['PowerMonitorInput'], label: `Test ${partId}`, interfaces: [], chips: [],
    categories: ['monitors'], verification: 'reviewed',
    package: { url, sha256: sha256Hex(bytes), bytes: bytes.length },
  }
  if (render) {
    const renderUrl = `renders/${partId}@${revision}.webp`
    host.files.set(`${BASE}${renderUrl}`, render)
    entry.render = { url: renderUrl, sha256: sha256Hex(render), bytes: render.length, widthPx: W, heightPx: H }
  }
  return entry
}

let cache: PartsCache
let host: Hosted
const library = (): PartsLibrary => createPartsLibrary({
  baseUrl: BASE, cache, clientOptions: { fetch: host.fetch, trustedKeys: [signer.trusted] },
})

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

describe('pictures for downloaded parts', () => {
  it('an installed part draws its hash-verified picture, through the same lookup as the bench and shelf', async () => {
    expect((await library().install(publish(host, 'pic-monitor'))).ok).toBe(true)
    const src = partRenderSrc('pic-monitor')
    expect(src).toMatch(/^blob:/)
    expect(partRenderForNodeType('PowerMonitorInput', { partId: 'pic-monitor' })?.src).toBe(src)
  })

  it('a part with no picture still installs and draws the placeholder (null)', async () => {
    expect((await library().install(publish(host, 'plain-monitor', 1, null))).ok).toBe(true)
    expect(partRenderSrc('plain-monitor')).toBeNull()
  })

  it('a render that fails its hash is refused; the part still installs without a picture', async () => {
    const entry = publish(host, 'bad-monitor')
    host.files.set(`${BASE}${entry.render!.url}`, fakeWebp(W, H).map((b, i) => (i === 30 ? b ^ 1 : b)))
    expect((await library().install(entry)).ok).toBe(true)
    expect(partRenderSrc('bad-monitor')).toBeNull()
  })

  it('a render whose size disagrees with the signed manifest is refused', async () => {
    const entry = publish(host, 'size-monitor', 1, fakeWebp(W + 8, H))
    entry.render = { ...entry.render!, widthPx: W + 8 }
    expect((await library().install(entry)).ok).toBe(true)
    expect(partRenderSrc('size-monitor')).toBeNull()
  })

  it('a render over the size limit is refused', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    big.set(fakeWebp(W, H))
    const entry = publish(host, 'huge-monitor', 1, big)
    expect((await library().install(entry)).ok).toBe(true)
    expect(partRenderSrc('huge-monitor')).toBeNull()
  })

  it('comes back offline in a later session from the remembered reference', async () => {
    await library().install(publish(host, 'pic-monitor'))
    resetRegisteredPartsForTests()
    resetSignedPartsForTests()
    host.files.clear()
    host.requests.length = 0
    expect(await library().restoreInstalled()).toBe(1)
    expect(partRenderSrc('pic-monitor')).toMatch(/^blob:/)
    expect(host.requests).toHaveLength(0)
  })

  it('a part that arrived in a save gets its picture from the index, for the same revision only', async () => {
    const entry = publish(host, 'saved-monitor')
    const other = publish(host, 'saved-monitor', 2)
    // Revision 2 overwrote revision 1's hosted package path only for its own revision.
    const packageBytes = host.files.get(`${BASE}packages/saved-monitor@1.json`)!
    const envelope = JSON.parse(new TextDecoder().decode(packageBytes)) as unknown
    await registerEmbeddedParts({ 'saved-monitor': { revision: 1, envelope } })
    expect(partRenderSrc('saved-monitor')).toBeNull()
    const lib = library()
    await lib.attachMissingRenders({ parts: [other] })
    expect(partRenderSrc('saved-monitor')).toBeNull()
    await lib.attachMissingRenders({ parts: [entry] })
    expect(partRenderSrc('saved-monitor')).toMatch(/^blob:/)
  })

  it('shows a result row picture only after verifying it', async () => {
    const entry = publish(host, 'row-monitor')
    expect(await library().renderBytes(entry)).not.toBeNull()
    host.files.set(`${BASE}${entry.render!.url}`, encoder.encode('not a webp'))
    const fresh = createPartsLibrary({
      baseUrl: BASE, cache: createMemoryCache(), clientOptions: { fetch: host.fetch, trustedKeys: [signer.trusted] },
    })
    expect(await fresh.renderBytes(entry)).toBeNull()
  })
})

describe('uninstalling', () => {
  it('removes the part, its remembered envelope and picture; nothing restores it', async () => {
    const entry = publish(host, 'gone-monitor')
    const lib = library()
    await lib.install(entry)
    expect(await lib.uninstall('gone-monitor')).toEqual({ ok: true, partId: 'gone-monitor' })
    expect(partOrigin('gone-monitor')).toBeUndefined()
    expect(signedEnvelopeFor('gone-monitor')).toBeUndefined()
    expect(partRenderSrc('gone-monitor')).toBeNull()
    expect(installedState(entry)).toBe('available')
    expect(await cache.get('installed:gone-monitor')).toBeNull()
    expect(await cache.get('render-ref:gone-monitor')).toBeNull()
    expect(await library().restoreInstalled()).toBe(0)
  })

  it('refuses a part the open project uses, and keeps it registered and remembered', async () => {
    const lib = library()
    await lib.install(publish(host, 'used-monitor'))
    const outcome = await lib.uninstall('used-monitor', { inUse: (id) => id === 'used-monitor' })
    expect(outcome).toEqual({ ok: false, reason: 'in-use' })
    expect(partOrigin('used-monitor')).toBe('downloaded')
    expect(await cache.get('installed:used-monitor')).not.toBeNull()
  })

  it('leaves bundled parts alone', async () => {
    expect(await library().uninstall(BASE_MONITOR)).toEqual({ ok: false, reason: 'not-downloaded' })
    expect(partOrigin(BASE_MONITOR)).toBe('bundled')
  })

  it('a save made before the uninstall still opens: it embeds the signed part', async () => {
    const lib = library()
    await lib.install(publish(host, 'kept-monitor'))
    const parts = collectSavedParts([{
      data: { nodeType: 'PowerMonitorInput', properties: { partId: 'kept-monitor' } },
    } as never])
    expect(parts['kept-monitor'].envelope).toBeDefined()
    await lib.uninstall('kept-monitor')
    expect(partOrigin('kept-monitor')).toBeUndefined()
    await registerEmbeddedParts(parts)
    expect(partOrigin('kept-monitor')).toBe('downloaded')
  })
})

describe('share links that name parts by id and revision', () => {
  const hostIndex = (parts: IndexPart[]) => {
    host.files.set(`${BASE}index.json`, encoder.encode(signEnvelope(JSON.stringify({
      indexVersion: 1,
      generatedAt: '2026-11-01T00:00:00Z',
      categories: [{ id: 'monitors', label: 'Power monitors', order: 1, parent: null }],
      parts,
    }), [signer])))
  }

  it('resolves them from the signed index for this session without installing', async () => {
    hostIndex([publish(host, 'link-monitor')])
    const lib = library()
    expect(await lib.resolveReferenced({ 'link-monitor': { revision: 1 }, [BASE_MONITOR]: { revision: 1 } })).toEqual([])
    expect(partOrigin('link-monitor')).toBe('downloaded')
    expect(await cache.get('installed:link-monitor')).toBeNull()
  })

  it('reports parts it cannot find: other revision, unknown id, or no parts host', async () => {
    hostIndex([publish(host, 'link-monitor')])
    expect(await library().resolveReferenced({ 'link-monitor': { revision: 3 }, 'nobody-has-this': { revision: 1 } }))
      .toEqual(['link-monitor', 'nobody-has-this'])
    const off = createPartsLibrary({ baseUrl: '', cache })
    expect(await off.resolveReferenced({ 'link-monitor': { revision: 1 } })).toEqual(['link-monitor'])
  })
})

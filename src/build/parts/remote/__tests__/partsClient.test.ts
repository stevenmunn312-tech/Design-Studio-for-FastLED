// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { base64urlDecode, base64urlEncode } from '../base64url'
import { createMemoryCache, createIndexedDbCache } from '../cache'
import { createPartsClient, type ManifestValidation } from '../client'
import { verifyEnvelopeText } from '../envelope'
import { applyKeyAnnouncement, effectiveKeys, emptyKeyState } from '../keyring'
import { PARTS_BASE_URL, TRUSTED_KEYS } from '../trustedKeys'
import {
  BASE,
  fakeHost,
  fakeWebp,
  makeSigner,
  sha256Hex,
  signEnvelope,
  type Hosted,
  type TestSigner,
} from './testKit'

const encoder = new TextEncoder()

interface Manifest {
  partId: string
}

const validate = (value: unknown): ManifestValidation<Manifest> =>
  typeof value === 'object' && value !== null && typeof (value as Manifest).partId === 'string'
    ? { ok: true, manifest: value as Manifest }
    : { ok: false, reason: 'no partId' }

function category(id: string, extra: Record<string, unknown> = {}) {
  return { id, label: id.toUpperCase(), order: 1, parent: null, ...extra }
}

interface Fixture {
  signer: TestSigner
  host: Hosted
  partEntry: Record<string, unknown>
  publish(extra?: { signers?: TestSigner[]; payload?: Record<string, unknown> }): void
}

function fixture(): Fixture {
  const signer = makeSigner('k1')
  const host = fakeHost()
  const manifestText = JSON.stringify({ partId: 'hc-sr04', revision: 1 })
  const pkgBytes = encoder.encode(signEnvelope(manifestText, [signer]))
  const webp = fakeWebp(64, 48)
  host.files.set(`${BASE}packages/hc-sr04@1.json`, pkgBytes)
  host.files.set(`${BASE}renders/hc-sr04@1.webp`, webp)
  const partEntry = {
    partId: 'hc-sr04',
    revision: 1,
    partTypes: ['DistanceInput'],
    label: 'HC-SR04',
    interfaces: ['gpio'],
    categories: ['ultra'],
    verification: 'reviewed',
    package: { url: 'packages/hc-sr04@1.json', sha256: sha256Hex(pkgBytes), bytes: pkgBytes.length },
    render: {
      url: 'renders/hc-sr04@1.webp',
      sha256: sha256Hex(webp),
      bytes: webp.length,
      widthPx: 64,
      heightPx: 48,
    },
    somethingNew: 'ignored',
  }
  const publish = (extra?: { signers?: TestSigner[]; payload?: Record<string, unknown> }) => {
    const payload = JSON.stringify({
      indexVersion: 1,
      generatedAt: '2026-11-01T00:00:00Z',
      categories: [category('ultra')],
      parts: [partEntry],
      ...extra?.payload,
    })
    host.files.set(`${BASE}index.json`, encoder.encode(signEnvelope(payload, extra?.signers ?? [signer])))
  }
  return { signer, host, partEntry, publish }
}

const clientFor = (f: Fixture, over: Partial<Parameters<typeof createPartsClient>[0]> = {}) =>
  createPartsClient<Manifest>({
    validateManifest: validate,
    baseUrl: BASE,
    trustedKeys: [f.signer.trusted],
    cache: createMemoryCache(),
    fetch: f.host.fetch,
    ...over,
  } as Parameters<typeof createPartsClient<Manifest>>[0])

describe('base64url', () => {
  it('round-trips and rejects junk', () => {
    for (const n of [0, 1, 2, 3, 31, 32, 64]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255)
      expect(Buffer.from(base64urlDecode(base64urlEncode(bytes))!)).toEqual(Buffer.from(bytes))
      expect(base64urlEncode(bytes)).toBe(Buffer.from(bytes).toString('base64url'))
    }
    expect(base64urlDecode('ab+/')).toBeNull()
    expect(base64urlDecode('a')).toBeNull()
  })
})

describe('shipped configuration', () => {
  it('trusts no key and fetches from nowhere until configured', () => {
    expect(TRUSTED_KEYS).toHaveLength(0)
    expect(PARTS_BASE_URL).toBe('')
  })

  it('never fetches or opens storage when no base URL is set', async () => {
    const f = fixture()
    f.publish()
    const client = clientFor(f, { baseUrl: '' })
    expect(await client.loadIndex()).toEqual({ ok: false, reason: 'not-configured' })
    expect(f.host.requests).toHaveLength(0)
  })

  it('has an IndexedDB cache that degrades to no cache without IndexedDB', async () => {
    const cache = createIndexedDbCache('missing-db')
    await cache.set('a', new Uint8Array([1]))
    expect(await cache.get('a')).toBeNull()
    await cache.delete('a')
  })
})

describe('envelope verification', () => {
  it('accepts one good signature among several and refuses everything else', async () => {
    const a = makeSigner('a')
    const b = makeSigner('b')
    const text = signEnvelope('hello', [b, a])
    expect(await verifyEnvelopeText(text, [a.trusted])).toEqual({ ok: true, payload: 'hello', keyId: 'a' })
    expect(await verifyEnvelopeText(text, [makeSigner('c').trusted])).toMatchObject({ reason: 'no-trusted-key' })
    // Same keyId, different key: named but does not verify.
    const impostor = { keyId: 'a', publicKey: makeSigner('a').publicKey }
    expect(await verifyEnvelopeText(text, [impostor])).toMatchObject({ reason: 'bad-signature' })
    const tampered = JSON.stringify({ ...JSON.parse(text), payload: 'hellp' })
    expect(await verifyEnvelopeText(tampered, [a.trusted])).toMatchObject({ reason: 'bad-signature' })
    expect(await verifyEnvelopeText('not json', [a.trusted])).toMatchObject({ reason: 'malformed' })
    expect(await verifyEnvelopeText('{"format":"x"}', [a.trusted])).toMatchObject({ reason: 'malformed' })
  })
})

describe('key rotation', () => {
  const base = [makeSigner('old').trusted]
  const next = makeSigner('new').trusted

  it('adds and retires, and never retires the last key', () => {
    let state = applyKeyAnnouncement(base, emptyKeyState(), { add: [next], retire: ['old'] })
    expect(effectiveKeys(base, state).map((k) => k.keyId)).toEqual(['new'])
    state = applyKeyAnnouncement(base, state, { add: [], retire: ['new'] })
    expect(effectiveKeys(base, state).map((k) => k.keyId)).toEqual(['new'])
    const solo = applyKeyAnnouncement(base, emptyKeyState(), { add: [], retire: ['old'] })
    expect(effectiveKeys(base, solo)).toHaveLength(1)
  })

  it('learns a successor from a verified index, persists it, and honours it offline', async () => {
    const f = fixture()
    const successor = makeSigner('k2')
    const cache = createMemoryCache()
    f.publish({
      signers: [f.signer],
      payload: { keys: { add: [{ keyId: 'k2', publicKey: successor.publicKey }], retire: ['k1'] } },
    })
    const client = clientFor(f, { cache })
    expect((await client.loadIndex()).ok).toBe(true)
    expect((await client.trustedKeys()).map((k) => k.keyId)).toEqual(['k2'])
    // A fresh client on the same cache keeps the learned keys.
    const again = clientFor(f, { cache })
    expect((await again.trustedKeys()).map((k) => k.keyId)).toEqual(['k2'])
  })

  it('ignores an announcement from an index the trusted keys did not sign', async () => {
    const f = fixture()
    const rogue = makeSigner('rogue')
    f.publish({
      signers: [rogue],
      payload: { keys: { add: [{ keyId: 'rogue', publicKey: rogue.publicKey }], retire: ['k1'] } },
    })
    const client = clientFor(f)
    expect(await client.loadIndex()).toEqual({ ok: false, reason: 'unavailable' })
    expect((await client.trustedKeys()).map((k) => k.keyId)).toEqual(['k1'])
  })
})

describe('index loading', () => {
  it('downloads, verifies, caches and then works offline', async () => {
    const f = fixture()
    f.publish()
    const cache = createMemoryCache()
    const online = await clientFor(f, { cache }).loadIndex()
    expect(online).toMatchObject({ ok: true, source: 'network' })
    f.host.files.clear()
    const offline = await clientFor(f, { cache }).loadIndex()
    expect(offline).toMatchObject({ ok: true, source: 'cache', refreshError: 'network' })
    if (offline.ok) {
      expect(offline.index.parts[0].partId).toBe('hc-sr04')
      expect('somethingNew' in offline.index.parts[0]).toBe(false)
    }
  })

  it('refuses an index it cannot verify, with nothing cached', async () => {
    const f = fixture()
    f.publish({ signers: [makeSigner('k1')] })
    expect(await clientFor(f).loadIndex()).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('re-verifies the cached index on read', async () => {
    const f = fixture()
    f.publish()
    const cache = createMemoryCache()
    await clientFor(f, { cache }).loadIndex()
    f.host.files.clear()
    await cache.set('index', encoder.encode(signEnvelope('{"indexVersion":1}', [makeSigner('k1')])))
    expect(await clientFor(f, { cache }).loadIndex()).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('returns a typed needs-newer-app result', async () => {
    const f = fixture()
    f.publish({ payload: { indexVersion: 2 } })
    expect(await clientFor(f).loadIndex()).toEqual({ ok: false, reason: 'needs-newer-app' })
    // With a good cache it falls back to it and says why.
    const g = fixture()
    g.publish()
    const cache = createMemoryCache()
    await clientFor(g, { cache }).loadIndex()
    g.publish({ payload: { indexVersion: 2, generatedAt: '2026-12-01T00:00:00Z' } })
    expect(await clientFor(g, { cache }).loadIndex()).toMatchObject({
      ok: true,
      source: 'cache',
      refreshError: 'needs-newer-app',
    })
  })

  it('keeps the newer cached index when an older signed one is replayed', async () => {
    const f = fixture()
    f.publish({ payload: { generatedAt: '2026-11-10T00:00:00Z' } })
    const cache = createMemoryCache()
    await clientFor(f, { cache }).loadIndex()
    f.publish({ payload: { generatedAt: '2026-10-01T00:00:00Z' } })
    expect(await clientFor(f, { cache }).loadIndex()).toMatchObject({ source: 'cache', refreshError: 'stale' })
  })

  it('drops malformed entries without losing the rest, and hides drafted parts', async () => {
    const f = fixture()
    f.publish({
      payload: {
        parts: [
          f.partEntry,
          { partId: 'broken' },
          { ...f.partEntry, partId: 'draft', verification: 'drafted' },
          { ...f.partEntry, partId: 'big', package: { ...(f.partEntry.package as object), bytes: 99_999_999 } },
        ],
      },
    })
    const client = clientFor(f)
    const result = await client.loadIndex()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.index.droppedParts).toBe(2)
      expect(client.offered(result.index).map((p) => p.partId)).toEqual(['hc-sr04'])
    }
  })

  it('fails closed with no Ed25519: nothing downloaded loads', async () => {
    const f = fixture()
    f.publish()
    const subtle = globalThis.crypto.subtle
    const original = subtle.importKey
    subtle.importKey = (() => Promise.reject(new DOMException('no', 'NotSupportedError'))) as typeof subtle.importKey
    try {
      expect(await clientFor(f).loadIndex()).toEqual({ ok: false, reason: 'cannot-verify' })
    } finally {
      subtle.importKey = original
    }
  })

  it('times out a hung request', async () => {
    const f = fixture()
    const hung = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as typeof fetch
    const client = clientFor(f, { fetch: hung, timeoutMs: 20 })
    expect(await client.loadIndex()).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('package download', () => {
  async function load(f: Fixture, cache = createMemoryCache()) {
    const client = clientFor(f, { cache })
    const result = await client.loadIndex()
    if (!result.ok) throw new Error('index')
    return { client, part: result.index.parts[0], cache }
  }

  it('verifies, returns the manifest, caches, and serves it offline', async () => {
    const f = fixture()
    f.publish()
    const { client, part, cache } = await load(f)
    expect(await client.getPackage(part)).toMatchObject({ ok: true, source: 'network', manifest: { partId: 'hc-sr04' } })
    f.host.files.clear()
    const offline = await clientFor(f, { cache }).getPackage(part)
    expect(offline).toMatchObject({ ok: true, source: 'cache' })
  })

  it('rejects a hash or size mismatch before verifying', async () => {
    const f = fixture()
    f.publish()
    const { client, part } = await load(f)
    f.host.files.set(`${BASE}packages/hc-sr04@1.json`, encoder.encode(signEnvelope('{"partId":"x"}', [f.signer])))
    expect(await client.getPackage(part)).toMatchObject({ ok: false })
    const grown = new Uint8Array(part.package.bytes + 1)
    f.host.files.set(`${BASE}packages/hc-sr04@1.json`, grown)
    expect(await client.getPackage(part)).toEqual({ ok: false, reason: 'size-mismatch' })
  })

  it('rejects a package signed by an untrusted key even when the hash matches', async () => {
    const f = fixture()
    const rogueBytes = encoder.encode(signEnvelope('{"partId":"hc-sr04"}', [makeSigner('k1')]))
    f.host.files.set(`${BASE}packages/hc-sr04@1.json`, rogueBytes)
    ;(f.partEntry.package as Record<string, unknown>).sha256 = sha256Hex(rogueBytes)
    ;(f.partEntry.package as Record<string, unknown>).bytes = rogueBytes.length
    f.publish()
    const { client, part } = await load(f)
    expect(await client.getPackage(part)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects a manifest the injected validator refuses', async () => {
    const f = fixture()
    f.publish()
    const client = clientFor(f, { validateManifest: () => ({ ok: false, reason: 'nope' }) })
    const result = await client.loadIndex()
    if (!result.ok) throw new Error('index')
    expect(await client.getPackage(result.index.parts[0])).toEqual({
      ok: false,
      reason: 'invalid-manifest',
      detail: 'nope',
    })
  })

  it('drops a corrupted cache entry and refetches', async () => {
    const f = fixture()
    f.publish()
    const { client, part, cache } = await load(f)
    await cache.set(`pkg:${part.package.sha256}`, new Uint8Array([1, 2, 3]))
    expect(await client.getPackage(part)).toMatchObject({ ok: true, source: 'network' })
  })

  it('refuses a drafted part and a non-https URL', async () => {
    const f = fixture()
    f.publish()
    const { client, part } = await load(f)
    expect(await client.getPackage({ ...part, verification: 'drafted' })).toEqual({ ok: false, reason: 'not-offered' })
    expect(
      await client.getPackage({ ...part, package: { ...part.package, url: 'http://evil.example/x.json', sha256: 'f'.repeat(64) } }),
    ).toEqual({ ok: false, reason: 'bad-url' })
  })
})

describe('render download', () => {
  async function part(f: Fixture) {
    const client = clientFor(f)
    const result = await client.loadIndex()
    if (!result.ok) throw new Error('index')
    return { client, part: result.index.parts[0] }
  }

  it('accepts a checked WebP', async () => {
    const f = fixture()
    f.publish()
    const { client, part: p } = await part(f)
    expect(await client.getRender(p)).toMatchObject({ ok: true, widthPx: 64, heightPx: 48 })
  })

  it('rejects non-WebP, wrong dimensions, wrong hash and oversize', async () => {
    const f = fixture()
    f.publish()
    const { client, part: p } = await part(f)
    const url = `${BASE}renders/hc-sr04@1.webp`
    const png = new Uint8Array(p.render!.bytes).fill(1)
    png.set([0x89, 0x50, 0x4e, 0x47])
    f.host.files.set(url, png)
    expect((await client.getRender(p)).ok).toBe(false)

    const big = fakeWebp(4000, 4000)
    const bigPart = { ...p, render: { ...p.render!, sha256: sha256Hex(big), bytes: big.length, widthPx: 4000, heightPx: 4000 } }
    f.host.files.set(url, big)
    expect(await client.getRender(bigPart)).toEqual({ ok: false, reason: 'bad-dimensions' })

    const lie = fakeWebp(10, 10)
    const liePart = { ...p, render: { ...p.render!, sha256: sha256Hex(lie), bytes: lie.length } }
    f.host.files.set(url, lie)
    expect(await client.getRender(liePart)).toEqual({ ok: false, reason: 'bad-dimensions' })

    const notWebp = new Uint8Array(40).fill(7)
    const nwPart = { ...p, render: { ...p.render!, sha256: sha256Hex(notWebp), bytes: 40 } }
    f.host.files.set(url, notWebp)
    expect(await client.getRender(nwPart)).toEqual({ ok: false, reason: 'not-webp' })
  })
})

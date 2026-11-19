// Downloads, verifies, caches and serves the official parts index and part
// packages. No UI; the shelf calls this. See docs/design/part-packages.md.
//
// Nothing here runs at import time. Nothing is fetched unless a base URL is
// configured. Anything that does not verify is dropped, never partly loaded:
// a runtime without Ed25519 loads nothing that was downloaded.

import {
  createIndexedDbCache,
  decodeText,
  encodeText,
  type PartsCache,
} from './cache'
import { parseEnvelope, verifyEnvelope, type SignedEnvelope, type VerifyFailure } from './envelope'
import {
  MAX_RENDER_BYTES,
  MAX_RENDER_PX,
  offeredParts,
  parseIndexPayload,
  type IndexPart,
  type IndexRenderRef,
  type PartsIndex,
} from './indexSchema'
import {
  applyKeyAnnouncement,
  effectiveKeys,
  emptyKeyState,
  readKeyState,
  type KeyState,
} from './keyring'
import { PARTS_BASE_URL, TRUSTED_KEYS, type TrustedKey } from './trustedKeys'
import { readWebpInfo } from './webp'

export type ManifestValidation<M> =
  | { ok: true; manifest: M }
  | { ok: false; reason: string }

export interface PartsClientOptions<M> {
  /** Validates a manifest payload. The manifest is otherwise opaque to this module. */
  validateManifest: (value: unknown) => ManifestValidation<M>
  /** Host root, with or without a trailing slash. Defaults to `PARTS_BASE_URL` (empty: no fetching). */
  baseUrl?: string
  trustedKeys?: readonly TrustedKey[]
  cache?: PartsCache
  fetch?: typeof fetch
  /** Per-request timeout in milliseconds. Default 15 000. */
  timeoutMs?: number
}

export type IndexRefreshError =
  | 'network'
  | 'needs-newer-app'
  | 'invalid'
  | 'stale'
  | VerifyFailure

export type IndexLoadResult =
  | {
      ok: true
      index: PartsIndex
      source: 'network' | 'cache'
      /** Set when a refresh was tried and failed, so `index` is the cached one. */
      refreshError?: IndexRefreshError
    }
  | {
      ok: false
      reason: 'not-configured' | 'needs-newer-app' | 'cannot-verify' | 'unavailable' | 'invalid'
    }

export type PackageFailure =
  | 'not-offered'
  | 'not-configured'
  | 'network'
  | 'bad-url'
  | 'size-mismatch'
  | 'hash-mismatch'
  | 'invalid-manifest'
  | VerifyFailure

export type PackageResult<M> =
  /** `envelope` is the verified signed package, for a save to carry. */
  | { ok: true; manifest: M; source: 'network' | 'cache'; envelope: SignedEnvelope }
  | { ok: false; reason: PackageFailure; detail?: string }

export type RenderFailure =
  | 'no-render'
  | 'not-configured'
  | 'network'
  | 'bad-url'
  | 'size-mismatch'
  | 'hash-mismatch'
  | 'not-webp'
  | 'bad-dimensions'
  | 'cannot-verify'

export type RenderResult =
  | { ok: true; bytes: Uint8Array; widthPx: number; heightPx: number; source: 'network' | 'cache' }
  | { ok: false; reason: RenderFailure }

export interface PartsClient<M> {
  /** Last verified index: refreshed from the network when configured, else (or offline) from the cache. */
  loadIndex(options?: { refresh?: boolean }): Promise<IndexLoadResult>
  /** Parts the shelf may offer (`reviewed` and `bench`). */
  offered(index: PartsIndex): IndexPart[]
  /** The part's verified manifest: from the cache (re-verified) or downloaded. */
  getPackage(part: IndexPart): Promise<PackageResult<M>>
  /** The part's render bytes, checked: WebP only, bounded size, sha256. */
  getRender(part: IndexPart): Promise<RenderResult>
  /** The key set currently trusted (configured keys plus rotations learned from verified indexes). */
  trustedKeys(): Promise<TrustedKey[]>
}

const INDEX_KEY = 'index'
const KEYS_KEY = 'keys'
const DEFAULT_TIMEOUT_MS = 15_000

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource))
  let out = ''
  for (const b of digest) out += b.toString(16).padStart(2, '0')
  return out
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

export function createPartsClient<M>(options: PartsClientOptions<M>): PartsClient<M> {
  const baseUrl = (options.baseUrl ?? PARTS_BASE_URL).trim()
  const configuredKeys = options.trustedKeys ?? TRUSTED_KEYS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let cacheInstance: PartsCache | null = options.cache ?? null
  // Created on first use so constructing a client touches no storage.
  const cache = (): PartsCache => (cacheInstance ??= createIndexedDbCache())

  const resolveUrl = (ref: string): string | null => {
    try {
      const rootBase = globalThis.location?.href
      const root = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, rootBase)
      const url = new URL(ref, root)
      if (url.protocol === 'https:') return url.href
      if (url.protocol === 'http:' && isLocalHost(url.hostname)) return url.href
      return null
    } catch {
      return null
    }
  }

  type Fetched = { ok: true; bytes: Uint8Array } | { ok: false; reason: 'network' | 'size-mismatch' }

  const fetchBytes = async (url: string, maxBytes: number, noStore: boolean): Promise<Fetched> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const doFetch = options.fetch ?? globalThis.fetch
      const response = await doFetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        cache: noStore ? 'no-cache' : 'default',
      })
      if (!response.ok) return { ok: false, reason: 'network' }
      const declared = Number(response.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'size-mismatch' }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > maxBytes) return { ok: false, reason: 'size-mismatch' }
      return { ok: true, bytes }
    } catch {
      return { ok: false, reason: 'network' }
    } finally {
      clearTimeout(timer)
    }
  }

  const loadKeyState = async (): Promise<KeyState> => {
    const bytes = await cache().get(KEYS_KEY)
    const text = bytes ? decodeText(bytes) : null
    if (text === null) return emptyKeyState()
    try {
      return readKeyState(JSON.parse(text))
    } catch {
      return emptyKeyState()
    }
  }

  const currentKeys = async (): Promise<TrustedKey[]> =>
    effectiveKeys(configuredKeys, await loadKeyState())

  type Checked =
    | { ok: true; index: PartsIndex; text: string; keyId: string }
    | { ok: false; reason: IndexRefreshError }

  const checkIndexText = async (text: string, keys: readonly TrustedKey[]): Promise<Checked> => {
    const envelope = parseEnvelope(text)
    if (!envelope) return { ok: false, reason: 'malformed' }
    const verified = await verifyEnvelope(envelope, keys)
    if (!verified.ok) return { ok: false, reason: verified.reason }
    const parsed = parseIndexPayload(verified.payload)
    if (!parsed.ok) return { ok: false, reason: parsed.reason }
    return { ok: true, index: parsed.index, text, keyId: verified.keyId }
  }

  const readCachedIndex = async (keys: readonly TrustedKey[]): Promise<Checked | null> => {
    const bytes = await cache().get(INDEX_KEY)
    const text = bytes ? decodeText(bytes) : null
    if (text === null) return null
    // Re-verified on every read: the cache is not trusted.
    return checkIndexText(text, keys)
  }

  const loadIndex = async (opts?: { refresh?: boolean }): Promise<IndexLoadResult> => {
    const keys = effectiveKeys(configuredKeys, await loadKeyState())
    const cached = await readCachedIndex(keys)
    if (cached && !cached.ok && cached.reason === 'cannot-verify') {
      return { ok: false, reason: 'cannot-verify' }
    }
    const usable = cached && cached.ok ? cached : null
    let refreshError: IndexRefreshError | undefined

    if (baseUrl && opts?.refresh !== false) {
      const url = resolveUrl('index.json')
      const fetched = url ? await fetchBytes(url, 4 * 1024 * 1024, true) : null
      const text = fetched?.ok ? decodeText(fetched.bytes) : null
      if (text === null) {
        refreshError = 'network'
      } else {
        const checked = await checkIndexText(text, keys)
        if (!checked.ok) {
          if (checked.reason === 'cannot-verify') return { ok: false, reason: 'cannot-verify' }
          refreshError = checked.reason
        } else if (usable && Date.parse(checked.index.generatedAt) < Date.parse(usable.index.generatedAt)) {
          // Replay of an older, validly signed index: keep what we have.
          refreshError = 'stale'
        } else {
          // The envelope verified against an already-trusted key, so its key
          // announcement is honoured (and never empties the trusted set).
          const nextState = applyKeyAnnouncement(
            configuredKeys,
            await loadKeyState(),
            checked.index.keys,
          )
          await cache().set(KEYS_KEY, encodeText(JSON.stringify(nextState)))
          await cache().set(INDEX_KEY, encodeText(checked.text))
          return { ok: true, index: checked.index, source: 'network' }
        }
      }
    }

    if (usable) {
      return refreshError
        ? { ok: true, index: usable.index, source: 'cache', refreshError }
        : { ok: true, index: usable.index, source: 'cache' }
    }
    if (refreshError === 'needs-newer-app') return { ok: false, reason: 'needs-newer-app' }
    if (refreshError === 'invalid' || refreshError === 'malformed') return { ok: false, reason: 'invalid' }
    if (!baseUrl) return { ok: false, reason: 'not-configured' }
    return { ok: false, reason: 'unavailable' }
  }

  const checkPackageBytes = async (
    part: IndexPart,
    bytes: Uint8Array,
  ): Promise<PackageResult<M>> => {
    if (bytes.length !== part.package.bytes) return { ok: false, reason: 'size-mismatch' }
    const hash = await sha256Hex(bytes)
    if (hash === null) return { ok: false, reason: 'cannot-verify' }
    if (hash !== part.package.sha256) return { ok: false, reason: 'hash-mismatch' }
    const text = decodeText(bytes)
    const envelope = text === null ? null : parseEnvelope(text)
    if (!envelope) return { ok: false, reason: 'malformed' }
    const verified = await verifyEnvelope(envelope, await currentKeys())
    if (!verified.ok) return { ok: false, reason: verified.reason }
    let value: unknown
    try {
      value = JSON.parse(verified.payload)
    } catch {
      return { ok: false, reason: 'malformed' }
    }
    const manifest = options.validateManifest(value)
    if (!manifest.ok) return { ok: false, reason: 'invalid-manifest', detail: manifest.reason }
    return { ok: true, manifest: manifest.manifest, source: 'cache', envelope }
  }

  const getPackage = async (part: IndexPart): Promise<PackageResult<M>> => {
    if (part.verification === 'drafted') return { ok: false, reason: 'not-offered' }
    const cacheKey = `pkg:${part.package.sha256}`
    const cachedBytes = await cache().get(cacheKey)
    if (cachedBytes) {
      const result = await checkPackageBytes(part, cachedBytes)
      if (result.ok) return result
      if (result.reason === 'cannot-verify') return result
      await cache().delete(cacheKey)
    }
    if (!baseUrl) return { ok: false, reason: 'not-configured' }
    const url = resolveUrl(part.package.url)
    if (!url) return { ok: false, reason: 'bad-url' }
    const fetched = await fetchBytes(url, part.package.bytes, false)
    if (!fetched.ok) return { ok: false, reason: fetched.reason }
    const result = await checkPackageBytes(part, fetched.bytes)
    if (!result.ok) return result
    await cache().set(cacheKey, fetched.bytes)
    return { ok: true, manifest: result.manifest, source: 'network', envelope: result.envelope }
  }

  const checkRenderBytes = async (
    ref: IndexRenderRef,
    bytes: Uint8Array,
  ): Promise<RenderResult> => {
    if (bytes.length !== ref.bytes) return { ok: false, reason: 'size-mismatch' }
    const hash = await sha256Hex(bytes)
    if (hash === null) return { ok: false, reason: 'cannot-verify' }
    if (hash !== ref.sha256) return { ok: false, reason: 'hash-mismatch' }
    const info = readWebpInfo(bytes)
    if (!info) return { ok: false, reason: 'not-webp' }
    const inBounds = info.width <= MAX_RENDER_PX && info.height <= MAX_RENDER_PX
    if (!inBounds || info.width !== ref.widthPx || info.height !== ref.heightPx) {
      return { ok: false, reason: 'bad-dimensions' }
    }
    return { ok: true, bytes, widthPx: info.width, heightPx: info.height, source: 'cache' }
  }

  const getRender = async (part: IndexPart): Promise<RenderResult> => {
    const ref = part.render
    if (!ref) return { ok: false, reason: 'no-render' }
    // The schema drops an oversized reference; this keeps a hand-built one from being fetched too.
    if (ref.bytes > MAX_RENDER_BYTES) return { ok: false, reason: 'size-mismatch' }
    const cacheKey = `render:${ref.sha256}`
    const cachedBytes = await cache().get(cacheKey)
    if (cachedBytes) {
      const result = await checkRenderBytes(ref, cachedBytes)
      if (result.ok) return result
      await cache().delete(cacheKey)
    }
    if (!baseUrl) return { ok: false, reason: 'not-configured' }
    const url = resolveUrl(ref.url)
    if (!url) return { ok: false, reason: 'bad-url' }
    const fetched = await fetchBytes(url, ref.bytes, false)
    if (!fetched.ok) return { ok: false, reason: fetched.reason }
    const result = await checkRenderBytes(ref, fetched.bytes)
    if (!result.ok) return result
    await cache().set(cacheKey, fetched.bytes)
    return { ...result, source: 'network' }
  }

  return { loadIndex, offered: offeredParts, getPackage, getRender, trustedKeys: currentKeys }
}

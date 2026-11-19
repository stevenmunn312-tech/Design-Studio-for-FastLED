// The online parts library as the shelf sees it: the signed index, installing a
// part from it, and remembering what was installed.
//
// Everything that touches the network or a signature lives in `./remote`. This
// module only joins it to the runtime catalogue:
//
//   install   fetch the package, verify its signature and hash, validate the
//             manifest as `downloaded`, register it, and only then remember it.
//             A part that does not verify, does not validate or needs a newer
//             app is never registered and never remembered.
//   restore   at start, re-verify each remembered envelope and register it. The
//             stored copy is untrusted bytes, exactly like a save's.
//
// Where the installed envelopes live: the same IndexedDB the remote client
// already uses for the index and package bytes. They are re-derivable, public,
// signed data, not the user's work, so they do not belong in the helper's
// Projects folder (which the browser build cannot reach, and which holds
// projects), and they can be large (up to 256 KB each), which rules out
// localStorage. See docs/plans/downloadable-parts.md ("Saves").
//
// Nothing runs at import time. With no `PARTS_BASE_URL` the library is
// `configured: false`: it makes no request and `loadIndex` says so.

import { validatePartManifest, type PartManifest } from './manifest/partManifest'
import { hasDownloadedRender, partById, partOrigin, registeredPartManifests, setDownloadedRender, unregisterPart } from './partCatalogue'
import { forgetSignedPart, registerSignedParts, type SignedPartFailure } from './signedParts'
import { readEnvelopeShape } from './savedParts'
import { decodeText, encodeText } from './remote/cache'
import {
  createIndexedDbCache,
  createPartsClient,
  type IndexLoadResult,
  type IndexPart,
  type PartsCache,
  type PartsClient,
  type PartsClientOptions,
} from './remote'
import { PARTS_BASE_URL } from './remote/trustedKeys'

const INSTALLED_IDS_KEY = 'installed-ids'
const installedKey = (partId: string): string => `installed:${partId}`
/** Which picture an installed part uses: the index's pinned reference, so a later session finds the cached bytes offline. */
const renderRefKey = (partId: string): string => `render-ref:${partId}`
const MAX_INSTALLED = 256

export type InstallFailure =
  /** The download failed (offline, host error, wrong size). */
  | 'network'
  /** The package or its signature did not verify, or this runtime cannot verify. */
  | 'unverified'
  /** The signed manifest does not pass this app's validation. */
  | 'invalid'
  /** The id is a bundled part, or a newer revision is already installed. */
  | 'kept'
  | 'not-configured'
  | 'not-offered'

export type InstallOutcome =
  | { ok: true; status: 'added' | 'replaced' | 'unchanged'; partId: string; revision: number }
  /** Well formed, but written for a newer Design Studio. Nothing was installed. */
  | { ok: false; reason: 'needs-newer-app'; detail: string }
  | { ok: false; reason: InstallFailure; detail?: string }

export interface PartsLibrary {
  /** True when a parts host is configured. False: no request is ever made. */
  readonly configured: boolean
  /** The verified index, refreshed from the network at most once per `refresh: true`. */
  loadIndex(options?: { refresh?: boolean }): Promise<IndexLoadResult>
  /** Download, verify, validate, register and remember one part. Never throws. */
  install(part: IndexPart): Promise<InstallOutcome>
  /** Register every remembered part again. Returns how many registered. Never throws. */
  restoreInstalled(): Promise<number>
  /**
   * Fetch, verify and attach the picture an index entry names. True when the
   * part now has its picture. A part with no picture, a picture that fails
   * verification or one that does not match the manifest's render size leaves
   * the part drawing its placeholder.
   */
  loadRender(part: Pick<IndexPart, 'partId' | 'revision' | 'render'>): Promise<boolean>
  /**
   * The verified bytes of an index entry's picture, for a result row that is
   * not installed. Null when there is none or it did not verify.
   */
  renderBytes(part: Pick<IndexPart, 'render'>): Promise<Uint8Array | null>
  /**
   * Attach pictures to downloaded parts that have none: from the remembered
   * reference first (offline), then from the index when it names the same
   * revision. A save opened on another machine gets its pictures this way.
   */
  attachMissingRenders(index?: { parts: readonly IndexPart[] } | null): Promise<void>
  /**
   * Resolve the parts a share link named by id and revision only (it left the
   * signed envelope out to stay short): fetch each from the index, verify and
   * register it for this session without installing it. Returns the part ids
   * that could not be resolved (no parts host, not offered at that revision,
   * download or verification failed).
   */
  resolveReferenced(parts: Record<string, { revision: number; envelope?: unknown }>): Promise<string[]>
  /**
   * Forget a downloaded part: unregister it, delete the remembered envelope and
   * picture. Refuses a part `inUse` reports as used (the caller owns the
   * project, the library does not). Saves keep working: they embed the envelope.
   */
  uninstall(partId: string, options?: { inUse?: (partId: string) => boolean }): Promise<UninstallOutcome>
}

export type UninstallOutcome =
  | { ok: true; partId: string }
  | { ok: false; reason: 'in-use' | 'not-downloaded' }

export interface PartsLibraryOptions {
  baseUrl?: string
  client?: Pick<PartsClient<PartManifest>, 'loadIndex' | 'getPackage' | 'getRender' | 'trustedKeys'>
  clientOptions?: Partial<PartsClientOptions<PartManifest>>
  cache?: PartsCache
}

const NEEDS_NEWER = 'needs-newer-app: '

function validateDownloaded(value: unknown) {
  const checked = validatePartManifest(value, 'downloaded')
  if (checked.status === 'ok') return { ok: true as const, manifest: checked.manifest }
  if (checked.status === 'needs-newer-app') return { ok: false as const, reason: NEEDS_NEWER + checked.reasons.join('; ') }
  return { ok: false as const, reason: checked.errors.join('; ') }
}

async function readIds(cache: PartsCache): Promise<string[]> {
  const bytes = await cache.get(INSTALLED_IDS_KEY)
  const text = bytes ? decodeText(bytes) : null
  if (text === null) return []
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string').slice(0, MAX_INSTALLED)
      : []
  } catch {
    return []
  }
}

export function createPartsLibrary(options: PartsLibraryOptions = {}): PartsLibrary {
  const baseUrl = (options.baseUrl ?? PARTS_BASE_URL).trim()
  const configured = baseUrl !== ''
  let cacheInstance: PartsCache | null = options.cache ?? null
  const cache = (): PartsCache => (cacheInstance ??= createIndexedDbCache())
  let clientInstance = options.client ?? null
  const client = () => (clientInstance ??= createPartsClient<PartManifest>({
    validateManifest: validateDownloaded,
    baseUrl,
    cache: cache(),
    ...options.clientOptions,
  }))

  const remember = async (partId: string, envelopeText: string): Promise<void> => {
    const ids = await readIds(cache())
    if (!ids.includes(partId)) {
      if (ids.length >= MAX_INSTALLED) return
      await cache().set(INSTALLED_IDS_KEY, encodeText(JSON.stringify([...ids, partId])))
    }
    await cache().set(installedKey(partId), encodeText(envelopeText))
  }

  const objectUrls = new Map<string, string>()

  const renderBytes = async (part: Pick<IndexPart, 'render'>): Promise<Uint8Array | null> => {
    if (!part.render) return null
    try {
      const result = await client().getRender(part as IndexPart)
      return result.ok ? result.bytes : null
    } catch {
      return null
    }
  }

  const showBytes = (partId: string, revision: number, bytes: Uint8Array): boolean => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/webp' }))
    if (!setDownloadedRender(partId, revision, url)) {
      URL.revokeObjectURL(url)
      return false
    }
    const old = objectUrls.get(partId)
    if (old) URL.revokeObjectURL(old)
    objectUrls.set(partId, url)
    return true
  }

  const loadRender = async (part: Pick<IndexPart, 'partId' | 'revision' | 'render'>): Promise<boolean> => {
    try {
      if (!part.render || partOrigin(part.partId) !== 'downloaded') return false
      const registered = partById(part.partId) as { revision?: number; render?: { widthPx: number; heightPx: number } } | undefined
      // The picture is for one revision; pads and indicators are measured on it.
      if (!registered || registered.revision !== part.revision) return false
      const wanted = registered.render
      if (!wanted || wanted.widthPx !== part.render.widthPx || wanted.heightPx !== part.render.heightPx) return false
      const bytes = await renderBytes(part)
      if (!bytes || !showBytes(part.partId, part.revision, bytes)) return false
      // Remembered only after it verified, so the next session needs no network.
      await cache().set(renderRefKey(part.partId), encodeText(JSON.stringify({ revision: part.revision, render: part.render })))
      return true
    } catch {
      return false
    }
  }

  const attachMissingRenders = async (index?: { parts: readonly IndexPart[] } | null): Promise<void> => {
    try {
      for (const manifest of registeredPartManifests()) {
        const id = manifest.partId
        if (partOrigin(id) !== 'downloaded' || hasDownloadedRender(id)) continue
        const remembered = await cache().get(renderRefKey(id))
        const text = remembered ? decodeText(remembered) : null
        let attached = false
        if (text !== null) {
          try {
            const value = JSON.parse(text) as { revision?: number; render?: IndexPart['render'] }
            if (value.render && typeof value.revision === 'number') {
              attached = await loadRender({ partId: id, revision: value.revision, render: value.render })
            }
          } catch {
            // An unreadable reference is the same as none.
          }
        }
        const offered = index?.parts.find((entry) => entry.partId === id && entry.revision === manifest.revision)
        if (!attached && offered?.render) await loadRender(offered)
      }
    } catch {
      // Pictures are an extra; the part already works.
    }
  }

  const loadIndex = async (opts?: { refresh?: boolean }): Promise<IndexLoadResult> => {
    if (!configured) return { ok: false, reason: 'not-configured' }
    const result = await client().loadIndex(opts)
    if (result.ok) void attachMissingRenders(result.index)
    return result
  }

  const install = async (part: IndexPart): Promise<InstallOutcome> => {
    if (!configured) return { ok: false, reason: 'not-configured' }
    try {
      const downloaded = await client().getPackage(part)
      if (!downloaded.ok) {
        const { reason, detail } = downloaded
        if (reason === 'invalid-manifest') {
          return detail?.startsWith(NEEDS_NEWER)
            ? { ok: false, reason: 'needs-newer-app', detail: detail.slice(NEEDS_NEWER.length) }
            : { ok: false, reason: 'invalid', detail }
        }
        if (reason === 'not-offered') return { ok: false, reason: 'not-offered' }
        if (reason === 'not-configured') return { ok: false, reason: 'not-configured' }
        if (reason === 'network' || reason === 'bad-url' || reason === 'size-mismatch') {
          return { ok: false, reason: 'network' }
        }
        return { ok: false, reason: 'unverified', detail: reason }
      }
      // Verified again here, with the id the index named: the package must be
      // a manifest for the part the user asked for, and registers as `downloaded`.
      const keys = await client().trustedKeys()
      const [result] = await registerSignedParts([downloaded.envelope], { keys, expectedIds: [part.partId] })
      const failure: SignedPartFailure | undefined = result.failure
      if (failure) return { ok: false, reason: 'unverified', detail: failure }
      const registration = result.registration
      if (!registration) return { ok: false, reason: 'invalid' }
      if (registration.status === 'needs-newer-app') {
        return { ok: false, reason: 'needs-newer-app', detail: registration.reasons.join('; ') }
      }
      if (registration.status === 'invalid') {
        return { ok: false, reason: 'invalid', detail: registration.reasons.join('; ') }
      }
      if (registration.status === 'kept-bundled' || registration.status === 'kept-newer') {
        return { ok: false, reason: 'kept', detail: registration.reasons.join('; ') }
      }
      const revision = (partById(part.partId) as { revision?: number } | undefined)?.revision ?? part.revision
      await remember(part.partId, JSON.stringify(downloaded.envelope))
      // Best effort and after the part is usable: no picture means the placeholder.
      await loadRender({ partId: part.partId, revision, render: part.render })
      return { ok: true, status: registration.status, partId: part.partId, revision }
    } catch {
      return { ok: false, reason: 'network' }
    }
  }

  const restoreInstalled = async (): Promise<number> => {
    try {
      const ids = await readIds(cache())
      const envelopes: unknown[] = []
      const expectedIds: string[] = []
      for (const id of ids) {
        const bytes = await cache().get(installedKey(id))
        const text = bytes ? decodeText(bytes) : null
        if (text === null) continue
        let shaped = null
        try {
          shaped = readEnvelopeShape(JSON.parse(text))
        } catch {
          // An unreadable entry is skipped, never fatal.
        }
        if (shaped) {
          envelopes.push(shaped)
          expectedIds.push(id)
        }
      }
      if (envelopes.length === 0) return 0
      const keys = await client().trustedKeys()
      const results = await registerSignedParts(envelopes, { keys, expectedIds })
      // Pictures come from the cache by their pinned hash: no network needed.
      await attachMissingRenders(null)
      return results.filter((result) => {
        const status = result.registration?.status
        return !result.failure && (status === 'added' || status === 'replaced' || status === 'unchanged')
      }).length
    } catch {
      return 0
    }
  }

  const resolveReferenced = async (
    parts: Record<string, { revision: number; envelope?: unknown }>,
  ): Promise<string[]> => {
    const unresolved: string[] = []
    let index: IndexLoadResult | null = null
    for (const [id, entry] of Object.entries(parts)) {
      if (entry.envelope !== undefined) continue
      const origin = partOrigin(id)
      if (origin === 'bundled') continue
      const have = (partById(id) as { revision?: number } | undefined)?.revision
      if (typeof have === 'number' && have >= entry.revision) continue
      try {
        if (!configured) { unresolved.push(id); continue }
        index ??= await loadIndex()
        const offered = index.ok
          ? index.index.parts.find((part) => part.partId === id && part.revision === entry.revision)
          : undefined
        if (!offered) { unresolved.push(id); continue }
        const downloaded = await client().getPackage(offered)
        if (!downloaded.ok) { unresolved.push(id); continue }
        const keys = await client().trustedKeys()
        const [result] = await registerSignedParts([downloaded.envelope], { keys, expectedIds: [id] })
        const status = result.registration?.status
        if (result.failure || !(status === 'added' || status === 'replaced' || status === 'unchanged')) unresolved.push(id)
      } catch {
        unresolved.push(id)
      }
    }
    return unresolved
  }

  const uninstall = async (
    partId: string,
    opts?: { inUse?: (partId: string) => boolean },
  ): Promise<UninstallOutcome> => {
    if (partOrigin(partId) !== 'downloaded') return { ok: false, reason: 'not-downloaded' }
    if (opts?.inUse?.(partId)) return { ok: false, reason: 'in-use' }
    unregisterPart(partId)
    forgetSignedPart(partId)
    const url = objectUrls.get(partId)
    if (url) URL.revokeObjectURL(url)
    objectUrls.delete(partId)
    try {
      const ids = await readIds(cache())
      await cache().set(INSTALLED_IDS_KEY, encodeText(JSON.stringify(ids.filter((id) => id !== partId))))
      await cache().delete(installedKey(partId))
      await cache().delete(renderRefKey(partId))
    } catch {
      // The part is gone for this session; a stale record restores at most a re-verified copy.
    }
    return { ok: true, partId }
  }

  return { configured, loadIndex, install, restoreInstalled, loadRender, renderBytes, attachMissingRenders, resolveReferenced, uninstall }
}

let shared: PartsLibrary | null = null

/** The app's library, created on first use. */
export function getPartsLibrary(): PartsLibrary {
  return (shared ??= createPartsLibrary())
}

/** Test only: drop the shared library so the next `getPartsLibrary` is fresh. */
export function resetPartsLibraryForTests(replacement: PartsLibrary | null = null): void {
  shared = replacement
}

export type InstalledState =
  /** A bundled part, or not in the catalogue and not installed. */
  | 'available'
  | 'installed'
  /** Installed at a lower revision than the index offers. */
  | 'update'
  | 'bundled'

/** How one index entry stands against the runtime catalogue. */
export function installedState(part: Pick<IndexPart, 'partId' | 'revision'>): InstalledState {
  const origin = partOrigin(part.partId)
  if (origin === 'bundled') return 'bundled'
  if (origin !== 'downloaded') return 'available'
  const have = (partById(part.partId) as { revision?: unknown } | undefined)?.revision
  return typeof have === 'number' && have < part.revision ? 'update' : 'installed'
}

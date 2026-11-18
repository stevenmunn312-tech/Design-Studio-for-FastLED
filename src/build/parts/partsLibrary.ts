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
import { partById, partOrigin } from './partCatalogue'
import { registerSignedParts, type SignedPartFailure } from './signedParts'
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
}

export interface PartsLibraryOptions {
  baseUrl?: string
  client?: Pick<PartsClient<PartManifest>, 'loadIndex' | 'getPackage' | 'trustedKeys'>
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

  const loadIndex = async (opts?: { refresh?: boolean }): Promise<IndexLoadResult> => {
    if (!configured) return { ok: false, reason: 'not-configured' }
    return client().loadIndex(opts)
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
      return results.filter((result) => {
        const status = result.registration?.status
        return !result.failure && (status === 'added' || status === 'replaced' || status === 'unchanged')
      }).length
    } catch {
      return 0
    }
  }

  return { configured, loadIndex, install, restoreInstalled }
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

// Signed parts: the only way a part from outside the app ever loads.
//
// A downloaded part reaches the registry as a signed envelope. It is verified
// against the trusted keys, its payload must be a manifest for that part id,
// and `registerParts(..., 'downloaded')` validates it again. The envelope that
// registered a part is remembered here so a save can carry it; a project opened
// elsewhere re-verifies it. An unsigned manifest never loads from a save: the
// only embedded form is an envelope.
//
// Bundled parts are never embedded. See docs/plans/downloadable-parts.md
// ("Saves", "Trust and safety").

import type { StudioNode } from '../../state/graphStore'
import { partById, partOrigin, registerParts, type PartRegistration } from './partCatalogue'
import { partOptionFor } from './partOptions'
import { partTypeById } from './partTypes'
import { verifyEnvelope, type SignedEnvelope } from './remote/envelope'
import { createPartsClient } from './remote/client'
import { TRUSTED_KEYS, type TrustedKey } from './remote/trustedKeys'
import { readEnvelopeShape, sanitizeSavedParts, type SavedParts } from './savedParts'

export type SignedPartFailure =
  | 'malformed'
  | 'cannot-verify'
  | 'no-trusted-key'
  | 'bad-signature'
  /** The signed payload is not a manifest for the id the save named. */
  | 'wrong-part'

export interface SignedPartResult {
  partId: string | null
  /** The registry's outcome when the envelope verified; null when it did not. */
  registration: PartRegistration | null
  failure?: SignedPartFailure
}

interface Remembered {
  revision: number
  envelope: SignedEnvelope
}

const envelopes = new Map<string, Remembered>()
/** Embedded entries that failed verification, kept so a re-save does not lose them. */
const unverified = new Map<string, { revision: number; envelope: SignedEnvelope; failure: SignedPartFailure }>()
let keyOverride: readonly TrustedKey[] | null = null

/** Test only: trust exactly these keys (null restores the shipped set). */
export function overrideTrustedPartKeysForTests(keys: readonly TrustedKey[] | null): void {
  keyOverride = keys
}

/** Test only: forget remembered envelopes and failures. Pair with `resetRegisteredPartsForTests`. */
export function resetSignedPartsForTests(): void {
  envelopes.clear()
  unverified.clear()
}

/** The keys to verify against: the shipped set plus rotations the index announced. */
export async function trustedPartKeys(): Promise<readonly TrustedKey[]> {
  if (keyOverride) return keyOverride
  try {
    const client = createPartsClient({ validateManifest: () => ({ ok: false, reason: 'unused' }) })
    return await client.trustedKeys()
  } catch {
    // No storage to read learned keys from: the shipped keys still apply.
    return TRUSTED_KEYS
  }
}

function readPayload(payload: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(payload)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

/**
 * Verify and register signed parts. A part that fails verification is not
 * registered and its failure is reported; nothing is thrown. `expectedIds`
 * (parallel to `list`) names the id each envelope must carry.
 */
export async function registerSignedParts(
  list: readonly unknown[],
  options?: { keys?: readonly TrustedKey[]; expectedIds?: readonly (string | undefined)[] },
): Promise<SignedPartResult[]> {
  const keys = options?.keys ?? await trustedPartKeys()
  const results: SignedPartResult[] = []
  for (const [index, candidate] of list.entries()) {
    const envelope = readEnvelopeShape(candidate)
    if (!envelope) { results.push({ partId: null, registration: null, failure: 'malformed' }); continue }
    const verified = await verifyEnvelope(envelope, keys)
    if (!verified.ok) { results.push({ partId: null, registration: null, failure: verified.reason }); continue }
    const manifest = readPayload(verified.payload)
    const id = manifest && typeof manifest.partId === 'string' ? manifest.partId : null
    const expected = options?.expectedIds?.[index]
    if (!manifest || (expected !== undefined && id !== expected)) {
      results.push({ partId: id, registration: null, failure: manifest ? 'wrong-part' : 'malformed' })
      continue
    }
    const [registration] = registerParts([manifest], 'downloaded')
    results.push({ partId: id, registration })
    if (id && (registration.status === 'added' || registration.status === 'replaced' || registration.status === 'unchanged')) {
      const revision = typeof manifest.revision === 'number' ? manifest.revision : 0
      const known = envelopes.get(id)
      if (!known || known.revision <= revision) envelopes.set(id, { revision, envelope })
      unverified.delete(id)
    }
  }
  return results
}

/** Drop the remembered envelope (and any unverified copy) of a part that was uninstalled. */
export function forgetSignedPart(partId: string): void {
  envelopes.delete(partId)
  unverified.delete(partId)
}

/** The signed envelope a registered downloaded part came in, if this session holds it. */
export function signedEnvelopeFor(partId: string): SignedEnvelope | undefined {
  if (partOrigin(partId) !== 'downloaded') return undefined
  const remembered = envelopes.get(partId)
  const revision = revisionOf(partId)
  return remembered && remembered.revision === revision ? remembered.envelope : undefined
}

function revisionOf(partId: string): number | undefined {
  const revision = (partById(partId) as { revision?: unknown } | undefined)?.revision
  return typeof revision === 'number' ? revision : undefined
}

/** Why a held node's embedded copy did not load, when it was in the save. */
export function embeddedPartFailure(partId: string): SignedPartFailure | undefined {
  return unverified.get(partId)?.failure
}

/**
 * The `parts` map for a set of nodes: every part they use, with its revision,
 * and the signed envelope for a downloaded one. An id the app does not know is
 * carried only when the save it came from held an embedded copy that did not
 * verify, so re-saving does not lose it (it stays unverified and never loads).
 */
export function collectSavedParts(nodes: readonly Pick<StudioNode, 'data'>[]): SavedParts {
  const parts: SavedParts = {}
  for (const node of nodes) {
    const nodeType = String(node.data?.nodeType ?? '')
    const property = partTypeById(nodeType)?.property
    if (!property) continue
    const saved = (node.data.properties as Record<string, unknown> | undefined)?.[property]
    if (saved === undefined || saved === null || String(saved).trim() === '') continue
    const id = partOptionFor(nodeType, String(saved))?.id ?? String(saved)
    if (parts[id]) continue
    const revision = revisionOf(id)
    if (revision !== undefined) {
      const envelope = signedEnvelopeFor(id)
      parts[id] = envelope ? { revision, envelope } : { revision }
      continue
    }
    const carried = unverified.get(id)
    if (carried) parts[id] = { revision: carried.revision, envelope: carried.envelope }
  }
  return parts
}

/**
 * Register the signed parts a save embedded, before its graph loads. A part the
 * registry already holds at the same or a newer revision is left alone; the rest
 * are verified. A failure is remembered (see `embeddedPartFailure`) and the node
 * stays held.
 */
export async function registerEmbeddedParts(
  value: unknown,
  options?: { keys?: readonly TrustedKey[] },
): Promise<SignedPartResult[]> {
  if (value === undefined || value === null) return []
  const { parts } = sanitizeSavedParts(value)
  const ids: string[] = []
  const toVerify: unknown[] = []
  for (const [id, entry] of Object.entries(parts)) {
    if (!entry.envelope) continue
    if (partOrigin(id) === 'bundled') continue
    const have = revisionOf(id)
    if (have !== undefined && have >= entry.revision) continue
    ids.push(id)
    toVerify.push(entry.envelope)
  }
  if (toVerify.length === 0) return []
  const results = await registerSignedParts(toVerify, { keys: options?.keys, expectedIds: ids })
  results.forEach((result, index) => {
    const id = ids[index]
    // A signature that verified over a manifest this app cannot use is as
    // unusable as one that did not verify.
    const status = result.registration?.status
    const failure = result.failure ?? (status === 'invalid' || status === 'needs-newer-app' ? 'malformed' : undefined)
    if (failure) {
      const entry = parts[id]
      if (entry.envelope) unverified.set(id, { revision: entry.revision, envelope: entry.envelope, failure })
    }
  })
  return results
}

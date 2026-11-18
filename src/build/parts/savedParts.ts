// The `parts` map a save carries: for every part its nodes use, the revision it
// was built with and, for a downloaded part, the signed envelope it came in.
// Bundled parts carry a revision only; a newer app's bundled part is also on
// the signed index, where an older app finds it by id.
//
// This module is shape and bounds only (no catalogue, no crypto), so the
// save sanitizer can use it without pulling the registry in. Nothing here
// trusts an envelope: `signedParts.ts` verifies one before it is registered.

import { ENVELOPE_FORMAT, type SignedEnvelope } from './remote/envelope'

export interface SavedPartEntry {
  /** The manifest revision the project was built with. */
  revision: number
  /** The signed package, present only for a downloaded part. */
  envelope?: SignedEnvelope
}

export type SavedParts = Record<string, SavedPartEntry>

/** Most parts a save may list. */
export const MAX_SAVED_PARTS = 256
/** Longest signed payload one part may embed, in UTF-16 units. */
export const MAX_SAVED_PART_PAYLOAD = 256 * 1024
/** Total embedded payload across the map. */
export const MAX_SAVED_PARTS_PAYLOAD = 4 * 1024 * 1024

const PART_ID = /^[a-z0-9][a-z0-9-]{0,79}$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** A fresh envelope object when `value` has the signed-envelope shape, else null. */
export function readEnvelopeShape(value: unknown): SignedEnvelope | null {
  if (!isPlainObject(value)) return null
  if (value.format !== ENVELOPE_FORMAT || typeof value.payload !== 'string') return null
  if (value.payload.length > MAX_SAVED_PART_PAYLOAD) return null
  const list = value.signatures
  if (!Array.isArray(list) || list.length === 0 || list.length > 16) return null
  const signatures: SignedEnvelope['signatures'] = []
  for (const item of list) {
    if (!isPlainObject(item) || typeof item.keyId !== 'string' || typeof item.sig !== 'string') return null
    if (item.keyId.length > 64 || item.sig.length > 128) return null
    signatures.push({ keyId: item.keyId, sig: item.sig })
  }
  return { format: ENVELOPE_FORMAT, payload: value.payload, signatures }
}

export interface SanitizedSavedParts {
  parts: SavedParts
  /** Entries left out: malformed, or past the count or size bound. */
  dropped: number
}

/**
 * A bounded copy of a saved `parts` value. A malformed entry is dropped whole;
 * entries past the count or byte bound are dropped in order. Only the known
 * fields survive.
 */
export function sanitizeSavedParts(value: unknown): SanitizedSavedParts {
  const parts: SavedParts = {}
  if (!isPlainObject(value)) return { parts, dropped: value === undefined ? 0 : 1 }
  let dropped = 0
  let kept = 0
  let bytes = 0
  for (const [id, entry] of Object.entries(value)) {
    if (!PART_ID.test(id) || !isPlainObject(entry)) { dropped += 1; continue }
    const revision = entry.revision
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1 || revision > 1_000_000) {
      dropped += 1
      continue
    }
    let envelope: SignedEnvelope | undefined
    if (entry.envelope !== undefined) {
      const shaped = readEnvelopeShape(entry.envelope)
      if (!shaped) { dropped += 1; continue }
      envelope = shaped
    }
    const size = envelope ? envelope.payload.length : 0
    if (kept >= MAX_SAVED_PARTS || bytes + size > MAX_SAVED_PARTS_PAYLOAD) { dropped += 1; continue }
    kept += 1
    bytes += size
    parts[id] = envelope ? { revision, envelope } : { revision }
  }
  return { parts, dropped }
}

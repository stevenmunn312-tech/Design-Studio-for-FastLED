// Key rotation without an app release. The signed index payload may carry
// `keys: { add: [{ keyId, publicKey }], retire: [keyId] }`. The client only
// honours it after the index envelope verified against an already-trusted key
// (the caller's job), and it never lets a retirement empty the trusted set.
// The learned state is persisted with the cache.

import { base64urlDecode } from './base64url'
import type { TrustedKey } from './trustedKeys'

export interface KeyState {
  added: TrustedKey[]
  retired: string[]
}

export interface KeyAnnouncement {
  add: TrustedKey[]
  retire: string[]
}

export function emptyKeyState(): KeyState {
  return { added: [], retired: [] }
}

export function effectiveKeys(base: readonly TrustedKey[], state: KeyState): TrustedKey[] {
  const retired = new Set(state.retired)
  const out = new Map<string, TrustedKey>()
  for (const key of [...base, ...state.added]) {
    if (!retired.has(key.keyId)) out.set(key.keyId, key)
  }
  return [...out.values()]
}

function validKey(value: unknown): TrustedKey | null {
  if (typeof value !== 'object' || value === null) return null
  const { keyId, publicKey } = value as Record<string, unknown>
  if (typeof keyId !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) return null
  if (typeof publicKey !== 'string') return null
  if (base64urlDecode(publicKey)?.length !== 32) return null
  return { keyId, publicKey }
}

/** Pull a well-formed announcement out of an index payload object; junk is ignored. */
export function readKeyAnnouncement(value: unknown): KeyAnnouncement {
  const out: KeyAnnouncement = { add: [], retire: [] }
  if (typeof value !== 'object' || value === null) return out
  const { add, retire } = value as Record<string, unknown>
  if (Array.isArray(add)) {
    for (const k of add.slice(0, 16)) {
      const key = validKey(k)
      if (key) out.add.push(key)
    }
  }
  if (Array.isArray(retire)) {
    for (const id of retire.slice(0, 16)) if (typeof id === 'string') out.retire.push(id)
  }
  return out
}

/** Read a persisted state, tolerating anything the store hands back. */
export function readKeyState(value: unknown): KeyState {
  const state = emptyKeyState()
  if (typeof value !== 'object' || value === null) return state
  const { added, retired } = value as Record<string, unknown>
  if (Array.isArray(added)) {
    for (const k of added) {
      const key = validKey(k)
      if (key) state.added.push(key)
    }
  }
  if (Array.isArray(retired)) {
    for (const id of retired) if (typeof id === 'string') state.retired.push(id)
  }
  return state
}

/**
 * Apply an announcement from a verified index. Additions first (an added key is
 * un-retired), then retirements in order; a retirement that would leave no
 * trusted key is skipped, so the app can never lock itself out.
 */
export function applyKeyAnnouncement(
  base: readonly TrustedKey[],
  state: KeyState,
  announcement: KeyAnnouncement,
): KeyState {
  const added = new Map(state.added.map((k) => [k.keyId, k]))
  const retired = new Set(state.retired)
  for (const key of announcement.add) {
    added.set(key.keyId, key)
    retired.delete(key.keyId)
  }
  const next: KeyState = { added: [...added.values()], retired: [...retired] }
  for (const id of announcement.retire) {
    if (next.retired.includes(id)) continue
    const candidate: KeyState = { added: next.added, retired: [...next.retired, id] }
    if (effectiveKeys(base, candidate).length > 0) next.retired = candidate.retired
  }
  return next
}

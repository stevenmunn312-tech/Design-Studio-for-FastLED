// The Ed25519 public keys the app trusts to sign the parts index and part
// packages. See docs/design/part-packages.md.
//
// No production key exists yet, so this list ships EMPTY on purpose: with no
// trusted key nothing downloaded can verify, and nothing downloaded loads.
// When the project's signing key is generated (`node scripts/parts/sign.mjs
// keygen <path>`), add its public half here. List more than one key before
// v1.0.0 so a lost key can be rotated out without an app release (the signed
// index can announce successors; see `keyring.ts`). Never put a private key
// anywhere in the repository.

export interface TrustedKey {
  /** Short stable id, referenced by signatures. */
  keyId: string
  /** Raw 32-byte Ed25519 public key, base64url without padding. */
  publicKey: string
}

export const TRUSTED_KEYS: readonly TrustedKey[] = []

/**
 * Base URL of the static host serving `index.json`, packages and renders. Empty
 * until a host exists: with no base URL the client never fetches.
 */
export const PARTS_BASE_URL = ''

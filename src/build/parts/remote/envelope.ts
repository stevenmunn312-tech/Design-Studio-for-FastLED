// Signed envelope: `{ format: 'dsf-signed/1', payload, signatures }`. The
// signature covers the exact UTF-8 bytes of the `payload` string, so no JSON
// canonicalisation is needed. Valid when at least one signature verifies
// against a trusted key.

import { base64urlDecode } from './base64url'
import type { TrustedKey } from './trustedKeys'

export const ENVELOPE_FORMAT = 'dsf-signed/1'

export interface EnvelopeSignature {
  keyId: string
  sig: string
}

export interface SignedEnvelope {
  format: typeof ENVELOPE_FORMAT
  payload: string
  signatures: EnvelopeSignature[]
}

export type VerifyFailure =
  /** Not JSON, wrong shape, or wrong `format`. */
  | 'malformed'
  /** The runtime has no Ed25519; nothing can be verified, so nothing loads. */
  | 'cannot-verify'
  /** No signature in the envelope names a trusted key. */
  | 'no-trusted-key'
  /** A trusted key was named but no signature from one verified. */
  | 'bad-signature'

export type VerifyResult =
  | { ok: true; payload: string; keyId: string }
  | { ok: false; reason: VerifyFailure }

const encoder = new TextEncoder()

export function parseEnvelope(text: string): SignedEnvelope | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v.format !== ENVELOPE_FORMAT || typeof v.payload !== 'string') return null
  if (!Array.isArray(v.signatures) || v.signatures.length === 0 || v.signatures.length > 16) return null
  const signatures: EnvelopeSignature[] = []
  for (const s of v.signatures) {
    if (typeof s !== 'object' || s === null) return null
    const { keyId, sig } = s as Record<string, unknown>
    if (typeof keyId !== 'string' || typeof sig !== 'string') return null
    signatures.push({ keyId, sig })
  }
  return { format: ENVELOPE_FORMAT, payload: v.payload, signatures }
}

/** True when this runtime exposes WebCrypto with Ed25519. */
export async function canVerifyEd25519(): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return false
  try {
    // Any 32 bytes import as a raw Ed25519 public key; this only probes support.
    await subtle.importKey('raw', new Uint8Array(32), { name: 'Ed25519' }, false, ['verify'])
    return true
  } catch {
    return false
  }
}

/** Verify an envelope against `keys`. Fails closed: any doubt is a failure. */
export async function verifyEnvelope(
  envelope: SignedEnvelope,
  keys: readonly TrustedKey[],
): Promise<VerifyResult> {
  if (!(await canVerifyEd25519())) return { ok: false, reason: 'cannot-verify' }
  const subtle = globalThis.crypto.subtle
  const message = encoder.encode(envelope.payload)
  let sawTrustedKey = false
  for (const signature of envelope.signatures) {
    const key = keys.find((k) => k.keyId === signature.keyId)
    if (!key) continue
    sawTrustedKey = true
    const raw = base64urlDecode(key.publicKey)
    const sig = base64urlDecode(signature.sig)
    if (!raw || raw.length !== 32 || !sig || sig.length !== 64) continue
    try {
      const cryptoKey = await subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify'])
      if (await subtle.verify({ name: 'Ed25519' }, cryptoKey, sig, message)) {
        return { ok: true, payload: envelope.payload, keyId: key.keyId }
      }
    } catch {
      // A bad key or signature is just a signature that did not verify.
    }
  }
  return { ok: false, reason: sawTrustedKey ? 'bad-signature' : 'no-trusted-key' }
}

/** Parse and verify envelope text in one step. */
export async function verifyEnvelopeText(
  text: string,
  keys: readonly TrustedKey[],
): Promise<VerifyResult> {
  const envelope = parseEnvelope(text)
  if (!envelope) return { ok: false, reason: 'malformed' }
  return verifyEnvelope(envelope, keys)
}

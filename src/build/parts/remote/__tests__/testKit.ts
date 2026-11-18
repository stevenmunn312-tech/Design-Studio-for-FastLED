// Shared fixtures: throwaway Ed25519 keys and signed envelopes generated at run
// time. No key material is ever stored in the repository.

import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import type { TrustedKey } from '../trustedKeys'

export interface TestSigner {
  keyId: string
  publicKey: string
  privateKey: KeyObject
  trusted: TrustedKey
}

export function makeSigner(keyId: string): TestSigner {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const raw = publicKey.export({ format: 'jwk' }).x as string
  return { keyId, publicKey: raw, privateKey, trusted: { keyId, publicKey: raw } }
}

export function signEnvelope(payload: string, signers: TestSigner[]): string {
  const bytes = Buffer.from(payload, 'utf8')
  return JSON.stringify({
    format: 'dsf-signed/1',
    payload,
    signatures: signers.map((s) => ({
      keyId: s.keyId,
      sig: sign(null, bytes, s.privateKey).toString('base64url'),
    })),
  })
}

export const sha256Hex = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex')

/** A syntactically valid lossless WebP header of the given size (not decodable, but inspectable). */
export function fakeWebp(width: number, height: number): Uint8Array {
  const b = Buffer.alloc(40)
  b.write('RIFF', 0, 'ascii')
  b.writeUInt32LE(32, 4)
  b.write('WEBP', 8, 'ascii')
  b.write('VP8L', 12, 'ascii')
  b.writeUInt32LE(20, 16)
  b[20] = 0x2f
  b.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 21)
  return new Uint8Array(b)
}

export interface Hosted {
  files: Map<string, Uint8Array>
  fetch: typeof fetch
  requests: string[]
}

/** A fake static host keyed by absolute URL. A missing URL is a network error. */
export function fakeHost(): Hosted {
  const files = new Map<string, Uint8Array>()
  const requests: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requests.push(url)
    const body = files.get(url)
    if (!body) throw new TypeError('network down')
    return new Response(body as BufferSource, { status: 200 })
  }) as typeof fetch
  return { files, fetch: fetchImpl, requests }
}

export const BASE = 'https://parts.example.test/v1/'

import { afterEach, describe, expect, it } from 'vitest'
import { buildShareUrl, readSharedWorkspace, SHARE_URL_WARN_BYTES } from '../shareGraph'

const envelope = (payload: string) => ({
  format: 'dsf-signed/1' as const,
  payload,
  signatures: [{ keyId: 'k', sig: 'A'.repeat(86) }],
})

/** Incompressible-ish text, so the test measures a realistic worst case. */
function noise(length: number): string {
  let seed = 7
  let out = ''
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    out += String.fromCharCode(33 + (seed % 90))
  }
  return out
}

afterEach(() => { window.location.hash = '' })

describe('share links and downloaded parts', () => {
  it('carries the signed envelope when the link stays short', () => {
    const url = buildShareUrl({
      nodes: [], edges: [],
      parts: { 'my-part': { revision: 2, envelope: envelope(JSON.stringify({ partId: 'my-part', blob: noise(2000) })) } },
    })
    expect(url.length).toBeLessThan(SHARE_URL_WARN_BYTES)
    window.location.hash = new URL(url).hash
    expect(readSharedWorkspace()?.workspace.parts?.['my-part'].envelope).toBeDefined()
  })

  it('falls back to id and revision when envelopes would make the link too long', () => {
    const big = (id: string) => ({ revision: 1, envelope: envelope(JSON.stringify({ partId: id, blob: noise(70000) })) })
    const parts = { 'part-a': big('part-a'), 'part-b': big('part-b') }
    const url = buildShareUrl({ nodes: [], edges: [], parts })
    expect(url.length).toBeLessThan(SHARE_URL_WARN_BYTES)
    window.location.hash = new URL(url).hash
    expect(readSharedWorkspace()?.workspace.parts).toEqual({ 'part-a': { revision: 1 }, 'part-b': { revision: 1 } })
  })
})

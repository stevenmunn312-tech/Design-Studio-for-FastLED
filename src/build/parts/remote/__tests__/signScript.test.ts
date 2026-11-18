// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createMemoryCache } from '../cache'
import { createPartsClient } from '../client'
import { verifyEnvelopeText } from '../envelope'
import { BASE, fakeWebp } from './testKit'

const REPO = resolve(__dirname, '..', '..', '..', '..', '..')
const SCRIPT = join(REPO, 'scripts', 'parts', 'sign.mjs')
const work = mkdtempSync(join(tmpdir(), 'dsf-sign-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))

const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

describe('scripts/parts/sign.mjs', () => {
  const keyPath = join(work, 'private.pem')
  let publicKey = ''

  it('generates a keypair, refusing repo paths and overwrites', () => {
    const inRepo = join(REPO, 'src', 'should-not-exist.pem')
    const refused = run('keygen', inRepo)
    expect(refused.status).not.toBe(0)
    expect(existsSync(inRepo)).toBe(false)

    const ok = run('keygen', keyPath)
    expect(ok.status).toBe(0)
    publicKey = /publicKey: (\S+)/.exec(ok.stdout)![1]
    expect(publicKey).toHaveLength(43)
    expect(readFileSync(keyPath, 'utf8')).toContain('PRIVATE KEY')
    expect(run('keygen', keyPath).status).not.toBe(0)
  })

  it('signs a payload file into an envelope the app verifies', async () => {
    const payloadFile = join(work, 'payload.json')
    writeFileSync(payloadFile, '{"a": 1}\n')
    const signed = run('sign', payloadFile, '--key', keyPath, '--key-id', 'k1')
    expect(signed.status).toBe(0)
    expect(await verifyEnvelopeText(signed.stdout, [{ keyId: 'k1', publicKey }])).toEqual({
      ok: true,
      payload: '{"a": 1}\n',
      keyId: 'k1',
    })
  })

  it('builds a signed index and packages the client can download and verify', async () => {
    const manifests = join(work, 'manifests')
    const out = join(work, 'site')
    mkdirSync(manifests)
    writeFileSync(
      join(manifests, 'hc-sr04.json'),
      JSON.stringify({
        partId: 'hc-sr04',
        revision: 2,
        partTypes: ['DistanceInput'],
        label: 'HC-SR04',
        interfaces: ['gpio'],
        categories: ['ultra'],
        verification: 'bench',
      }),
    )
    writeFileSync(join(manifests, 'hc-sr04.webp'), fakeWebp(80, 60))
    writeFileSync(
      join(manifests, 'categories.json'),
      JSON.stringify([{ id: 'ultra', label: 'Ultrasonic', order: 1, parent: null }]),
    )
    const built = run('index', manifests, '--out-dir', out, '--key', keyPath, '--key-id', 'k1', '--base-url', BASE)
    expect(built.status).toBe(0)

    const files = new Map<string, Uint8Array>()
    for (const rel of ['index.json', 'packages/hc-sr04@2.json', 'renders/hc-sr04@2.webp']) {
      files.set(`${BASE}${rel}`, readFileSync(join(out, rel)))
    }
    const client = createPartsClient<{ partId: string }>({
      baseUrl: BASE,
      trustedKeys: [{ keyId: 'k1', publicKey }],
      cache: createMemoryCache(),
      fetch: (async (url: RequestInfo | URL) => {
        const body = files.get(String(url))
        if (!body) throw new TypeError('missing')
        return new Response(body as BufferSource)
      }) as typeof fetch,
      validateManifest: (v) => ({ ok: true, manifest: v as { partId: string } }),
    })
    const index = await client.loadIndex()
    expect(index.ok).toBe(true)
    if (!index.ok) return
    const part = index.index.parts[0]
    expect(part).toMatchObject({ partId: 'hc-sr04', revision: 2, verification: 'bench' })
    expect(index.index.categories[0].id).toBe('ultra')
    expect(await client.getPackage(part)).toMatchObject({ ok: true, manifest: { partId: 'hc-sr04' } })
    expect(await client.getRender(part)).toMatchObject({ ok: true, widthPx: 80, heightPx: 60 })
  })
})

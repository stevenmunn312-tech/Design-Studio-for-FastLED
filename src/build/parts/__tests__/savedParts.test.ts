// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StudioNode } from '../../../state/graphStore'
import { captureWorkspace } from '../../../state/workspacePersistence'
import { parseProjectFile, serializeProject } from '../../../utils/projectFileIO'
import { sanitizeWorkspacePayload } from '../../../utils/workspacePayload'
import { PART_CATALOGUE, partOrigin, registerParts, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../partCatalogue'
import { describeUnresolved, unresolvedNodes } from '../partResolution'
import { partTypeById } from '../partTypes'
import type { PartManifest } from '../manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../manifest/vocabulary'
import { makeSigner, signEnvelope } from '../remote/__tests__/testKit'
import {
  MAX_SAVED_PARTS,
  MAX_SAVED_PARTS_PAYLOAD,
  sanitizeSavedParts,
} from '../savedParts'
import {
  collectSavedParts,
  embeddedPartFailure,
  overrideTrustedPartKeysForTests,
  registerEmbeddedParts,
  registerSignedParts,
  resetSignedPartsForTests,
  signedEnvelopeFor,
} from '../signedParts'

const BASE_MONITOR = 'adafruit-ina219-current-sensor'
const signer = makeSigner('test-key')
const stranger = makeSigner('other-key')
const KEYS = [signer.trusted]

function manifest(partId: string, revision = 1): PartManifest {
  const entry = PART_CATALOGUE[BASE_MONITOR] as PartCatalogueEntry
  return {
    ...(JSON.parse(JSON.stringify(entry)) as PartCatalogueEntry),
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision,
    partTypes: ['PowerMonitorInput'],
    categories: [],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
  }
}

const sign = (m: unknown, by = signer) => JSON.parse(signEnvelope(JSON.stringify(m), [by])) as Record<string, unknown>

function node(partId: string): StudioNode {
  return {
    id: `n-${partId}`, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: 'Monitor', nodeType: 'PowerMonitorInput', category: 'output', properties: { partId }, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const OPENED: Array<() => void> = []

beforeEach(() => {
  const definition = partTypeById('PowerMonitorInput') as { downloadable: boolean }
  const before = definition.downloadable
  definition.downloadable = true
  OPENED.push(() => { definition.downloadable = before })
  overrideTrustedPartKeysForTests(KEYS)
})

afterEach(() => {
  while (OPENED.length > 0) OPENED.pop()!()
  overrideTrustedPartKeysForTests(null)
  resetRegisteredPartsForTests()
  resetSignedPartsForTests()
})

/** Register a signed part, save a project using it, then start from a fresh registry. */
async function saveAndForget(partId = 'signed-monitor') {
  await registerSignedParts([sign(manifest(partId))], { keys: KEYS })
  const nodes = [node(partId)]
  const parts = collectSavedParts(nodes)
  const text = serializeProject({
    id: 'p', name: 'P', createdAt: 1, updatedAt: 1,
    workspace: { nodes, edges: [], parts },
  })
  resetRegisteredPartsForTests()
  resetSignedPartsForTests()
  return { text, nodes, parts }
}

describe('saves carry their parts', () => {
  it('round-trips a signed part: save, fresh registry, load, node resolves', async () => {
    const { text, nodes } = await saveAndForget()
    expect(partOrigin('signed-monitor')).toBeUndefined()
    expect(unresolvedNodes(nodes)).toHaveLength(1)

    const { project, dropped } = parseProjectFile(text, 'x')
    expect(dropped).toBe(0)
    const results = await registerEmbeddedParts(project.workspace.parts)
    expect(results.map((r) => r.registration?.status)).toEqual(['added'])
    expect(partOrigin('signed-monitor')).toBe('downloaded')
    expect(unresolvedNodes(nodes)).toHaveLength(0)
    // The part remembers its envelope, so saving again carries it on.
    expect(signedEnvelopeFor('signed-monitor')).toBeDefined()
    expect(collectSavedParts(nodes)['signed-monitor'].envelope).toBeDefined()
  })

  it('bundled-only projects list revisions and no envelope', () => {
    const parts = collectSavedParts([node(BASE_MONITOR)])
    expect(parts).toEqual({ [BASE_MONITOR]: { revision: expect.any(Number) } })
    expect(parts[BASE_MONITOR].envelope).toBeUndefined()
  })

  it('captureWorkspace writes the map', () => {
    const workspace = captureWorkspace({
      nodes: [node(BASE_MONITOR)], edges: [], graphData: {}, graphs: {}, activeGraphId: 'root',
    } as unknown as Parameters<typeof captureWorkspace>[0])
    expect(Object.keys(workspace.parts ?? {})).toEqual([BASE_MONITOR])
  })

  it('a tampered envelope leaves the node held, with a plain reason', async () => {
    const { parts, nodes } = await saveAndForget()
    const envelope = parts['signed-monitor'].envelope!
    const tampered = { ...envelope, payload: envelope.payload.replace('Test signed-monitor', 'Test evil-monitor') }
    const results = await registerEmbeddedParts({ 'signed-monitor': { revision: 1, envelope: tampered } })
    expect(results[0].failure).toBe('bad-signature')
    expect(partOrigin('signed-monitor')).toBeUndefined()
    const held = unresolvedNodes(nodes)
    expect(held).toHaveLength(1)
    expect(embeddedPartFailure('signed-monitor')).toBe('bad-signature')
    expect(describeUnresolved(held[0].reasons[0]).fix).toContain('could not be verified')
    // A re-save keeps the unverified copy rather than losing it.
    expect(collectSavedParts(nodes)['signed-monitor'].envelope).toEqual(tampered)
  })

  it('an unknown signing key does not load', async () => {
    const envelope = sign(manifest('signed-monitor'), stranger)
    const results = await registerEmbeddedParts({ 'signed-monitor': { revision: 1, envelope } })
    expect(results[0].failure).toBe('no-trusted-key')
    expect(partOrigin('signed-monitor')).toBeUndefined()
  })

  it('an unsigned manifest in a save is dropped and never registered', async () => {
    const text = JSON.stringify({
      id: 'p', name: 'P', createdAt: 1, updatedAt: 1,
      workspace: { nodes: [], edges: [], parts: { 'signed-monitor': { revision: 1, envelope: manifest('signed-monitor') } } },
    })
    const { project, dropped } = parseProjectFile(text, 'x')
    expect(dropped).toBe(1)
    expect(project.workspace.parts).toEqual({})
    expect(await registerEmbeddedParts(project.workspace.parts)).toEqual([])
    expect(partOrigin('signed-monitor')).toBeUndefined()
  })

  it('an envelope signed for another part id is refused', async () => {
    const envelope = sign(manifest('other-monitor'))
    const results = await registerEmbeddedParts({ 'signed-monitor': { revision: 1, envelope } })
    expect(results[0].failure).toBe('wrong-part')
    expect(partOrigin('other-monitor')).toBeUndefined()
    expect(partOrigin('signed-monitor')).toBeUndefined()
  })

  it('a signed but invalid manifest stays held', async () => {
    const envelope = sign({ partId: 'signed-monitor' })
    await registerEmbeddedParts({ 'signed-monitor': { revision: 1, envelope } })
    expect(partOrigin('signed-monitor')).toBeUndefined()
    expect(embeddedPartFailure('signed-monitor')).toBe('malformed')
  })

  it('keeps a newer registered revision and takes a newer embedded one', async () => {
    registerParts([manifest('signed-monitor', 3)], 'downloaded')
    await registerEmbeddedParts({ 'signed-monitor': { revision: 2, envelope: sign(manifest('signed-monitor', 2)) } })
    expect((PART_CATALOGUE['signed-monitor'] as unknown as PartManifest).revision).toBe(3)
    await registerEmbeddedParts({ 'signed-monitor': { revision: 4, envelope: sign(manifest('signed-monitor', 4)) } })
    expect((PART_CATALOGUE['signed-monitor'] as unknown as PartManifest).revision).toBe(4)
  })

  it('never lets an embedded copy replace a bundled part', async () => {
    const results = await registerEmbeddedParts({ [BASE_MONITOR]: { revision: 9, envelope: sign(manifest(BASE_MONITOR, 9)) } })
    expect(results).toEqual([])
    expect(partOrigin(BASE_MONITOR)).toBe('bundled')
  })

  it('bounds the map by count and by bytes and drops malformed entries', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_SAVED_PARTS + 5 }, (_, i) => [`part-${i}`, { revision: 1 }]))
    const counted = sanitizeSavedParts(many)
    expect(Object.keys(counted.parts)).toHaveLength(MAX_SAVED_PARTS)
    expect(counted.dropped).toBe(5)

    const big = (id: string) => [id, { revision: 1, envelope: { format: 'dsf-signed/1', payload: 'x'.repeat(200 * 1024), signatures: [{ keyId: 'k', sig: 's' }] } }]
    const sized = sanitizeSavedParts(Object.fromEntries(Array.from({ length: 25 }, (_, i) => big(`big-${i}`))))
    const total = Object.values(sized.parts).reduce((sum, entry) => sum + (entry.envelope?.payload.length ?? 0), 0)
    expect(total).toBeLessThanOrEqual(MAX_SAVED_PARTS_PAYLOAD)
    expect(sized.dropped).toBeGreaterThan(0)

    const bad = sanitizeSavedParts({ 'Not An Id': { revision: 1 }, ok: { revision: 0 }, fine: { revision: 2, extra: 'x' }, odd: 'x' })
    expect(bad.parts).toEqual({ fine: { revision: 2 } })
    expect(bad.dropped).toBe(3)
  })

  it('oversize payloads do not crash the workspace sanitizer or load a part', async () => {
    const huge = { format: 'dsf-signed/1', payload: 'x'.repeat(300 * 1024), signatures: [{ keyId: 'test-key', sig: 'AAAA' }] }
    const result = sanitizeWorkspacePayload({ nodes: [node('signed-monitor')], edges: [], parts: { 'signed-monitor': { revision: 1, envelope: huge } } })
    expect(result?.workspace.parts).toEqual({})
    expect(result?.dropped).toBe(1)
    expect(unresolvedNodes(result!.workspace.nodes)).toHaveLength(1)
  })

  it('a workspace without parts stays without them', () => {
    const result = sanitizeWorkspacePayload({ nodes: [], edges: [] })
    expect(result?.workspace.parts).toBeUndefined()
  })
})

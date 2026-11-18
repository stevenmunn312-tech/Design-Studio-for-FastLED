import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RemotePartsSection from '../RemotePartsSection'
import HardwarePartsShelf from '../HardwarePartsShelf'
import { PART_CATALOGUE, partOrigin, registerParts, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../../../build/parts/partCatalogue'
import { createPartsLibrary, type PartsLibrary } from '../../../build/parts/partsLibrary'
import { partTypeById } from '../../../build/parts/partTypes'
import { PART_MANIFEST_VERSION } from '../../../build/parts/manifest/vocabulary'
import type { PartManifest } from '../../../build/parts/manifest/partManifest'
import { createMemoryCache } from '../../../build/parts/remote'
import { BASE, fakeHost, makeSigner, sha256Hex, signEnvelope, type Hosted } from '../../../build/parts/remote/__tests__/testKit'
import { resetSignedPartsForTests } from '../../../build/parts/signedParts'
import { useUiStore } from '../../../state/uiStore'

const BASE_MONITOR = 'adafruit-ina219-current-sensor'
const encoder = new TextEncoder()
const signer = makeSigner('ui-key')

function manifest(partId: string, revision = 1, extra: Record<string, unknown> = {}): PartManifest {
  const entry = PART_CATALOGUE[BASE_MONITOR] as PartCatalogueEntry
  return {
    ...(JSON.parse(JSON.stringify(entry)) as PartCatalogueEntry),
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision,
    partTypes: ['PowerMonitorInput'],
    categories: ['monitors'],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    ...extra,
  } as PartManifest
}

interface Offer { partId: string; revision: number; body: unknown; label: string }

/** Host a signed index offering these parts. */
function hostIndex(host: Hosted, offers: Offer[]): void {
  const parts = offers.map(({ partId, revision, body, label }) => {
    const bytes = encoder.encode(signEnvelope(JSON.stringify(body), [signer]))
    const url = `packages/${partId}@${revision}.json`
    host.files.set(`${BASE}${url}`, bytes)
    return {
      partId, revision, label, partTypes: ['PowerMonitorInput'], interfaces: ['i2c'], chips: ['INA999'],
      categories: ['monitors'], verification: 'reviewed',
      package: { url, sha256: sha256Hex(bytes), bytes: bytes.length },
    }
  })
  const payload = JSON.stringify({
    indexVersion: 1,
    generatedAt: '2026-11-01T00:00:00Z',
    categories: [{ id: 'monitors', label: 'Power monitors', order: 1, parent: null }],
    parts,
  })
  host.files.set(`${BASE}index.json`, encoder.encode(signEnvelope(payload, [signer])))
}

let host: Hosted

function library(baseUrl = BASE): PartsLibrary {
  return createPartsLibrary({
    baseUrl,
    cache: createMemoryCache(),
    clientOptions: { fetch: host.fetch, trustedKeys: [signer.trusted] },
  })
}

const OPENED: Array<() => void> = []

beforeEach(() => {
  const definition = partTypeById('PowerMonitorInput') as { downloadable: boolean }
  const before = definition.downloadable
  definition.downloadable = true
  OPENED.push(() => { definition.downloadable = before })
  host = fakeHost()
})

afterEach(() => {
  cleanup()
  while (OPENED.length > 0) OPENED.pop()!()
  resetRegisteredPartsForTests()
  resetSignedPartsForTests()
})

describe('RemotePartsSection', () => {
  it('shows nothing and asks nothing when no parts host is configured', () => {
    hostIndex(host, [{ partId: 'sig-monitor', revision: 1, body: manifest('sig-monitor'), label: 'Sig monitor' }])
    const { container } = render(<RemotePartsSection query="monitor" library={library('')} />)
    expect(container.textContent).toBe('')
    expect(host.requests).toHaveLength(0)
  })

  it('finds a remote part by chip and category, then downloads and installs it', async () => {
    hostIndex(host, [{ partId: 'sig-monitor', revision: 1, body: manifest('sig-monitor'), label: 'Sig monitor' }])
    render(<RemotePartsSection query="ina999" library={library()} />)
    const button = await screen.findByRole('button', { name: 'Download Sig monitor' })
    // Nothing is installed by searching.
    expect(partOrigin('sig-monitor')).toBeUndefined()
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText('Installed')).toBeTruthy())
    expect(partOrigin('sig-monitor')).toBe('downloaded')
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
  })

  it('matches a category label', async () => {
    hostIndex(host, [{ partId: 'sig-monitor', revision: 1, body: manifest('sig-monitor'), label: 'Sig monitor' }])
    render(<RemotePartsSection query="power monitors" library={library()} />)
    expect(await screen.findByRole('button', { name: 'Download Sig monitor' })).toBeTruthy()
  })

  it('says a part needs a newer app and does not install it', async () => {
    const future = manifest('sig-monitor', 1, { manifestVersion: PART_MANIFEST_VERSION + 1 })
    hostIndex(host, [{ partId: 'sig-monitor', revision: 1, body: future, label: 'Sig monitor' }])
    render(<RemotePartsSection query="sig" library={library()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Download Sig monitor' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Needs a newer Design Studio/)
    expect(partOrigin('sig-monitor')).toBeUndefined()
    expect(screen.queryByText('Installed')).toBeNull()
  })

  it('reports a part that fails validation without installing it', async () => {
    const bad = manifest('sig-monitor', 1, { dimensionsMm: 'wide' })
    hostIndex(host, [{ partId: 'sig-monitor', revision: 1, body: bad, label: 'Sig monitor' }])
    render(<RemotePartsSection query="sig" library={library()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Download Sig monitor' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not valid/)
    expect(partOrigin('sig-monitor')).toBeUndefined()
  })

  it('offers an update for an installed part and applies it only on request', async () => {
    registerParts([manifest('sig-monitor', 1)], 'downloaded')
    hostIndex(host, [{ partId: 'sig-monitor', revision: 2, body: manifest('sig-monitor', 2), label: 'Sig monitor' }])
    // No search needed: updates are always listed.
    render(<RemotePartsSection query="" library={library()} />)
    const update = await screen.findByRole('button', { name: 'Update Sig monitor' })
    expect(update.textContent).toBe('Update to rev 2')
    expect((PART_CATALOGUE['sig-monitor'] as PartManifest).revision).toBe(1)
    fireEvent.click(update)
    await waitFor(() => expect((PART_CATALOGUE['sig-monitor'] as PartManifest).revision).toBe(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Update/ })).toBeNull())
  })

  it('leaves bundled parts to the shelf and keeps quiet when the index is unreachable', async () => {
    const { container, rerender } = render(<RemotePartsSection query="" library={library()} />)
    await waitFor(() => expect(host.requests.length).toBeGreaterThan(0))
    expect(container.textContent).toBe('')
    rerender(<RemotePartsSection query="monitor" library={library()} />)
    expect((await screen.findByRole('status')).textContent).toMatch(/unavailable/)
  })
})

describe('HardwarePartsShelf search', () => {
  const items = [
    { key: 'a', nodeType: 'PowerMonitorInput', label: 'Current sensor', hint: 'INA219 over I2C', disabled: false, disabledReason: null, onSelect: vi.fn() },
    { key: 'b', nodeType: 'ButtonBank', label: 'Button', hint: 'A momentary control', disabled: false, disabledReason: null, onSelect: vi.fn() },
  ]
  const categories = [{ id: 'inputs', label: 'Inputs', hint: 'Controls', items }]

  it('matches every word across name, summary and shelf, and adds no remote section without a host', () => {
    useUiStore.getState().setHardwareShelfCategory(null)
    render(<HardwarePartsShelf categories={categories} targetNodeType={null} onTargetHandled={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'inputs ina219' } })
    expect(screen.getByRole('button', { name: 'Add Current sensor' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add Button' })).toBeNull()
    expect(screen.queryByLabelText('Online parts library')).toBeNull()
  })
})

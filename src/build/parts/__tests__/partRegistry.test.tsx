import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import PartIdentity from '../../../components/Hardware/PartIdentity'
import { inputPartEntries } from '../../../components/Hardware/hardwarePartCatalog'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { powerConverterModules, powerConverterPartIds } from '../../../state/peripherals/powerConverter'
import {
  PART_CATALOGUE,
  catalogueVersion,
  partById,
  partOrigin,
  registerParts,
  registeredPartsForType,
  resetRegisteredPartsForTests,
  setDownloadedRender,
  subscribeCatalogue,
} from '../partCatalogue'
import { PART_OPTIONS, partOptionsFor, resolvePartIdentity } from '../partOptions'
import { partRenderForNodeType } from '../partRenders'
import { unknownPartId, unresolvedNodes } from '../partResolution'
import { partTypeById } from '../partTypes'
import { usePartCatalogueVersion } from '../usePartCatalogueVersion'
import type { PartManifest } from '../manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../manifest/vocabulary'

const BASE_MONITOR = 'adafruit-ina219-current-sensor'
const BASE_CONVERTER = 'lm2596-buck-module'

/** A valid manifest built from a bundled part, under a new id. */
function fixture(
  source: string,
  partTypes: string[],
  partId: string,
  extra: Partial<PartManifest> = {},
): PartManifest {
  const entry = JSON.parse(JSON.stringify(PART_CATALOGUE[source])) as PartManifest
  // The menu name and position belong to the source part, not to its copy.
  const copy = { ...entry.copy }
  delete copy.optionLabel
  delete copy.optionOrder
  return {
    ...entry,
    ...(entry.copy ? { copy } : {}),
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision: 1,
    partTypes,
    categories: [],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    ...extra,
  }
}

function node(nodeType: string, properties: Record<string, unknown>): StudioNode {
  return {
    id: 'part', type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

// No part type is open to downloads until its per-part facts have all moved
// into its block, so the tests open the type they use for as long as they run.
const OPENED: Array<{ restore: () => void }> = []
function openToDownloads(nodeType: string): void {
  const definition = partTypeById(nodeType) as { downloadable: boolean }
  const before = definition.downloadable
  definition.downloadable = true
  OPENED.push({ restore: () => { definition.downloadable = before } })
}

beforeEach(() => {
  openToDownloads('PowerMonitorInput')
  openToDownloads('PowerConverter')
})

afterEach(() => {
  cleanup()
  while (OPENED.length > 0) OPENED.pop()!.restore()
  resetRegisteredPartsForTests()
})

describe('registering parts', () => {
  it('starts with the bundled parts only', () => {
    expect(partOrigin(BASE_MONITOR)).toBe('bundled')
    expect(partOrigin('not-a-part')).toBeUndefined()
    expect(registeredPartsForType('PowerMonitorInput')).toEqual([])
  })

  it('adds a valid part, which every accessor then sees', () => {
    const [result] = registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'new-monitor')], 'downloaded')
    expect(result).toEqual({ partId: 'new-monitor', status: 'added', reasons: [] })
    expect(partById('new-monitor')?.label).toBe('Test new-monitor')
    expect(Object.keys(PART_CATALOGUE)).toContain('new-monitor')
    expect(partOrigin('new-monitor')).toBe('downloaded')
    expect(registeredPartsForType('PowerMonitorInput').map((part) => part.partId)).toEqual(['new-monitor'])
  })

  it('reports each manifest and adds only the ones that are ok', () => {
    const results = registerParts([
      fixture(BASE_MONITOR, ['PowerMonitorInput'], 'good-monitor'),
      { partId: 'broken' },
      fixture(BASE_MONITOR, ['CanBusInterface'], 'future-monitor'),
      fixture(BASE_MONITOR, ['PowerMonitorInput'], 'draft-monitor', { verification: 'drafted' }),
    ], 'downloaded')
    expect(results.map((result) => [result.partId, result.status])).toEqual([
      ['good-monitor', 'added'],
      ['broken', 'invalid'],
      ['future-monitor', 'needs-newer-app'],
      ['draft-monitor', 'invalid'],
    ])
    expect(results[1].reasons.length).toBeGreaterThan(0)
    expect(partById('broken')).toBeUndefined()
    expect(partById('future-monitor')).toBeUndefined()
    expect(partById('draft-monitor')).toBeUndefined()
  })

  it('holds a part to the downloaded rules when it is downloaded', () => {
    const closed = partTypeById('PowerMonitorInput') as { downloadable: boolean }
    closed.downloadable = false
    const [result] = registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'closed-type')], 'downloaded')
    expect(result.status).toBe('needs-newer-app')
    // The same manifest is fine as a bundled one.
    const [bundled] = registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'closed-type')], 'bundled')
    expect(bundled.status).toBe('added')
    expect(partOrigin('closed-type')).toBe('bundled')
  })

  it('never replaces a bundled part, whatever its revision', () => {
    const before = PART_CATALOGUE[BASE_MONITOR]
    const [result] = registerParts([
      fixture(BASE_MONITOR, ['PowerMonitorInput'], BASE_MONITOR, { revision: 99, label: 'Impostor' }),
    ], 'downloaded')
    expect(result.status).toBe('kept-bundled')
    expect(PART_CATALOGUE[BASE_MONITOR]).toBe(before)
    expect(partOrigin(BASE_MONITOR)).toBe('bundled')
  })

  it('replaces a downloaded part only with a higher revision', () => {
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'rev-part', { revision: 2, label: 'Two' })], 'downloaded')
    const attempt = (revision: number, label: string) =>
      registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'rev-part', { revision, label })], 'downloaded')[0].status

    expect(attempt(2, 'Same')).toBe('unchanged')
    expect(attempt(1, 'Older')).toBe('kept-newer')
    expect(partById('rev-part')?.label).toBe('Two')
    expect(attempt(3, 'Three')).toBe('replaced')
    expect(partById('rev-part')?.label).toBe('Three')
    // Still one entry, in its original place.
    expect(registeredPartsForType('PowerMonitorInput').filter((part) => part.partId === 'rev-part')).toHaveLength(1)
  })

  it('does not let a downloaded part replace one registered as bundled', () => {
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'pack-part', { revision: 1 })], 'bundled')
    const [result] = registerParts([
      fixture(BASE_MONITOR, ['PowerMonitorInput'], 'pack-part', { revision: 5, label: 'Downloaded' }),
    ], 'downloaded')
    expect(result.status).toBe('kept-bundled')
    expect(partOrigin('pack-part')).toBe('bundled')
    expect(partById('pack-part')?.label).toBe('Test pack-part')
  })

  it('keeps its own copy, so editing the manifest afterwards changes nothing', () => {
    const manifest = fixture(BASE_MONITOR, ['PowerMonitorInput'], 'copy-part')
    registerParts([manifest], 'downloaded')
    manifest.label = 'Edited'
    expect(partById('copy-part')?.label).toBe('Test copy-part')
  })

  it('drops every registered part on reset and leaves the bundled ones', () => {
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'gone-part')], 'downloaded')
    resetRegisteredPartsForTests()
    expect(partById('gone-part')).toBeUndefined()
    expect(partById(BASE_MONITOR)).toBeDefined()
  })
})

describe('catalogue version and subscription', () => {
  it('moves once per call that changes something, and not otherwise', () => {
    const start = catalogueVersion()
    registerParts([
      fixture(BASE_MONITOR, ['PowerMonitorInput'], 'v-one'),
      fixture(BASE_MONITOR, ['PowerMonitorInput'], 'v-two'),
    ], 'downloaded')
    expect(catalogueVersion()).toBe(start + 1)

    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'v-one')], 'downloaded') // unchanged
    registerParts([{ nope: true }], 'downloaded') // invalid
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], BASE_MONITOR)], 'downloaded') // bundled id
    expect(catalogueVersion()).toBe(start + 1)

    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'v-one', { revision: 2 })], 'downloaded')
    expect(catalogueVersion()).toBe(start + 2)
  })

  it('moves on a direct write to the catalogue too, so a fixture part never goes stale behind a memo', () => {
    const start = catalogueVersion()
    const manifest = fixture(BASE_MONITOR, ['PowerMonitorInput'], 'direct-part')
    PART_CATALOGUE['direct-part'] = manifest
    expect(catalogueVersion()).toBe(start + 1)
    expect(partById('direct-part')).toBe(manifest)
    delete PART_CATALOGUE['direct-part']
    expect(catalogueVersion()).toBe(start + 2)
    delete PART_CATALOGUE['direct-part'] // nothing there: no change
    expect(catalogueVersion()).toBe(start + 2)
  })

  it('tells listeners after each change, until they unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCatalogue(listener)
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'sub-one')], 'downloaded')
    expect(listener).toHaveBeenCalledTimes(1)
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'sub-one')], 'downloaded')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'sub-two')], 'downloaded')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('re-renders a hook user when a part arrives', () => {
    const { result } = renderHook(() => usePartCatalogueVersion())
    const first = result.current
    act(() => { registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'hook-part')], 'downloaded') })
    expect(result.current).toBe(first + 1)
  })

  it('re-renders a component that reads the catalogue while rendering', () => {
    const id = 'render-part'
    useGraphStore.setState({
      nodes: [node('PowerMonitorInput', { partId: id })], edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<PartIdentity nodeId="part" nodeType="PowerMonitorInput" />)
    // Unknown: drawn from the saved id, with no catalogue entry behind it.
    expect(screen.queryByText(`Test ${id}`)).toBeNull()
    act(() => { registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], id)], 'downloaded') })
    expect(screen.getByText(`Test ${id}`)).toBeTruthy()
  })
})

describe('derived values follow the registry', () => {
  it('offers a registered part as an option, with the manifest label and copy', () => {
    const before = partOptionsFor('PowerMonitorInput')
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'opt-part', {
      copy: { summary: 'Short line for the menu', wiringNote: 'Wire it like this' },
    })], 'downloaded')

    const options = partOptionsFor('PowerMonitorInput')
    expect(options.slice(0, before.length)).toEqual(before)
    expect(options.at(-1)).toEqual({
      id: 'opt-part', label: 'Test opt-part', summary: 'Short line for the menu', note: 'Wire it like this',
    })
    expect(PART_OPTIONS.PowerMonitorInput.options).toBe(options)
    // Only the types the manifest names.
    expect(partOptionsFor('DistanceInput').some((option) => option.id === 'opt-part')).toBe(false)
    expect(resolvePartIdentity('PowerMonitorInput', { partId: 'opt-part' })?.entry?.partId).toBe('opt-part')
  })

  it('leaves out the copy a manifest does not have', () => {
    // Bundled entries carry overlay copy now; this fixture must have none.
    registerParts([{ ...fixture(BASE_MONITOR, ['PowerMonitorInput'], 'bare-part'), copy: undefined }], 'downloaded')
    expect(partOptionsFor('PowerMonitorInput').at(-1)).toEqual({ id: 'bare-part', label: 'Test bare-part' })
  })

  it('returns the very same options until the catalogue changes', () => {
    const first = partOptionsFor('PowerMonitorInput')
    expect(partOptionsFor('PowerMonitorInput')).toBe(first)
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'memo-part')], 'downloaded')
    expect(partOptionsFor('PowerMonitorInput')).not.toBe(first)
  })

  it('stops holding a node whose part is registered', () => {
    const held = node('PowerMonitorInput', { partId: 'saved-part' })
    expect(unknownPartId('PowerMonitorInput', held.data.properties)).toBe('saved-part')
    expect(unresolvedNodes([held])).toHaveLength(1)

    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'saved-part')], 'downloaded')
    expect(unknownPartId('PowerMonitorInput', held.data.properties)).toBeNull()
    expect(unresolvedNodes([held])).toEqual([])
  })

  it('lists a registered part on the shelf, from the type default and its own manifest', () => {
    const template = inputPartEntries().find((entry) => entry.nodeType === 'PowerMonitorInput')!
    const before = inputPartEntries().length
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'shelf-part', {
      dimensionsMm: { width: 31.5, height: 18 },
      copy: { summary: 'Shelf summary' },
    })], 'downloaded')

    const entries = inputPartEntries()
    expect(entries).toHaveLength(before + 1)
    const row = entries.find((entry) => entry.properties?.partId === 'shelf-part')!
    expect(row.nodeType).toBe('PowerMonitorInput')
    expect(row.label).toBe('Test shelf-part')
    expect(row.hint).toBe('Shelf summary')
    expect(row.footprint).toEqual({ width: 31.5, height: 18 })
    expect(row.properties).toEqual({ partId: 'shelf-part' })
    // What the manifest lacks comes from the type's default row.
    expect(row.signalPort).toBe(template.signalPort)
    expect(row.pinRequests).toEqual(template.pinRequests)
    expect(row.pinFields.map((field) => field.key)).toEqual(template.pinFields.map((field) => field.key))
    // Bundled rows are untouched and keep their order.
    expect(entries.slice(0, before)).toEqual(inputPartEntries().slice(0, before))
  })

  it('does not put a part on the shelf for a type that has no input row', () => {
    const before = inputPartEntries().length
    registerParts([fixture(BASE_CONVERTER, ['PowerConverter'], 'conv-part')], 'downloaded')
    expect(inputPartEntries()).toHaveLength(before)
  })

  it('draws a registered part from its own verified render, never a bundled file', () => {
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'render-part')], 'downloaded')
    // The manifest's render.file names a bundled picture; a downloaded part does not borrow it.
    expect(partRenderForNodeType('PowerMonitorInput', { partId: 'render-part' })?.src ?? null).toBeNull()

    const revision = (PART_CATALOGUE['render-part'] as unknown as { revision: number }).revision
    setDownloadedRender('render-part', revision, 'blob:verified-render')
    const render = partRenderForNodeType('PowerMonitorInput', { partId: 'render-part' })
    expect(render?.label).toBe('Test render-part')
    expect(render?.src).toBe('blob:verified-render')
  })

  it('adds a registered converter to the lists derived from the catalogue', () => {
    const ids = powerConverterPartIds()
    registerParts([fixture(BASE_CONVERTER, ['PowerConverter'], 'conv-part')], 'downloaded')

    expect(powerConverterPartIds()).toEqual([...ids, 'conv-part'])
    expect(powerConverterModules().map((module) => module.partId)).toContain('conv-part')
    // The option row is derived from the converter's own block, not a bare manifest row.
    const row = partOptionsFor('PowerConverter').find((option) => option.id === 'conv-part')!
    expect(row.summary).toContain('V in')
    expect(partOptionsFor('PowerConverter').filter((option) => option.id === 'conv-part')).toHaveLength(1)
  })
})

describe('bundled behaviour is unchanged', () => {
  it('offers the same parts before and after a registration, in the same order', () => {
    const ids = (nodeType: string) => partOptionsFor(nodeType).map((option) => option.id)
    const monitors = ids('PowerMonitorInput')
    const distance = ids('DistanceInput')
    registerParts([fixture(BASE_MONITOR, ['PowerMonitorInput'], 'extra-part')], 'downloaded')
    expect(ids('PowerMonitorInput').slice(0, monitors.length)).toEqual(monitors)
    expect(ids('DistanceInput')).toEqual(distance)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { boardProfileById } from '../../../build/boards/boardProfiles'
import { PART_CATALOGUE, registerParts, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../../../build/parts/partCatalogue'
import { partTypeById } from '../../../build/parts/partTypes'
import type { PartManifest } from '../../../build/parts/manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../../../build/parts/manifest/vocabulary'
import { hardwareShelfCategories } from '../hardwareShelfModel'

function shelf() {
  return hardwareShelfCategories({
    nodes: [],
    selectedFqbn: 'esp32:esp32:esp32s3',
    boardProfile: boardProfileById('espressif-esp32-s3-devkitc-1')!,
    nextLedPin: 14,
    hasPartOfType: () => false,
    inputPartBlocker: () => null,
    addInputPart: vi.fn(),
    addFixturePart: vi.fn(),
    addLedOutput: vi.fn(),
  })
}

function groupOf(partId: string): string | undefined {
  for (const category of shelf()) {
    const item = category.items.find((entry) => entry.partId === partId)
    if (item) return item.subcategory
  }
  throw new Error(`${partId} is not on the shelf`)
}

function fixture(source: string, partTypes: string[], partId: string, categories: string[]): PartManifest {
  const entry = PART_CATALOGUE[source] as PartCatalogueEntry
  return {
    ...(JSON.parse(JSON.stringify(entry)) as PartCatalogueEntry),
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision: 1,
    partTypes,
    categories,
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
  }
}

afterEach(() => {
  resetRegisteredPartsForTests()
})

describe('shelf groups from the category tree', () => {
  it('puts ultrasonic and time-of-flight distance sensors in different groups', () => {
    const ultrasonic = groupOf('hc-sr04-ultrasonic-module')
    const laser = groupOf('adafruit-vl53l0x-distance-sensor')
    expect(ultrasonic).toMatch(/Ultrasonic/)
    expect(laser).toMatch(/Time-of-flight/)
    expect(ultrasonic).not.toBe(laser)
  })

  it('orders the groups of a shelf by the tree and hides empty ones', () => {
    const inputs = shelf().find((category) => category.id === 'inputs')!
    const groups = inputs.items.map((item) => item.subcategory).filter((label, index, all) => all.indexOf(label) === index)
    expect(groups.indexOf('Buttons and touch')).toBeLessThan(groups.indexOf('Clocks'))
    expect(groups.every((label) => label !== undefined && label !== '')).toBe(true)
    expect(groups).not.toContain('Cooling')
  })

  it('keeps the LED outputs flat and the user-rated supply under Supplies', () => {
    const categories = shelf()
    expect(categories.find((category) => category.id === 'led-outputs')!.items.every((item) => !item.subcategory)).toBe(true)
    const power = categories.find((category) => category.id === 'power')!
    expect(power.items.find((item) => item.nodeType === 'PowerSupply')?.subcategory).toBe('Supplies')
  })

  it('files a registered part by its own categories, and updates when it arrives', () => {
    const definition = partTypeById('RelayOutput') as { downloadable: boolean }
    const before = definition.downloadable
    definition.downloadable = true
    try {
      expect(shelf().flatMap((category) => category.items).some((item) => item.partId === 'new-ssr')).toBe(false)
      const [result] = registerParts([
        fixture('relay-module-1ch-5v', ['RelayOutput'], 'new-ssr', ['switching-ssr']),
      ], 'downloaded')
      expect(result.status).toBe('added')
      expect(groupOf('new-ssr')).toBe('Switching › Solid-state relays')
    } finally {
      definition.downloadable = before
    }
  })

  it('sends a part with missing or unknown categories to Other parts', () => {
    const definition = partTypeById('RelayOutput') as { downloadable: boolean }
    const before = definition.downloadable
    definition.downloadable = true
    try {
      registerParts([
        fixture('relay-module-1ch-5v', ['RelayOutput'], 'bare-relay', []),
        fixture('relay-module-1ch-5v', ['RelayOutput'], 'odd-relay', ['not-a-category']),
      ], 'downloaded')
      expect(groupOf('bare-relay')).toBe('Other parts')
      expect(groupOf('odd-relay')).toBe('Other parts')
      const power = shelf().find((category) => category.id === 'power')!
      expect(power.items[power.items.length - 1].subcategory).toBe('Other parts')
    } finally {
      definition.downloadable = before
    }
  })
})

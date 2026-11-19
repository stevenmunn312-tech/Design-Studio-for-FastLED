import { describe, expect, it, vi } from 'vitest'
import { boardProfileById } from '../../../build/boards/boardProfiles'
import { hardwareShelfCategories } from '../hardwareShelfModel'
import { LED_OUTPUT_ENTRIES } from '../hardwarePartCatalog'
import { ledProducts } from '../../../state/output/ledProductCatalogue'

function ledShelf(addLedOutput = vi.fn()) {
  const categories = hardwareShelfCategories({
    nodes: [],
    selectedFqbn: 'esp32:esp32:esp32s3',
    boardProfile: boardProfileById('espressif-esp32-s3-devkitc-1')!,
    nextLedPin: 14,
    hasPartOfType: () => false,
    inputPartBlocker: () => null,
    addInputPart: vi.fn(),
    addFixturePart: vi.fn(),
    addLedOutput,
  })
  return categories
}

describe('LED outputs shelf', () => {
  it('is first and lists the Custom forms before any catalogue part', () => {
    const categories = ledShelf()
    expect(categories[0].id).toBe('led-outputs')
    const items = categories[0].items
    const custom = LED_OUTPUT_ENTRIES.map((entry) => entry.form)
    expect(items.filter((item) => custom.includes(item.key as never)).map((item) => item.key))
      .toEqual(custom)
    const firstPart = items.findIndex((item) => item.partId !== undefined)
    expect(firstPart).toBeGreaterThan(-1)
    // Every Custom entry sits above the first catalogue part, however many parts there are.
    for (const form of custom) expect(items.findIndex((item) => item.key === form)).toBeLessThan(firstPart)
    // And the Custom entries carry no group heading, so they are not pushed under one.
    for (const form of custom) expect(items.find((item) => item.key === form)!.subcategory).toBeUndefined()
  })

  it('offers every catalogue LED product, grouped by the category tree', () => {
    const items = ledShelf()[0].items.filter((item) => item.partId !== undefined)
    expect(items.map((item) => item.partId).sort()).toEqual(ledProducts().map((product) => product.partId).sort())
    const group = (partId: string) => items.find((item) => item.partId === partId)!.subcategory
    expect(group('ws2812b-ring-24')).toBe('Rings')
    expect(group('ws2812b-strip')).toBe('Strips')
    expect(group('hub75-panel-64x64-p4')).toBe('HUB75 panels')
  })

  it('adds an LED output carrying the part when a product is dragged or picked', () => {
    const addLedOutput = vi.fn()
    const ring = ledShelf(addLedOutput)[0].items.find((item) => item.partId === 'ws2812b-ring-24')!
    expect(ring.disabled).toBe(false)
    ring.onSelect()
    expect(addLedOutput).toHaveBeenCalledWith(expect.objectContaining({ partId: 'ws2812b-ring-24', form: 'ring' }))
  })
})

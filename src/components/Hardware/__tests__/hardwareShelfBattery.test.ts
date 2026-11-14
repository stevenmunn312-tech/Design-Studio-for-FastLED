import { describe, expect, it, vi } from 'vitest'
import { boardProfileById } from '../../../build/boards/boardProfiles'
import type { StudioNode } from '../../../state/graphStore'
import { hardwareShelfCategories } from '../hardwareShelfModel'

function moduleNode(id: string, partId: string, extra: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: 'Pack electronics', nodeType: 'BatteryModule', category: 'hardware', properties: { partId, ...extra }, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function shelfItem(nodes: StudioNode[], partId: string) {
  const addFixturePart = vi.fn()
  const categories = hardwareShelfCategories({
    nodes,
    selectedFqbn: 'esp32:esp32:esp32s3',
    boardProfile: boardProfileById('espressif-esp32-s3-devkitc-1')!,
    nextLedPin: 14,
    hasPartOfType: (nodeType) => nodes.some((node) => node.data.nodeType === nodeType),
    inputPartBlocker: () => null,
    addInputPart: vi.fn(),
    addFixturePart,
    addLedOutput: vi.fn(),
  })
  const item = categories.flatMap((category) => category.items).find((entry) => entry.key === `BatteryModule:${partId}`)!
  return { item, addFixturePart }
}

const TP4056 = 'tp4056-usbc-charge-protect-module'
const PCM = '1s-10a-liion-protection-board'

describe('pack electronics on the hardware shelf', () => {
  it('adds a charge-and-protect board to a protected pack as its charger only', () => {
    const { item, addFixturePart } = shelfItem([moduleNode('pcm', PCM)], TP4056)
    expect(item.disabled).toBe(false)
    item.onSelect()
    expect(addFixturePart).toHaveBeenCalledWith(expect.anything(), TP4056, { use: 'Charging only' })
  })

  it('adds it with both functions when nothing protects the pack yet', () => {
    const { item, addFixturePart } = shelfItem([], TP4056)
    item.onSelect()
    expect(addFixturePart).toHaveBeenCalledWith(expect.anything(), TP4056, undefined)
  })

  it('offers a protection board once the combined board only charges', () => {
    expect(shelfItem([moduleNode('charger', TP4056)], PCM).item).toEqual(expect.objectContaining({
      disabled: true, disabledReason: 'Bench already has protection',
    }))
    expect(shelfItem([moduleNode('charger', TP4056, { use: 'Charging only' })], PCM).item.disabled).toBe(false)
  })

  it('still refuses a second charger', () => {
    const nodes = [moduleNode('pcm', PCM), moduleNode('charger', TP4056, { use: 'Charging only' })]
    expect(shelfItem(nodes, TP4056).item).toEqual(expect.objectContaining({
      disabled: true, disabledReason: 'Bench already has charger',
    }))
  })
})

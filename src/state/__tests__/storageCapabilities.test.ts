import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../graphStore'
import { resolveStorageCapabilitySource, storageCapabilitySources } from '../storageCapabilities'

function hardware(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'hardware', properties, inputs: [], outputs: [] },
  } as StudioNode
}

describe('storage capabilities', () => {
  it('discovers SD, onboard flash, and USB providers', () => {
    const sources = storageCapabilitySources([
      hardware('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }),
      hardware('sd', 'SDCard', { partId: 'microsd-module-5v' }),
    ])
    expect(sources.map(({ kind }) => kind)).toEqual(['sd', 'flash', 'usb'])
    expect(sources[1].label).toBe('Onboard flash (16 MB)')
  })

  it('does not silently choose when several providers exist', () => {
    const nodes = [hardware('board', 'Board'), hardware('sd', 'SDCard')]
    expect(resolveStorageCapabilitySource(nodes, '')).toBeNull()
    expect(resolveStorageCapabilitySource(nodes, 'sd:sd')?.kind).toBe('sd')
  })

  it('exposes both onboard flash and USB for a board-only graph', () => {
    const board = hardware('board', 'Board')
    expect(storageCapabilitySources([board])).toHaveLength(2)
    expect(resolveStorageCapabilitySource([board], '')).toBeNull()
  })
})

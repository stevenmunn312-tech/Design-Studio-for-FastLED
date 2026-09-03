import { describe, expect, it, vi } from 'vitest'
import { createDisplayDocument } from '../../state/displayEditor'
import type { DisplayWidget } from '../../state/displayDocument'
import { bakeCustomDisplayAssets } from '../bakeCustomDisplayAssets'

const art: DisplayWidget = {
  id: 'art', type: 'Image/Icon', label: 'Art', bounds: { x: 0, y: 0, width: 2, height: 1 },
  properties: { assetId: 'icon:power', tint: true, tintColor: '#ffffff' },
}

describe('custom display asset baker', () => {
  it('fetches only planned catalogue URLs and returns packed bytes', async () => {
    const rasterize = vi.fn(async () => new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]))
    const result = await bakeCustomDisplayAssets({ ...createDisplayDocument('panel'), widgets: [art] }, rasterize)
    expect(result.issues).toEqual([])
    expect(rasterize).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'icon:power' }), '/display-assets/icons/power.svg')
    expect([...result.assets[0].data]).toEqual([4, 8])
  })

  it('returns a named diagnostic and no partial bake when rasterization fails', async () => {
    const result = await bakeCustomDisplayAssets(
      { ...createDisplayDocument('panel'), widgets: [art] },
      async () => { throw new Error('decoder failed') },
    )
    expect(result.assets).toEqual([])
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'asset-data', message: expect.stringContaining('Power'),
    })])
  })
})


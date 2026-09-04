import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDisplayDocument } from '../../state/displayEditor'
import type { DisplayWidget } from '../../state/displayDocument'
import { bakeCustomDisplayAssets } from '../bakeCustomDisplayAssets'

const art: DisplayWidget = {
  id: 'art', type: 'Image/Icon', label: 'Art', bounds: { x: 0, y: 0, width: 2, height: 1 },
  properties: { assetId: 'icon:power', tint: true, tintColor: '#ffffff' },
}

describe('custom display asset baker', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([false, true])('releases decoded SVG resources (decoder failure: %s)', async (fail) => {
    const decode = vi.fn(async () => { if (fail) throw new Error('SVG decoder failed') })
    const drawImage = vi.fn()
    const revokeObjectURL = vi.fn()
    const imageSizes: number[][] = []
    vi.stubGlobal('Image', class {
      src = ''
      decode = decode
      constructor(public width: number, public height: number) { imageSizes.push([width, height]) }
    })
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() {
        return { clearRect: vi.fn(), drawImage,
          getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]) }) }
      }
    })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:display-art'), revokeObjectURL })
    const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['<svg/>']) }))
    vi.stubGlobal('fetch', fetcher)
    const result = await bakeCustomDisplayAssets({ ...createDisplayDocument('panel'), widgets: [art] })
    expect(fetcher).toHaveBeenCalledWith('/display-assets/icons/power.svg')
    expect(imageSizes).toEqual([[96, 96]])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:display-art')
    if (fail) {
      expect(drawImage).not.toHaveBeenCalled()
      expect(result.assets).toEqual([])
      expect(result.issues[0].message).toContain('SVG decoder failed')
    } else {
      expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1, 1)
      expect([...result.assets[0].data]).toEqual([4, 8])
    }
  })

  it('fetches only planned catalogue URLs and returns packed bytes', async () => {
    const rasterize = vi.fn(async () => new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]))
    const result = await bakeCustomDisplayAssets({ ...createDisplayDocument('panel'), widgets: [art] }, rasterize)
    expect(result.issues).toEqual([])
    expect(rasterize).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'icon:power' }), '/display-assets/icons/power.svg')
    expect([...result.assets[0].data]).toEqual([4, 8])
  })

  it('returns a named diagnostic and no partial bake when rasterization fails', async () => {
    const rasterize = vi.fn()
      .mockResolvedValueOnce(new Uint8ClampedArray(8))
      .mockRejectedValueOnce(new Error('decoder failed'))
    const result = await bakeCustomDisplayAssets(
      { ...createDisplayDocument('panel'), widgets: [art, { ...art, id: 'large-art', bounds: { ...art.bounds, width: 3 } }] },
      rasterize,
    )
    expect(rasterize).toHaveBeenCalledTimes(2)
    expect(result.assets).toEqual([])
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'asset-data', message: 'Could not bake Power at 3x1: decoder failed',
    })])
  })

  it('validates every asset before starting any rasterization', async () => {
    const rasterize = vi.fn()
    const result = await bakeCustomDisplayAssets({
      ...createDisplayDocument('panel'), widgets: [art,
        { ...art, id: 'unknown', properties: { assetId: 'unknown-asset' } }],
    }, rasterize)
    expect(rasterize).not.toHaveBeenCalled()
    expect(result.assets).toEqual([])
    expect(result.issues[0].message).toContain('unknown-asset')
  })
})

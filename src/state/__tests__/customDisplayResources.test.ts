import { describe, expect, it } from 'vitest'
import { createDisplayDocument } from '../displayEditor'
import type { DisplayDocument, DisplayWidget } from '../displayDocument'
import {
  CUSTOM_DISPLAY_ASSET_MAX_BYTES,
  customDisplayAssetByteLength,
  customDisplayAssetRequests,
  customDisplayFontSize,
  customDisplayFontSizes,
  customDisplayResourceIssues,
  packCustomDisplayAsset,
  type CustomDisplayAssetRequest,
} from '../customDisplayResources'

function image(id: string, assetId = 'icon:power', tint = true): DisplayWidget {
  return {
    id,
    type: 'Image/Icon',
    label: 'Image',
    bounds: { x: 0, y: 0, width: 24, height: 20 },
    properties: { assetId, tint, tintColor: '#123456' },
  }
}

function document(widgets: DisplayWidget[] = []): DisplayDocument {
  return { ...createDisplayDocument('panel', 320, 240), widgets }
}

describe('custom display static resources', () => {
  it('collects and folds only exact asset variants the document paints', () => {
    const doc = document([image('one'), image('two'), image('plain', 'icon:power', false)])
    doc.theme.background = { kind: 'image', assetId: 'background:01-neon-orbit:320x240' }
    const requests = customDisplayAssetRequests(doc)

    expect(requests).toHaveLength(3)
    expect(requests[0]).toMatchObject({ assetId: 'background:01-neon-orbit:320x240', width: 320, height: 240, fit: 'fill', format: 'rgb565' })
    expect(requests[1]).toMatchObject({ assetId: 'icon:power', width: 24, height: 20, fit: 'contain', format: 'a8', tintColor: '#123456' })
    expect(requests[1].owners).toEqual([{ kind: 'widget', widgetIndex: 0 }, { kind: 'widget', widgetIndex: 1 }])
    expect(requests[2]).toMatchObject({ assetId: 'icon:power', format: 'rgb565a8' })
  })

  it('snaps to and requests only LVGL font sizes that are actually used', () => {
    const text = image('not-text')
    text.type = 'Text'
    text.properties = { text: 'Hello', fontSize: 23 }
    const button: DisplayWidget = {
      id: 'go', type: 'Button', label: 'Go', bounds: { x: 0, y: 40, width: 80, height: 48 },
      properties: { text: 'Go', presentation: 'text' },
    }
    const doc = document([text, button])
    doc.theme.fontSize = 15
    expect(customDisplayFontSize(23)).toBe(22)
    expect(customDisplayFontSize(96)).toBe(48)
    expect(customDisplayFontSizes(doc)).toEqual([14, 22])
  })

  it('packs alpha masks and LVGL RGB565/RGB565A8 planes deterministically', () => {
    const base = { key: 'x', assetId: 'icon:power', width: 2, height: 1, fit: 'contain' as const, owners: [] }
    const rgba = new Uint8ClampedArray([255, 0, 0, 7, 0, 255, 0, 9])
    const a8 = packCustomDisplayAsset({ ...base, format: 'a8' }, rgba)
    const rgb = packCustomDisplayAsset({ ...base, format: 'rgb565' }, rgba)
    const rgba565 = packCustomDisplayAsset({ ...base, format: 'rgb565a8' }, rgba)
    expect([...a8]).toEqual([7, 9])
    expect([...rgb]).toEqual([0x00, 0xf8, 0xe0, 0x07])
    expect([...rgba565]).toEqual([0x00, 0xf8, 0xe0, 0x07, 7, 9])
  })

  it('rejects editor-only art, oversized flash plans and malformed bake lengths before codegen', () => {
    const editorOnly = document([image('bad', 'template:now-playing')])
    expect(customDisplayResourceIssues(editorOnly)[0].message).toContain('editor-only')

    const huge = document()
    huge.designSize = { width: 1024, height: 1024 }
    huge.theme.background = { kind: 'image', assetId: 'background:01-neon-orbit:320x240' }
    expect(customDisplayResourceIssues(huge)).toContainEqual(expect.objectContaining({
      code: 'asset-size', message: expect.stringContaining(String(CUSTOM_DISPLAY_ASSET_MAX_BYTES)),
    }))

    const doc = document([image('art')])
    const request = customDisplayAssetRequests(doc)[0]
    const bad = { ...request, data: new Uint8Array(customDisplayAssetByteLength(request) - 1) }
    expect(customDisplayResourceIssues(doc, [bad])).toContainEqual(expect.objectContaining({ code: 'asset-data' }))
  })

  it('does not accept arbitrary asset ids as resource names', () => {
    const doc = document([image('art', '../../secret.svg')])
    expect(customDisplayResourceIssues(doc)).toEqual([
      { code: 'asset', message: 'Asset ../../secret.svg is not in the installed display pack.' },
    ])
    expect(customDisplayAssetRequests(doc)).toEqual([])
  })

  it('prices each native format by its emitted byte layout', () => {
    const request = (format: CustomDisplayAssetRequest['format']): CustomDisplayAssetRequest => ({
      key: format, assetId: 'icon:power', width: 3, height: 2, fit: 'contain', format, owners: [],
    })
    expect(customDisplayAssetByteLength(request('a8'))).toBe(6)
    expect(customDisplayAssetByteLength(request('rgb565'))).toBe(12)
    expect(customDisplayAssetByteLength(request('rgb565a8'))).toBe(18)
  })
})

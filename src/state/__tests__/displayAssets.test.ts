import { describe, expect, it } from 'vitest'
import {
  DISPLAY_ASSETS,
  DISPLAY_ASSET_PACK_VERSION,
  displayAsset,
  displayAssetFlashCost,
  displayAssetUrl,
  displayAssetsByCategory,
  displayAssetsForSlot,
  displayControlTheme,
  normalizeDisplayAssetId,
} from '../displayAssets'
import { displayWidgetValidationIssues, normalizeDisplayWidgetProperties } from '../displayRegistry'
import type { DisplayWidget } from '../displayDocument'

const ASSET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:[-.][a-z0-9]+)*)?$/

function imageWidget(assetId: string): DisplayWidget {
  return {
    id: 'art',
    type: 'Image/Icon',
    label: 'Art',
    bounds: { x: 0, y: 0, width: 48, height: 48 },
    properties: { assetId, tint: false, tintColor: '#f4f7ff' },
  }
}

describe('display asset registry', () => {
  it('covers every pack category with well-formed, site-relative entries', () => {
    expect(DISPLAY_ASSET_PACK_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(Object.fromEntries(
      (['icon', 'control', 'widget-glyph', 'background', 'theme', 'template-preview'] as const)
        .map((category) => [category, displayAssetsByCategory(category).length]),
    )).toEqual({
      icon: 43, control: 252, 'widget-glyph': 19, background: 54, theme: 18, 'template-preview': 7,
    })

    for (const [id, entry] of Object.entries(DISPLAY_ASSETS)) {
      expect(entry.id).toBe(id)
      expect(id).toMatch(ASSET_ID)
      // A workspace must never be able to learn where the pack was authored.
      expect(entry.file.startsWith('display-assets/')).toBe(true)
      expect(entry.file).not.toMatch(/\.\.|[A-Za-z]:|\\/)
      expect(displayAssetUrl(entry)).toBe(`/${entry.file}`)
    }
  })

  it('offers only slot-fillable art to a widget, and prices a bake by the size drawn', () => {
    const icons = displayAssetsForSlot(['icon'])
    expect(icons.length).toBe(43 + 252)
    expect(icons.every((entry) => entry.tintable)).toBe(true)
    // Palette glyphs, backgrounds, themes and template previews are not widget art.
    expect(icons.some((entry) => entry.category === 'widget-glyph')).toBe(false)
    expect(displayAssetsForSlot(['pattern-thumbnail'])).toEqual([])

    const glyph = displayAsset('icon:power')!
    expect(glyph).toMatchObject({ category: 'icon', width: 96, height: 96, tintable: true, format: 'svg' })
    expect(displayAssetFlashCost(glyph)).toBe(96 * 96)
    expect(displayAssetFlashCost(glyph, { width: 48, height: 48 })).toBe(48 * 48)

    const background = displayAsset('background:01-neon-orbit:320x240')!
    expect(displayAssetFlashCost(background)).toBe(320 * 240 * 2)
    // Nothing a screen never bakes may report a flash cost.
    expect(displayAssetFlashCost(displayAsset('theme:01-neon-orbit')!)).toBe(0)
    expect(displayAssetFlashCost(displayAsset('template:now-playing')!)).toBe(0)
  })

  it('keeps a themed control addressable by its set', () => {
    const control = displayAsset('control:03-synthwave:play-pause')!
    expect(control).toMatchObject({ category: 'control', tintable: true })
    expect(displayControlTheme(control)).toBe('03-synthwave')
    expect(displayControlTheme(displayAsset('icon:power')!)).toBeUndefined()
  })

  it('is the only authority on what a document may store in an asset slot', () => {
    expect(normalizeDisplayAssetId('icon:power')).toBe('icon:power')
    expect(normalizeDisplayAssetId('icon:not-in-this-pack')).toBe('')
    expect(normalizeDisplayAssetId('C:/Users/User/Desktop/Player Controls/svg/power.svg')).toBe('')
    expect(normalizeDisplayAssetId('../../etc/passwd')).toBe('')
    expect(normalizeDisplayAssetId(42)).toBe('')

    expect(normalizeDisplayWidgetProperties('Image/Icon', {
      assetId: 'icon:power', tint: true,
    }, 160, 24)).toEqual({ assetId: 'icon:power', tint: true })
    expect(normalizeDisplayWidgetProperties('Image/Icon', {
      assetId: 'semantic-icons/svg/power.svg',
    }, 160, 24)).toEqual({})
    // An optional slot may still be cleared.
    expect(normalizeDisplayWidgetProperties('Button', { assetId: '' }, 160, 24)).toEqual({ assetId: '' })
  })

  it('names an asset the installed pack no longer has instead of drawing a blank', () => {
    expect(displayWidgetValidationIssues(imageWidget('icon:power'), 'touch-tft')).toEqual([])
    expect(displayWidgetValidationIssues(imageWidget(''), 'touch-tft')).toEqual([
      { code: 'property', message: 'Choose an image or icon asset.' },
    ])
    expect(displayWidgetValidationIssues(imageWidget('icon:retired-glyph'), 'touch-tft')).toEqual([
      { code: 'property', message: 'Asset icon:retired-glyph is not in the installed pack.' },
    ])
  })
})

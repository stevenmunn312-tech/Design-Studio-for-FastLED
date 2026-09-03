import { describe, expect, it } from 'vitest'
import {
  DISPLAY_DOCUMENT_LIMITS,
  DISPLAY_DOCUMENT_SCHEMA_VERSION,
  DISPLAY_WIDGET_TYPES,
  normalizeDisplayDocument,
  normalizeDisplayDocuments,
} from '../displayDocument'

function document(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: DISPLAY_DOCUMENT_SCHEMA_VERSION,
    displayId: 'panel-main',
    designSize: { width: 320, height: 240 },
    orientation: '90',
    gridSize: 8,
    theme: {
      background: { kind: 'gradient', startColor: '#001122', endColor: '#334455', direction: 'vertical' },
      accentColor: '#AABBCC',
    },
    widgets: [{
      id: 'title', type: 'Text', label: 'Track title',
      bounds: { x: 8, y: 8, width: 200, height: 32 },
      properties: { align: 'left', fontSize: 18 },
    }],
    ...overrides,
  }
}

describe('custom display document normalization', () => {
  it('keeps the versioned declarative contract and applies theme defaults', () => {
    const result = normalizeDisplayDocument(document())!
    expect(result).toMatchObject({
      schemaVersion: 1,
      displayId: 'panel-main',
      designSize: { width: 320, height: 240 },
      orientation: '90',
      gridSize: 8,
      theme: {
        background: { kind: 'gradient', direction: 'vertical' },
        accentColor: '#aabbcc',
        font: 'sans',
      },
    })
    expect(result.widgets[0]).toMatchObject({ id: 'title', type: 'Text', properties: { align: 'left', fontSize: 18 } })
  })

  it('defines every launch widget named by the frozen display design', () => {
    expect(DISPLAY_WIDGET_TYPES).toEqual([
      'Text', 'Numeric Readout', 'Timecode', 'Progress', 'Value Meter',
      'Status Indicator', 'Colour Swatch', 'Pattern Browser', 'Image/Icon',
      'Button', 'Toggle', 'Slider', 'Dial',
    ])
  })

  it('drops unknown types, duplicate ids, nested properties, and invalid documents', () => {
    const valid = document({
      widgets: [
        document().widgets[0],
        { ...document().widgets[0], label: 'duplicate' },
        { id: 'script', type: 'Script', bounds: { x: 0, y: 0, width: 1, height: 1 }, properties: {} },
        { id: 'button', type: 'Button', label: 'Go', bounds: { x: 0, y: 0, width: 80, height: 50 }, properties: { text: 'Go', unknown: true, nested: { code: 'no' } } },
      ],
    })
    const result = normalizeDisplayDocument(valid)!
    expect(result.widgets.map((widget) => widget.id)).toEqual(['title', 'button'])
    expect(result.widgets[1].properties).toEqual({ text: 'Go' })
    expect(normalizeDisplayDocument({ ...document(), schemaVersion: 99 })).toBeNull()
    expect(normalizeDisplayDocument({ ...document(), displayId: '../panel' })).toBeNull()
  })

  it('bounds geometry, strings, widget counts, and document counts', () => {
    const widgets = Array.from({ length: DISPLAY_DOCUMENT_LIMITS.widgetsPerDocument + 10 }, (_, index) => ({
      id: `w${index}`, type: 'Text', label: 'x'.repeat(200),
      bounds: { x: 9999, y: -2, width: 9999, height: 9999 }, properties: {},
    }))
    const normalized = normalizeDisplayDocument(document({
      designSize: { width: 9999, height: 9999 }, gridSize: 999, widgets,
    }))!
    expect(normalized.designSize).toEqual({
      width: DISPLAY_DOCUMENT_LIMITS.designWidth,
      height: DISPLAY_DOCUMENT_LIMITS.designHeight,
    })
    expect(normalized.gridSize).toBe(DISPLAY_DOCUMENT_LIMITS.gridSize)
    expect(normalized.widgets).toHaveLength(DISPLAY_DOCUMENT_LIMITS.widgetsPerDocument)
    expect(normalized.widgets[0].bounds).toEqual({ x: 1023, y: 0, width: 1, height: 1024 })
    expect([...normalized.widgets[0].label]).toHaveLength(DISPLAY_DOCUMENT_LIMITS.labelLength)

    const registry = Object.fromEntries(Array.from(
      { length: DISPLAY_DOCUMENT_LIMITS.documents + 2 },
      (_, index) => [`key${index}`, document({ displayId: `panel${index}` })],
    ))
    expect(Object.keys(normalizeDisplayDocuments(registry))).toHaveLength(DISPLAY_DOCUMENT_LIMITS.documents)
  })

  // Ids come from the installed asset pack, so a document naming anything else
  // — a working-folder path, a URL, an id the pack has retired — keeps nothing.
  it('stores installed asset ids rather than source paths', () => {
    const background = (assetId: string) => normalizeDisplayDocument(document({
      theme: { background: { kind: 'image', assetId } },
    }))!.theme.background
    expect(background('background:01-neon-orbit:320x240'))
      .toEqual({ kind: 'image', assetId: 'background:01-neon-orbit:320x240' })
    expect(background(String.raw`C:rt\secret.png`)).toEqual({ kind: 'solid', color: '#080b12' })
    expect(background('background:retired:320x240')).toEqual({ kind: 'solid', color: '#080b12' })

    const widget = (id: string) => normalizeDisplayDocument(document({
      widgets: [{
        id: 'icon', type: 'Image/Icon', label: '', bounds: { x: 0, y: 0, width: 32, height: 32 },
        properties: { assetId: id },
      }],
    }))!.widgets[0]
    expect(widget('icon:queue').properties.assetId).toBe('icon:queue')
    expect(widget('https://example.com/play.svg').properties.assetId).toBeUndefined()
    expect(widget('semantic-icons/svg/power.svg').properties.assetId).toBeUndefined()
  })
})

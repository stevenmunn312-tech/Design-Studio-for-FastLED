import { describe, expect, it } from 'vitest'
import { DISPLAY_WIDGET_TYPES, type DisplayWidget } from '../displayDocument'
import {
  DISPLAY_WIDGET_LIBRARY,
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
  displayDocumentPorts,
  displayWidgetPortId,
  displayWidgetPorts,
  displayWidgetValidationIssues,
  normalizeDisplayWidgetProperties,
} from '../displayRegistry'

function widget(overrides: Partial<DisplayWidget> = {}): DisplayWidget {
  return {
    id: 'volume',
    type: 'Slider',
    label: 'Volume',
    bounds: { x: 8, y: 8, width: 120, height: 48 },
    properties: { min: 0, max: 1, step: 0.01, orientation: 'horizontal' },
    ...overrides,
  }
}

describe('display widget registry', () => {
  it('defines every frozen launch widget exactly once', () => {
    expect(Object.keys(DISPLAY_WIDGET_LIBRARY)).toEqual(DISPLAY_WIDGET_TYPES)
    for (const type of DISPLAY_WIDGET_TYPES) {
      const definition = DISPLAY_WIDGET_LIBRARY[type]
      expect(definition.type).toBe(type)
      expect(definition.allowedDisplayClasses).toContain('touch-tft')
      expect(definition.previewRenderer).toBeTruthy()
      expect(definition.lvglEmitter).toBeTruthy()
      expect(definition.states).toContain('default')
      const inspectorKeys = definition.propertyInspector.map((property) => property.key)
      expect(new Set(inspectorKeys).size).toBe(inspectorKeys.length)
      expect(Object.keys(definition.defaultProperties).every((key) => inspectorKeys.includes(key))).toBe(true)
      expect(new Set(definition.portRoles.map((role) => role.role)).size).toBe(definition.portRoles.length)
    }
  })

  it('derives stable role-based port ids independently of label and position', () => {
    const slider = widget()
    expect(displayWidgetPorts(slider)).toMatchObject([
      { id: 'widget:volume:out', role: 'out', direction: 'output', dataType: 'float' },
      { id: 'widget:volume:set', role: 'set', direction: 'input', dataType: 'float', optional: true },
    ])
    const renamedAndMoved = { ...slider, label: 'Master level', bounds: { x: 99, y: 80, width: 120, height: 48 } }
    expect(displayWidgetPorts(renamedAndMoved).map((port) => port.id))
      .toEqual(displayWidgetPorts(slider).map((port) => port.id))
    expect(displayWidgetPorts(renamedAndMoved).map((port) => port.label))
      .toEqual(['Master level Output', 'Master level Set'])
    expect(displayWidgetPortId('transport-play', 'out')).toBe('widget:transport-play:out')
    expect(displayWidgetPorts(widget({ type: 'Image/Icon', label: 'Artwork' }))).toEqual([])
  })

  it('reserves synchronized state roles only for stateful controls', () => {
    expect(DISPLAY_WIDGET_LIBRARY.Button.portRoles.map((role) => role.role)).toEqual(['out'])
    for (const type of ['Toggle', 'Slider', 'Dial'] as const) {
      expect(DISPLAY_WIDGET_LIBRARY[type].portRoles.map((role) => role.role)).toEqual(['out', 'set'])
    }
    expect(DISPLAY_WIDGET_LIBRARY.Text.portRoles).toEqual([
      { role: 'value', label: 'Text', direction: 'input', dataType: 'string' },
    ])
  })

  it('partitions document ports by graph direction without changing widget order', () => {
    const ports = displayDocumentPorts({
      widgets: [
        widget({ id: 'title', type: 'Text', label: 'Title' }),
        widget({ id: 'volume', type: 'Slider', label: 'Volume' }),
      ],
    })
    expect(ports.inputs.map((port) => port.id)).toEqual(['widget:title:value', 'widget:volume:set'])
    expect(ports.outputs.map((port) => port.id)).toEqual(['widget:volume:out'])
  })

  it('provides independent defaults and registry-owned minimum bounds', () => {
    const first = defaultDisplayWidgetProperties('Button')
    const second = defaultDisplayWidgetProperties('Button')
    first.text = 'Changed'
    expect(second.text).toBe('Button')
    expect(defaultDisplayWidgetBounds('Button')).toEqual({ x: 0, y: 0, width: 48, height: 48 })
    expect(defaultDisplayWidgetBounds('Dial', 16, 24)).toEqual({ x: 16, y: 24, width: 48, height: 48 })
  })

  it('normalizes imported properties from inspector metadata', () => {
    expect(normalizeDisplayWidgetProperties('Text', {
      text: 'abcdef', align: 'diagonal', fontSize: 999, color: '#AABBCC', wrap: true, maxLines: 9, script: 'no',
    }, 4, 24)).toEqual({ text: 'abcd', fontSize: 96, color: '#aabbcc', wrap: true, maxLines: 4 })

    expect(normalizeDisplayWidgetProperties('Button', {
      text: 'Play', assetId: ' icons/play ', presentation: 'icon', nested: { no: true },
    }, 160, 24)).toEqual({ text: 'Play', assetId: 'icons/play', presentation: 'icon' })

    expect(normalizeDisplayWidgetProperties('Slider', {
      min: Number.NaN, max: 2_000_000, step: -4, orientation: 'round',
    }, 160, 24)).toEqual({ max: 1_000_000, step: 0.0001 })
  })

  it('reports visual, touch, asset, and cross-property validation issues', () => {
    expect(displayWidgetValidationIssues(widget({
      bounds: { x: 0, y: 0, width: 70, height: 20 },
      properties: { min: 1, max: 0, step: 0 },
    }), 'touch-tft').map((issue) => issue.code)).toEqual(['visual-size', 'touch-size', 'property', 'property'])

    expect(displayWidgetValidationIssues(widget({
      type: 'Image/Icon',
      bounds: { x: 0, y: 0, width: 32, height: 32 },
      properties: {},
    }), 'touch-tft')).toEqual([
      { code: 'property', message: 'Choose an image or icon asset.' },
    ])
  })
})

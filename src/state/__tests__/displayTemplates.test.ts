import { describe, expect, it } from 'vitest'
import { createDisplayDocument, displayLayoutIssues } from '../displayEditor'
import { displayDocumentPorts, displayWidgetPorts } from '../displayRegistry'
import {
  DISPLAY_TEMPLATES,
  DISPLAY_TEMPLATE_REFERENCE_SIZE,
  applyDisplayTemplate,
} from '../displayTemplates'

function referenceDocument() {
  return createDisplayDocument(
    'panel',
    DISPLAY_TEMPLATE_REFERENCE_SIZE.width,
    DISPLAY_TEMPLATE_REFERENCE_SIZE.height,
  )
}

describe('custom display templates', () => {
  it('covers the planned starting layouts exactly once', () => {
    expect(DISPLAY_TEMPLATES.map((template) => template.id)).toEqual([
      'now-playing',
      'minimal-transport',
      'pattern-deck',
      'led-performance',
      'audio-reactor',
      'diagnostics',
      'dmx-monitor',
    ])
    expect(new Set(DISPLAY_TEMPLATES.map((template) => template.label)).size).toBe(DISPLAY_TEMPLATES.length)
  })

  it('places every template on the reference screen with no layout issue', () => {
    for (const template of DISPLAY_TEMPLATES) {
      const document = applyDisplayTemplate(referenceDocument(), template.id)
      expect(document.widgets).toHaveLength(template.widgets.length)
      expect(displayLayoutIssues(document)).toEqual([])
      for (const [index, placed] of document.widgets.entries()) {
        expect(placed.bounds).toEqual(template.widgets[index].bounds)
        expect(placed.label).toBe(template.widgets[index].label)
      }
    }
  })

  it('inserts ordinary widgets that mint the ports they would mint one at a time', () => {
    const document = applyDisplayTemplate(referenceDocument(), 'now-playing')
    const ports = displayDocumentPorts(document)
    expect(ports.inputs.map((port) => port.id)).toEqual(
      document.widgets.flatMap((widget) => displayWidgetPorts(widget)
        .filter((port) => port.direction === 'input')
        .map((port) => port.id)),
    )
    expect(ports.outputs.map((port) => port.id)).toEqual([
      'widget:button:out',
      'widget:toggle:out',
      'widget:button-2:out',
    ])
    expect(document.widgets.find((widget) => widget.id === 'toggle')?.properties)
      .toMatchObject({ offLabel: 'Play', onLabel: 'Pause', presentation: 'text' })
  })

  it('appends a second template with fresh stable ids and independent properties', () => {
    const first = applyDisplayTemplate(referenceDocument(), 'minimal-transport')
    const both = applyDisplayTemplate(first, 'minimal-transport')

    expect(both.widgets).toHaveLength(first.widgets.length * 2)
    expect(new Set(both.widgets.map((widget) => widget.id)).size).toBe(both.widgets.length)
    both.widgets.at(-1)!.properties.max = 4
    expect(first.widgets.at(-1)!.properties.max).toBe(1)
  })

  it('clamps a template authored for the reference screen onto a smaller display', () => {
    const document = applyDisplayTemplate(createDisplayDocument('panel', 160, 128), 'pattern-deck')
    for (const widget of document.widgets) {
      expect(widget.bounds.x + widget.bounds.width).toBeLessThanOrEqual(160)
      expect(widget.bounds.y + widget.bounds.height).toBeLessThanOrEqual(128)
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  addDisplayWidget,
  constrainDisplayWidgetBounds,
  createDisplayDocument,
  displayLayoutIssues,
  duplicateDisplayWidget,
  removeDisplayWidget,
  updateDisplayWidget,
} from '../displayEditor'

describe('custom display editor model', () => {
  it('creates an independent versioned touch document', () => {
    const first = createDisplayDocument('panel-a', 320, 240, '90')
    const second = createDisplayDocument('panel-b')
    first.theme.accentColor = '#000000'
    expect(first).toMatchObject({ schemaVersion: 1, displayId: 'panel-a', designSize: { width: 320, height: 240 }, orientation: '90', gridSize: 8 })
    expect(second.theme.accentColor).not.toBe('#000000')
  })

  it('adds registry-backed widgets with stable unique ids and free positions', () => {
    let document = createDisplayDocument('panel')
    document = addDisplayWidget(document, 'Button')
    document = addDisplayWidget(document, 'Button')
    expect(document.widgets.map((widget) => widget.id)).toEqual(['button', 'button-2'])
    expect(document.widgets[0]).toMatchObject({ type: 'Button', label: 'Button', properties: { text: 'Button' } })
    expect(document.widgets[0].bounds).not.toEqual(document.widgets[1].bounds)
    expect(displayLayoutIssues(document).filter((issue) => issue.code === 'collision')).toEqual([])
  })

  it('snaps movement and resizing while enforcing the registry minimum and screen edge', () => {
    const document = createDisplayDocument('panel', 100, 80)
    expect(constrainDisplayWidgetBounds(document, 'Slider', { x: 77, y: -3, width: 19, height: 9 }))
      .toEqual({ x: 4, y: 0, width: 96, height: 48 })

    const withButton = addDisplayWidget(document, 'Button')
    const moved = updateDisplayWidget(withButton, 'button', (widget) => ({
      ...widget,
      bounds: { ...widget.bounds, x: 21, y: 17 },
    }))
    expect(moved.widgets[0].bounds).toMatchObject({ x: 24, y: 16 })
  })

  it('duplicates independent properties and reports collisions', () => {
    let document = addDisplayWidget(createDisplayDocument('panel', 80, 56), 'Button')
    document = duplicateDisplayWidget(document, 'button')
    expect(document.widgets.map((widget) => widget.id)).toEqual(['button', 'button-2'])
    expect(displayLayoutIssues(document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'collision', widgetId: 'button', otherWidgetId: 'button-2' }),
    ]))
    document.widgets[1].properties.text = 'Copy'
    expect(document.widgets[0].properties.text).toBe('Button')
    expect(removeDisplayWidget(document, 'button').widgets.map((widget) => widget.id)).toEqual(['button-2'])
  })
})

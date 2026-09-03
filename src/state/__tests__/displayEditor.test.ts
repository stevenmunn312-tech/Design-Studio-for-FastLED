import { describe, expect, it } from 'vitest'
import {
  addDisplayWidget,
  alignDisplayWidgets,
  constrainDisplayWidgetBounds,
  createDisplayDocument,
  displayLayoutIssues,
  distributeDisplayWidgets,
  duplicateDisplayWidget,
  duplicateDisplayWidgets,
  pasteDisplayWidgets,
  removeDisplayWidget,
  removeDisplayWidgets,
  translateDisplayWidgets,
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

  it('moves a multi-selection as a bounded group without changing its spacing', () => {
    let document = addDisplayWidget(createDisplayDocument('panel', 160, 80), 'Button')
    document = addDisplayWidget(document, 'Button')
    const beforeGap = document.widgets[1].bounds.x - document.widgets[0].bounds.x
    const moved = translateDisplayWidgets(document, ['button', 'button-2'], 500, 8)

    expect(moved.widgets[1].bounds.x + moved.widgets[1].bounds.width).toBe(160)
    expect(moved.widgets[1].bounds.x - moved.widgets[0].bounds.x).toBe(beforeGap)
    expect(moved.widgets.map((widget) => widget.bounds.y)).toEqual([8, 8])
  })

  it('aligns and distributes selected widgets while leaving other widgets untouched', () => {
    let document = createDisplayDocument('panel', 320, 240)
    document = addDisplayWidget(document, 'Button')
    document = addDisplayWidget(document, 'Button')
    document = addDisplayWidget(document, 'Button')
    document = addDisplayWidget(document, 'Text')
    document = updateDisplayWidget(document, 'button', (widget) => ({ ...widget, bounds: { ...widget.bounds, x: 0, y: 0 } }))
    document = updateDisplayWidget(document, 'button-2', (widget) => ({ ...widget, bounds: { ...widget.bounds, x: 48, y: 40 } }))
    document = updateDisplayWidget(document, 'button-3', (widget) => ({ ...widget, bounds: { ...widget.bounds, x: 144, y: 80 } }))
    const textBounds = document.widgets.find((widget) => widget.id === 'text')!.bounds

    const aligned = alignDisplayWidgets(document, ['button', 'button-2', 'button-3'], 'top')
    expect(aligned.widgets.slice(0, 3).map((widget) => widget.bounds.y)).toEqual([0, 0, 0])
    expect(aligned.widgets.find((widget) => widget.id === 'text')!.bounds).toEqual(textBounds)

    const distributed = distributeDisplayWidgets(document, ['button', 'button-2', 'button-3'], 'horizontal')
    expect(distributed.widgets.slice(0, 3).map((widget) => widget.bounds.x)).toEqual([0, 72, 144])
  })

  it('copies, duplicates, pastes and removes a selection with fresh stable ids', () => {
    let document = addDisplayWidget(createDisplayDocument('panel'), 'Button')
    document = addDisplayWidget(document, 'Text')
    const duplicated = duplicateDisplayWidgets(document, ['button', 'text'])
    expect(duplicated.widgetIds).toEqual(['button-2', 'text-2'])
    expect(duplicated.document.widgets).toHaveLength(4)

    const pasted = pasteDisplayWidgets(duplicated.document, document.widgets, 16)
    expect(pasted.widgetIds).toEqual(['button-3', 'text-3'])
    expect(pasted.document.widgets.find((widget) => widget.id === 'button-3')?.bounds.x).toBe(16)
    expect(removeDisplayWidgets(pasted.document, pasted.widgetIds).widgets).toHaveLength(4)
  })
})

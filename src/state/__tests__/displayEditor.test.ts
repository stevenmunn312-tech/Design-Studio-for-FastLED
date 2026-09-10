import { describe, expect, it } from 'vitest'
import { DISPLAY_TOUCH_SEPARATION_PX } from '../displayRegistry'
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
  resizeDisplayDocument,
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

  it('reflows a complete layout when the mounted display changes orientation', () => {
    const portrait = {
      ...createDisplayDocument('panel', 240, 320),
      widgets: [
        { id: 'left', type: 'Toggle' as const, label: 'Left', bounds: { x: 8, y: 184, width: 104, height: 64 }, properties: {} },
        { id: 'right', type: 'Toggle' as const, label: 'Right', bounds: { x: 128, y: 184, width: 104, height: 64 }, properties: {} },
      ],
    }
    const landscape = resizeDisplayDocument(portrait, { width: 320, height: 240 }, '90')
    expect(landscape).toMatchObject({ designSize: { width: 320, height: 240 }, orientation: '90' })
    expect(displayLayoutIssues(landscape)).toEqual([])

    const restored = resizeDisplayDocument(landscape, { width: 240, height: 320 }, '0')
    expect(restored).toMatchObject({ designSize: { width: 240, height: 320 }, orientation: '0' })
    expect(displayLayoutIssues(restored)).toEqual([])
  })

  it('carries widget sizes across a rotation instead of rescaling them', () => {
    // A rotation turns the glass; it does not resize what is on it. Scaling
    // both axes narrowed a label until its text wrapped, and the extra line
    // had nowhere to go — which is what a rotation used to expose. Position
    // still moves in proportion, so the composition survives.
    const landscape = {
      ...createDisplayDocument('panel', 320, 240),
      widgets: [
        { id: 'top', type: 'Text' as const, label: 'Top Left', bounds: { x: 16, y: 8, width: 160, height: 32 }, properties: { text: 'Top Left' } },
        { id: 'bottom', type: 'Text' as const, label: 'Bottom Right', bounds: { x: 144, y: 200, width: 160, height: 32 }, properties: { text: 'Bottom Right' } },
      ],
    }
    const portrait = resizeDisplayDocument(landscape, { width: 240, height: 320 }, '0')
    for (const [index, widget] of portrait.widgets.entries()) {
      expect(widget.bounds.width, widget.label).toBe(landscape.widgets[index].bounds.width)
      expect(widget.bounds.height, widget.label).toBe(landscape.widgets[index].bounds.height)
    }
    // Reading order holds: the first widget stays above the second.
    expect(portrait.widgets[0].bounds.y).toBeLessThan(portrait.widgets[1].bounds.y)
    expect(displayLayoutIssues(portrait)).toEqual([])

    // Rotating back is not bit-exact and cannot be: a widget keeping its size
    // takes up a different *share* of the narrower panel, so a position that
    // has to be clamped on the way over has nowhere to remember the overhang.
    // What must hold is that the loss happens once and then stops — otherwise
    // a few rotations would walk a layout off its own screen.
    const restored = resizeDisplayDocument(portrait, { width: 320, height: 240 }, '90')
    const again = resizeDisplayDocument(
      resizeDisplayDocument(restored, { width: 240, height: 320 }, '0'),
      { width: 320, height: 240 }, '90',
    )
    expect(again.widgets.map((widget) => widget.bounds))
      .toEqual(restored.widgets.map((widget) => widget.bounds))
    for (const [index, widget] of restored.widgets.entries()) {
      expect(widget.bounds.width, widget.label).toBe(landscape.widgets[index].bounds.width)
      expect(widget.bounds.height, widget.label).toBe(landscape.widgets[index].bounds.height)
    }
    expect(displayLayoutIssues(restored)).toEqual([])
  })

  it('cuts a widget down only when the panel it lands on is too small for it', () => {
    // The one case a bound may still shrink, and it is the clamp doing it
    // rather than the rotation: 288 pixels of label cannot sit on 240 of glass.
    const landscape = {
      ...createDisplayDocument('panel', 320, 240),
      widgets: [
        { id: 'wide', type: 'Text' as const, label: 'Wide', bounds: { x: 16, y: 96, width: 288, height: 32 }, properties: {} },
      ],
    }
    const portrait = resizeDisplayDocument(landscape, { width: 240, height: 320 }, '0')
    expect(portrait.widgets[0].bounds.width).toBe(240)
    expect(portrait.widgets[0].bounds.x).toBe(0)
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

  it('keeps touch targets a finger apart while passive widgets may sit against them', () => {
    let document = createDisplayDocument('panel', 320, 240)
    document = addDisplayWidget(document, 'Button')
    document = addDisplayWidget(document, 'Button')
    const [first, second] = document.widgets
    expect(second.bounds.x - (first.bounds.x + first.bounds.width)).toBeGreaterThanOrEqual(DISPLAY_TOUCH_SEPARATION_PX)
    expect(displayLayoutIssues(document)).toEqual([])

    const adjacent = updateDisplayWidget(document, 'button-2', (widget) => ({
      ...widget,
      bounds: { ...widget.bounds, x: first.bounds.x + first.bounds.width },
    }))
    expect(displayLayoutIssues(adjacent)).toEqual([{
      widgetId: 'button',
      otherWidgetId: 'button-2',
      code: 'separation',
      message: `Button needs ${DISPLAY_TOUCH_SEPARATION_PX} px of separation from Button.`,
    }])

    const overlapping = updateDisplayWidget(adjacent, 'button-2', (widget) => ({
      ...widget,
      bounds: { ...widget.bounds, x: first.bounds.x + 16 },
    }))
    expect(displayLayoutIssues(overlapping).map((issue) => issue.code)).toEqual(['collision'])

    let withCaption = addDisplayWidget(document, 'Text')
    withCaption = updateDisplayWidget(withCaption, 'text', (widget) => ({
      ...widget,
      bounds: { ...widget.bounds, x: first.bounds.x, y: first.bounds.y + first.bounds.height },
    }))
    expect(displayLayoutIssues(withCaption)).toEqual([])
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

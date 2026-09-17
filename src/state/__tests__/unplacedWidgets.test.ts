import { describe, expect, it } from 'vitest'
import {
  addDisplayWidget,
  createDisplayDocument,
  displayLayoutIssues,
  placeDisplayWidget,
  resizeDisplayDocument,
  translateDisplayWidgets,
  unplaceDisplayWidgets,
} from '../displayEditor'
import {
  isPlacedWidget,
  normalizeDisplayDocument,
  placedWidgets,
  type DisplayDocument,
  type DisplayWidget,
} from '../displayDocument'
import { customDisplayAssetRequests, customDisplayFontSizes } from '../customDisplayResources'
import { applyDisplayTemplate, canonicalDisplayTemplateBounds } from '../displayTemplates'

/*
 * A widget that has been wired but not yet dragged onto a screen has no
 * bounds. Every walk over a document's widgets therefore means one of two
 * things, and this file is where the difference is held:
 *
 *   ports  — all widgets, because a connected one still has a port and an edge
 *   pixels — placed widgets only, because nothing else draws
 *
 * See docs/development/design/wire-first-touch-controls.md. Optional bounds
 * turn most of that question into a compile error, but three of these cases
 * compile perfectly well while being wrong, so they are asserted here.
 */

function placedWidget(id: string, x: number, y: number): DisplayWidget {
  return {
    id,
    type: 'Slider',
    label: id,
    bounds: { x, y, width: 96, height: 48 },
    properties: { min: 0, max: 1, step: 0.01, orientation: 'horizontal' },
  }
}

/** Wired, waiting in the designer's Connected group — no geometry at all. */
function connectedWidget(id: string): DisplayWidget {
  return {
    id,
    type: 'Slider',
    label: id,
    properties: { min: 0, max: 1, step: 0.01, orientation: 'horizontal' },
  }
}

function documentWith(widgets: DisplayWidget[]): DisplayDocument {
  return { ...createDisplayDocument('panel', 240, 320), widgets }
}

describe('unplaced widgets', () => {
  it('survives a save and reload rather than being dropped at the boundary', () => {
    // A connected widget is normal data, not a malformed one. Dropping it on
    // import would lose the wire's own half of the pairing.
    const document = documentWith([connectedWidget('volume'), placedWidget('speed', 8, 8)])
    const reloaded = normalizeDisplayDocument(JSON.parse(JSON.stringify(document)))

    expect(reloaded?.widgets.map((widget) => widget.id)).toEqual(['volume', 'speed'])
    expect(reloaded?.widgets[0].bounds).toBeUndefined()
    expect(placedWidgets(reloaded).map((widget) => widget.id)).toEqual(['speed'])
  })

  it('treats malformed bounds as unplaced rather than as a reason to drop the widget', () => {
    const reloaded = normalizeDisplayDocument({
      ...documentWith([]),
      widgets: [{ ...connectedWidget('volume'), bounds: 'nonsense' }],
    })
    expect(reloaded?.widgets).toHaveLength(1)
    expect(reloaded?.widgets[0].bounds).toBeUndefined()
  })

  /*
   * The three that compile while being wrong. Each pairs a widget to something
   * else *by index*, so an unplaced widget counted on one side and not the
   * other shifts everything after it.
   */

  it('keeps a template reflow aligned when an unplaced widget sits before the placed ones', () => {
    // resizeDisplayDocument pairs widgets to canonicalDisplayTemplateBounds by
    // index. Counting the unplaced one would hand every widget its neighbour's
    // rectangle — and the sizes are plausible, so nothing would look broken.
    const templated = applyDisplayTemplate(createDisplayDocument('panel', 240, 320), 'now-playing')
    const withConnected = { ...templated, widgets: [connectedWidget('volume'), ...templated.widgets] }

    const rotated = resizeDisplayDocument(withConnected, { width: 320, height: 240 }, '90')
    const expected = canonicalDisplayTemplateBounds(
      placedWidgets(resizeDisplayDocument(templated, { width: 320, height: 240 }, '90')),
      320,
      240,
    )

    expect(expected, 'the template must still be recognised after the rotation').toBeTruthy()
    expect(placedWidgets(rotated).map((widget) => widget.bounds))
      .toEqual(placedWidgets(resizeDisplayDocument(templated, { width: 320, height: 240 }, '90'))
        .map((widget) => widget.bounds))
    // And the connected widget is still there, still without geometry.
    expect(rotated.widgets[0].bounds).toBeUndefined()
  })

  it('numbers a baked asset by its placed index, the same index the emitter uses', () => {
    // customDisplayLvglCpp looks an asset up by the index of the widget it is
    // emitting. Both sides count the placed list; counting different lists
    // draws one widget's icon on another.
    const icon = {
      id: 'icon',
      type: 'Image/Icon' as const,
      label: 'Icon',
      bounds: { x: 8, y: 8, width: 24, height: 24 },
      properties: { assetId: 'icon:power', tint: false },
    }
    const document = documentWith([connectedWidget('volume'), icon])

    const owners = customDisplayAssetRequests(document)
      .flatMap((request) => request.owners)
      .filter((owner) => owner.kind === 'widget')
    expect(owners.length, 'the icon must have registered an asset').toBeGreaterThan(0)
    for (const owner of owners) {
      if (owner.kind !== 'widget') continue
      expect(
        placedWidgets(document)[owner.widgetIndex]?.id,
        'widgetIndex must index the placed widgets, not every widget',
      ).toBe('icon')
    }
  })

  it('charges no font to a widget nobody has placed', () => {
    const text = {
      id: 'title', type: 'Text' as const, label: 'Title',
      bounds: { x: 0, y: 0, width: 100, height: 20 },
      properties: { text: 'x', align: 'left', fontSize: 28, wrap: false, maxLines: 1 },
    }
    const unplacedText = { ...text, id: 'hidden', bounds: undefined, properties: { ...text.properties, fontSize: 48 } }

    expect(customDisplayFontSizes(documentWith([text]))).toEqual(
      customDisplayFontSizes(documentWith([text, unplacedText])),
    )
  })

  /* The pixels half: nothing unplaced draws, collides or moves. */

  it('reports no geometry issue for a widget that is not on the screen', () => {
    const offScreen = { ...connectedWidget('volume') }
    const overlapping = [placedWidget('a', 8, 8), placedWidget('b', 8, 8)]

    const issues = displayLayoutIssues(documentWith([offScreen, ...overlapping]))
    expect(issues.some((issue) => issue.widgetId === 'volume')).toBe(false)
    expect(issues.some((issue) => issue.code === 'collision')).toBe(true)
  })

  it('leaves an unplaced widget alone when the screen is rearranged', () => {
    const document = documentWith([connectedWidget('volume'), placedWidget('speed', 8, 8)])
    const moved = translateDisplayWidgets(document, ['volume', 'speed'], 16, 16)

    expect(moved.widgets.find((widget) => widget.id === 'volume')?.bounds).toBeUndefined()
    expect(moved.widgets.find((widget) => widget.id === 'speed')?.bounds).toMatchObject({ x: 24, y: 24 })
  })

  it('agrees with itself about what is placed', () => {
    const document = documentWith([connectedWidget('volume'), placedWidget('speed', 8, 8)])
    expect(placedWidgets(document)).toEqual(document.widgets.filter(isPlacedWidget))
    expect(placedWidgets(null)).toEqual([])
  })

  /*
   * Crossing the line, both ways. Placing and unplacing are the whole of what
   * the designer's Connected group does, so they are geometry operations and
   * live beside the rest of them rather than in the component.
   */

  it('gives a connected widget the same free rectangle the palette would have', () => {
    const document = documentWith([connectedWidget('volume')])
    const placed = placeDisplayWidget(document, 'volume')

    // The comparison is against what adding a Slider from the palette does to
    // the same document: one placement rule, not one per entry point.
    const fromPalette = addDisplayWidget(documentWith([]), 'Slider').widgets[0]
    expect(placed.widgets[0].bounds).toEqual(fromPalette.bounds)
    expect(displayLayoutIssues(placed)).toEqual([])
  })

  it('places into free space rather than on top of what is already drawn', () => {
    const document = documentWith([placedWidget('speed', 0, 0), connectedWidget('volume')])
    const placed = placeDisplayWidget(document, 'volume')

    expect(placed.widgets[1].bounds).toBeDefined()
    expect(displayLayoutIssues(placed).some((issue) => issue.code === 'collision')).toBe(false)
  })

  it('leaves a widget already on the screen exactly as it is', () => {
    const document = documentWith([placedWidget('speed', 8, 8)])
    expect(placeDisplayWidget(document, 'speed')).toBe(document)
    expect(placeDisplayWidget(document, 'nobody')).toBe(document)
  })

  it('takes a widget off the screen without taking anything else from it', () => {
    const document = documentWith([placedWidget('speed', 8, 8)])
    const returned = unplaceDisplayWidgets(document, ['speed'])

    // Losing bounds is the whole of it: the id the port is keyed on, the label
    // and the adopted range all survive, because the wire still names them.
    expect(returned.widgets[0]).toEqual({
      id: 'speed',
      type: 'Slider',
      label: 'speed',
      properties: { min: 0, max: 1, step: 0.01, orientation: 'horizontal' },
    })
    expect('bounds' in returned.widgets[0]).toBe(false)
    expect(unplaceDisplayWidgets(returned, ['speed'])).toBe(returned)
  })
})

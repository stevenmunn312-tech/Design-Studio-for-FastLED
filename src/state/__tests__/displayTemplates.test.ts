import { describe, expect, it } from 'vitest'
import { createDisplayDocument, displayLayoutIssues, resizeDisplayDocument } from '../displayEditor'
import { displayDocumentPorts, displayWidgetIsBound } from '../displayRegistry'
import { DISPLAY_SOURCE_FROM_GRAPH } from '../displaySourceFields'
import {
  DISPLAY_TEMPLATES,
  displayTemplate,
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
      'show-status',
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

  it('uses each template’s touch-safe portrait composition on the custom panel', () => {
    for (const template of DISPLAY_TEMPLATES) {
      const document = applyDisplayTemplate(createDisplayDocument('panel', 240, 320), template.id)
      expect(document.widgets).toHaveLength(template.portraitWidgets.length)
      expect(displayLayoutIssues(document)).toEqual([])
      for (const [index, placed] of document.widgets.entries()) {
        expect(placed.bounds).toEqual(template.portraitWidgets[index].bounds)
        expect(placed.label).toBe(template.portraitWidgets[index].label)
      }
    }
  })

  it('reflows every recognised template to its dedicated portrait and landscape composition', () => {
    for (const template of DISPLAY_TEMPLATES) {
      const landscape = applyDisplayTemplate(referenceDocument(), template.id, 'theme:03-synthwave')
      const portrait = resizeDisplayDocument(landscape, { width: 240, height: 320 }, '0')
      expect(portrait.widgets.map((widget) => widget.bounds)).toEqual(
        template.portraitWidgets.map((widget) => widget.bounds),
      )
      expect(displayLayoutIssues(portrait)).toEqual([])

      const restored = resizeDisplayDocument(portrait, { width: 320, height: 240 }, '90')
      expect(restored.widgets.map((widget) => widget.bounds)).toEqual(
        template.widgets.map((widget) => widget.bounds),
      )
      expect(displayLayoutIssues(restored)).toEqual([])
    }
  })

  it('keeps a deliberately repositioned template on the ordinary resize path', () => {
    const landscape = applyDisplayTemplate(referenceDocument(), 'pattern-deck')
    const customised = {
      ...landscape,
      widgets: landscape.widgets.map((widget, index) => (
        index === 0 ? { ...widget, bounds: { ...widget.bounds, x: 8 } } : widget
      )),
    }

    const portrait = resizeDisplayDocument(customised, { width: 240, height: 320 }, '0')
    // What makes this the ordinary path is that the widget keeps the size it
    // was given — 288 wide, cut to the 240 of glass it now has — instead of
    // being re-laid-out into the template's own portrait composition, which
    // would have made it 208 by 72. Asserting a position instead only ever
    // worked because the old proportional scale happened to land back on the
    // same grid line.
    const reflowed = displayTemplate('pattern-deck')!.portraitWidgets[0].bounds
    expect(portrait.widgets[0].bounds).toMatchObject({ width: 240, height: 88 })
    expect(portrait.widgets[0].bounds.height).not.toBe(reflowed.height)
  })

  /*
   * The readings arrive bound; only the controls arrive on wires.
   *
   * This template used to mint six input sockets on the panel, and filling them
   * meant drawing six cables from the Music Player already wired to the panel
   * beside them. Each reading now names a field of that source instead, so the
   * screen works the moment it is placed. A control is unchanged: what a finger
   * did to it is still published on a wire.
   */
  it('arrives with its readings bound to the panel source and its controls still on wires', () => {
    const document = applyDisplayTemplate(referenceDocument(), 'now-playing')
    const ports = displayDocumentPorts(document)
    expect(ports.inputs).toEqual([])
    expect(document.widgets.filter((widget) => displayWidgetIsBound(widget))
      .map((widget) => widget.properties.source))
      .toEqual(['title', 'artist', 'elapsed', 'remaining', 'progress', 'playing'])
    expect(ports.outputs.map((port) => port.id)).toEqual([
      'widget:button:out',
      'widget:toggle:out',
      'widget:button-2:out',
    ])
    expect(document.widgets.find((widget) => widget.id === 'toggle')?.properties)
      .toMatchObject({ offLabel: 'Play', onLabel: 'Pause', presentation: 'text' })
  })

  /*
   * Binding is a property, so it is reversible and the ports follow it.
   *
   * The socket has to come back when an author wants a computed value on that
   * readout instead — otherwise a template's convenience would be a one-way
   * door out of the graph.
   */
  it('mints the socket again for a reading switched back to the graph', () => {
    const document = applyDisplayTemplate(referenceDocument(), 'now-playing')
    const released = {
      ...document,
      widgets: document.widgets.map((widget) => (widget.id === 'text'
        ? { ...widget, properties: { ...widget.properties, source: DISPLAY_SOURCE_FROM_GRAPH } }
        : widget)),
    }
    expect(displayDocumentPorts(released).inputs.map((port) => port.id)).toEqual(['widget:text:value'])
  })

  /*
   * A template's size variants have to agree about what is bound.
   *
   * The bindings are keyed by the template's own widget label rather than
   * repeated in each composition, precisely so a portrait layout cannot bind a
   * field its landscape twin leaves on a wire — which would make a panel's
   * rotation quietly change which sockets it has.
   */
  it('binds the same fields in every size variant of a template', () => {
    for (const template of DISPLAY_TEMPLATES) {
      const bindings = (widgets: readonly { label: string; properties?: Readonly<Record<string, unknown>> }[]) =>
        widgets.map((widget) => `${widget.label}=${String(widget.properties?.source ?? '')}`)
      const expected = bindings(template.widgets)
      for (const variant of [template.portraitWidgets, template.squareWidgets]) {
        if (variant) expect(bindings(variant)).toEqual(expected)
      }
    }
  })

  it('uses the selected themed icon set for template controls when one is supplied', () => {
    const document = applyDisplayTemplate(referenceDocument(), 'now-playing', 'theme:03-synthwave')

    expect(document.widgets.filter((widget) => ['Previous', 'Play', 'Next'].includes(widget.label))
      .map((widget) => widget.properties))
      .toEqual([
        expect.objectContaining({ assetId: 'control:03-synthwave:previous', presentation: 'icon' }),
        expect.objectContaining({ assetId: 'control:03-synthwave:play-pause', presentation: 'icon' }),
        expect.objectContaining({ assetId: 'control:03-synthwave:next', presentation: 'icon' }),
      ])
  })

  it('keeps themed transport targets square when a template rotates', () => {
    const landscape = applyDisplayTemplate(referenceDocument(), 'now-playing', 'theme:03-synthwave')
    const portrait = resizeDisplayDocument(landscape, { width: 240, height: 320 }, '0')

    for (const label of ['Previous', 'Play', 'Next']) {
      expect(portrait.widgets.find((widget) => widget.label === label)?.bounds).toMatchObject({ width: 64, height: 64 })
    }
    expect(displayLayoutIssues(portrait)).toEqual([])

    const legacyPortrait = {
      ...portrait,
      widgets: portrait.widgets.map((widget) => (
        ['Previous', 'Play', 'Next'].includes(widget.label)
          ? { ...widget, bounds: { ...widget.bounds, width: 48, height: 88 } }
          : widget
      )),
    }
    const repairedLandscape = resizeDisplayDocument(legacyPortrait, { width: 320, height: 240 }, '90')
    for (const label of ['Previous', 'Play', 'Next']) {
      expect(repairedLandscape.widgets.find((widget) => widget.label === label)?.bounds).toMatchObject({ width: 64, height: 64 })
    }
    expect(repairedLandscape.widgets.find((widget) => widget.label === 'Title')?.bounds)
      .toEqual({ x: 16, y: 8, width: 288, height: 32 })
    expect(repairedLandscape.widgets.find((widget) => widget.label === 'Position')?.bounds)
      .toEqual({ x: 16, y: 128, width: 288, height: 16 })
  })

  it('uses the selected themed icons for every template action', () => {
    const document = applyDisplayTemplate(referenceDocument(), 'pattern-deck', 'theme:03-synthwave')
    expect(document.widgets.find((widget) => widget.label === 'Shuffle')?.properties)
      .toMatchObject({ assetId: 'control:03-synthwave:shuffle', presentation: 'icon' })
    expect(document.widgets.find((widget) => widget.label === 'Auto advance')?.properties)
      .toMatchObject({ assetId: 'control:03-synthwave:auto-advance', presentation: 'icon' })

    const performance = applyDisplayTemplate(referenceDocument(), 'led-performance', 'theme:03-synthwave')
    expect(performance.widgets.find((widget) => widget.label === 'Freeze')?.properties)
      .toMatchObject({ assetId: 'control:03-synthwave:freeze', presentation: 'icon' })
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

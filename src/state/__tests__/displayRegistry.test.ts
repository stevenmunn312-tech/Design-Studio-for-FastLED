import { describe, expect, it } from 'vitest'
import { DISPLAY_DOCUMENT_LIMITS, DISPLAY_WIDGET_TYPES, type DisplayWidget , PlacedDisplayWidget} from '../displayDocument'
import {
  DISPLAY_CONTROL_TRACK_PX,
  DISPLAY_TOUCH_TARGET_MIN_PX,
  DISPLAY_WIDGET_LIBRARY,
  displayControlHitBounds,
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
  displayWidgetBodyFallback,
  displayWidgetCaptionLayout,
  displayWidgetContentBounds,
  displayWidgetOnScreenCaption,
  displayWidgetShowsLabel,
  displayDocumentInputPorts,
  displayDocumentPorts,
  displayDocumentTouchOutputPorts,
  displayWidgetIsControl,
  displayWidgetPortId,
  displayWidgetPorts,
  displayWidgetValidationIssues,
  isDisplayTouchTarget,
  normalizeDisplayWidgetProperties,
} from '../displayRegistry'

function widget(overrides: Partial<DisplayWidget> = {}): PlacedDisplayWidget {
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
    expect(displayDocumentInputPorts({
      widgets: [
        widget({ id: 'title', type: 'Text', label: 'Title' }),
        widget({ id: 'volume', type: 'Slider', label: 'Volume' }),
      ],
    }).map((port) => port.id)).toEqual(['widget:title:value', 'widget:volume:set'])
    expect(displayDocumentTouchOutputPorts({
      widgets: [
        widget({ id: 'title', type: 'Text', label: 'Title' }),
        widget({ id: 'volume', type: 'Slider', label: 'Volume' }),
      ],
    }).map((port) => port.id)).toEqual(['widget:volume:out'])
  })

  it('keeps bound readings off the panel while interactive controls still publish through Touch', () => {
    const document = {
      widgets: [
        widget({
          id: 'title',
          type: 'Text',
          label: 'Title',
          properties: { source: 'title' },
        }),
        widget({
          id: 'volume',
          type: 'Slider',
          label: 'Volume',
          properties: { min: 0, max: 1, step: 0.01, orientation: 'horizontal', source: 'volume' },
        }),
      ],
    }
    expect(displayDocumentInputPorts(document).map((port) => port.id)).toEqual([])
    expect(displayDocumentTouchOutputPorts(document).map((port) => port.id)).toEqual(['widget:volume:out'])
  })

  it('keeps duplicate widget labels distinct and preserves identities across reorder', () => {
    const first = widget({ id: 'speed-a', label: 'Speed' })
    const second = widget({ id: 'speed-b', label: 'Speed', bounds: { x: 8, y: 80, width: 120, height: 48 } })
    const original = displayDocumentTouchOutputPorts({ widgets: [first, second] })
    const reordered = displayDocumentTouchOutputPorts({ widgets: [second, first] })

    expect(original).toEqual([
      { id: 'widget:speed-a:out', label: 'Speed Output', dataType: 'float' },
      { id: 'widget:speed-b:out', label: 'Speed Output', dataType: 'float' },
    ])
    expect(reordered.map((port) => port.id)).toEqual(['widget:speed-b:out', 'widget:speed-a:out'])
  })

  it('provides independent defaults and registry-owned minimum bounds', () => {
    const first = defaultDisplayWidgetProperties('Button')
    const second = defaultDisplayWidgetProperties('Button')
    first.text = 'Changed'
    expect(second.text).toBe('Button')
    expect(defaultDisplayWidgetBounds('Button')).toEqual({ x: 0, y: 0, width: 48, height: 48 })
    expect(defaultDisplayWidgetBounds('Dial', 16, 24)).toEqual({ x: 16, y: 24, width: 48, height: 48 })
  })

  it.each(DISPLAY_WIDGET_TYPES)('%s defaults survive the inspector/import contract unchanged', (type) => {
    const defaults = defaultDisplayWidgetProperties(type)
    expect(normalizeDisplayWidgetProperties(type, defaults,
      DISPLAY_DOCUMENT_LIMITS.propertyStringLength, DISPLAY_DOCUMENT_LIMITS.propertyCount)).toEqual(defaults)
    expect(DISPLAY_WIDGET_LIBRARY[type].validateProperties(defaults))
      .toEqual(type === 'Image/Icon' ? ['Choose an image or icon asset.'] : [])
  })

  it('normalizes imported properties from inspector metadata', () => {
    expect(normalizeDisplayWidgetProperties('Text', {
      text: 'abcdef', align: 'diagonal', fontSize: 999, color: '#AABBCC', wrap: true, maxLines: 9, script: 'no',
    }, 4, 24)).toEqual({ text: 'abcd', fontSize: 96, color: '#aabbcc', wrap: true, maxLines: 4 })

    expect(normalizeDisplayWidgetProperties('Button', {
      text: 'Play', assetId: ' control:01-neon-orbit:play-pause ', presentation: 'icon', nested: { no: true },
    }, 160, 24)).toEqual({ text: 'Play', assetId: 'control:01-neon-orbit:play-pause', presentation: 'icon' })

    expect(normalizeDisplayWidgetProperties('Slider', {
      min: Number.NaN, max: 2_000_000, step: -4, orientation: 'round',
    }, 160, 24)).toEqual({ max: 1_000_000, step: 0.0001 })

    expect(normalizeDisplayWidgetProperties('Slider', { showLabel: false }, 160, 24)).toEqual({ showLabel: false })
    expect(normalizeDisplayWidgetProperties('Slider', { showLabel: true }, 160, 24)).toEqual({ showLabel: true })
    expect(normalizeDisplayWidgetProperties('Slider', { showLabel: 'yes' }, 160, 24)).toEqual({})
  })

  /*
   * The label is drawn once. Off, it is the widget's own content — which is
   * what every design saved before captions existed, and every template, was
   * drawn as, so the default has to be off. On, it moves out to a caption and
   * the body falls back to nothing, so a wired Text reads as the value it is
   * being told instead of repeating its own caption underneath it.
   */
  it('moves a widget label between its content and its caption, and never draws both', () => {
    expect(defaultDisplayWidgetProperties('Slider').showLabel).toBeUndefined()
    expect(displayWidgetShowsLabel({ properties: {} })).toBe(false)
    expect(displayWidgetShowsLabel({ properties: { showLabel: false } })).toBe(false)
    expect(displayWidgetShowsLabel({ properties: { showLabel: true } })).toBe(true)

    const off = widget({ label: 'Volume' })
    expect(displayWidgetOnScreenCaption(off)).toBe('')
    expect(displayWidgetBodyFallback(off)).toBe('Volume')

    const on = widget({ label: 'Volume', properties: { showLabel: true } })
    expect(displayWidgetOnScreenCaption(on)).toBe('Volume')
    expect(displayWidgetBodyFallback(on)).toBe('')

    // A blank name is not a caption, whatever the box says.
    expect(displayWidgetOnScreenCaption(widget({ label: '  ', properties: { showLabel: true } }))).toBe('')
  })

  /*
   * The caption is charged to the widget's own box rather than floating over
   * it, because a name painted across a slider's track cannot be read. The
   * LVGL emitter offsets its object by exactly this, so these numbers are the
   * contract between the two renderers.
   */
  it('takes the caption strip out of the widget, and refuses a box too short to hold both', () => {
    const on = widget({ label: 'Volume', properties: { showLabel: true } })
    const layout = displayWidgetCaptionLayout(on, 16, on.bounds.height)!
    expect(layout).toMatchObject({ text: 'Volume', fontSize: 12, height: 14, gap: 2, offset: 16 })
    expect(displayWidgetContentBounds(on, 16)).toEqual({ x: 8, y: 24, width: 120, height: 32 })

    // Uncaptioned, the widget keeps every pixel it was given.
    expect(displayWidgetContentBounds(widget({ label: 'Volume' }), 16)).toEqual(on.bounds)

    // Too short for a caption and a widget both: no caption on either side,
    // rather than one renderer squeezing and the other overlapping.
    const squeezed = widget({ label: 'Volume', properties: { showLabel: true }, bounds: { x: 0, y: 0, width: 120, height: 20 } })
    expect(displayWidgetCaptionLayout(squeezed, 16, squeezed.bounds.height)).toBeNull()
    expect(displayWidgetContentBounds(squeezed, 16)).toEqual(squeezed.bounds)

    // Asked without a box — the font pass, which needs the size whether or
    // not this particular widget ends up drawing it.
    expect(displayWidgetCaptionLayout(on, 16)).not.toBeNull()
  })

  it('sizes every touch target for a finger and grows its hit region past the track it paints', () => {
    for (const type of DISPLAY_WIDGET_TYPES) {
      const touch = DISPLAY_WIDGET_LIBRARY[type].minimumTouchSize
      expect(isDisplayTouchTarget(type)).toBe(touch !== undefined)
      if (!touch) continue
      expect(Math.min(touch.width, touch.height)).toBeGreaterThanOrEqual(DISPLAY_TOUCH_TARGET_MIN_PX)
    }

    expect(displayControlHitBounds(widget())).toEqual({ x: 8, y: 8, width: 120, height: 48 })
    expect(displayControlHitBounds(widget({ bounds: { x: 40, y: 40, width: 60, height: 20 } })))
      .toEqual({ x: 22, y: 26, width: 96, height: 48 })
    expect(displayControlHitBounds(widget()).height).toBeGreaterThan(DISPLAY_CONTROL_TRACK_PX)
    expect(displayControlHitBounds(widget({ type: 'Text', bounds: { x: 0, y: 0, width: 48, height: 20 } })))
      .toEqual({ x: 0, y: 0, width: 48, height: 20 })
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

  /*
   * Which widgets are controls is derived from the `out` role rather than
   * listed, so a fifth control joins every "a control with no connection is
   * inert" rule for free. The four are named here so the *set* stays a
   * decision: a widget that grows an output later fails this until someone has
   * looked at what that means for the inert rules and for the Connected group.
   */
  it('counts exactly the widgets with an out port as controls', () => {
    const controls = Object.values(DISPLAY_WIDGET_LIBRARY)
      .filter((definition) => displayWidgetIsControl(definition.type))
      .map((definition) => definition.type)
      .sort()
    expect(controls).toEqual(['Button', 'Dial', 'Slider', 'Toggle'])

    // And it is the port that decides, not the name: a readout with an input
    // role only is not a control however finger-like it looks.
    expect(displayWidgetIsControl('Progress')).toBe(false)
    expect(displayWidgetIsControl('Image/Icon')).toBe(false)
  })
})

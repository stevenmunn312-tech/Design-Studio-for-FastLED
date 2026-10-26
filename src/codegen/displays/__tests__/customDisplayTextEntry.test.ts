import { describe, expect, it } from 'vitest'
import {
  CUSTOM_DISPLAY_LVGL_TEXT_ENTRY_CPP,
  customDisplayLvglGlobalCpp,
  customDisplayLvglLoopCpp,
  customDisplayLvglOutputExpression,
  customDisplayLvglSetupCpp,
  customDisplayNeedsKeyboard,
} from '../customDisplayLvglCpp'
import { addDisplayWidget, createDisplayDocument, updateDisplayWidget } from '../../../state/displays/displayEditor'
import { customDisplayFontSizes } from '../../../state/displays/customDisplayResources'
import {
  DISPLAY_KEYBOARD_FONT_SIZE,
  DISPLAY_TEXT_ENTRY_MAX_BYTES,
  displayTextEntryClamp,
  displayTextEntryMaxLength,
  displayTextEntryStart,
  displayWidgetPorts,
} from '../../../state/displays/displayRegistry'
import { normalizeDisplayDocument } from '../../../state/displays/displayDocument'
import { generateCpp } from '../../cppGenerator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function entryDocument(text = 'Kitchen') {
  let document = createDisplayDocument('screen', 240, 320)
  document = addDisplayWidget(document, 'Text Entry')
  document = updateDisplayWidget(document, 'text-entry', (widget) => ({
    ...widget, properties: { ...widget.properties, text, fontSize: 20 },
  }))
  return document
}

describe('Text Entry widget', () => {
  it('outputs text and takes an optional Set', () => {
    const ports = displayWidgetPorts({ id: 'name', type: 'Text Entry', label: 'Name' })
    expect(ports.map((port) => [port.role, port.direction, port.dataType])).toEqual([
      ['out', 'output', 'string'],
      ['set', 'input', 'string'],
    ])
  })

  it('holds typed text to its maximum length and the firmware buffer', () => {
    const widget = { properties: { maxLength: 5 } }
    expect(displayTextEntryClamp(widget, 'hello world')).toBe('hello')
    expect(displayTextEntryClamp(widget, 'a\nb')).toBe('a b')
    const roomy = { properties: { maxLength: 999 } }
    expect(displayTextEntryMaxLength(roomy)).toBe(DISPLAY_TEXT_ENTRY_MAX_BYTES)
    // Cut on a whole character, never inside one.
    const wide = displayTextEntryClamp(roomy, 'é'.repeat(200))
    expect(new TextEncoder().encode(wide).length).toBeLessThanOrEqual(DISPLAY_TEXT_ENTRY_MAX_BYTES)
    expect(wide).toBe('é'.repeat(Math.floor(DISPLAY_TEXT_ENTRY_MAX_BYTES / 2)))
    expect(displayTextEntryStart({ properties: { text: 'Hi', maxLength: 1 } })).toBe('H')
  })

  it('survives a save', () => {
    const saved = normalizeDisplayDocument(JSON.parse(JSON.stringify(entryDocument())))!
    expect(saved.widgets[0]).toMatchObject({ type: 'Text Entry', properties: { text: 'Kitchen', fontSize: 20 } })
  })

  it('builds a textarea, one shared keyboard and its own font sizes', () => {
    const document = entryDocument()
    const emit = { id: 'screen', document }
    const globals = customDisplayLvglGlobalCpp(emit)
    expect(globals).toContain('// FLS-LVGL-WIDGETS:keyboard')
    expect(globals).toContain('static lv_obj_t *_cdKeyboard_screen = nullptr;')
    expect(customDisplayFontSizes(document)).toEqual(expect.arrayContaining([DISPLAY_KEYBOARD_FONT_SIZE, 20]))
    const setup = customDisplayLvglSetupCpp(emit).join('\n')
    expect(setup).toContain('_cd_screen[0].object = lv_textarea_create(_cdScreen_screen);')
    expect(setup).toContain('lv_textarea_set_one_line(_cd_screen[0].object, true);')
    expect(setup).toContain('lv_textarea_set_placeholder_text(_cd_screen[0].object, "Tap to type");')
    expect(setup).toContain('lv_obj_add_event_cb(_cd_screen[0].object, _cdEntryEvent, LV_EVENT_ALL, _cdKeyboard_screen);')
    expect(setup).toContain('_cdSetEntry(_cd_screen[0], "Kitchen");')
    // The keyboard exists before the field that names it.
    expect(setup.indexOf('_cdKeyboard_screen = lv_keyboard_create')).toBeLessThan(setup.indexOf('lv_textarea_create'))
    expect(customDisplayLvglOutputExpression(emit, 'text-entry')).toBe('_cdTextOutput(_cd_screen[0])')
  })

  it('takes a Set only while nobody is typing', () => {
    const emit = { id: 'screen', document: entryDocument(), bindings: { 'text-entry': [{ role: 'set' as const, expression: 'n_name_text' }] } }
    expect(customDisplayLvglLoopCpp(emit)).toEqual([
      '  if (!_cdSyncHeld(_cd_screen[0])) _cdSetEntry(_cd_screen[0], n_name_text);',
    ])
  })

  it('costs nothing in a design without one', () => {
    const document = addDisplayWidget(createDisplayDocument('screen', 240, 320), 'Slider')
    expect(customDisplayNeedsKeyboard(document)).toBe(false)
    expect(customDisplayLvglGlobalCpp({ id: 'screen', document })).not.toContain('FLS-LVGL-WIDGETS')
  })
})

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, ports: { inputs?: unknown[]; outputs?: unknown[] } = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: ports.inputs ?? [], outputs: ports.outputs ?? [] },
  } as unknown as StudioNode
}

describe('normal sketch with a Text Entry', () => {
  it('reads the confirmed text into a string the graph can use', () => {
    let document = entryDocument()
    document = addDisplayWidget(document, 'Text')
    const panel = node('tft', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', tftLayout: 'Custom design', displayId: 'screen',
      sckPin: 18, mosiPin: 23, misoPin: 19, csPin: 5, dcPin: 16, resetPin: 17, backlightPin: 4,
      touchCsPin: 15, touchIrqPin: 2, touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19, enabled: true,
    }, {
      inputs: [{ id: 'display', label: 'Display', dataType: 'display' }, { id: 'enabled', label: 'Enabled', dataType: 'bool' },
        { id: 'widget:text:value', label: 'Text', dataType: 'string' }],
    })
    const touch = node('tft-touch', 'TouchInput', { panelId: 'tft' }, {
      outputs: [{ id: 'controls', label: 'Controls', dataType: 'playercontrols' },
        { id: 'widget:text-entry:out', label: 'Text Entry', dataType: 'string' }],
    })
    const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' })
    const edges = [{ id: 'e', source: 'tft-touch', sourceHandle: 'widget:text-entry:out', target: 'tft', targetHandle: 'widget:text:value' }] as unknown as StudioEdge[]
    const src = generateCpp([output, panel, touch], edges, {}, { displayDocuments: { screen: document } })
    expect(src).toContain('const char * n_tft_touch_widget_text_entry_out = _cdTextOutput(_cd_screen[0]);')
    expect(src).toContain('_cdSetText(_cd_screen[1], n_tft_touch_widget_text_entry_out);')
    expect(src).toContain(CUSTOM_DISPLAY_LVGL_TEXT_ENTRY_CPP.split('\n')[1])
  })
})

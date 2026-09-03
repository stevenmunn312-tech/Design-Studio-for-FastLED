import { describe, expect, it } from 'vitest'
import {
  CUSTOM_DISPLAY_LVGL_HELPERS,
  CUSTOM_DISPLAY_LVGL_INCLUDE,
  CUSTOM_DISPLAY_LVGL_FORWARD,
  CUSTOM_DISPLAY_LVGL_TIMING_CPP,
  customDisplayLvglGlobalCpp,
  customDisplayLvglLoopCpp,
  customDisplayLvglOutputExpression,
  customDisplayLvglSetupCpp,
  customDisplayLvglTimingLoopCpp,
  customDisplayLvglTimingSetupCpp,
  type CustomDisplayLvglEmit,
} from '../customDisplayLvglCpp'
import { createDisplayDocument } from '../../state/displayEditor'
import {
  DISPLAY_WIDGET_LIBRARY,
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
} from '../../state/displayRegistry'
import { DISPLAY_WIDGET_TYPES, type DisplayDocument, type DisplayWidget } from '../../state/displayDocument'
import { customDisplayAssetByteLength, customDisplayAssetRequests } from '../../state/customDisplayResources'
import { customDisplayAssetsCpp } from '../customDisplayAssetsCpp'

function widget(type: DisplayWidget['type'], index: number): DisplayWidget {
  return {
    id: `${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
    type,
    label: type,
    bounds: { ...defaultDisplayWidgetBounds(type), x: index * 2, y: index * 3 },
    properties: defaultDisplayWidgetProperties(type),
  }
}

function document(widgets: DisplayWidget[]): DisplayDocument {
  return { ...createDisplayDocument('panel', 320, 240), widgets }
}

function emitted(emit: CustomDisplayLvglEmit): string {
  return [
    CUSTOM_DISPLAY_LVGL_INCLUDE,
    CUSTOM_DISPLAY_LVGL_FORWARD,
    CUSTOM_DISPLAY_LVGL_HELPERS,
    CUSTOM_DISPLAY_LVGL_TIMING_CPP,
    ...(emit.assets ? [customDisplayAssetsCpp(emit.id, emit.document, emit.assets)] : []),
    customDisplayLvglGlobalCpp(emit),
    ...customDisplayLvglSetupCpp(emit),
    ...customDisplayLvglLoopCpp(emit),
  ].join('\n')
}

describe('custom Display LVGL object emitter', () => {
  it('creates every registered widget in deterministic document order', () => {
    const widgets = DISPLAY_WIDGET_TYPES.map(widget)
    const emit = { id: 'panel', document: document(widgets) }
    const first = emitted(emit)
    const second = emitted(emit)

    expect(first).toBe(second)
    expect(first.match(/\.object = lv_/g)).toHaveLength(DISPLAY_WIDGET_TYPES.length)
    for (const definition of Object.values(DISPLAY_WIDGET_LIBRARY)) {
      expect(definition.lvglEmitter).toBeTruthy()
    }
    expect(first.indexOf('_cd_panel[0].object')).toBeLessThan(first.indexOf('_cd_panel[12].object'))
  })

  it('emits exact bounds plus solid and gradient screen styles', () => {
    const item = widget('Text', 0)
    item.bounds = { x: 11, y: 17, width: 101, height: 29 }
    const solid = emitted({ id: 'panel', document: document([item]) })
    expect(solid).toContain('lv_obj_set_pos(_cd_panel[0].object, 11, 17);')
    expect(solid).toContain('lv_obj_set_size(_cd_panel[0].object, 101, 29);')
    expect(solid).toContain('lv_color_hex(0x080B12)')

    const gradientDocument = document([item])
    gradientDocument.theme = {
      ...gradientDocument.theme,
      background: { kind: 'gradient', startColor: '#112233', endColor: '#445566', direction: 'vertical' },
    }
    const gradient = emitted({ id: 'panel', document: gradientDocument })
    expect(gradient).toContain('lv_color_hex(0x112233)')
    expect(gradient).toContain('lv_color_hex(0x445566)')
    expect(gradient).toContain('LV_GRAD_DIR_VER')
  })

  it('emits only used font sizes and assigns the nearest pinned bitmap font', () => {
    const item = widget('Text', 0)
    item.properties.fontSize = 23
    const source = emitted({ id: 'panel', document: document([item]) })
    expect(source).toContain('// FLS-LVGL-FONTS:22')
    expect(source).toContain('lv_obj_set_style_text_font(_cd_panel[0].object, &lv_font_montserrat_22')
    expect(source).not.toContain('lv_font_montserrat_24')
  })

  it('uses baked images for the background, image widgets and control icons', () => {
    const art = widget('Image/Icon', 0)
    art.bounds = { x: 8, y: 8, width: 24, height: 24 }
    art.properties = { assetId: 'icon:power', tint: true, tintColor: '#123456' }
    const button = widget('Button', 1)
    button.properties = { text: 'Go', assetId: 'icon:queue', presentation: 'icon' }
    const doc = document([art, button])
    doc.theme.background = { kind: 'image', assetId: 'background:01-neon-orbit:320x240' }
    const assets = customDisplayAssetRequests(doc).map((request) => ({
      ...request, data: new Uint8Array(customDisplayAssetByteLength(request)),
    }))
    const source = emitted({ id: 'panel-name', document: doc, assets })

    expect(source).toContain('uint8_t _cdAsset_panel_name_0_map[] PROGMEM')
    expect(source).toContain('.cf = LV_COLOR_FORMAT_RGB565')
    expect(source).toContain('.cf = LV_COLOR_FORMAT_A8')
    expect(source).toContain('.cf = LV_COLOR_FORMAT_RGB565A8')
    expect(source).toContain('lv_image_set_src(_cdBackground_panel_name, &_cdAsset_panel_name_0);')
    expect(source).toContain('lv_image_set_src(_cd_panel_name[0].object, &_cdAsset_panel_name_1);')
    expect(source).toContain('lv_obj_set_style_image_recolor(_cd_panel_name[0].object, lv_color_hex(0x123456)')
    expect(source).toContain('lv_image_set_src(_cdImage_panel_name_1, &_cdAsset_panel_name_2);')
    expect(source).not.toContain('lv_label_set_text(_cdLabel_panel_name_1')
    // Neither catalogue ids nor labels are ever C++ declaration material.
    expect(source).not.toContain('_icon:power')
  })

  it('refuses missing or wrong-sized asset data before emitting a table', () => {
    const art = widget('Image/Icon', 0)
    art.bounds = { x: 0, y: 0, width: 2, height: 2 }
    art.properties = { assetId: 'icon:power', tint: true, tintColor: '#ffffff' }
    const doc = document([art])
    const request = customDisplayAssetRequests(doc)[0]

    expect(() => customDisplayAssetsCpp('panel', doc, [])).toThrow('has not been baked')
    expect(() => customDisplayAssetsCpp('panel', doc, [{
      ...request, data: new Uint8Array(3),
    }])).toThrow('produced 3 bytes; 4 are required')
  })

  it('uses one bounded runtime cache and no allocating Arduino String', () => {
    const source = emitted({ id: 'panel', document: document([widget('Text', 0)]) })
    expect(source).toContain('char text[CD_TEXT_BYTES];')
    expect(source).toContain('char nextText[CD_TEXT_BYTES];')
    expect(source).toContain('#define CD_TEXT_BYTES 64')
    expect(source).toContain('strncmp(runtime.text, value, CD_TEXT_BYTES) == 0')
    expect(source).not.toMatch(/\bString\b/)
  })

  it('declares its helper struct before Arduino can hoist function prototypes', () => {
    const source = emitted({ id: 'panel', document: document([widget('Text', 0)]) })
    expect(source.indexOf(CUSTOM_DISPLAY_LVGL_FORWARD)).toBeLessThan(source.indexOf('static void _cdCopy'))
    expect(source).toContain('struct CustomDisplayWidgetRuntime {')
  })

  it('attaches one generic bounded callback to all four control types', () => {
    const controls = ['Button', 'Toggle', 'Slider', 'Dial'].map((type, index) => widget(type as never, index))
    const source = emitted({ id: 'panel', document: document(controls) })
    expect(source.match(/lv_obj_add_event_cb/g)).toHaveLength(4)
    expect(source).toContain('code == LV_EVENT_PRESSED')
    expect(source).toContain('code == LV_EVENT_VALUE_CHANGED')
    expect(source).toContain('code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST')
    expect(source).toContain('roundf((value - runtime->minimum) / runtime->step)')
  })

  it('resolves bindings by stable widget role and updates only on change', () => {
    const text = widget('Text', 0)
    const progress = widget('Progress', 1)
    const toggle = widget('Toggle', 2)
    const slider = widget('Slider', 3)
    const emit: CustomDisplayLvglEmit = {
      id: 'panel',
      document: document([text, progress, toggle, slider]),
      bindings: {
        [text.id]: [{ role: 'value', expression: 'n_title_text' }],
        [progress.id]: [{ role: 'value', expression: 'n_progress_out' }],
        [toggle.id]: [{ role: 'set', expression: 'n_enabled_out' }],
        [slider.id]: [{ role: 'set', expression: 'n_level_out' }],
      },
    }
    const loop = customDisplayLvglLoopCpp(emit).join('\n')
    expect(loop).toContain('_cdSetText(_cd_panel[0], n_title_text);')
    expect(loop).toContain('_cdSetInteger(_cd_panel[1], _cdScaled((float)(n_progress_out), 0.0f, 1.0f));')
    expect(loop).toContain('if (!_cd_panel[2].touchOwned && !_cd_panel[2].touchPending) _cdSetChecked(_cd_panel[2], (bool)(n_enabled_out));')
    expect(loop).toContain('if (!_cd_panel[3].touchOwned && !_cd_panel[3].touchPending) {')
    expect(loop).toContain('_cdSetInteger(_cd_panel[3], _cdScaled(_cd_panel[3].floatValue')
  })

  it('publishes touch values by index without turning widget ids into C++ identifiers', () => {
    const button = widget('Button', 0)
    button.id = 'play-next'
    button.label = 'Play "next"\nnow'
    button.properties.text = 'Say "go"?'
    const emit = { id: 'panel-1', document: document([button]) }
    const source = emitted(emit)

    expect(customDisplayLvglOutputExpression(emit, 'play-next')).toBe('_cdBoolOutput(_cd_panel_1[0])')
    expect(source).toContain('"Say \\"go\\"\\?"')
    expect(source).not.toContain('_play-next')
    expect(customDisplayLvglOutputExpression(emit, 'missing')).toBeNull()
  })

  it('preserves a quick control intent until graph code samples it, then restores wired state', () => {
    const toggle = widget('Toggle', 0)
    const emit: CustomDisplayLvglEmit = {
      id: 'panel',
      document: document([toggle]),
      bindings: { [toggle.id]: [{ role: 'set', expression: 'n_enabled' }] },
    }
    const source = emitted(emit)

    expect(source).toContain('runtime->touchPending = true;')
    expect(customDisplayLvglOutputExpression(emit, toggle.id)).toBe('_cdBoolOutput(_cd_panel[0])')
    expect(source).toContain('runtime.touchPending = false;')
    expect(source).toContain('if (!_cd_panel[0].touchOwned && !_cd_panel[0].touchPending)')
    expect(source).toContain('if (!_cd_panel[0].touchOwned) _cd_panel[0].touchPending = false;')
  })

  it('keeps setup valid for an empty document', () => {
    const source = emitted({ id: 'panel', document: document([]) })
    expect(source).toContain('CustomDisplayWidgetRuntime _cd_panel[1]')
    expect(source).toContain('lv_screen_load(_cdScreen_panel);')
  })

  it('services LVGL from monotonic milliseconds rather than LED frame count', () => {
    expect(CUSTOM_DISPLAY_LVGL_TIMING_CPP).toContain('lv_tick_set_cb(_cdMonotonicMillis);')
    expect(CUSTOM_DISPLAY_LVGL_TIMING_CPP).toContain('(uint32_t)(now - _cdLastHandlerMs)')
    expect(CUSTOM_DISPLAY_LVGL_TIMING_CPP).toContain('lv_timer_handler();')
    expect(CUSTOM_DISPLAY_LVGL_TIMING_CPP).not.toContain('lv_tick_inc')
    expect(customDisplayLvglTimingSetupCpp()).toBe('  _cdBeginTiming();')
    expect(customDisplayLvglTimingLoopCpp()).toBe('  _cdServiceLvgl();')
  })
})

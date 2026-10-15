import { describe, expect, it } from 'vitest'
import type { DisplayDocument, DisplayWidget, PlacedDisplayWidget } from '../displayDocument'
import {
  DISPLAY_GAUGE_PAD_PX,
  DISPLAY_PICKER_HUE_MAX,
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
  displayColorHue,
  displayControlOutput,
  displayControlSetState,
  displayGaugeGeometry,
  displayHueColor,
  displayPickerHueAt,
  displayPickerStartHue,
  displayPickerStops,
  displayWidgetFormatsNumber,
  displayWidgetIsControl,
  displayWidgetIsNumericControl,
  displayWidgetPorts,
  displayWidgetValidationIssues,
} from '../displayRegistry'
import { createDisplayDocument } from '../displayEditor'
import { resolveDisplayThemeTokens } from '../displayTheme'
import { customDisplayFontSizes } from '../customDisplayResources'
import { initialDisplayControlValue } from '../../../components/DisplayEditor/displayRunPreview'
import {
  CUSTOM_DISPLAY_LVGL_HELPERS,
  CUSTOM_DISPLAY_LVGL_HUE_COLOR_CPP,
  customDisplayLvglLoopCpp,
  customDisplayLvglOutputExpression,
  customDisplayLvglSetupCpp,
  customDisplayLvglTapExpression,
  type CustomDisplayLvglEmit,
} from '../../../codegen/displays/customDisplayLvglCpp'
import { customDisplaySampleCpp } from '../../../codegen/displays/customDisplayControlGraph'

function widget(
  type: 'Colour Picker' | 'Arc Gauge',
  properties: DisplayWidget['properties'] = {},
  bounds = defaultDisplayWidgetBounds(type),
): PlacedDisplayWidget {
  return {
    id: type === 'Colour Picker' ? 'hue' : 'level',
    type,
    label: type,
    bounds,
    properties: { ...defaultDisplayWidgetProperties(type), ...properties },
  }
}

function document(widgets: DisplayWidget[]): DisplayDocument {
  return { ...createDisplayDocument('panel', 320, 240), widgets }
}

describe('Colour Picker hue', () => {
  it('turns a hue into the six-sector HSV colour, red at both ends', () => {
    expect(displayHueColor(0, 1, 1)).toEqual({ r: 255, g: 0, b: 0 })
    expect(displayHueColor(60, 1, 1)).toEqual({ r: 255, g: 255, b: 0 })
    expect(displayHueColor(120, 1, 1)).toEqual({ r: 0, g: 255, b: 0 })
    expect(displayHueColor(180, 1, 1)).toEqual({ r: 0, g: 255, b: 255 })
    expect(displayHueColor(240, 1, 1)).toEqual({ r: 0, g: 0, b: 255 })
    expect(displayHueColor(300, 1, 1)).toEqual({ r: 255, g: 0, b: 255 })
    expect(displayHueColor(360, 1, 1)).toEqual({ r: 255, g: 0, b: 0 })
    // Halfway between two pure hues, as the strip's gradient shows it.
    expect(displayHueColor(30, 1, 1)).toEqual({ r: 255, g: 128, b: 0 })
  })

  it('applies saturation and brightness', () => {
    expect(displayHueColor(200, 0, 1)).toEqual({ r: 255, g: 255, b: 255 })
    expect(displayHueColor(0, 1, 0.5)).toEqual({ r: 128, g: 0, b: 0 })
    expect(displayHueColor(0, 0.5, 1)).toEqual({ r: 255, g: 128, b: 128 })
  })

  it('reads back the hue of every colour it makes, and 0 for a grey', () => {
    for (let hue = 0; hue < DISPLAY_PICKER_HUE_MAX; hue++) {
      const back = displayColorHue(displayHueColor(hue, 1, 1))
      // Eight-bit channels put a hue within a degree of where it started.
      const error = Math.min(Math.abs(back - hue), DISPLAY_PICKER_HUE_MAX - Math.abs(back - hue))
      expect(error).toBeLessThanOrEqual(1)
    }
    expect(displayColorHue({ r: 90, g: 90, b: 90 })).toBe(0)
    expect(displayColorHue({ r: 0, g: 0, b: 0 })).toBe(0)
  })

  it('draws its strip from seven stops 60 degrees apart, at its own tone', () => {
    const dim = widget('Colour Picker', { brightness: 0.5 })
    const stops = displayPickerStops(dim)
    expect(stops).toHaveLength(7)
    expect(stops[0]).toEqual(stops[6])
    expect(stops[2]).toEqual({ r: 0, g: 128, b: 0 })
  })

  it('maps a point across the strip to whole degrees, held at its ends', () => {
    expect(displayPickerHueAt(0, 0, 180)).toBe(0)
    expect(displayPickerHueAt(90, 0, 180)).toBe(180)
    expect(displayPickerHueAt(500, 0, 180)).toBe(360)
    expect(displayPickerHueAt(-5, 0, 180)).toBe(0)
  })
})

describe('Colour Picker as a control', () => {
  const picker = widget('Colour Picker', { initial: 120 })

  it('outputs a colour and takes an optional colour on Set', () => {
    const ports = displayWidgetPorts(picker)
    expect(ports.map((port) => [port.role, port.direction, port.dataType, port.optional ?? false])).toEqual([
      ['out', 'output', 'color', false],
      ['set', 'input', 'color', true],
    ])
    expect(displayWidgetIsControl(picker.type)).toBe(true)
    // Its state is a hue, but what it publishes is a colour, not a number.
    expect(displayWidgetIsNumericControl(picker.type)).toBe(false)
  })

  it('holds a hue and reports the colour at its tone', () => {
    expect(displayPickerStartHue(picker)).toBe(120)
    expect(initialDisplayControlValue(picker)).toBe(120)
    expect(displayControlOutput(picker, 240)).toEqual({ r: 0, g: 0, b: 255 })
    expect(displayControlOutput(widget('Colour Picker', { saturation: 0 }), 240)).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('reads a colour on Set as the hue it moves to, and leaves other controls alone', () => {
    expect(displayControlSetState(picker, { r: 0, g: 255, b: 255 })).toBe(180)
    expect(displayControlSetState({ type: 'Slider' }, 0.5)).toBe(0.5)
    expect(displayControlOutput({ type: 'Slider', properties: {} }, 0.5)).toBe(0.5)
  })

  it('warns that zero brightness is black, and wants a touch-sized strip', () => {
    const messages = (entry: DisplayWidget) => displayWidgetValidationIssues(entry, 'touch-tft').map((issue) => issue.message)
    expect(messages(picker)).toEqual([])
    expect(messages(widget('Colour Picker', { brightness: 0 }))).toContain('Brightness 0 picks black whatever the hue.')
    expect(messages(widget('Colour Picker', {}, { x: 0, y: 0, width: 100, height: 24 })).some((message) => message.includes('touch target'))).toBe(true)
  })
})

describe('Arc Gauge', () => {
  it('takes one number and formats it with the shared number formatter', () => {
    const gauge = widget('Arc Gauge')
    expect(displayWidgetPorts(gauge).map((port) => [port.role, port.direction, port.dataType])).toEqual([['value', 'input', 'float']])
    expect(displayWidgetIsControl(gauge.type)).toBe(false)
    expect(displayWidgetFormatsNumber('Arc Gauge')).toBe(true)
    expect(displayWidgetFormatsNumber('Numeric Readout')).toBe(true)
    expect(displayWidgetFormatsNumber('Value Meter')).toBe(false)
  })

  it('sits its ring inside the border and padding, as wide as the shorter side', () => {
    expect(displayGaugeGeometry(120, 100, 1)).toEqual({ inset: 1 + DISPLAY_GAUGE_PAD_PX, size: 90, stroke: 9 })
    // A small ring keeps a stroke worth seeing.
    expect(displayGaugeGeometry(40, 40, 2)).toEqual({ inset: 6, size: 28, stroke: 3 })
  })

  it('reports an empty range', () => {
    const messages = displayWidgetValidationIssues(widget('Arc Gauge', { min: 5, max: 5 }), 'touch-tft').map((issue) => issue.message)
    expect(messages).toContain('Maximum must be greater than minimum.')
  })

  it('pins a font face only while it shows its number', () => {
    const fontSize = 28
    const shown = document([widget('Arc Gauge', { fontSize })])
    const hidden = document([widget('Arc Gauge', { fontSize, showValue: false })])
    expect(customDisplayFontSizes(shown)).toContain(28)
    expect(customDisplayFontSizes(hidden)).not.toContain(28)
  })
})

describe('Colour Picker and Arc Gauge on the glass', () => {
  const picker = widget('Colour Picker', { initial: 90, saturation: 0.5 }, { x: 0, y: 0, width: 182, height: 48 })
  const gauge = widget('Arc Gauge', { min: 0, max: 100, decimals: 0, suffix: '%' }, { x: 0, y: 60, width: 100, height: 100 })
  const emit: CustomDisplayLvglEmit = {
    id: 'panel',
    document: document([picker, gauge]),
    bindings: {
      [picker.id]: [{ role: 'set', expression: 'n_tint' }],
      [gauge.id]: [{ role: 'value', expression: 'n_level' }],
    },
  }
  const setup = customDisplayLvglSetupCpp(emit).join('\n')
  const loop = customDisplayLvglLoopCpp(emit).join('\n')
  const border = resolveDisplayThemeTokens(emit.document.theme).borderWidth

  it('builds the picker from six gradient segments and a marker, so lv_conf.h needs no new widget', () => {
    expect(setup).toContain('_cd_panel[0].object = lv_obj_create(_cdScreen_panel);')
    expect(setup.match(/lv_obj_t \*_cdHue_panel_0_\d = lv_obj_create\(_cd_panel\[0\]\.object\);/g)).toHaveLength(6)
    // Red to yellow at half saturation, as displayPickerStops gives the preview.
    expect(setup).toContain('lv_obj_set_style_bg_color(_cdHue_panel_0_0, lv_color_hex(0xFF8080), LV_PART_MAIN);')
    expect(setup).toContain('lv_obj_set_style_bg_grad_color(_cdHue_panel_0_0, lv_color_hex(0xFFFF80), LV_PART_MAIN);')
    expect(setup).toContain('lv_obj_set_style_bg_grad_dir(_cdHue_panel_0_5, LV_GRAD_DIR_HOR, LV_PART_MAIN);')
    expect(setup).toContain('lv_obj_t *_cdHueMarker_panel_0 = lv_obj_create(_cd_panel[0].object);')
    expect(setup).not.toMatch(/lv_(colorwheel|canvas)_/)
  })

  it('splits the strip evenly inside the border', () => {
    const width = 182 - 2 * border
    expect(setup).toContain(`lv_obj_set_pos(_cdHue_panel_0_1, ${Math.floor(width / 6)}, 0);`)
    expect(setup).toContain(`lv_obj_set_size(_cdHue_panel_0_5, ${width - Math.floor((5 * width) / 6)}, ${48 - 2 * border});`)
  })

  it('takes touch on the container, leaves the segments inert and seeds its hue', () => {
    expect(setup).toContain('_cd_panel[0].kind = 7;')
    expect(setup).toContain('lv_obj_add_event_cb(_cd_panel[0].object, _cdEvent, LV_EVENT_ALL, &_cd_panel[0]);')
    expect(setup).toContain('lv_obj_remove_flag(_cdHue_panel_0_0, LV_OBJ_FLAG_CLICKABLE);')
    expect(setup).toContain('lv_obj_remove_flag(_cdHueMarker_panel_0, LV_OBJ_FLAG_CLICKABLE);')
    expect(setup).toContain('lv_obj_update_layout(_cd_panel[0].object);\n  _cdSetHue(_cd_panel[0], 90.0f);')
  })

  it('moves to the hue of a Set colour only while no finger holds it', () => {
    expect(loop).toContain('if (!_cd_panel[0].touchOwned && !_cd_panel[0].touchPending) _cdSetHue(_cd_panel[0], _cdColorHue((uint32_t)(n_tint)));')
  })

  it('publishes a CRGB at its tone and is read on press and drag', () => {
    expect(customDisplayLvglOutputExpression(emit, picker.id)).toBe('_cdHueColor(_cdFloatOutput(_cd_panel[0]), 0.5f, 1.0f)')
    expect(customDisplayLvglTapExpression(emit, picker.id)).toBeNull()
    expect(CUSTOM_DISPLAY_LVGL_HELPERS).toContain('runtime->kind == 7 && (code == LV_EVENT_PRESSED || code == LV_EVENT_PRESSING)')
    expect(CUSTOM_DISPLAY_LVGL_HUE_COLOR_CPP).toContain('static CRGB _cdHueColor(float hue, float saturation, float value)')
    expect(CUSTOM_DISPLAY_LVGL_HELPERS).toContain('lv_obj_t *marker = lv_obj_get_child(runtime.object, 6);')
  })

  it('draws the gauge as an untouchable arc inset by border and padding', () => {
    expect(setup).toContain('_cd_panel[1].object = lv_arc_create(_cdScreen_panel);')
    expect(setup).toContain('lv_obj_remove_flag(_cd_panel[1].object, LV_OBJ_FLAG_CLICKABLE);')
    expect(setup).toContain(`lv_obj_set_style_pad_all(_cd_panel[1].object, ${border + DISPLAY_GAUGE_PAD_PX}, LV_PART_MAIN);`)
    expect(setup).toContain('lv_arc_set_bg_angles(_cd_panel[1].object, 135, 45);')
    const { stroke } = displayGaugeGeometry(100, 100, border)
    expect(setup).toContain(`lv_obj_set_style_arc_width(_cd_panel[1].object, ${stroke}, LV_PART_INDICATOR);`)
    expect(setup).not.toContain('_cd_panel[1].kind =')
    expect(setup).not.toContain('lv_obj_add_event_cb(_cd_panel[1].object')
  })

  it('shows its reading in a centred label, formatted as a Numeric Readout would be', () => {
    expect(setup).toContain('lv_obj_t *_cdGaugeValue_panel_1 = lv_label_create(_cd_panel[1].object);')
    expect(setup).toContain('_dsFormatNumber(_cd_panel[1].nextText, 0.0f, 0, 1, false, ')
    expect(loop).toContain('_cdSetInteger(_cd_panel[1], _cdScaled((float)(n_level), 0.0f, 100.0f));')
    expect(loop).toContain('_dsFormatNumber(_cd_panel[1].nextText, (double)(n_level), 0, 1, false, ')
    expect(loop).toContain('_cdSetChildText(_cd_panel[1], 0, _cd_panel[1].nextText);')
    expect(CUSTOM_DISPLAY_LVGL_HELPERS).toContain('lv_obj_check_type(runtime.object, &lv_arc_class)')
  })

  it('keeps its CRGB helper out of the shared block, so a screen-only build can drop FastLED', () => {
    expect(CUSTOM_DISPLAY_LVGL_HELPERS).not.toMatch(/\b(CRGB|CHSV|FastLED)\b/)
  })

  it('leaves out the label when the reading is hidden', () => {
    const quiet = { ...emit, document: document([widget('Arc Gauge', { showValue: false })]) }
    const lines = [...customDisplayLvglSetupCpp(quiet), ...customDisplayLvglLoopCpp({ ...quiet, bindings: { level: [{ role: 'value', expression: 'n_level' }] } })].join('\n')
    expect(lines).not.toContain('_cdGaugeValue_')
    expect(lines).not.toContain('_dsFormatNumber')
  })
})

describe('A colour widget output in the template control graph', () => {
  it('is read into a CRGB that rests at black while the panel is dark', () => {
    const sample = { type: 'color' as const, variable: 'n_touch_widget_hue_out', expression: '_cdHueColor(_cdFloatOutput(_cd_panel[0]), 1.0f, 1.0f)' }
    expect(customDisplaySampleCpp(sample, '_cdPanelOn_panel'))
      .toBe('  CRGB n_touch_widget_hue_out = _cdPanelOn_panel ? (_cdHueColor(_cdFloatOutput(_cd_panel[0]), 1.0f, 1.0f)) : CRGB::Black;')
    expect(customDisplaySampleCpp({ ...sample, type: 'float' }, null)).toBe(`  float n_touch_widget_hue_out = ${sample.expression};`)
  })
})

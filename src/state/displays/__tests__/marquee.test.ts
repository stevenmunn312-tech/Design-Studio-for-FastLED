import { describe, expect, it } from 'vitest'
import type { DisplayDocument, DisplayWidget, PlacedDisplayWidget } from '../displayDocument'
import {
  DISPLAY_MARQUEE_DEFAULT_SPEED,
  DISPLAY_MARQUEE_MAX_SPEED,
  DISPLAY_MARQUEE_MIN_SPEED,
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
  displayMarqueeSpeed,
  displayWidgetIsControl,
  displayWidgetPorts,
} from '../displayRegistry'
import { createDisplayDocument } from '../displayEditor'
import { customDisplayFontSizes } from '../customDisplayResources'
import {
  CUSTOM_DISPLAY_LVGL_HELPERS,
  customDisplayLvglLoopCpp,
  customDisplayLvglSetupCpp,
  type CustomDisplayLvglEmit,
} from '../../../codegen/displays/customDisplayLvglCpp'

function marquee(properties: DisplayWidget['properties'] = {}): PlacedDisplayWidget {
  return {
    id: 'ticker',
    type: 'Marquee',
    label: 'Marquee',
    bounds: { ...defaultDisplayWidgetBounds('Marquee'), x: 0, y: 0, width: 200, height: 32 },
    properties: { ...defaultDisplayWidgetProperties('Marquee'), ...properties },
  }
}

function document(widgets: DisplayWidget[]): DisplayDocument {
  return { ...createDisplayDocument('panel', 320, 240), widgets }
}

describe('Marquee', () => {
  it('reads one line of text, as Text does, and takes no touch', () => {
    const ports = displayWidgetPorts(marquee())
    expect(ports).toHaveLength(1)
    expect(ports[0]).toMatchObject({ direction: 'input', dataType: 'string' })
    expect(displayWidgetIsControl('Marquee')).toBe(false)
  })

  it("travels at LVGL's own label scroll speed unless set, held inside the inspector's range", () => {
    expect(DISPLAY_MARQUEE_DEFAULT_SPEED).toBe(40)
    expect(displayMarqueeSpeed(marquee())).toBe(40)
    expect(displayMarqueeSpeed(marquee({ speed: 72.4 }))).toBe(72)
    expect(displayMarqueeSpeed(marquee({ speed: 0 }))).toBe(DISPLAY_MARQUEE_MIN_SPEED)
    expect(displayMarqueeSpeed(marquee({ speed: 9000 }))).toBe(DISPLAY_MARQUEE_MAX_SPEED)
    expect(displayMarqueeSpeed(marquee({ speed: 'fast' }))).toBe(40)
  })

  it('pins the font face its text is drawn in', () => {
    expect(customDisplayFontSizes(document([marquee({ fontSize: 28 })]))).toEqual([28])
  })
})

describe('Marquee on the glass', () => {
  const ticker = marquee({ text: 'Doors open at 8', speed: 60, color: '#ffcc00', fontSize: 20 })
  const emit = (bound: boolean): CustomDisplayLvglEmit => ({
    id: 'panel',
    document: document([ticker]),
    bindings: bound ? { [ticker.id]: [{ role: 'value', expression: 'n_news' }] } : {},
  })
  const setup = customDisplayLvglSetupCpp(emit(false)).join('\n')

  it('moves a label inside a plain container, so lv_conf.h needs no new widget', () => {
    expect(setup).toContain('_cd_panel[0].object = lv_obj_create(_cdScreen_panel);')
    expect(setup).toContain('lv_obj_t *_cdMarqueeText_panel_0 = lv_label_create(_cd_panel[0].object);')
    expect(setup).toContain('lv_obj_set_style_text_font(_cdMarqueeText_panel_0, &lv_font_montserrat_20, LV_PART_MAIN);')
    expect(setup).toContain('lv_obj_set_style_text_color(_cdMarqueeText_panel_0, lv_color_hex(0xFFCC00), LV_PART_MAIN);')
    // LVGL's own circular scroll leaves text that fits standing still.
    expect(setup).not.toContain('LV_LABEL_LONG_MODE_SCROLL')
  })

  it('clips the text to its box, draws the border over it and grows no scrollbar', () => {
    expect(setup).toContain('lv_obj_remove_flag(_cd_panel[0].object, LV_OBJ_FLAG_SCROLLABLE);')
    expect(setup).toContain('lv_obj_remove_flag(_cd_panel[0].object, LV_OBJ_FLAG_CLICKABLE);')
    expect(setup).toContain('lv_obj_set_style_clip_corner(_cd_panel[0].object, true, LV_PART_MAIN);')
    expect(setup).toContain('lv_obj_set_style_border_post(_cd_panel[0].object, true, LV_PART_MAIN);')
    expect(setup).not.toContain('_cd_panel[0].kind =')
  })

  it('starts its authored text at the left edge, at its own speed', () => {
    expect(setup).toContain('lv_obj_align(_cdMarqueeText_panel_0, LV_ALIGN_LEFT_MID, 0, 0);')
    expect(setup).toContain('_cdSetMarquee(_cd_panel[0], "Doors open at 8", 60);')
  })

  it('carries graph text on at the same speed', () => {
    expect(customDisplayLvglLoopCpp(emit(true)).join('\n')).toContain('_cdSetMarquee(_cd_panel[0], n_news, 60);')
  })

  it('runs from the inner right edge until the text has gone, and keeps its place through new text', () => {
    expect(CUSTOM_DISPLAY_LVGL_HELPERS).toContain('int32_t from = lv_obj_get_content_width(runtime.object);')
    expect(CUSTOM_DISPLAY_LVGL_HELPERS).toContain('int32_t to = -lv_obj_get_width(label);')
    expect(CUSTOM_DISPLAY_LVGL_HELPERS).toContain('lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);')
    expect(CUSTOM_DISPLAY_LVGL_HELPERS)
      .toContain('if (at < from && at > to) a.act_time = (int32_t)((uint32_t)(from - at) * 1000u / speed);')
  })
})

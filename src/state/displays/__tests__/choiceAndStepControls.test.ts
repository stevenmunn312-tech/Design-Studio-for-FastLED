import { describe, expect, it } from 'vitest'
import type { DisplayDocument, DisplayWidget, PlacedDisplayWidget } from '../displayDocument'
import {
  DISPLAY_CHOICE_MAX_OPTIONS,
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
  displayChoiceOptions,
  displayControlRange,
  displayControlStartValue,
  displayStepDecimals,
  displayStepKeyWidth,
  displayWidgetIsNumericControl,
  displayWidgetIsRangedControl,
  displayWidgetValidationIssues,
} from '../displayRegistry'
import { createDisplayDocument } from '../displayEditor'
import { displayControlIsUnconfigured } from '../../player/wireFirstControls'
import {
  choiceIndexFromPoint,
  initialDisplayControlValue,
  stepDirectionFromPoint,
  stepDisplayControlValue,
} from '../../../components/DisplayEditor/displayRunPreview'
import {
  CUSTOM_DISPLAY_LVGL_HELPERS,
  customDisplayLvglLoopCpp,
  customDisplayLvglOutputExpression,
  customDisplayLvglSetupCpp,
  customDisplayLvglTapExpression,
  type CustomDisplayLvglEmit,
} from '../../../codegen/displays/customDisplayLvglCpp'

function control(
  type: 'Choice Strip' | 'Step Control',
  properties: DisplayWidget['properties'] = {},
  bounds = defaultDisplayWidgetBounds(type),
): PlacedDisplayWidget {
  return {
    id: type === 'Choice Strip' ? 'mode' : 'count',
    type,
    label: type,
    bounds,
    properties: { ...defaultDisplayWidgetProperties(type), ...properties },
  }
}

function document(widgets: DisplayWidget[]): DisplayDocument {
  return { ...createDisplayDocument('panel', 320, 240), widgets }
}

const RECT = { left: 0, top: 0, width: 150, height: 48 }

describe('Choice Strip', () => {
  it('reads its options from one comma-separated list, trimmed and capped at six', () => {
    expect(displayChoiceOptions(control('Choice Strip', { options: ' Low,Mid , ,High ' }))).toEqual(['Low', 'Mid', 'High'])
    const many = control('Choice Strip', { options: 'a,b,c,d,e,f,g,h' })
    expect(displayChoiceOptions(many)).toHaveLength(DISPLAY_CHOICE_MAX_OPTIONS)
    expect(displayControlRange(many)).toEqual({ min: 0, max: 5, step: 1 })
  })

  it('counts its options from 0 and starts on its own Starts at, or the first', () => {
    expect(displayControlStartValue(control('Choice Strip'))).toBe(0)
    expect(displayControlStartValue(control('Choice Strip', { initial: 2 }))).toBe(2)
    // A start past the last option is held on it rather than naming nothing.
    expect(displayControlStartValue(control('Choice Strip', { options: 'a,b', initial: 4 }))).toBe(1)
    expect(initialDisplayControlValue(control('Choice Strip', { initial: 1 }))).toBe(1)
  })

  it('reports too few or too many options, a start past the end, and segments too narrow to touch', () => {
    const messages = (widget: DisplayWidget) => displayWidgetValidationIssues(widget, 'touch-tft').map((issue) => issue.message)
    expect(messages(control('Choice Strip'))).toEqual([])
    expect(messages(control('Choice Strip', { options: 'Only' }))).toContain('List at least two options, separated by commas.')
    expect(messages(control('Choice Strip', { options: 'a,b,c,d,e,f,g' }))).toContain('Only the first 6 options are shown.')
    expect(messages(control('Choice Strip', { options: 'a,b', initial: 3 })))
      .toContain('Starts at must name one of the options, counting the first as 0.')
    expect(messages(control('Choice Strip', { options: 'a,b,c,d' }, { x: 0, y: 0, width: 160, height: 48 })))
      .toEqual(['4 options need a strip at least 192 px wide.'])
  })

  it('maps a touch to the evenly divided option under it', () => {
    const widget = control('Choice Strip')
    expect(choiceIndexFromPoint(widget, 10, RECT)).toBe(0)
    expect(choiceIndexFromPoint(widget, 75, RECT)).toBe(1)
    expect(choiceIndexFromPoint(widget, 149, RECT)).toBe(2)
    expect(choiceIndexFromPoint(widget, 400, RECT)).toBe(2)
  })

  it('is a numeric control but takes no range from what it drives', () => {
    const widget = control('Choice Strip')
    expect(displayWidgetIsNumericControl(widget.type)).toBe(true)
    expect(displayWidgetIsRangedControl(widget.type)).toBe(false)
    expect(displayControlIsUnconfigured(widget)).toBe(false)
  })
})

describe('Step Control', () => {
  it('moves one step at a time inside its range', () => {
    const widget = control('Step Control', { min: 0, max: 3, step: 1 })
    expect(stepDisplayControlValue(widget, 2, 1)).toBe(3)
    expect(stepDisplayControlValue(widget, 3, 1)).toBe(3)
    expect(stepDisplayControlValue(widget, 0, -1)).toBe(0)
    expect(displayControlStartValue(control('Step Control', { min: 2, max: 8 }))).toBe(2)
  })

  it('keeps square keys and room for the value, and hit-tests on the same split', () => {
    expect(displayStepKeyWidth(150, 48)).toBe(48)
    expect(displayStepKeyWidth(96, 48)).toBe(32)
    const fraction = 48 / 150
    expect(stepDirectionFromPoint(10, RECT, fraction)).toBe(-1)
    expect(stepDirectionFromPoint(75, RECT, fraction)).toBe(0)
    expect(stepDirectionFromPoint(140, RECT, fraction)).toBe(1)
  })

  it('shows the precision of its step', () => {
    expect(displayStepDecimals(control('Step Control', { step: 1 }))).toBe(0)
    expect(displayStepDecimals(control('Step Control', { step: 0.25 }))).toBe(2)
  })

  it('is a ranged control, so it adopts a target range while untouched', () => {
    const widget = control('Step Control')
    expect(displayWidgetIsRangedControl(widget.type)).toBe(true)
    expect(displayControlIsUnconfigured(widget)).toBe(true)
  })
})

describe('Choice Strip and Step Control on the glass', () => {
  const choice = control('Choice Strip', { options: 'Calm, Party, Strobe', initial: 1 })
  const step = control('Step Control', { min: 0, max: 2, step: 0.5 }, { x: 0, y: 60, width: 150, height: 48 })
  const emit: CustomDisplayLvglEmit = {
    id: 'panel',
    document: document([choice, step]),
    bindings: {
      [choice.id]: [{ role: 'set', expression: 'n_mode' }],
      [step.id]: [{ role: 'set', expression: 'n_count' }],
    },
  }
  const setup = customDisplayLvglSetupCpp(emit).join('\n')

  it('builds each from buttons and labels, so lv_conf.h needs no new widget', () => {
    expect(setup).toContain('_cd_panel[0].object = lv_obj_create(_cdScreen_panel);')
    expect(setup).toContain('lv_obj_t *_cdOption_panel_0_2 = lv_button_create(_cd_panel[0].object);')
    expect(setup).toContain('lv_label_set_text(_cdOption_panel_0_1Label, "Party");')
    expect(setup).toContain('lv_obj_t *_cdStepDown_panel_1 = lv_button_create(_cd_panel[1].object);')
    expect(setup).toContain('lv_obj_t *_cdStepValue_panel_1 = lv_label_create(_cd_panel[1].object);')
    expect(setup).not.toMatch(/lv_(buttonmatrix|spinbox|roller|dropdown)_/)
  })

  it('lays the options out evenly inside the border', () => {
    // 144 wide less a 1 px border each side leaves 142: 47, 47, 48.
    expect(setup).toContain('lv_obj_set_pos(_cdOption_panel_0_1, 47, 0);')
    expect(setup).toContain('lv_obj_set_size(_cdOption_panel_0_2, 48, 46);')
  })

  it('hands touch to the keys, not the container, and seeds the starting value', () => {
    expect(setup).not.toContain('lv_obj_add_event_cb(_cd_panel[0].object')
    expect(setup.match(/lv_obj_add_event_cb\(_cdOption_panel_0_\d, _cdEvent, LV_EVENT_ALL, &_cd_panel\[0\]\);/g)).toHaveLength(3)
    expect(setup).toContain('lv_obj_add_event_cb(_cdStepUp_panel_1, _cdEvent, LV_EVENT_ALL, &_cd_panel[1]);')
    expect(setup).toContain('_cdSetChoice(_cd_panel[0], 1.0f);')
    expect(setup).toContain('_cd_panel[1].decimals = 1;')
    expect(setup).toContain('_cdSetStep(_cd_panel[1], 0.0f);')
  })

  it('follows its Set wire only while no finger holds it', () => {
    const loop = customDisplayLvglLoopCpp(emit).join('\n')
    expect(loop).toContain('if (!_cd_panel[0].touchOwned && !_cd_panel[0].touchPending) _cdSetChoice(_cd_panel[0], (float)(n_mode));')
    expect(loop).toContain('if (!_cd_panel[1].touchOwned && !_cd_panel[1].touchPending) _cdSetStep(_cd_panel[1], (float)(n_count));')
  })

  it('publishes a float and counts finger moves for the Controls wire', () => {
    expect(customDisplayLvglOutputExpression(emit, choice.id)).toBe('_cdFloatOutput(_cd_panel[0])')
    expect(customDisplayLvglOutputExpression(emit, step.id)).toBe('_cdFloatOutput(_cd_panel[1])')
    expect(customDisplayLvglTapExpression(emit, step.id)).toBe('_cd_panel[1].taps')
    expect(CUSTOM_DISPLAY_LVGL_HELPERS).toContain('runtime->kind == 5 && code == LV_EVENT_CLICKED')
    expect(CUSTOM_DISPLAY_LVGL_HELPERS).toContain('code == LV_EVENT_PRESSED || code == LV_EVENT_LONG_PRESSED_REPEAT')
  })

  it('starts a wired control where the graph already is', () => {
    const seeded = customDisplayLvglSetupCpp({ ...emit, initialValues: { [step.id]: 1.5, [choice.id]: 2 } }).join('\n')
    expect(seeded).toContain('_cdSetChoice(_cd_panel[0], 2.0f);')
    expect(seeded).toContain('_cdSetStep(_cd_panel[1], 1.5f);')
  })
})

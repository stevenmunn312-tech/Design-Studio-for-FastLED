import type { BakedCustomDisplayAsset } from '../state/customDisplayResources'
import type { customDisplayControlPlan } from './customDisplayControlGraph'
import {
  CUSTOM_DISPLAY_LVGL_INCLUDE, CUSTOM_DISPLAY_LVGL_FORWARD, CUSTOM_DISPLAY_LVGL_HELPERS,
  CUSTOM_DISPLAY_LVGL_TIMING_CPP, customDisplayLvglTimingSetupCpp,
  customDisplayLvglGlobalCpp, customDisplayLvglSetupCpp, customDisplayLvglLoopCpp,
} from './customDisplayLvglCpp'
import {
  CUSTOM_DISPLAY_PANEL_CPP_INCLUDES, customDisplayPanelGlobalCpp,
  customDisplayPanelHelpersCpp, customDisplayPanelSetupCpp,
} from './customDisplayPanelCpp'
import { customDisplayAssetsCpp } from './customDisplayAssetsCpp'
import { DISPLAY_TEXT_CPP_HELPERS } from './displayTextCpp'
import { TFT_TOUCH_CPP_HELPERS } from './tftTouchCpp'

export type CustomDisplayAssets = Record<string, readonly BakedCustomDisplayAsset[]>

export function customDisplayShowCpp(plan: ReturnType<typeof customDisplayControlPlan>, assets: CustomDisplayAssets = {}) {
  if (plan.errors.length) throw new Error(plan.errors.join('\n'))
  const displays = plan.displays.filter((display) => display.enabled)
  const includes: string[] = [], forwards: string[] = [], helpers: string[] = [], shared: string[] = []
  const setup: string[] = [], sample: string[] = [], loop: string[] = []
  if (displays.length) {
    includes.push(CUSTOM_DISPLAY_LVGL_INCLUDE, CUSTOM_DISPLAY_PANEL_CPP_INCLUDES)
    forwards.push(CUSTOM_DISPLAY_LVGL_FORWARD)
    shared.push(DISPLAY_TEXT_CPP_HELPERS)
    helpers.push(CUSTOM_DISPLAY_LVGL_HELPERS, CUSTOM_DISPLAY_LVGL_TIMING_CPP)
    if (displays.some((display) => display.panel.touch)) helpers.push(TFT_TOUCH_CPP_HELPERS)
    setup.push('  lv_init();', customDisplayLvglTimingSetupCpp())
  }
  for (const display of displays) {
    const emit = { ...display.emit, assets: assets[display.nodeId] ?? [] }
    helpers.push(customDisplayAssetsCpp(emit.id, emit.document, emit.assets), customDisplayLvglGlobalCpp(emit),
      customDisplayPanelGlobalCpp(display.panel), customDisplayPanelHelpersCpp(display.panel))
    setup.push(...customDisplayPanelSetupCpp(display.panel), ...customDisplayLvglSetupCpp(emit))
    if (display.panel.touch) sample.push(`  lv_indev_read(_cdIndev_${display.panel.id});`)
    loop.push(...customDisplayLvglLoopCpp(emit))
  }
  // Complete all touch reads before snapshotting any outputs. Every binding,
  // including feedback through another screen, observes this same snapshot.
  sample.push(...plan.sample)
  if (displays.length) loop.push('  _cdServiceLvgl();')
  return { includes, forwards, helpers, shared, setup, sample, loop }
}

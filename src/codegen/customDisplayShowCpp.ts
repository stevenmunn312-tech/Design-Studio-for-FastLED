import type { BakedCustomDisplayAsset } from '../state/customDisplayResources'
import { customDisplaySampleCpp, type customDisplayControlPlan } from './customDisplayControlGraph'
import {
  CUSTOM_DISPLAY_LVGL_INCLUDE, CUSTOM_DISPLAY_LVGL_FORWARD, CUSTOM_DISPLAY_LVGL_HELPERS,
  CUSTOM_DISPLAY_LVGL_TIMING_CPP, customDisplayLvglTimingSetupCpp,
  customDisplayLvglGlobalCpp, customDisplayLvglSetupCpp, customDisplayLvglLoopCpp,
} from './customDisplayLvglCpp'
import {
  CUSTOM_DISPLAY_PANEL_CPP_INCLUDES, customDisplayPanelGlobalCpp,
  customDisplayPanelEnableCpp, customDisplayPanelHelpersCpp, customDisplayPanelSetupCpp,
} from './customDisplayPanelCpp'
import { customDisplayAssetsCpp } from './customDisplayAssetsCpp'
import { displayTextCppHelpers } from './displayTextCpp'
import { TFT_TOUCH_CPP_HELPERS } from './tftTouchCpp'

export type CustomDisplayAssets = Record<string, readonly BakedCustomDisplayAsset[]>

export function customDisplayShowCpp(
  plan: ReturnType<typeof customDisplayControlPlan>,
  assets: CustomDisplayAssets = {},
  telemetry = false,
) {
  if (plan.errors.length) throw new Error(plan.errors.join('\n'))
  // Every mounted panel is built, disabled or not: it is fitted hardware
  // either way, and dropping it from the sketch made Enabled a build switch
  // here and a runtime one in a normal sketch. Off now means the same thing in
  // both — dark, no touch, outputs at rest — through the panel's own latch.
  const displays = plan.displays
  const includes: string[] = [], forwards: string[] = [], helpers: string[] = [], shared: string[] = []
  const setup: string[] = [], sample: string[] = [], enable: string[] = [], loop: string[] = []
  const snapshots: string[] = []
  if (displays.length) {
    includes.push(CUSTOM_DISPLAY_LVGL_INCLUDE, CUSTOM_DISPLAY_PANEL_CPP_INCLUDES)
    forwards.push(CUSTOM_DISPLAY_LVGL_FORWARD)
    if (displays.some((display) => display.emit.document.widgets.some((widget) => widget.type === 'Numeric Readout'))) {
      shared.push(displayTextCppHelpers({ number: true, dateTime: false, copy: false }))
    }
    helpers.push(CUSTOM_DISPLAY_LVGL_HELPERS, CUSTOM_DISPLAY_LVGL_TIMING_CPP)
    if (displays.some((display) => display.panel.touch)) helpers.push(TFT_TOUCH_CPP_HELPERS)
    setup.push('  lv_init();', customDisplayLvglTimingSetupCpp())
  }
  for (const display of displays) {
    const emit = { ...display.emit, assets: assets[display.documentId] ?? [] }
    const panel = { ...display.panel, telemetry }
    helpers.push(customDisplayAssetsCpp(emit.id, emit.document, emit.assets), customDisplayLvglGlobalCpp(emit),
      customDisplayPanelGlobalCpp(panel), customDisplayPanelHelpersCpp(panel))
    setup.push(...customDisplayPanelSetupCpp(panel), ...customDisplayLvglSetupCpp(emit))
    const gate = `_cdPanelOn_${panel.id}`
    const always = panel.enabledExpr === 'true'
    if (panel.touch) {
      const read = `lv_indev_read(_cdIndev_${panel.id});`
      sample.push(always ? `  ${read}` : `  if (${gate}) ${read}`)
    }
    enable.push(...customDisplayPanelEnableCpp(panel))
    const publish = customDisplayLvglLoopCpp(emit)
    loop.push(...(always ? publish : [`  if (${gate}) {`, ...publish.map((line) => `  ${line}`), `  }`]))
    snapshots.push(...display.samples.map((entry) => customDisplaySampleCpp(entry, always ? null : gate)))
  }
  // Complete all touch reads before snapshotting any outputs. Every binding,
  // including feedback through another screen, observes this same snapshot.
  // A set-aside design's outputs join it at rest, so wires from them resolve.
  sample.push(...snapshots, ...plan.resting.map((entry) => customDisplaySampleCpp(entry, null)))
  if (displays.length) loop.push('  _cdServiceLvgl();')
  return { includes, forwards, helpers, shared, setup, sample, enable, loop }
}

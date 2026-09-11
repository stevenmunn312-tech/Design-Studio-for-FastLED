import { describe, expect, it } from 'vitest'
import {
  CUSTOM_DISPLAY_LVGL_HELPERS,
  CUSTOM_DISPLAY_LVGL_INCLUDE,
  CUSTOM_DISPLAY_LVGL_FORWARD,
  CUSTOM_DISPLAY_LVGL_TIMING_CPP,
  customDisplayLvglGlobalCpp,
  customDisplayLvglLoopCpp,
  customDisplayLvglSetupCpp,
  type CustomDisplayLvglEmit,
} from '../customDisplayLvglCpp'
import { createDisplayDocument } from '../../state/displayEditor'
import { defaultDisplayWidgetBounds, defaultDisplayWidgetProperties } from '../../state/displayRegistry'
import { DISPLAY_WIDGET_TYPES, type DisplayDocument, type DisplayWidget } from '../../state/displayDocument'

/**
 * Every Montserrat face the emitted screen references must be one the sketch
 * asked the build helper to compile.
 *
 * `// FLS-LVGL-FONTS:<sizes>` is an allow-listed contract: the helper
 * specializes `lv_conf.h` so only those sizes exist in flash, and every other
 * `LV_FONT_MONTSERRAT_*` is defined to 0. So a `&lv_font_montserrat_N` the
 * marker does not list is not a styling slip — it is an undefined symbol at
 * link time, on a screen that looked right in the preview.
 *
 * The two sides are close to agreeing by construction: both pin through
 * `customDisplayFontSize`. What is not derived is *which widgets have text* —
 * `customDisplayFontSizes` collects sizes from a hand-written list of six
 * widget types, while the emitter decides per widget from the registry's
 * `lvglEmitter` plus the control-label path. A widget that starts emitting a
 * label, or a new type whose emitter is 'label', satisfies the emitter and is
 * invisible to the list.
 *
 * The display compile matrix cannot catch this: every LVGL fixture it builds
 * uses one size, the pinned default, so any disagreement about which widgets
 * need a face is hidden. This test asks the question at a size nothing else
 * uses, over one document holding every registered widget type.
 */

const FONT_REFERENCE = /&lv_font_montserrat_(\d+)/g
const FONT_MARKER = /^\/\/ FLS-LVGL-FONTS:([0-9,]+)$/m

/**
 * One widget per type, each carrying a font size no other widget uses.
 *
 * A shared theme size would make this test toothless: every text widget would
 * contribute the same number, so dropping a type from the marker's widget list
 * could not change the declared set. Distinct sizes mean each type's presence
 * in that list is observable on its own — verified by removing one and watching
 * this fail.
 */
function widget(type: DisplayWidget['type'], index: number, fontSize: number): DisplayWidget {
  return {
    id: `${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
    type,
    label: type,
    bounds: { ...defaultDisplayWidgetBounds(type), x: index * 2, y: index * 3 },
    properties: { ...defaultDisplayWidgetProperties(type), fontSize },
  }
}

/**
 * A face per widget, never repeated.
 *
 * Cycling a short list of sizes was not enough: Timecode and Button drew the
 * same number, so removing either from the marker's widget list left the
 * declared set unchanged and this test passed a break. Every widget gets its
 * own even size (LVGL pins even sizes to their own faces), which makes each
 * type's presence in that list observable on its own.
 */
function sizeFor(index: number): number {
  return 8 + index * 2
}

function everyWidget(): DisplayDocument {
  const base = createDisplayDocument('panel', 320, 240)
  return {
    ...base,
    widgets: DISPLAY_WIDGET_TYPES.map((type, index) => widget(type, index, sizeFor(index))),
  }
}

function emitted(emit: CustomDisplayLvglEmit): string {
  return [
    CUSTOM_DISPLAY_LVGL_INCLUDE,
    CUSTOM_DISPLAY_LVGL_FORWARD,
    CUSTOM_DISPLAY_LVGL_HELPERS,
    CUSTOM_DISPLAY_LVGL_TIMING_CPP,
    customDisplayLvglGlobalCpp(emit),
    ...customDisplayLvglSetupCpp(emit),
    ...customDisplayLvglLoopCpp(emit),
  ].join('\n')
}

function fontsOf(source: string): { referenced: Set<number>; declared: Set<number> } {
  const marker = FONT_MARKER.exec(source)
  expect(marker, 'the emitted screen declares no FLS-LVGL-FONTS marker').toBeTruthy()
  return {
    referenced: new Set([...source.matchAll(FONT_REFERENCE)].map((match) => Number(match[1]))),
    declared: new Set(marker![1].split(',').map(Number)),
  }
}

describe('custom Display LVGL font declarations', () => {
  it('declares every face it references', () => {
    const { referenced, declared } = fontsOf(emitted({ id: 'panel', document: everyWidget() }))

    expect(referenced.size).toBeGreaterThan(1)
    expect([...referenced].filter((size) => !declared.has(size))).toEqual([])
  })

  it('declares nothing it does not reference', () => {
    // The marker exists to keep unused faces out of flash, so declaring one
    // nothing draws with is a real defect too — a cheaper one than a missing
    // face, which does not link at all.
    const { referenced, declared } = fontsOf(emitted({ id: 'panel', document: everyWidget() }))

    expect([...declared].filter((size) => !referenced.has(size))).toEqual([])
  })

  it('holds for a screen with no widgets at all', () => {
    const base = createDisplayDocument('panel', 320, 240)
    const { referenced, declared } = fontsOf(emitted({ id: 'panel', document: base }))

    expect([...referenced].filter((size) => !declared.has(size))).toEqual([])
  })
})

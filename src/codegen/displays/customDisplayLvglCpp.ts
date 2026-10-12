import { customDisplayId as safeId } from './customDisplayId'
// Deterministic LVGL 9 object tree for a panel's own screen design.
//
// This module deliberately stops at the LVGL boundary. The panel driver and
// browser-side rasterizer are separate slices, while customDisplayAssetsCpp
// supplies the finished PROGMEM tables. It owns the parts that are purely a
// function of a normalized DisplayDocument: objects, styles, font selection,
// callbacks, bounded caches and bindings.

import {
  placedWidgets,
  type DisplayDocument,
  type DisplayWidget,
  type DisplayWidgetProperty,
  type PlacedDisplayWidget,
} from '../../state/displays/displayDocument'
import {
  DISPLAY_PICKER_MARKER_PX,
  displayChoiceOptions,
  displayControlRange,
  displayControlStartValue,
  displayGaugeGeometry,
  displayPickerStartHue,
  displayPickerStops,
  displayPickerTone,
  displayStepDecimals,
  displayStepKeyWidth,
  displayWidgetBodyFallback,
  displayWidgetCaptionLayout,
  displayWidgetContentBounds,
  displayWidgetDefinition,
  displayWidgetIsNumericControl,
  type DisplayWidgetPortRoleId,
} from '../../state/displays/displayRegistry'
import { resolveDisplayThemeTokens, displayWidgetTextTokens, type DisplayWidgetStateTokens } from '../../state/displays/displayTheme'
import { DISPLAY_TEXT_BUFFER_BYTES, cppStringLiteral, displayString, normalizeNumberFormat } from '../../state/displays/displayText'
import {
  customDisplayAssetRequests,
  customDisplayFontSize,
  customDisplayFontSizes,
  type BakedCustomDisplayAsset,
} from '../../state/displays/customDisplayResources'
import { customDisplayAssetIndex, customDisplayAssetSymbol } from './customDisplayAssetsCpp'

/** `FLS_LVGL_POOL_FROM_HEAP` comes from the helper's lv_conf.h, through lvgl.h. */
export const CUSTOM_DISPLAY_LVGL_INCLUDE = [
  '#include <lvgl.h>',
  '#if defined(FLS_LVGL_POOL_FROM_HEAP)',
  '#include <esp_heap_caps.h>',
  '#include <esp_rom_sys.h>',
  '#endif',
].join('\n')

/** Required above Arduino's auto-generated function prototypes because the
 * shared helpers take this runtime by reference. */
export const CUSTOM_DISPLAY_LVGL_FORWARD = 'struct CustomDisplayWidgetRuntime;'

/** LVGL uses a fixed internal integer range for authored floating-point
 * controls. The graph-facing value is mapped back to the widget's real range
 * in the callback, so a range or step never becomes a generated identifier. */
export const CUSTOM_DISPLAY_LVGL_VALUE_SCALE = 10000

/** Smallest interval between LVGL timer-handler calls. It bounds UI service
 * work independently of LED frame count while remaining responsive to touch. */
export const CUSTOM_DISPLAY_LVGL_HANDLER_MIN_MS = 5

/** The pinned helper lv_conf.h reserves this once per sketch, shared by every
 * screen, widget, style and dynamically allocated label. On ESP32 lv_init()
 * takes it from internal heap; elsewhere it is a static array. Either way it
 * is internal RAM. Keep in step with backend/toolchain.py's LV_MEM_SIZE
 * (checked by the RAM contract test). */
export const CUSTOM_DISPLAY_LVGL_HEAP_BYTES = 64 * 1024

/** CustomDisplayWidgetRuntime on the supported 32-bit targets: pointer,
 * four byte-sized fields, the tap count and step precision (padded to four
 * bytes), four floats, two integers and two bounded strings, rounded to the
 * struct's four-byte alignment. This lives outside LVGL's heap. */
export const CUSTOM_DISPLAY_WIDGET_RAM_BYTES = Math.ceil((36 + 2 * DISPLAY_TEXT_BUFFER_BYTES) / 4) * 4

export interface CustomDisplayLvglBinding {
  /** C++ expression for the registry role, already resolved by the graph
   * generator. Expressions are codegen-owned; document text never enters here. */
  role: DisplayWidgetPortRoleId
  expression: string
}

export interface CustomDisplayLvglEmit {
  /** Codegen-owned identifier stem (normally the sanitized graph node id). */
  id: string
  /**
   * Stem for baked image symbols. Omitted when it is `id`.
   *
   * A drawing shown on two panels keeps one PROGMEM table under the document
   * id. Each glass still has its own screen and widget objects, under `id`.
   */
  assetId?: string
  document: DisplayDocument
  /** Finished, validated browser-side rasterizations. Omit while previewing an
   * incomplete document; deploy generation validates and requires every use. */
  assets?: readonly BakedCustomDisplayAsset[]
  /** Bindings grouped by widget id. Unknown roles are harmlessly ignored. */
  bindings?: Readonly<Record<string, readonly CustomDisplayLvglBinding[]>>
  /**
   * What each control reads before a finger has moved it, by widget id.
   *
   * A widget's value is runtime state, not something the document stores, so
   * without this the struct's zero-initialised `floatValue` is what a build
   * starts from — a slider driving an LED output's brightness reported 0 and
   * the strip stayed dark until someone touched glass that may not even be
   * fitted. The app has never behaved that way: `connectTouchControl` seeds a
   * new control from the property it drives precisely so wiring one does not
   * drop the effect to its minimum, and this is that same value reaching
   * firmware. Absent for a widget driving nothing, which keeps its minimum.
   */
  initialValues?: Readonly<Record<string, number | boolean>>
}



function property(widget: DisplayWidget, key: string, fallback: DisplayWidgetProperty): DisplayWidgetProperty {
  return widget.properties[key] ?? fallback
}

function numberProperty(widget: DisplayWidget, key: string, fallback: number): number {
  const value = property(widget, key, fallback)
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function boolProperty(widget: DisplayWidget, key: string, fallback: boolean): boolean {
  const value = property(widget, key, fallback)
  return typeof value === 'boolean' ? value : fallback
}

function stringProperty(widget: DisplayWidget, key: string, fallback = ''): string {
  const value = property(widget, key, fallback)
  return typeof value === 'string' ? value : fallback
}

function colorHex(color: string): string {
  return `0x${color.slice(1).toUpperCase()}`
}

function floatLiteral(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) return '0.0f'
  if (Number.isInteger(value)) return `${value.toFixed(1)}f`
  return `${value}f`
}

function opacity(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
}

/** The symbol stem of this drawing's baked images. */
export function customDisplayAssetStem(emit: Pick<CustomDisplayLvglEmit, 'id' | 'assetId'>): string {
  return emit.assetId ?? emit.id
}

function binding(emit: CustomDisplayLvglEmit, widgetId: string, role: DisplayWidgetPortRoleId): string | null {
  return emit.bindings?.[widgetId]?.find((candidate) => candidate.role === role)?.expression ?? null
}

function object(emit: CustomDisplayLvglEmit, index: number): string {
  return `_cd_${safeId(emit.id)}[${index}].object`
}

function runtime(emit: CustomDisplayLvglEmit, index: number): string {
  return `_cd_${safeId(emit.id)}[${index}]`
}

function alignCpp(align: 'left' | 'center' | 'right'): string {
  if (align === 'center') return 'LV_TEXT_ALIGN_CENTER'
  if (align === 'right') return 'LV_TEXT_ALIGN_RIGHT'
  return 'LV_TEXT_ALIGN_LEFT'
}

/**
 * Every `bg_color` needs a `bg_opa` beside it.
 *
 * The generated `lv_conf.h` sets `LV_USE_THEME_DEFAULT 0` to keep the theme's
 * styles out of flash, and the theme is what normally makes an object's
 * background opaque. LVGL's own class default for `bg_opa` is transparent, so
 * a colour set without one is painted at zero alpha and the display's
 * background — white — shows through instead. On a dark screen design that
 * reads as an inverted panel: white behind near-white text, with only the
 * borders visible. It cost a bench session to find, because the fixed OLED
 * and TFT layouts never touch LVGL and looked perfectly correct beside it.
 *
 * `customDisplayLvglBackgrounds.test.ts` holds the pairing over the emitted
 * sketch rather than over this function, so a colour added anywhere — a new
 * widget part, a new state — is caught even if it never comes through here.
 */
function styleLines(
  target: string,
  tokens: DisplayWidgetStateTokens,
  selector = 'LV_PART_MAIN',
): string[] {
  return [
    `  lv_obj_set_style_bg_color(${target}, lv_color_hex(${colorHex(tokens.surfaceColor)}), ${selector});`,
    // Opacity beside the colour — see the note above `styleLines`.
    `  lv_obj_set_style_bg_opa(${target}, LV_OPA_COVER, ${selector});`,
    `  lv_obj_set_style_text_color(${target}, lv_color_hex(${colorHex(tokens.textColor)}), ${selector});`,
    `  lv_obj_set_style_border_color(${target}, lv_color_hex(${colorHex(tokens.borderColor)}), ${selector});`,
    `  lv_obj_set_style_opa(${target}, ${opacity(tokens.opacity)}, ${selector});`,
  ]
}

function stateStyleLines(
  target: string,
  tokens: DisplayWidgetStateTokens,
  state: 'PRESSED' | 'CHECKED' | 'DISABLED',
): string[] {
  return styleLines(target, tokens, `_cdSel(LV_PART_MAIN, LV_STATE_${state})`)
}

/**
 * The LVGL class a widget's object is created as.
 *
 * Named separately from the create call because text styling applies to the
 * *class*, not to the emitter id: two emitters create an `lv_label`, and
 * gating the font/align/long-mode block on `lvglEmitter === 'label'` left the
 * Pattern Browser — a label — with no font at all. It rendered at LVGL's
 * built-in default face while the DOM preview honoured the authored size, and
 * the face the marker had already compiled into flash for it went unused.
 * Found by `customDisplayLvglFonts.test.ts` comparing the two.
 */
function lvglWidgetClass(widget: DisplayWidget): string {
  switch (displayWidgetDefinition(widget.type).lvglEmitter) {
    case 'label': return 'lv_label'
    case 'bar': return 'lv_bar'
    case 'led': return 'lv_led'
    case 'button': return 'lv_button'
    case 'switch': return 'lv_switch'
    case 'slider': return 'lv_slider'
    case 'arc': return 'lv_arc'
    // Pattern Browser keeps its placeholder until its separate collection
    // thumbnail slice is wired into the custom screen. A placeholder that
    // honours the authored text size is still the nearer thing to the preview.
    case 'pattern-browser': return 'lv_label'
    case 'image': return 'lv_image'
    case 'swatch': return 'lv_obj'
    // Both are a plain container holding buttons and labels, so neither
    // needs an LVGL widget the pinned lv_conf.h leaves out.
    case 'choice': return 'lv_obj'
    case 'stepper': return 'lv_obj'
    // A strip of gradient segments and a marker in a plain container: LVGL 9
    // has no colour wheel, and a canvas would cost a frame buffer.
    case 'colour-picker': return 'lv_obj'
    // The Dial's arc, with its knob left unstyled and its touch removed.
    case 'gauge': return 'lv_arc'
  }
}

function widgetCreateExpression(widget: DisplayWidget, screen: string): string {
  return `${lvglWidgetClass(widget)}_create(${screen})`
}

function controlKind(widget: DisplayWidget): number {
  if (widget.type === 'Button') return 1
  if (widget.type === 'Toggle') return 2
  if (widget.type === 'Slider') return 3
  if (widget.type === 'Dial') return 4
  if (widget.type === 'Choice Strip') return 5
  if (widget.type === 'Step Control') return 6
  if (widget.type === 'Colour Picker') return 7
  return 0
}

function rgbHex(color: { r: number; g: number; b: number }): string {
  return `0x${[color.r, color.g, color.b].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

function setupWidgetLines(emit: CustomDisplayLvglEmit, widget: PlacedDisplayWidget, index: number): string[] {
  const theme = resolveDisplayThemeTokens(emit.document.theme)
  const base = widget.type === 'Toggle' || widget.type === 'Status Indicator'
    ? theme.states.inactive
    : theme.states.default
  const obj = object(emit, index)
  const rt = runtime(emit, index)
  const b = widget.bounds
  const text = displayWidgetTextTokens(widget, emit.document.theme)
  // A captioned widget is drawn in what the caption leaves it, exactly as the
  // preview lays it out. Both sides read the one layout in displayRegistry.
  const caption = displayWidgetCaptionLayout(widget, text.fontSize, b.height)
  const box = displayWidgetContentBounds(widget, text.fontSize)
  const lines = [
    `  ${rt}.lastInteger = INT32_MIN;`,
    `  ${rt}.lastColor = UINT32_MAX;`,
    `  ${obj} = ${widgetCreateExpression(widget, `_cdScreen_${safeId(emit.id)}`)};`,
    `  lv_obj_set_pos(${obj}, ${box.x}, ${box.y});`,
    `  lv_obj_set_size(${obj}, ${box.width}, ${box.height});`,
    `  lv_obj_set_style_radius(${obj}, ${theme.cornerRadius}, LV_PART_MAIN);`,
    `  lv_obj_set_style_border_width(${obj}, ${theme.borderWidth}, LV_PART_MAIN);`,
    ...styleLines(obj, base),
  ]

  if (lvglWidgetClass(widget) === 'lv_label') {
    lines.push(
      `  lv_obj_set_style_text_font(${obj}, &lv_font_montserrat_${customDisplayFontSize(text.fontSize)}, LV_PART_MAIN);`,
      `  lv_obj_set_style_text_align(${obj}, ${alignCpp(text.align)}, LV_PART_MAIN);`,
      // Circular scroll moves only text too wide to fit, which is also the
      // only text the preview animates.
      `  lv_label_set_long_mode(${obj}, ${text.overflow === 'scroll' ? 'LV_LABEL_LONG_MODE_SCROLL_CIRCULAR' : text.wrap ? 'LV_LABEL_LONG_MODE_WRAP' : 'LV_LABEL_LONG_MODE_DOTS'});`,
      // The gap between wrapped rows, so the glass breaks its lines where the
      // preview does. LVGL measures the space *between* lines while the
      // tokens carry the pitch, and the Montserrat faces are close enough to
      // their nominal size that the difference is the pitch less the size.
      `  lv_obj_set_style_text_line_space(${obj}, ${Math.max(0, text.lineHeight - text.fontSize)}, LV_PART_MAIN);`,
    )
    if (widget.type === 'Text') {
      const authoredColor = stringProperty(widget, 'color', base.textColor)
      lines.push(`  lv_obj_set_style_text_color(${obj}, lv_color_hex(${colorHex(authoredColor)}), LV_PART_MAIN);`)
    }
  }

  if (widget.type === 'Progress' || widget.type === 'Value Meter') {
    lines.push(`  lv_bar_set_range(${obj}, 0, CD_VALUE_SCALE);`)
    if (widget.type === 'Value Meter' && stringProperty(widget, 'orientation', 'horizontal') === 'vertical') {
      lines.push(`  lv_bar_set_orientation(${obj}, LV_BAR_ORIENTATION_VERTICAL);`)
    }
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(base.indicatorColor)}), LV_PART_INDICATOR);`)
    lines.push(`  lv_obj_set_style_bg_opa(${obj}, LV_OPA_COVER, LV_PART_INDICATOR);`)
  }

  if (widget.type === 'Toggle' || widget.type === 'Slider' || widget.type === 'Dial') {
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(base.trackColor)}), LV_PART_MAIN);`)
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(base.indicatorColor)}), LV_PART_INDICATOR);`)
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(base.thumbColor)}), LV_PART_KNOB);`)
    lines.push(`  lv_obj_set_style_bg_opa(${obj}, LV_OPA_COVER, LV_PART_INDICATOR);`)
    lines.push(`  lv_obj_set_style_bg_opa(${obj}, LV_OPA_COVER, LV_PART_KNOB);`)
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(theme.states.active.indicatorColor)}), _cdSel(LV_PART_INDICATOR, LV_STATE_CHECKED));`)
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(theme.states.pressed.thumbColor)}), _cdSel(LV_PART_KNOB, LV_STATE_PRESSED));`)
  }

  if (widget.type === 'Slider' || widget.type === 'Dial') {
    lines.push(`  ${rt}.minimum = ${floatLiteral(numberProperty(widget, 'min', 0))};`)
    lines.push(`  ${rt}.maximum = ${floatLiteral(numberProperty(widget, 'max', 1))};`)
    lines.push(`  ${rt}.step = ${floatLiteral(numberProperty(widget, 'step', 0.01))};`)
    // Seeded before the range is applied below, so the object and the runtime
    // agree from the first pass rather than after the first touch.
    // A wire-first control starts at the property it drives; anything else at
    // its own Starts at, the value the preview rests it at too.
    const seeded = emit.initialValues?.[widget.id]
      ?? (typeof widget.properties.initial === 'number' ? displayControlStartValue(widget) : undefined)
    const minimum = numberProperty(widget, 'min', 0)
    const maximum = numberProperty(widget, 'max', 1)
    if (typeof seeded === 'number' && maximum > minimum) {
      const clamped = Math.min(maximum, Math.max(minimum, seeded))
      lines.push(`  ${rt}.floatValue = ${floatLiteral(clamped)};`)
    }
    if (widget.type === 'Slider') {
      lines.push(`  lv_slider_set_range(${obj}, 0, CD_VALUE_SCALE);`)
      if (stringProperty(widget, 'orientation', 'horizontal') === 'vertical') {
        lines.push(`  lv_slider_set_orientation(${obj}, LV_SLIDER_ORIENTATION_VERTICAL);`)
      }
    } else {
      lines.push(`  lv_arc_set_range(${obj}, 0, CD_VALUE_SCALE);`)
      lines.push(`  lv_arc_set_bg_angles(${obj}, 135, 45);`)
    }
    // The knob has to show the seeded reading too, or the glass says minimum
    // while the graph is being driven with something else.
    if (typeof seeded === 'number' && maximum > minimum) {
      const clamped = Math.min(maximum, Math.max(minimum, seeded))
      const raw = Math.round(((clamped - minimum) / (maximum - minimum)) * CUSTOM_DISPLAY_LVGL_VALUE_SCALE)
      lines.push(widget.type === 'Slider'
        ? `  lv_slider_set_value(${obj}, ${raw}, LV_ANIM_OFF);`
        : `  lv_arc_set_value(${obj}, ${raw});`)
    }
  }

  const kind = controlKind(widget)
  if (kind > 0) {
    lines.push(`  ${rt}.kind = ${kind};`)
    // A container's keys take the touch, each reporting to this runtime; a
    // Colour Picker's container takes it itself.
    if (kind < 5 || kind === 7) lines.push(`  lv_obj_add_event_cb(${obj}, _cdEvent, LV_EVENT_ALL, &${rt});`)
    lines.push(...stateStyleLines(obj, theme.states.pressed, 'PRESSED'))
    lines.push(...stateStyleLines(obj, theme.states.active, 'CHECKED'))
    lines.push(...stateStyleLines(obj, theme.states.disabled, 'DISABLED'))
  }

  if (widget.type === 'Choice Strip' || widget.type === 'Step Control') {
    lines.push(...keyedControlLines(emit, widget, index, box, text.fontSize))
  }

  if (widget.type === 'Colour Picker') lines.push(...pickerLines(emit, widget, index, box))
  if (widget.type === 'Arc Gauge') lines.push(...gaugeLines(emit, widget, index, box, text.fontSize))

  if (widget.type === 'Text') {
    const fallbackText = stringProperty(widget, 'text') || displayWidgetBodyFallback(widget)
    lines.push(`  _cdSetText(${rt}, ${cppStringLiteral(displayString(fallbackText))});`)
  } else if (widget.type === 'Numeric Readout') {
    const format = normalizeNumberFormat(widget.properties)
    lines.push(`  _dsFormatNumber(${rt}.nextText, 0.0, ${format.decimals}, ${format.padWidth}, `
      + `${format.showSign ? 'true' : 'false'}, ${format.maxIntegerDigits}, ${cppStringLiteral(format.prefix)}, ${cppStringLiteral(format.suffix)});`)
    lines.push(`  _cdSetText(${rt}, ${rt}.nextText);`)
  } else if (widget.type === 'Timecode') {
    lines.push(`  _cdFormatTime(${rt}.nextText, 0.0f, ${boolProperty(widget, 'showHours', false) ? 'true' : 'false'});`)
    lines.push(`  _cdSetText(${rt}, ${rt}.nextText);`)
  } else if (widget.type === 'Pattern Browser') {
    lines.push(`  _cdSetText(${rt}, "NO PATTERN");`)
  } else if (widget.type === 'Image/Icon') {
    const assetIndex = emit.assets ? customDisplayAssetIndex(emit.document, { kind: 'widget', widgetIndex: index }) : null
    if (assetIndex !== null) {
      const request = customDisplayAssetRequests(emit.document)[assetIndex]
      lines.push(`  lv_image_set_src(${obj}, &${customDisplayAssetSymbol(customDisplayAssetStem(emit), assetIndex)});`)
      if (request.format === 'a8') {
        lines.push(`  lv_obj_set_style_image_recolor(${obj}, lv_color_hex(${colorHex(request.tintColor ?? '#ffffff')}), LV_PART_MAIN);`)
        lines.push(`  lv_obj_set_style_image_recolor_opa(${obj}, LV_OPA_COVER, LV_PART_MAIN);`)
      }
    } else {
      lines.push(`  lv_obj_t *_cdLabel_${safeId(emit.id)}_${index} = lv_label_create(${obj});`)
      lines.push(`  lv_label_set_text(_cdLabel_${safeId(emit.id)}_${index}, "IMAGE");`)
      lines.push(`  lv_obj_center(_cdLabel_${safeId(emit.id)}_${index});`)
    }
  } else if (widget.type === 'Button') {
    lines.push(...controlContentsLines(emit, widget, index, obj, text.fontSize, stringProperty(widget, 'text') || displayWidgetBodyFallback(widget)))
  } else if (widget.type === 'Toggle') {
    const label = stringProperty(widget, 'offLabel', 'Off')
    lines.push(...controlContentsLines(emit, widget, index, obj, text.fontSize, label))
  }

  if (caption) {
    const cap = `_cdCaption_${safeId(emit.id)}_${index}`
    const screen = `_cdScreen_${safeId(emit.id)}`
    lines.push(
      `  lv_obj_t *${cap} = lv_label_create(${screen});`,
      `  lv_obj_set_pos(${cap}, ${b.x}, ${b.y});`,
      `  lv_obj_set_size(${cap}, ${b.width}, ${caption.height});`,
      `  lv_obj_set_style_text_font(${cap}, &lv_font_montserrat_${customDisplayFontSize(caption.fontSize)}, LV_PART_MAIN);`,
      `  lv_obj_set_style_text_color(${cap}, lv_color_hex(${colorHex(base.textColor)}), LV_PART_MAIN);`,
      `  lv_obj_set_style_text_align(${cap}, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);`,
      `  lv_label_set_long_mode(${cap}, LV_LABEL_LONG_MODE_DOTS);`,
      `  lv_label_set_text(${cap}, ${cppStringLiteral(displayString(caption.text))});`,
    )
  }

  return lines
}

/**
 * A Choice Strip or Step Control: a container whose own buttons take the
 * touch. Laid out here in pixels from the same registry helpers the DOM
 * preview reads, inside the container's border. The value is seeded and drawn
 * before the first pass, as a Slider's is.
 */
function keyedControlLines(
  emit: CustomDisplayLvglEmit,
  widget: PlacedDisplayWidget,
  index: number,
  box: { width: number; height: number },
  fontSize: number,
): string[] {
  const theme = resolveDisplayThemeTokens(emit.document.theme)
  const obj = object(emit, index)
  const rt = runtime(emit, index)
  const stem = `${safeId(emit.id)}_${index}`
  const font = `&lv_font_montserrat_${customDisplayFontSize(fontSize)}`
  const border = theme.borderWidth
  const width = Math.max(1, box.width - 2 * border)
  const height = Math.max(1, box.height - 2 * border)
  const range = displayControlRange(widget)
  const seeded = emit.initialValues?.[widget.id]
  const start = typeof seeded === 'number' ? seeded : (displayControlStartValue(widget) ?? range.min)
  const lines = [
    `  lv_obj_remove_flag(${obj}, LV_OBJ_FLAG_SCROLLABLE);`,
    `  lv_obj_set_style_pad_all(${obj}, 0, LV_PART_MAIN);`,
    `  lv_obj_set_style_clip_corner(${obj}, true, LV_PART_MAIN);`,
    `  ${rt}.minimum = ${floatLiteral(range.min)};`,
    `  ${rt}.maximum = ${floatLiteral(range.max)};`,
    `  ${rt}.step = ${floatLiteral(range.step)};`,
  ]
  const key = (name: string, x: number, keyWidth: number, label: string): void => {
    lines.push(
      `  lv_obj_t *${name} = lv_button_create(${obj});`,
      `  lv_obj_remove_flag(${name}, LV_OBJ_FLAG_SCROLL_ON_FOCUS);`,
      `  lv_obj_set_pos(${name}, ${x}, 0);`,
      `  lv_obj_set_size(${name}, ${keyWidth}, ${height});`,
      `  lv_obj_add_event_cb(${name}, _cdEvent, LV_EVENT_ALL, &${rt});`,
      `  lv_obj_t *${name}Label = lv_label_create(${name});`,
      `  lv_obj_set_style_text_font(${name}Label, ${font}, LV_PART_MAIN);`,
      `  lv_label_set_long_mode(${name}Label, LV_LABEL_LONG_MODE_DOTS);`,
      `  lv_obj_set_style_text_align(${name}Label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);`,
      `  lv_obj_set_width(${name}Label, ${Math.max(1, keyWidth - 4)});`,
      `  lv_label_set_text(${name}Label, ${cppStringLiteral(displayString(label))});`,
      `  lv_obj_center(${name}Label);`,
    )
  }

  if (widget.type === 'Choice Strip') {
    const options = displayChoiceOptions(widget)
    options.forEach((option, optionIndex) => {
      const x = Math.floor((optionIndex * width) / options.length)
      const next = Math.floor(((optionIndex + 1) * width) / options.length)
      const name = `_cdOption_${stem}_${optionIndex}`
      key(name, x, next - x, option)
      // A rule between neighbours, the chosen one in the active state.
      lines.push(
        `  lv_obj_set_style_radius(${name}, 0, LV_PART_MAIN);`,
        `  lv_obj_set_style_border_width(${name}, ${optionIndex > 0 ? border : 0}, LV_PART_MAIN);`,
        `  lv_obj_set_style_border_side(${name}, LV_BORDER_SIDE_LEFT, LV_PART_MAIN);`,
        ...styleLines(name, theme.states.default),
        ...stateStyleLines(name, theme.states.pressed, 'PRESSED'),
        ...stateStyleLines(name, theme.states.active, 'CHECKED'),
      )
    })
    lines.push(`  _cdSetChoice(${rt}, ${floatLiteral(start)});`)
    return lines
  }

  const keyWidth = displayStepKeyWidth(width, height)
  const valueName = `_cdStepValue_${stem}`
  key(`_cdStepDown_${stem}`, 0, keyWidth, '-')
  lines.push(
    `  lv_obj_t *${valueName} = lv_label_create(${obj});`,
    `  lv_obj_set_style_text_font(${valueName}, ${font}, LV_PART_MAIN);`,
    `  lv_obj_set_style_text_color(${valueName}, lv_color_hex(${colorHex(theme.states.default.textColor)}), LV_PART_MAIN);`,
    `  lv_obj_set_style_text_align(${valueName}, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);`,
    `  lv_label_set_long_mode(${valueName}, LV_LABEL_LONG_MODE_DOTS);`,
    `  lv_obj_set_width(${valueName}, ${Math.max(1, width - 2 * keyWidth)});`,
    `  lv_obj_align(${valueName}, LV_ALIGN_CENTER, 0, 0);`,
  )
  key(`_cdStepUp_${stem}`, width - keyWidth, keyWidth, '+')
  for (const name of [`_cdStepDown_${stem}`, `_cdStepUp_${stem}`]) {
    lines.push(
      `  lv_obj_set_style_radius(${name}, ${theme.cornerRadius}, LV_PART_MAIN);`,
      `  lv_obj_set_style_border_width(${name}, 0, LV_PART_MAIN);`,
      `  lv_obj_set_style_bg_color(${name}, lv_color_hex(${colorHex(theme.states.default.trackColor)}), LV_PART_MAIN);`,
      `  lv_obj_set_style_bg_opa(${name}, LV_OPA_COVER, LV_PART_MAIN);`,
      `  lv_obj_set_style_text_color(${name}, lv_color_hex(${colorHex(theme.states.default.textColor)}), LV_PART_MAIN);`,
      `  lv_obj_set_style_bg_color(${name}, lv_color_hex(${colorHex(theme.states.pressed.trackColor)}), _cdSel(LV_PART_MAIN, LV_STATE_PRESSED));`,
    )
  }
  lines.push(`  ${rt}.decimals = ${displayStepDecimals(widget)};`)
  lines.push(`  _cdSetStep(${rt}, ${floatLiteral(start)});`)
  return lines
}

/**
 * A Colour Picker: six two-stop horizontal gradients, red to red through the
 * stops `displayPickerStops` gives the preview, then a hollow marker. The
 * container takes the touch; its children take none, and `_cdSetHue` finds
 * the marker as the seventh child, so the child order is a contract.
 */
function pickerLines(
  emit: CustomDisplayLvglEmit,
  widget: PlacedDisplayWidget,
  index: number,
  box: { width: number; height: number },
): string[] {
  const theme = resolveDisplayThemeTokens(emit.document.theme)
  const obj = object(emit, index)
  const rt = runtime(emit, index)
  const stem = `${safeId(emit.id)}_${index}`
  const width = Math.max(1, box.width - 2 * theme.borderWidth)
  const height = Math.max(1, box.height - 2 * theme.borderWidth)
  const stops = displayPickerStops(widget)
  const lines = [
    `  lv_obj_remove_flag(${obj}, LV_OBJ_FLAG_SCROLLABLE);`,
    `  lv_obj_set_style_pad_all(${obj}, 0, LV_PART_MAIN);`,
    `  lv_obj_set_style_clip_corner(${obj}, true, LV_PART_MAIN);`,
  ]
  const child = (name: string): void => {
    lines.push(
      `  lv_obj_t *${name} = lv_obj_create(${obj});`,
      `  lv_obj_remove_flag(${name}, LV_OBJ_FLAG_CLICKABLE);`,
      `  lv_obj_remove_flag(${name}, LV_OBJ_FLAG_SCROLLABLE);`,
      `  lv_obj_set_style_pad_all(${name}, 0, LV_PART_MAIN);`,
    )
  }
  for (let segment = 0; segment < 6; segment++) {
    const x = Math.floor((segment * width) / 6)
    const next = Math.floor(((segment + 1) * width) / 6)
    const name = `_cdHue_${stem}_${segment}`
    child(name)
    lines.push(
      `  lv_obj_set_pos(${name}, ${x}, 0);`,
      `  lv_obj_set_size(${name}, ${next - x}, ${height});`,
      `  lv_obj_set_style_radius(${name}, 0, LV_PART_MAIN);`,
      `  lv_obj_set_style_border_width(${name}, 0, LV_PART_MAIN);`,
      `  lv_obj_set_style_bg_color(${name}, lv_color_hex(${rgbHex(stops[segment])}), LV_PART_MAIN);`,
      `  lv_obj_set_style_bg_opa(${name}, LV_OPA_COVER, LV_PART_MAIN);`,
      `  lv_obj_set_style_bg_grad_color(${name}, lv_color_hex(${rgbHex(stops[segment + 1])}), LV_PART_MAIN);`,
      `  lv_obj_set_style_bg_grad_dir(${name}, LV_GRAD_DIR_HOR, LV_PART_MAIN);`,
    )
  }
  const marker = `_cdHueMarker_${stem}`
  child(marker)
  lines.push(
    `  lv_obj_set_size(${marker}, ${DISPLAY_PICKER_MARKER_PX}, ${height});`,
    `  lv_obj_set_style_radius(${marker}, 3, LV_PART_MAIN);`,
    `  lv_obj_set_style_bg_opa(${marker}, LV_OPA_TRANSP, LV_PART_MAIN);`,
    `  lv_obj_set_style_border_width(${marker}, 2, LV_PART_MAIN);`,
    `  lv_obj_set_style_border_color(${marker}, lv_color_hex(${colorHex(theme.states.default.thumbColor)}), LV_PART_MAIN);`,
    `  lv_obj_set_style_border_opa(${marker}, LV_OPA_COVER, LV_PART_MAIN);`,
    // The marker is placed from the strip's laid-out width.
    `  lv_obj_update_layout(${obj});`,
    `  _cdSetHue(${rt}, ${floatLiteral(displayPickerStartHue(widget))});`,
  )
  return lines
}

/**
 * An Arc Gauge: the arc inset by its border and the preview's padding, 270 degrees from 135
 * as a Dial draws, its knob unstyled so it does not draw, and the reading in a
 * centred label as the arc's only child.
 */
function gaugeLines(
  emit: CustomDisplayLvglEmit,
  widget: PlacedDisplayWidget,
  index: number,
  box: { width: number; height: number },
  fontSize: number,
): string[] {
  const theme = resolveDisplayThemeTokens(emit.document.theme)
  const obj = object(emit, index)
  const rt = runtime(emit, index)
  const { inset, stroke } = displayGaugeGeometry(box.width, box.height, theme.borderWidth)
  const lines = [
    `  lv_obj_remove_flag(${obj}, LV_OBJ_FLAG_CLICKABLE);`,
    `  lv_obj_set_style_pad_all(${obj}, ${inset}, LV_PART_MAIN);`,
    `  lv_arc_set_range(${obj}, 0, CD_VALUE_SCALE);`,
    `  lv_arc_set_bg_angles(${obj}, 135, 45);`,
    `  lv_arc_set_value(${obj}, 0);`,
    `  lv_obj_set_style_arc_width(${obj}, ${stroke}, LV_PART_MAIN);`,
    `  lv_obj_set_style_arc_width(${obj}, ${stroke}, LV_PART_INDICATOR);`,
    `  lv_obj_set_style_arc_color(${obj}, lv_color_hex(${colorHex(theme.states.default.trackColor)}), LV_PART_MAIN);`,
    `  lv_obj_set_style_arc_color(${obj}, lv_color_hex(${colorHex(theme.states.default.indicatorColor)}), LV_PART_INDICATOR);`,
  ]
  if (boolProperty(widget, 'showValue', true)) {
    const label = `_cdGaugeValue_${safeId(emit.id)}_${index}`
    const format = normalizeNumberFormat(widget.properties)
    lines.push(
      `  lv_obj_t *${label} = lv_label_create(${obj});`,
      `  lv_obj_set_style_text_font(${label}, &lv_font_montserrat_${customDisplayFontSize(fontSize)}, LV_PART_MAIN);`,
      `  lv_obj_set_style_text_align(${label}, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);`,
      `  lv_obj_center(${label});`,
      `  _dsFormatNumber(${rt}.nextText, ${floatLiteral(numberProperty(widget, 'min', 0))}, ${format.decimals}, ${format.padWidth}, `
        + `${format.showSign ? 'true' : 'false'}, ${format.maxIntegerDigits}, ${cppStringLiteral(format.prefix)}, ${cppStringLiteral(format.suffix)});`,
      `  _cdSetChildText(${rt}, 0, ${rt}.nextText);`,
    )
  }
  return lines
}

function controlContentsLines(
  emit: CustomDisplayLvglEmit,
  widget: DisplayWidget,
  index: number,
  obj: string,
  fontSize: number,
  label: string,
): string[] {
  const lines: string[] = []
  const presentation = stringProperty(widget, 'presentation', 'text')
  const assetIndex = emit.assets && presentation !== 'text'
    ? customDisplayAssetIndex(emit.document, { kind: 'widget', widgetIndex: index })
    : null
  if (assetIndex !== null) {
    const image = `_cdImage_${safeId(emit.id)}_${index}`
    lines.push(`  lv_obj_t *${image} = lv_image_create(${obj});`)
    lines.push(`  lv_image_set_src(${image}, &${customDisplayAssetSymbol(customDisplayAssetStem(emit), assetIndex)});`)
    lines.push(presentation === 'icon'
      ? `  lv_obj_center(${image});`
      : `  lv_obj_align(${image}, LV_ALIGN_LEFT_MID, 4, 0);`)
  }
  if (label && (presentation !== 'icon' || assetIndex === null)) {
    const text = `_cdLabel_${safeId(emit.id)}_${index}`
    lines.push(`  lv_obj_t *${text} = lv_label_create(${obj});`)
    lines.push(`  lv_obj_set_style_text_font(${text}, &lv_font_montserrat_${customDisplayFontSize(fontSize)}, LV_PART_MAIN);`)
    lines.push(`  lv_label_set_text(${text}, ${cppStringLiteral(displayString(label))});`)
    lines.push(assetIndex === null
      ? `  lv_obj_center(${text});`
      : `  lv_obj_align(${text}, LV_ALIGN_RIGHT_MID, -4, 0);`)
  }
  return lines
}

/** Shared runtime emitted once per sketch containing at least one custom
 * display. It uses fixed buffers only; no Arduino String or per-frame heap. */
export const CUSTOM_DISPLAY_LVGL_HELPERS = `// ── Custom display / LVGL 9 ─────────────────────────────────────────────────
#define CD_VALUE_SCALE ${CUSTOM_DISPLAY_LVGL_VALUE_SCALE}
#define CD_TEXT_BYTES ${DISPLAY_TEXT_BUFFER_BYTES}

// A style selector is the union of a part and a state, and LVGL 9.5 deprecates
// combining those two enum types with a bare | -- the result is an
// lv_style_selector_t, not either enum. Each operand is widened before the or,
// rather than the result being cast after it: casting the result would leave
// the deprecated enum-to-enum operation happening inside the parentheses.
// One helper, so a new state-qualified style cannot reintroduce it per site.
static inline lv_style_selector_t _cdSel(lv_part_t part, lv_state_t state) {
  return (lv_style_selector_t)part | (lv_style_selector_t)state;
}

struct CustomDisplayWidgetRuntime {
  lv_obj_t *object;
  uint8_t kind;                 // 0 passive, 1 button, 2 toggle, 3 slider, 4 dial, 5 choice, 6 step, 7 colour picker
  bool touchOwned;
  bool touchPending;
  bool boolValue;
  // Finger gestures on this widget, and only those: a Set write moves the
  // value without an LVGL event, so this is how a Toggle carried in a Controls
  // bundle tells a press from the player's own feedback, and how a Slider or
  // Dial there says it has been moved at all.
  uint16_t taps;
  uint8_t decimals;             // a Step Control's shown precision
  float floatValue;
  float minimum, maximum, step;
  int32_t lastInteger;
  uint32_t lastColor;
  char text[CD_TEXT_BYTES];
  char nextText[CD_TEXT_BYTES];
};

static void _cdCopy(char *dst, const char *src) {
  size_t n = 0;
  while (src[n] != 0 && n < (size_t)(CD_TEXT_BYTES - 1)) n++;
  while (n > 0 && ((unsigned char)src[n] & 0xC0) == 0x80) n--;
  memcpy(dst, src, n);
  dst[n] = 0;
}

static bool _cdSetText(CustomDisplayWidgetRuntime &runtime, const char *value) {
  if (strncmp(runtime.text, value, CD_TEXT_BYTES) == 0) return false;
  _cdCopy(runtime.text, value);
  lv_label_set_text(runtime.object, runtime.text);
  return true;
}

// A label held as a child, such as an Arc Gauge's reading.
static bool _cdSetChildText(CustomDisplayWidgetRuntime &runtime, int32_t child, const char *value) {
  if (strncmp(runtime.text, value, CD_TEXT_BYTES) == 0) return false;
  _cdCopy(runtime.text, value);
  lv_label_set_text(lv_obj_get_child(runtime.object, child), runtime.text);
  return true;
}

static bool _cdSetInteger(CustomDisplayWidgetRuntime &runtime, int32_t value) {
  if (runtime.lastInteger == value) return false;
  runtime.lastInteger = value;
  if (runtime.kind == 3) lv_slider_set_value(runtime.object, value, LV_ANIM_OFF);
  // A Dial and an Arc Gauge are both arcs; only the Dial is a control.
  else if (lv_obj_check_type(runtime.object, &lv_arc_class)) lv_arc_set_value(runtime.object, value);
  else lv_bar_set_value(runtime.object, value, LV_ANIM_OFF);
  return true;
}

static bool _cdSetChecked(CustomDisplayWidgetRuntime &runtime, bool checked) {
  if (runtime.boolValue == checked) return false;
  runtime.boolValue = checked;
  if (checked) lv_obj_add_state(runtime.object, LV_STATE_CHECKED);
  else lv_obj_remove_state(runtime.object, LV_STATE_CHECKED);
  return true;
}

// A Choice Strip's options are its children, in order; the chosen one is
// checked. The index is clamped into the options, so a wire can only pick one.
static bool _cdSetChoice(CustomDisplayWidgetRuntime &runtime, float value) {
  if (!isfinite(value)) value = runtime.minimum;
  int32_t index = (int32_t)lroundf(constrain(value, runtime.minimum, runtime.maximum));
  runtime.floatValue = (float)index;
  if (runtime.lastInteger == index) return false;
  runtime.lastInteger = index;
  uint32_t count = lv_obj_get_child_count(runtime.object);
  for (uint32_t i = 0; i < count; i++) {
    lv_obj_t *option = lv_obj_get_child(runtime.object, (int32_t)i);
    if ((int32_t)i == index) lv_obj_add_state(option, LV_STATE_CHECKED);
    else lv_obj_remove_state(option, LV_STATE_CHECKED);
  }
  return true;
}

// A Step Control's children are its minus key, its value and its plus key.
// The value snaps to the step from the minimum and is redrawn only when it
// lands on a different step.
static bool _cdSetStep(CustomDisplayWidgetRuntime &runtime, float value) {
  if (!isfinite(value)) value = runtime.minimum;
  float steps = runtime.step > 0.0f ? roundf((value - runtime.minimum) / runtime.step) : 0.0f;
  runtime.floatValue = constrain(runtime.minimum + steps * runtime.step, runtime.minimum, runtime.maximum);
  int32_t position = runtime.step > 0.0f
    ? (int32_t)lroundf((runtime.floatValue - runtime.minimum) / runtime.step)
    : 0;
  if (runtime.lastInteger == position) return false;
  runtime.lastInteger = position;
  snprintf(runtime.text, CD_TEXT_BYTES, "%.*f", (int)runtime.decimals, (double)runtime.floatValue);
  lv_label_set_text(lv_obj_get_child(runtime.object, 1), runtime.text);
  return true;
}

// A Colour Picker holds its hue in whole degrees in floatValue, and its marker
// is the seventh child, after the six strip segments. Placed the way the
// preview places it: centred on the hue, held inside the strip.
static bool _cdSetHue(CustomDisplayWidgetRuntime &runtime, float hue) {
  if (!isfinite(hue)) hue = 0.0f;
  int32_t degrees = (int32_t)lroundf(constrain(hue, 0.0f, 360.0f));
  runtime.floatValue = (float)degrees;
  if (runtime.lastInteger == degrees) return false;
  runtime.lastInteger = degrees;
  lv_obj_t *marker = lv_obj_get_child(runtime.object, 6);
  int32_t width = lv_obj_get_content_width(runtime.object);
  int32_t span = lv_obj_get_width(marker);
  int32_t x = (int32_t)lroundf(degrees * width / 360.0f) - span / 2;
  int32_t travel = width > span ? width - span : 0;
  lv_obj_set_x(marker, x < 0 ? 0 : (x > travel ? travel : x));
  return true;
}

// The hue of a packed RGB colour in whole degrees (displayColorHue); a grey
// has none and reads as 0.
static float _cdColorHue(uint32_t rgb) {
  float r = ((rgb >> 16) & 0xFFu) / 255.0f, g = ((rgb >> 8) & 0xFFu) / 255.0f, b = (rgb & 0xFFu) / 255.0f;
  float high = max(r, max(g, b)), low = min(r, min(g, b)), delta = high - low;
  if (!(delta > 0.0f)) return 0.0f;
  float sector = high == r ? fmodf((g - b) / delta + 6.0f, 6.0f)
    : high == g ? (b - r) / delta + 2.0f
    : (r - g) / delta + 4.0f;
  return fmodf(roundf(sector * 60.0f), 360.0f);
}

static bool _cdSetLed(CustomDisplayWidgetRuntime &runtime, bool on) {
  int32_t value = on ? 1 : 0;
  if (runtime.lastInteger == value) return false;
  runtime.lastInteger = value;
  if (on) lv_led_on(runtime.object);
  else lv_led_off(runtime.object);
  return true;
}

static bool _cdSetColor(CustomDisplayWidgetRuntime &runtime, uint32_t color) {
  color &= 0xFFFFFFu;
  if (runtime.lastColor == color) return false;
  runtime.lastColor = color;
  lv_obj_set_style_bg_color(runtime.object, lv_color_hex(color), LV_PART_MAIN);
  return true;
}

static bool _cdBoolOutput(CustomDisplayWidgetRuntime &runtime) {
  runtime.touchPending = false;
  return runtime.boolValue;
}

static float _cdFloatOutput(CustomDisplayWidgetRuntime &runtime) {
  runtime.touchPending = false;
  return runtime.floatValue;
}

static int32_t _cdScaled(float value, float minimum, float maximum) {
  if (!isfinite(value) || maximum <= minimum) return 0;
  float unit = (value - minimum) / (maximum - minimum);
  return (int32_t)lroundf(constrain(unit, 0.0f, 1.0f) * CD_VALUE_SCALE);
}

static void _cdFormatTime(char *dst, float seconds, bool showHours) {
  if (!isfinite(seconds)) { _cdCopy(dst, "---"); return; }
  uint32_t whole = (uint32_t)max(0.0f, floorf(seconds));
  uint32_t hours = whole / 3600u;
  uint32_t minutes = (whole / 60u) % 60u;
  uint32_t secs = whole % 60u;
  if (showHours || hours > 0) snprintf(dst, CD_TEXT_BYTES, "%lu:%02lu:%02lu", (unsigned long)hours, (unsigned long)minutes, (unsigned long)secs);
  else snprintf(dst, CD_TEXT_BYTES, "%lu:%02lu", (unsigned long)(whole / 60u), (unsigned long)secs);
}

static void _cdEvent(lv_event_t *event) {
  CustomDisplayWidgetRuntime *runtime = (CustomDisplayWidgetRuntime *)lv_event_get_user_data(event);
  lv_event_code_t code = lv_event_get_code(event);
  if (code == LV_EVENT_PRESSED) {
    runtime->touchOwned = true;
    if (runtime->kind == 1) {
      runtime->boolValue = true;
      runtime->touchPending = true;
    }
  }
  if (code == LV_EVENT_VALUE_CHANGED) {
    if (runtime->kind == 2) {
      runtime->boolValue = lv_obj_has_state(runtime->object, LV_STATE_CHECKED);
      runtime->touchPending = true;
      runtime->taps++;
    }
    if (runtime->kind == 3 || runtime->kind == 4) {
      int32_t raw = runtime->kind == 3 ? lv_slider_get_value(runtime->object) : lv_arc_get_value(runtime->object);
      float value = runtime->minimum + (runtime->maximum - runtime->minimum) * raw / (float)CD_VALUE_SCALE;
      if (runtime->step > 0.0f) value = runtime->minimum + roundf((value - runtime->minimum) / runtime->step) * runtime->step;
      runtime->floatValue = constrain(value, runtime->minimum, runtime->maximum);
      runtime->taps++;
      runtime->touchPending = true;
    }
  }
  // A Choice Strip picks the option lifted from; a Step Control moves on the
  // press and again while held, at LVGL's long-press repeat.
  if (runtime->kind == 5 && code == LV_EVENT_CLICKED) {
    _cdSetChoice(*runtime, (float)lv_obj_get_index((lv_obj_t *)lv_event_get_target(event)));
    runtime->taps++;
    runtime->touchPending = true;
  }
  if (runtime->kind == 6 && (code == LV_EVENT_PRESSED || code == LV_EVENT_LONG_PRESSED_REPEAT)) {
    float direction = lv_obj_get_index((lv_obj_t *)lv_event_get_target(event)) == 0 ? -1.0f : 1.0f;
    _cdSetStep(*runtime, runtime->floatValue + direction * runtime->step);
    runtime->taps++;
    runtime->touchPending = true;
  }
  // A Colour Picker follows the finger along its strip, read across the whole
  // box as the preview reads it.
  if (runtime->kind == 7 && (code == LV_EVENT_PRESSED || code == LV_EVENT_PRESSING)) {
    lv_point_t point;
    lv_indev_get_point(lv_indev_active(), &point);
    lv_area_t area;
    lv_obj_get_coords(runtime->object, &area);
    int32_t span = lv_area_get_width(&area);
    float unit = (point.x - area.x1) / (float)(span > 1 ? span : 1);
    _cdSetHue(*runtime, roundf(constrain(unit, 0.0f, 1.0f) * 360.0f));
    if (code == LV_EVENT_PRESSED) runtime->taps++;
    runtime->touchPending = true;
  }
  if (code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST) {
    if (runtime->kind == 1) {
      runtime->boolValue = false;
      runtime->touchPending = true;
    }
    runtime->touchOwned = false;
  }
}
`

/**
 * A Colour Picker's colour, emitted only into a sketch that has one.
 *
 * Kept out of the shared helpers because it is the one helper that names
 * `CRGB`: a screen-only sketch drops the FastLED include when nothing it
 * emits mentions FastLED, and a CRGB in a helper nobody calls would keep it.
 */
export const CUSTOM_DISPLAY_LVGL_HUE_COLOR_CPP = `// The six-sector HSV every renderer shares (displayHueColor): channels move
// linearly between neighbouring pure hues, matching the drawn strip. FastLED's
// CHSV is not used because its rainbow conversion brightens yellow.
static CRGB _cdHueColor(float hue, float saturation, float value) {
  float h = fmodf(fmodf(isfinite(hue) ? hue : 0.0f, 360.0f) + 360.0f, 360.0f) / 60.0f;
  float v = constrain(value, 0.0f, 1.0f);
  float c = v * constrain(saturation, 0.0f, 1.0f);
  float x = c * (1.0f - fabsf(fmodf(h, 2.0f) - 1.0f));
  float r = 0.0f, g = 0.0f, b = 0.0f;
  switch ((int)h) {
    case 0: r = c; g = x; break;
    case 1: r = x; g = c; break;
    case 2: g = c; b = x; break;
    case 3: g = x; b = c; break;
    case 4: r = x; b = c; break;
    default: r = c; b = x; break;
  }
  float m = v - c;
  return CRGB((uint8_t)lroundf((r + m) * 255.0f), (uint8_t)lroundf((g + m) * 255.0f), (uint8_t)lroundf((b + m) * 255.0f));
}
`

/** Whether any of these designs needs `CUSTOM_DISPLAY_LVGL_HUE_COLOR_CPP`. */
export function customDisplayNeedsHueColor(documents: readonly DisplayDocument[]): boolean {
  return documents.some((document) => placedWidgets(document).some((widget) => widget.type === 'Colour Picker'))
}

/**
 * One monotonic LVGL clock and one bounded service gate per sketch.
 *
 * LVGL reads Arduino's millisecond clock directly. There is deliberately no
 * lv_tick_inc() in loop(): incrementing by a constant once per LED frame makes
 * animations run faster on a short strip and slower on a long one. Unsigned
 * subtraction keeps the handler cadence correct across millis() rollover.
 */
export const CUSTOM_DISPLAY_LVGL_TIMING_CPP = `// ── LVGL wall-clock service ─────────────────────────────────────────────────
#define CD_HANDLER_MIN_MS ${CUSTOM_DISPLAY_LVGL_HANDLER_MIN_MS}u
static uint32_t _cdLastHandlerMs = 0;

static uint32_t _cdMonotonicMillis() { return (uint32_t)millis(); }

static void _cdBeginTiming() {
  lv_tick_set_cb(_cdMonotonicMillis);
  _cdLastHandlerMs = _cdMonotonicMillis();
}

static void _cdServiceLvgl() {
  uint32_t now = _cdMonotonicMillis();
  if ((uint32_t)(now - _cdLastHandlerMs) < CD_HANDLER_MIN_MS) return;
  _cdLastHandlerMs = now;
  lv_timer_handler();
}
`

/** Starts LVGL, before any LVGL object is created. Where lv_conf.h takes the
 * pool from heap, a missing block would fault inside LVGL's allocator, so the
 * sketch stops first with a reason on the console. It prints through the ROM
 * because `Serial` would link the UART driver (~10 KB of flash) into every
 * sketch that has no other use for it. */
export function customDisplayLvglInitCpp(): string[] {
  return [
    '#if defined(FLS_LVGL_POOL_FROM_HEAP)',
    '  if (heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) < LV_MEM_SIZE) {',
    '    esp_rom_printf("Custom screen: no free block of internal RAM for LVGL; stopped.\\n");',
    '    for (;;) delay(1000);',
    '  }',
    '#endif',
    '  lv_init();',
  ]
}

export function customDisplayLvglTimingSetupCpp(): string {
  return '  _cdBeginTiming();'
}

export function customDisplayLvglTimingLoopCpp(): string {
  return '  _cdServiceLvgl();'
}

/** Per-display globals. Widget ids and labels are never identifiers: only the
 * codegen-owned display stem and stable array indices occur in declarations. */
/**
 * The widgets this screen emits, in the order that *is* the runtime array.
 *
 * Only placed widgets draw, and the index into this list is the widget's
 * runtime slot — and also the `widgetIndex` its baked asset was registered
 * under in `customDisplayResources.ts`. Both modules count the placed list, so
 * every walk here has to come through this one accessor: a walk over
 * `document.widgets` would number the slots differently and the screen would
 * quietly draw one widget's icon on another.
 */
function emittedWidgets(emit: CustomDisplayLvglEmit): PlacedDisplayWidget[] {
  return placedWidgets(emit.document)
}

export function customDisplayLvglGlobalCpp(emit: CustomDisplayLvglEmit): string {
  const id = safeId(emit.id)
  const count = Math.max(1, emittedWidgets(emit).length)
  return [
    `// FLS-LVGL-FONTS:${customDisplayFontSizes(emit.document).join(',')}`,
    `static lv_obj_t *_cdScreen_${id} = nullptr;`,
    `static CustomDisplayWidgetRuntime _cd_${id}[${count}] = {};`,
  ].join('\n')
}

/** Deterministic object creation and styling in document order. */
export function customDisplayLvglSetupCpp(emit: CustomDisplayLvglEmit): string[] {
  const id = safeId(emit.id)
  const theme = resolveDisplayThemeTokens(emit.document.theme)
  const background = theme.background.kind === 'solid'
    ? theme.background.color
    : theme.background.kind === 'gradient'
      ? theme.background.startColor
      : theme.background.fallbackColor
  const lines = [
    `  _cdScreen_${id} = lv_obj_create(nullptr);`,
    `  lv_obj_remove_flag(_cdScreen_${id}, LV_OBJ_FLAG_SCROLLABLE);`,
    `  lv_obj_set_style_pad_all(_cdScreen_${id}, 0, LV_PART_MAIN);`,
    `  lv_obj_set_style_border_width(_cdScreen_${id}, 0, LV_PART_MAIN);`,
    `  lv_obj_set_style_bg_color(_cdScreen_${id}, lv_color_hex(${colorHex(background)}), LV_PART_MAIN);`,
    `  lv_obj_set_style_bg_opa(_cdScreen_${id}, LV_OPA_COVER, LV_PART_MAIN);`,
  ]
  if (theme.background.kind === 'gradient') {
    lines.push(`  lv_obj_set_style_bg_grad_color(_cdScreen_${id}, lv_color_hex(${colorHex(theme.background.endColor)}), LV_PART_MAIN);`)
    lines.push(`  lv_obj_set_style_bg_grad_dir(_cdScreen_${id}, ${theme.background.direction === 'vertical' ? 'LV_GRAD_DIR_VER' : 'LV_GRAD_DIR_HOR'}, LV_PART_MAIN);`)
  }
  const backgroundIndex = emit.assets ? customDisplayAssetIndex(emit.document, { kind: 'background' }) : null
  if (backgroundIndex !== null) {
    lines.push(`  lv_obj_t *_cdBackground_${id} = lv_image_create(_cdScreen_${id});`)
    lines.push(`  lv_image_set_src(_cdBackground_${id}, &${customDisplayAssetSymbol(customDisplayAssetStem(emit), backgroundIndex)});`)
    lines.push(`  lv_obj_set_pos(_cdBackground_${id}, 0, 0);`)
    lines.push(`  lv_obj_set_size(_cdBackground_${id}, ${emit.document.designSize.width}, ${emit.document.designSize.height});`)
  }
  emittedWidgets(emit).forEach((widget, index) => lines.push(...setupWidgetLines(emit, widget, index)))
  lines.push(`  lv_screen_load(_cdScreen_${id});`)
  return lines
}

function passiveUpdateLines(emit: CustomDisplayLvglEmit, widget: DisplayWidget, index: number): string[] {
  const expr = binding(emit, widget.id, 'value')
  if (!expr) return []
  const rt = runtime(emit, index)
  switch (widget.type) {
    case 'Text':
      return [`  _cdSetText(${rt}, ${expr});`]
    case 'Numeric Readout': {
      const format = normalizeNumberFormat(widget.properties)
      return [
        `  _dsFormatNumber(${rt}.nextText, (double)(${expr}), ${format.decimals}, ${format.padWidth}, `
          + `${format.showSign ? 'true' : 'false'}, ${format.maxIntegerDigits}, ${cppStringLiteral(format.prefix)}, ${cppStringLiteral(format.suffix)});`,
        `  _cdSetText(${rt}, ${rt}.nextText);`,
      ]
    }
    case 'Timecode':
      return [
        `  _cdFormatTime(${rt}.nextText, (float)(${expr}), ${boolProperty(widget, 'showHours', false) ? 'true' : 'false'});`,
        `  _cdSetText(${rt}, ${rt}.nextText);`,
      ]
    case 'Progress':
    case 'Value Meter': {
      const min = numberProperty(widget, 'min', 0)
      const max = numberProperty(widget, 'max', 1)
      return [`  _cdSetInteger(${rt}, _cdScaled((float)(${expr}), ${floatLiteral(min)}, ${floatLiteral(max)}));`]
    }
    case 'Status Indicator':
      return [`  _cdSetLed(${rt}, (bool)(${expr}));`]
    case 'Colour Swatch':
      return [`  _cdSetColor(${rt}, (uint32_t)(${expr}));`]
    case 'Arc Gauge': {
      const min = numberProperty(widget, 'min', 0)
      const max = numberProperty(widget, 'max', 1)
      const lines = [`  _cdSetInteger(${rt}, _cdScaled((float)(${expr}), ${floatLiteral(min)}, ${floatLiteral(max)}));`]
      if (boolProperty(widget, 'showValue', true)) {
        const format = normalizeNumberFormat(widget.properties)
        lines.push(
          `  _dsFormatNumber(${rt}.nextText, (double)(${expr}), ${format.decimals}, ${format.padWidth}, `
            + `${format.showSign ? 'true' : 'false'}, ${format.maxIntegerDigits}, ${cppStringLiteral(format.prefix)}, ${cppStringLiteral(format.suffix)});`,
          `  _cdSetChildText(${rt}, 0, ${rt}.nextText);`,
        )
      }
      return lines
    }
    case 'Pattern Browser':
      // The control-graph resolver supplies the selected name expression; the
      // thumbnail itself belongs to the asset-baking slice.
      return [`  _cdSetText(${rt}, ${expr});`]
    default:
      return []
  }
}

function synchronizedUpdateLines(emit: CustomDisplayLvglEmit, widget: DisplayWidget, index: number): string[] {
  const expr = binding(emit, widget.id, 'set')
  if (!expr) return []
  const rt = runtime(emit, index)
  if (widget.type === 'Toggle') {
    return [
      `  if (!${rt}.touchOwned && !${rt}.touchPending) _cdSetChecked(${rt}, (bool)(${expr}));`,
      `  if (!${rt}.touchOwned) ${rt}.touchPending = false;`,
    ]
  }
  if (widget.type === 'Slider' || widget.type === 'Dial') {
    return [
      `  if (!${rt}.touchOwned && !${rt}.touchPending) {`,
      `    ${rt}.floatValue = constrain((float)(${expr}), ${rt}.minimum, ${rt}.maximum);`,
      `    _cdSetInteger(${rt}, _cdScaled(${rt}.floatValue, ${rt}.minimum, ${rt}.maximum));`,
      `  }`,
      `  if (!${rt}.touchOwned) ${rt}.touchPending = false;`,
    ]
  }
  if (widget.type === 'Colour Picker') {
    // The binding is the packed colour a Colour Swatch also stores.
    return [
      `  if (!${rt}.touchOwned && !${rt}.touchPending) _cdSetHue(${rt}, _cdColorHue((uint32_t)(${expr})));`,
      `  if (!${rt}.touchOwned) ${rt}.touchPending = false;`,
    ]
  }
  if (widget.type === 'Choice Strip' || widget.type === 'Step Control') {
    const setter = widget.type === 'Choice Strip' ? '_cdSetChoice' : '_cdSetStep'
    return [
      `  if (!${rt}.touchOwned && !${rt}.touchPending) ${setter}(${rt}, (float)(${expr}));`,
      `  if (!${rt}.touchOwned) ${rt}.touchPending = false;`,
    ]
  }
  return []
}

/** Role-based, change-only input updates. This is intentionally independent
 * of LVGL's timer handler; the generator decides where graph publication ends
 * and the later scheduling slice decides when LVGL flushes it. */
export function customDisplayLvglLoopCpp(emit: CustomDisplayLvglEmit): string[] {
  const lines: string[] = []
  emittedWidgets(emit).forEach((widget, index) => {
    lines.push(...passiveUpdateLines(emit, widget, index))
    lines.push(...synchronizedUpdateLines(emit, widget, index))
  })
  return lines
}

/** Graph-facing touch value for a widget output role. */
export function customDisplayLvglOutputExpression(
  emit: CustomDisplayLvglEmit,
  widgetId: string,
): string | null {
  const widgets = emittedWidgets(emit)
  const index = widgets.findIndex((widget) => widget.id === widgetId)
  if (index < 0) return null
  const widget = widgets[index]
  if (widget.type === 'Button' || widget.type === 'Toggle') return `_cdBoolOutput(${runtime(emit, index)})`
  if (widget.type === 'Colour Picker') {
    // A CRGB, the type a colour wire carries in every generator.
    const { saturation, brightness } = displayPickerTone(widget)
    return `_cdHueColor(_cdFloatOutput(${runtime(emit, index)}), ${floatLiteral(saturation)}, ${floatLiteral(brightness)})`
  }
  if (displayWidgetIsNumericControl(widget.type)) return `_cdFloatOutput(${runtime(emit, index)})`
  return null
}

/**
 * How many times a finger has flipped this Toggle, as a C++ expression.
 *
 * The widget's own output follows its Set input once released, so it cannot
 * say whether a change was a press or the player reporting back. The count
 * moves only on a real tap. Null for anything that is not an emitted Toggle.
 */
export function customDisplayLvglTapExpression(
  emit: CustomDisplayLvglEmit,
  widgetId: string,
): string | null {
  const widgets = emittedWidgets(emit)
  const index = widgets.findIndex((widget) => widget.id === widgetId)
  const type = widgets[index]?.type
  if (index < 0 || !type || (type !== 'Toggle' && !displayWidgetIsNumericControl(type))) return null
  return `${runtime(emit, index)}.taps`
}

import { customDisplayId as safeId } from './customDisplayId'
// Deterministic LVGL 9 object tree for the freeform Display node.
//
// This module deliberately stops at the LVGL boundary. The panel driver and
// browser-side rasterizer are separate slices, while customDisplayAssetsCpp
// supplies the finished PROGMEM tables. It owns the parts that are purely a
// function of a normalized DisplayDocument: objects, styles, font selection,
// callbacks, bounded caches and bindings.

import type { DisplayDocument, DisplayWidget, DisplayWidgetProperty } from '../state/displayDocument'
import { displayWidgetDefinition, type DisplayWidgetPortRoleId } from '../state/displayRegistry'
import { resolveDisplayThemeTokens, displayWidgetTextTokens, type DisplayWidgetStateTokens } from '../state/displayTheme'
import { DISPLAY_TEXT_BUFFER_BYTES, cppStringLiteral, displayString, normalizeNumberFormat } from '../state/displayText'
import {
  customDisplayAssetRequests,
  customDisplayFontSize,
  customDisplayFontSizes,
  type BakedCustomDisplayAsset,
} from '../state/customDisplayResources'
import { customDisplayAssetIndex, customDisplayAssetSymbol } from './customDisplayAssetsCpp'

export const CUSTOM_DISPLAY_LVGL_INCLUDE = '#include <lvgl.h>'

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
 * screen, widget, style and dynamically allocated label. Keep in step with
 * backend/app.py's LV_MEM_SIZE (checked by the RAM contract test). */
export const CUSTOM_DISPLAY_LVGL_HEAP_BYTES = 64 * 1024

/** CustomDisplayWidgetRuntime on the supported 32-bit targets: pointer,
 * four byte-sized fields, four floats, two integers and two bounded strings,
 * rounded to the struct's four-byte alignment. This lives outside LVGL's heap. */
export const CUSTOM_DISPLAY_WIDGET_RAM_BYTES = Math.ceil((32 + 2 * DISPLAY_TEXT_BUFFER_BYTES) / 4) * 4

export interface CustomDisplayLvglBinding {
  /** C++ expression for the registry role, already resolved by the graph
   * generator. Expressions are codegen-owned; document text never enters here. */
  role: DisplayWidgetPortRoleId
  expression: string
}

export interface CustomDisplayLvglEmit {
  /** Codegen-owned identifier stem (normally the sanitized graph node id). */
  id: string
  document: DisplayDocument
  /** Finished, validated browser-side rasterizations. Omit while previewing an
   * incomplete document; deploy generation validates and requires every use. */
  assets?: readonly BakedCustomDisplayAsset[]
  /** Bindings grouped by widget id. Unknown roles are harmlessly ignored. */
  bindings?: Readonly<Record<string, readonly CustomDisplayLvglBinding[]>>
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

function styleLines(
  target: string,
  tokens: DisplayWidgetStateTokens,
  selector = 'LV_PART_MAIN',
): string[] {
  return [
    `  lv_obj_set_style_bg_color(${target}, lv_color_hex(${colorHex(tokens.surfaceColor)}), ${selector});`,
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
  return styleLines(target, tokens, `LV_PART_MAIN | LV_STATE_${state}`)
}

function widgetCreateExpression(widget: DisplayWidget, screen: string): string {
  switch (displayWidgetDefinition(widget.type).lvglEmitter) {
    case 'label': return `lv_label_create(${screen})`
    case 'bar': return `lv_bar_create(${screen})`
    case 'led': return `lv_led_create(${screen})`
    case 'button': return `lv_button_create(${screen})`
    case 'switch': return `lv_switch_create(${screen})`
    case 'slider': return `lv_slider_create(${screen})`
    case 'arc': return `lv_arc_create(${screen})`
    // Pattern Browser keeps its placeholder until its separate collection
    // thumbnail slice is wired into the custom screen.
    case 'pattern-browser': return `lv_label_create(${screen})`
    case 'image': return `lv_image_create(${screen})`
    case 'swatch': return `lv_obj_create(${screen})`
  }
}

function controlKind(widget: DisplayWidget): number {
  if (widget.type === 'Button') return 1
  if (widget.type === 'Toggle') return 2
  if (widget.type === 'Slider') return 3
  if (widget.type === 'Dial') return 4
  return 0
}

function setupWidgetLines(emit: CustomDisplayLvglEmit, widget: DisplayWidget, index: number): string[] {
  const theme = resolveDisplayThemeTokens(emit.document.theme)
  const base = widget.type === 'Toggle' || widget.type === 'Status Indicator'
    ? theme.states.inactive
    : theme.states.default
  const obj = object(emit, index)
  const rt = runtime(emit, index)
  const b = widget.bounds
  const lines = [
    `  ${rt}.lastInteger = INT32_MIN;`,
    `  ${rt}.lastColor = UINT32_MAX;`,
    `  ${obj} = ${widgetCreateExpression(widget, `_cdScreen_${safeId(emit.id)}`)};`,
    `  lv_obj_set_pos(${obj}, ${b.x}, ${b.y});`,
    `  lv_obj_set_size(${obj}, ${b.width}, ${b.height});`,
    `  lv_obj_set_style_radius(${obj}, ${theme.cornerRadius}, LV_PART_MAIN);`,
    `  lv_obj_set_style_border_width(${obj}, ${theme.borderWidth}, LV_PART_MAIN);`,
    ...styleLines(obj, base),
  ]

  const text = displayWidgetTextTokens(widget, emit.document.theme)
  if (displayWidgetDefinition(widget.type).lvglEmitter === 'label') {
    lines.push(
      `  lv_obj_set_style_text_font(${obj}, &lv_font_montserrat_${customDisplayFontSize(text.fontSize)}, LV_PART_MAIN);`,
      `  lv_obj_set_style_text_align(${obj}, ${alignCpp(text.align)}, LV_PART_MAIN);`,
      `  lv_label_set_long_mode(${obj}, ${text.wrap ? 'LV_LABEL_LONG_MODE_WRAP' : 'LV_LABEL_LONG_MODE_DOTS'});`,
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
  }

  if (widget.type === 'Toggle' || widget.type === 'Slider' || widget.type === 'Dial') {
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(base.trackColor)}), LV_PART_MAIN);`)
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(base.indicatorColor)}), LV_PART_INDICATOR);`)
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(base.thumbColor)}), LV_PART_KNOB);`)
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(theme.states.active.indicatorColor)}), LV_PART_INDICATOR | LV_STATE_CHECKED);`)
    lines.push(`  lv_obj_set_style_bg_color(${obj}, lv_color_hex(${colorHex(theme.states.pressed.thumbColor)}), LV_PART_KNOB | LV_STATE_PRESSED);`)
  }

  if (widget.type === 'Slider' || widget.type === 'Dial') {
    lines.push(`  ${rt}.minimum = ${floatLiteral(numberProperty(widget, 'min', 0))};`)
    lines.push(`  ${rt}.maximum = ${floatLiteral(numberProperty(widget, 'max', 1))};`)
    lines.push(`  ${rt}.step = ${floatLiteral(numberProperty(widget, 'step', 0.01))};`)
    if (widget.type === 'Slider') {
      lines.push(`  lv_slider_set_range(${obj}, 0, CD_VALUE_SCALE);`)
      if (stringProperty(widget, 'orientation', 'horizontal') === 'vertical') {
        lines.push(`  lv_slider_set_orientation(${obj}, LV_SLIDER_ORIENTATION_VERTICAL);`)
      }
    } else {
      lines.push(`  lv_arc_set_range(${obj}, 0, CD_VALUE_SCALE);`)
      lines.push(`  lv_arc_set_bg_angles(${obj}, 135, 45);`)
    }
  }

  const kind = controlKind(widget)
  if (kind > 0) {
    lines.push(`  ${rt}.kind = ${kind};`)
    lines.push(`  lv_obj_add_event_cb(${obj}, _cdEvent, LV_EVENT_ALL, &${rt});`)
    lines.push(...stateStyleLines(obj, theme.states.pressed, 'PRESSED'))
    lines.push(...stateStyleLines(obj, theme.states.active, 'CHECKED'))
    lines.push(...stateStyleLines(obj, theme.states.disabled, 'DISABLED'))
  }

  if (widget.type === 'Text') {
    lines.push(`  _cdSetText(${rt}, ${cppStringLiteral(displayString(stringProperty(widget, 'text')))});`)
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
      lines.push(`  lv_image_set_src(${obj}, &${customDisplayAssetSymbol(emit.id, assetIndex)});`)
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
    lines.push(...controlContentsLines(emit, widget, index, obj, text.fontSize, stringProperty(widget, 'text', widget.label || 'Button')))
  } else if (widget.type === 'Toggle') {
    const label = stringProperty(widget, 'offLabel', 'Off')
    lines.push(...controlContentsLines(emit, widget, index, obj, text.fontSize, label))
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
    lines.push(`  lv_image_set_src(${image}, &${customDisplayAssetSymbol(emit.id, assetIndex)});`)
    lines.push(presentation === 'icon'
      ? `  lv_obj_center(${image});`
      : `  lv_obj_align(${image}, LV_ALIGN_LEFT_MID, 4, 0);`)
  }
  if (presentation !== 'icon' || assetIndex === null) {
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

struct CustomDisplayWidgetRuntime {
  lv_obj_t *object;
  uint8_t kind;                 // 0 passive, 1 button, 2 toggle, 3 slider, 4 dial
  bool touchOwned;
  bool touchPending;
  bool boolValue;
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

static bool _cdSetInteger(CustomDisplayWidgetRuntime &runtime, int32_t value) {
  if (runtime.lastInteger == value) return false;
  runtime.lastInteger = value;
  if (runtime.kind == 3) lv_slider_set_value(runtime.object, value, LV_ANIM_OFF);
  else if (runtime.kind == 4) lv_arc_set_value(runtime.object, value);
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
    }
    if (runtime->kind == 3 || runtime->kind == 4) {
      int32_t raw = runtime->kind == 3 ? lv_slider_get_value(runtime->object) : lv_arc_get_value(runtime->object);
      float value = runtime->minimum + (runtime->maximum - runtime->minimum) * raw / (float)CD_VALUE_SCALE;
      if (runtime->step > 0.0f) value = runtime->minimum + roundf((value - runtime->minimum) / runtime->step) * runtime->step;
      runtime->floatValue = constrain(value, runtime->minimum, runtime->maximum);
      runtime->touchPending = true;
    }
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

export function customDisplayLvglTimingSetupCpp(): string {
  return '  _cdBeginTiming();'
}

export function customDisplayLvglTimingLoopCpp(): string {
  return '  _cdServiceLvgl();'
}

/** Per-display globals. Widget ids and labels are never identifiers: only the
 * codegen-owned display stem and stable array indices occur in declarations. */
export function customDisplayLvglGlobalCpp(emit: CustomDisplayLvglEmit): string {
  const id = safeId(emit.id)
  const count = Math.max(1, emit.document.widgets.length)
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
  ]
  if (theme.background.kind === 'gradient') {
    lines.push(`  lv_obj_set_style_bg_grad_color(_cdScreen_${id}, lv_color_hex(${colorHex(theme.background.endColor)}), LV_PART_MAIN);`)
    lines.push(`  lv_obj_set_style_bg_grad_dir(_cdScreen_${id}, ${theme.background.direction === 'vertical' ? 'LV_GRAD_DIR_VER' : 'LV_GRAD_DIR_HOR'}, LV_PART_MAIN);`)
  }
  const backgroundIndex = emit.assets ? customDisplayAssetIndex(emit.document, { kind: 'background' }) : null
  if (backgroundIndex !== null) {
    lines.push(`  lv_obj_t *_cdBackground_${id} = lv_image_create(_cdScreen_${id});`)
    lines.push(`  lv_image_set_src(_cdBackground_${id}, &${customDisplayAssetSymbol(emit.id, backgroundIndex)});`)
    lines.push(`  lv_obj_set_pos(_cdBackground_${id}, 0, 0);`)
    lines.push(`  lv_obj_set_size(_cdBackground_${id}, ${emit.document.designSize.width}, ${emit.document.designSize.height});`)
  }
  emit.document.widgets.forEach((widget, index) => lines.push(...setupWidgetLines(emit, widget, index)))
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
  return []
}

/** Role-based, change-only input updates. This is intentionally independent
 * of LVGL's timer handler; the generator decides where graph publication ends
 * and the later scheduling slice decides when LVGL flushes it. */
export function customDisplayLvglLoopCpp(emit: CustomDisplayLvglEmit): string[] {
  const lines: string[] = []
  emit.document.widgets.forEach((widget, index) => {
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
  const index = emit.document.widgets.findIndex((widget) => widget.id === widgetId)
  if (index < 0) return null
  const widget = emit.document.widgets[index]
  if (widget.type === 'Button' || widget.type === 'Toggle') return `_cdBoolOutput(${runtime(emit, index)})`
  if (widget.type === 'Slider' || widget.type === 'Dial') return `_cdFloatOutput(${runtime(emit, index)})`
  return null
}

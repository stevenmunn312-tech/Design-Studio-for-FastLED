import type { DisplayWidget } from '../../state/displays/displayDocument'
import {
  displayControlRange,
  displayControlStartValue,
  displayPickerStartHue,
  displayTextEntryStart,
  displayWidgetIsControl,
} from '../../state/displays/displayRegistry'
import {
  resolvedDisplayControlValue,
  type DisplayWidgetRuntime,
} from '../../state/displays/displayRuntimeStore'

export type DisplayControlValue = boolean | number | string

/** Value the shared preview renderer paints for one evaluated widget. */
export function displayRunValue(
  widget: DisplayWidget,
  runtime: DisplayWidgetRuntime | undefined,
): unknown {
  // A Chart draws what it has read so far, not the latest reading alone.
  if (widget.type === 'Chart') return runtime?.history ?? []
  const fallback = initialDisplayControlValue(widget)
  return fallback === undefined
    ? runtime?.roleValues.get('value')
    : resolvedDisplayControlValue(runtime, fallback)
}

export interface DisplayControlRect {
  left: number
  top: number
  width: number
  height: number
}

export function isInteractiveDisplayWidget(widget: DisplayWidget): boolean {
  // Through the registry rather than by naming the four: the `out` role is
  // what makes a widget finger-driven, so a fifth control joins this for free.
  return displayWidgetIsControl(widget.type)
}

export function initialDisplayControlValue(widget: DisplayWidget): DisplayControlValue | undefined {
  if (widget.type === 'Button' || widget.type === 'Toggle') return false
  // A Colour Picker's state is its hue in degrees; the colour is derived.
  if (widget.type === 'Colour Picker') return displayPickerStartHue(widget)
  if (widget.type === 'Text Entry') return displayTextEntryStart(widget)
  return displayControlStartValue(widget)
}

export function snapDisplayControlValue(widget: DisplayWidget, value: number): number {
  const { min, max, step } = displayControlRange(widget)
  const clamped = Math.max(min, Math.min(max, value))
  const snapped = min + Math.round((clamped - min) / step) * step
  const precision = Math.min(8, Math.max(0, (String(step).split('.')[1] ?? '').length))
  return Number(Math.max(min, Math.min(max, snapped)).toFixed(precision))
}

export function sliderValueFromPoint(
  widget: DisplayWidget,
  point: { x: number; y: number },
  rect: DisplayControlRect,
): number {
  const { min, max } = displayControlRange(widget)
  const vertical = widget.properties.orientation === 'vertical'
  const amount = vertical
    ? 1 - ((point.y - rect.top) / Math.max(1, rect.height))
    : (point.x - rect.left) / Math.max(1, rect.width)
  return snapDisplayControlValue(widget, min + Math.max(0, Math.min(1, amount)) * (max - min))
}

export function dialValueFromDrag(
  widget: DisplayWidget,
  startValue: number,
  deltaY: number,
  travel = 120,
): number {
  const { min, max } = displayControlRange(widget)
  return snapDisplayControlValue(widget, startValue - (deltaY / Math.max(1, travel)) * (max - min))
}

export function stepDisplayControlValue(widget: DisplayWidget, value: number, direction: -1 | 1): number {
  return snapDisplayControlValue(widget, value + displayControlRange(widget).step * direction)
}

/**
 * Which option of a Choice Strip a point lands on, counting the first as 0.
 * The strip is divided evenly, the same split the LVGL emitter lays out.
 */
export function choiceIndexFromPoint(widget: DisplayWidget, x: number, rect: DisplayControlRect): number {
  const { max } = displayControlRange(widget)
  const count = max + 1
  const index = Math.floor(((x - rect.left) / Math.max(1, rect.width)) * count)
  return Math.max(0, Math.min(max, index))
}

/**
 * Which key of a Step Control a point lands on: -1 for minus, 1 for plus,
 * 0 for the value between them. `keyFraction` is each key's share of the
 * control's width (`displayStepKeyWidth` over the drawn width), so the hit
 * test follows the drawing at any zoom.
 */
export function stepDirectionFromPoint(x: number, rect: DisplayControlRect, keyFraction: number): -1 | 0 | 1 {
  const key = rect.width * keyFraction
  if (x < rect.left + key) return -1
  if (x >= rect.left + rect.width - key) return 1
  return 0
}

import type { DisplayWidget } from '../../state/displayDocument'

export type DisplayControlValue = boolean | number

export interface DisplayControlRect {
  left: number
  top: number
  width: number
  height: number
}

function numberProperty(widget: DisplayWidget, key: string, fallback: number): number {
  const value = widget.properties[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function isInteractiveDisplayWidget(widget: DisplayWidget): boolean {
  return widget.type === 'Button'
    || widget.type === 'Toggle'
    || widget.type === 'Slider'
    || widget.type === 'Dial'
}

export function initialDisplayControlValue(widget: DisplayWidget): DisplayControlValue | undefined {
  if (widget.type === 'Button' || widget.type === 'Toggle') return false
  if (widget.type === 'Slider' || widget.type === 'Dial') return numberProperty(widget, 'min', 0)
  return undefined
}

export function displayControlRange(widget: DisplayWidget): { min: number; max: number; step: number } {
  const min = numberProperty(widget, 'min', 0)
  const max = Math.max(min, numberProperty(widget, 'max', 1))
  const configuredStep = numberProperty(widget, 'step', 0.01)
  return { min, max, step: configuredStep > 0 ? configuredStep : 0.01 }
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

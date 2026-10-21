import type {
  DisplayBounds,
  DisplayDocument,
  DisplayWidget,
  DisplayWidgetProperty,
  DisplayWidgetType,
  PlacedDisplayWidget,
  ScreenScope,
} from './displayDocument'
import { displayAsset, normalizeDisplayAssetId } from './displayAssets'
import { DISPLAY_TEXT_BUFFER_BYTES } from './displayText'
import type { NodePort } from '../../types'
import {
  DISPLAY_SELECTION_SOURCE_FIELD, DISPLAY_SOURCE_FROM_GRAPH, displaySourceFields, normalizeDisplaySource, type DisplaySourceField,
} from './displaySourceFields'
import type { DisplaySignalKind } from './displaySignal'

export type DisplayClass = 'touch-tft'
export type DisplayWidgetPortDirection = 'input' | 'output'
/**
 * What a template control is *for*, independent of its label and position.
 *
 * Declared here rather than beside the routing that consumes it because this
 * module owns what a widget may carry: `normalizeDisplayWidgetProperties`
 * below has to keep `controlRole` across a save, and importing the routing
 * module to ask would be a cycle. Routing owns what to *do* with a role;
 * the registry owns that the role is a thing a widget can hold at all.
 *
 * Coarser than any destination port on purpose: `transportNext` is one role
 * whether the panel shows a Music Player (where it skips a track) or a Pattern
 * Slideshow (where it advances the collection).
 */
export type TemplateControlRole =
  | 'transportPrevious'
  | 'transportPlayPause'
  | 'transportNext'
  | 'transportVolume'
  | 'outputBrightness'
  | 'outputBlackout'

export const TEMPLATE_CONTROL_ROLE_IDS: readonly TemplateControlRole[] = [
  'transportPrevious', 'transportPlayPause', 'transportNext', 'transportVolume',
  'outputBrightness', 'outputBlackout',
]

/** A stored role, or null. The boundary check for an untrusted document — the
 *  same stance `normalizeDisplaySource` takes toward a bound field. */
export function normalizeDisplayControlRole(value: unknown): TemplateControlRole | null {
  return typeof value === 'string' && (TEMPLATE_CONTROL_ROLE_IDS as readonly string[]).includes(value)
    ? value as TemplateControlRole
    : null
}

export type DisplayWidgetPortRoleId = 'value' | 'out' | 'set'
export type DisplayWidgetPortDataType = 'string' | 'float' | 'bool' | 'color' | 'patternselect' | 'audio'
export type DisplayWidgetState = 'default' | 'pressed' | 'active' | 'inactive' | 'disabled'
export type DisplayAssetKind = 'image' | 'icon' | 'pattern-thumbnail'

export interface DisplayWidgetPortRole {
  role: DisplayWidgetPortRoleId
  label: string
  direction: DisplayWidgetPortDirection
  dataType: DisplayWidgetPortDataType
  /** A synchronized control remains locally owned when its set role is unwired. */
  optional?: boolean
}

export type DisplayWidgetPropertyControl =
  | { control: 'text'; maxLength?: number }
  | { control: 'number'; min: number; max: number; step: number; integer?: boolean }
  | { control: 'toggle' }
  | { control: 'select'; options: readonly string[] }
  | { control: 'color' }
  | { control: 'asset'; kinds: readonly DisplayAssetKind[]; optional?: boolean }
  /** One of the design's screens by id, or none. Which ids exist is the
   * document's fact, so the document's normalize drops one it lacks. */
  | { control: 'screen' }

export interface DisplayWidgetPropertyDefinition {
  key: string
  label: string
  control: DisplayWidgetPropertyControl
}

export interface DisplayWidgetAssetSlot {
  property: string
  label: string
  kinds: readonly DisplayAssetKind[]
  required: boolean
  tintable: boolean
}

export interface DisplayWidgetSize {
  width: number
  height: number
}

/**
 * Adapter identities are deliberately data, not imported React or codegen
 * functions. They let the editor and LVGL backend dispatch from the same
 * registry without making persisted documents executable.
 */
export type DisplayPreviewRenderer =
  | 'text' | 'marquee' | 'numeric' | 'timecode' | 'progress' | 'meter' | 'status'
  | 'swatch' | 'pattern-browser' | 'image' | 'button' | 'toggle' | 'slider' | 'dial'
  | 'choice' | 'stepper' | 'colour-picker' | 'gauge' | 'container' | 'text-entry' | 'chart' | 'spectrum'

export type DisplayLvglEmitter =
  | 'label' | 'marquee' | 'bar' | 'led' | 'swatch' | 'pattern-browser' | 'image'
  | 'button' | 'switch' | 'slider' | 'arc' | 'choice' | 'stepper' | 'colour-picker' | 'gauge' | 'container'
  | 'text-entry' | 'chart' | 'spectrum'

export interface DisplayWidgetDefinition {
  type: DisplayWidgetType
  label: string
  description: string
  portRoles: readonly DisplayWidgetPortRole[]
  defaultProperties: Readonly<Record<string, DisplayWidgetProperty>>
  minimumVisualSize: DisplayWidgetSize
  minimumTouchSize?: DisplayWidgetSize
  allowedDisplayClasses: readonly DisplayClass[]
  previewRenderer: DisplayPreviewRenderer
  lvglEmitter: DisplayLvglEmitter
  propertyInspector: readonly DisplayWidgetPropertyDefinition[]
  states: readonly DisplayWidgetState[]
  assetSlots: readonly DisplayWidgetAssetSlot[]
  validateProperties: (properties: Readonly<Record<string, DisplayWidgetProperty>>) => string[]
}

export interface ResolvedDisplayWidgetPort extends DisplayWidgetPortRole {
  id: string
  widgetId: string
  widgetType: DisplayWidgetType
}

export interface DisplayWidgetValidationIssue {
  code: 'display-class' | 'visual-size' | 'touch-size' | 'property'
  message: string
}

/**
 * Touch-first geometry for the 320x240 reference screen. A primary control is
 * at least DISPLAY_TOUCH_TARGET_MIN_PX on both axes, two controls stay
 * DISPLAY_TOUCH_SEPARATION_PX apart so one finger cannot land on both, and a
 * control paints a track only DISPLAY_CONTROL_TRACK_PX thick — which is why a
 * hit region is derived from the widget's bounds and never from that track.
 */
export const DISPLAY_TOUCH_TARGET_MIN_PX = 48
export const DISPLAY_TOUCH_SEPARATION_PX = 8
export const DISPLAY_CONTROL_TRACK_PX = 8

const TOUCH_TFT = ['touch-tft'] as const
const PASSIVE_STATES = ['default', 'inactive', 'disabled'] as const
const VALUE_STATES = ['default', 'active', 'inactive', 'disabled'] as const
const CONTROL_STATES = ['default', 'pressed', 'active', 'inactive', 'disabled'] as const
const NO_ASSETS: readonly DisplayWidgetAssetSlot[] = []
const noPropertyIssues = () => []

const input = (
  dataType: DisplayWidgetPortDataType,
  label = 'Value',
): readonly DisplayWidgetPortRole[] => [{ role: 'value', label, direction: 'input', dataType }]

const output = (
  dataType: DisplayWidgetPortDataType,
): readonly DisplayWidgetPortRole[] => [{ role: 'out', label: 'Output', direction: 'output', dataType }]

const synchronized = (
  dataType: 'float' | 'bool' | 'color' | 'string',
): readonly DisplayWidgetPortRole[] => [
  { role: 'out', label: 'Output', direction: 'output', dataType },
  { role: 'set', label: 'Set', direction: 'input', dataType, optional: true },
]

const text = (key: string, label: string, maxLength?: number): DisplayWidgetPropertyDefinition => ({
  key,
  label,
  control: maxLength === undefined ? { control: 'text' } : { control: 'text', maxLength },
})

const number = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  integer = false,
): DisplayWidgetPropertyDefinition => ({
  key,
  label,
  control: integer
    ? { control: 'number', min, max, step, integer: true }
    : { control: 'number', min, max, step },
})

const toggle = (key: string, label: string): DisplayWidgetPropertyDefinition => ({
  key,
  label,
  control: { control: 'toggle' },
})

const select = (
  key: string,
  label: string,
  options: readonly string[],
): DisplayWidgetPropertyDefinition => ({ key, label, control: { control: 'select', options } })

const color = (key: string, label: string): DisplayWidgetPropertyDefinition => ({
  key,
  label,
  control: { control: 'color' },
})

const screen = (key: string, label: string): DisplayWidgetPropertyDefinition => ({
  key,
  label,
  control: { control: 'screen' },
})

const asset = (
  key: string,
  label: string,
  kinds: readonly DisplayAssetKind[],
  optional = false,
): DisplayWidgetPropertyDefinition => ({
  key,
  label,
  control: optional
    ? { control: 'asset', kinds, optional: true }
    : { control: 'asset', kinds },
})

const assetSlot = (
  property: string,
  label: string,
  kinds: readonly DisplayAssetKind[],
  required: boolean,
  tintable: boolean,
): DisplayWidgetAssetSlot => ({ property, label, kinds, required, tintable })

function numericProperty(
  properties: Readonly<Record<string, DisplayWidgetProperty>>,
  key: string,
  fallback: number,
): number {
  const value = properties[key]
  return typeof value === 'number' ? value : fallback
}

function rangePropertyIssues(
  properties: Readonly<Record<string, DisplayWidgetProperty>>,
  options: { step?: boolean; warnings?: boolean; initial?: boolean } = {},
): string[] {
  const min = numericProperty(properties, 'min', 0)
  const max = numericProperty(properties, 'max', 1)
  const issues: string[] = []
  if (max <= min) issues.push('Maximum must be greater than minimum.')
  if (options.initial && typeof properties.initial === 'number' && max > min
    && (properties.initial < min || properties.initial > max)) {
    issues.push('Starts at must be inside the range.')
  }
  if (options.step && numericProperty(properties, 'step', 0.01) <= 0) {
    issues.push('Step must be greater than zero.')
  }
  if (options.warnings) {
    const low = numericProperty(properties, 'warningLow', min)
    const high = numericProperty(properties, 'warningHigh', max)
    if (low < min || low > max || high < min || high > max || high < low) {
      issues.push('Warning thresholds must be ordered inside the configured range.')
    }
  }
  return issues
}

function requiredAssetIssues(properties: Readonly<Record<string, DisplayWidgetProperty>>): string[] {
  const id = typeof properties.assetId === 'string' ? properties.assetId : ''
  if (id.length === 0) return ['Choose an image or icon asset.']
  // Normalization drops an unknown id, so one that survives to here and still
  // fails to resolve means the pack no longer has it — worth naming rather than
  // drawing an empty square.
  return displayAsset(id) ? [] : [`Asset ${id} is not in the installed pack.`]
}

/** A Choice Strip shows between two and six segments. */
export const DISPLAY_CHOICE_MIN_OPTIONS = 2
export const DISPLAY_CHOICE_MAX_OPTIONS = 6

function authoredChoiceOptions(properties: Readonly<Record<string, DisplayWidgetProperty>>): string[] {
  const raw = typeof properties.options === 'string' ? properties.options : ''
  return raw.split(',').map((option) => option.trim()).filter((option) => option.length > 0)
}

/**
 * The segments a Choice Strip draws, in order. Its output is the index into
 * this list, so the preview, the touch evaluator and the LVGL emitter all
 * read it here: two renderers splitting the text their own way would put a
 * finger on one option and report another.
 */
export function displayChoiceOptions(widget: Pick<DisplayWidget, 'properties'>): string[] {
  return authoredChoiceOptions(widget.properties).slice(0, DISPLAY_CHOICE_MAX_OPTIONS)
}

function choicePropertyIssues(properties: Readonly<Record<string, DisplayWidgetProperty>>): string[] {
  const count = authoredChoiceOptions(properties).length
  if (count < DISPLAY_CHOICE_MIN_OPTIONS) return ['List at least two options, separated by commas.']
  const issues = count > DISPLAY_CHOICE_MAX_OPTIONS
    ? [`Only the first ${DISPLAY_CHOICE_MAX_OPTIONS} options are shown.`]
    : []
  if (typeof properties.initial === 'number' && properties.initial >= Math.min(count, DISPLAY_CHOICE_MAX_OPTIONS)) {
    issues.push('Starts at must name one of the options, counting the first as 0.')
  }
  return issues
}

/** A Colour Picker's hue is in degrees, red at both ends of the strip. */
export const DISPLAY_PICKER_HUE_MAX = 360

export interface DisplayRgb {
  r: number
  g: number
  b: number
}

/**
 * The colour a hue stands for, in degrees, at a saturation and brightness
 * from 0 to 1: the six-sector HSV conversion.
 *
 * Between two neighbouring sectors' pure hues every channel moves linearly,
 * so a strip drawn as six two-stop gradients shows exactly these colours. That
 * is why the preview, the LVGL strip and `_cdHueColor` in firmware all use
 * this rather than FastLED's CHSV, whose rainbow conversion brightens yellow
 * and would report a colour the strip under the finger does not show.
 */
export function displayHueColor(hue: number, saturation: number, value: number): DisplayRgb {
  const h = ((((Number.isFinite(hue) ? hue : 0) % 360) + 360) % 360) / 60
  const v = Math.max(0, Math.min(1, value))
  const chroma = v * Math.max(0, Math.min(1, saturation))
  const x = chroma * (1 - Math.abs((h % 2) - 1))
  const sector = Math.floor(h)
  const [r, g, b] = sector === 0 ? [chroma, x, 0]
    : sector === 1 ? [x, chroma, 0]
      : sector === 2 ? [0, chroma, x]
        : sector === 3 ? [0, x, chroma]
          : sector === 4 ? [x, 0, chroma]
            : [chroma, 0, x]
  const m = v - chroma
  const byte = (channel: number) => Math.round((channel + m) * 255)
  return { r: byte(r), g: byte(g), b: byte(b) }
}

/**
 * The hue of a colour, in whole degrees: where a Colour Picker moves when its
 * Set input names that colour. A grey has no hue and reads as 0, red, the
 * same answer `_cdColorHue` gives on the glass.
 */
export function displayColorHue(color: DisplayRgb): number {
  const r = color.r / 255, g = color.g / 255, b = color.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  if (!(delta > 0)) return 0
  const sector = max === r ? ((g - b) / delta + 6) % 6
    : max === g ? (b - r) / delta + 2
      : (r - g) / delta + 4
  return Math.round(sector * 60) % DISPLAY_PICKER_HUE_MAX
}

/** Whether a value is a graph colour, `{ r, g, b }`. */
export function isDisplayRgb(value: unknown): value is DisplayRgb {
  if (!value || typeof value !== 'object') return false
  const color = value as Partial<DisplayRgb>
  return [color.r, color.g, color.b].every((channel) => typeof channel === 'number' && Number.isFinite(channel))
}

/** A Colour Picker's authored saturation and brightness, each 0 to 1. */
export function displayPickerTone(widget: Pick<DisplayWidget, 'properties'>): { saturation: number; brightness: number } {
  const unit = (key: string) => Math.max(0, Math.min(1, numericProperty(widget.properties, key, 1)))
  return { saturation: unit('saturation'), brightness: unit('brightness') }
}

/** The hue a Colour Picker shows before a finger has moved it. */
export function displayPickerStartHue(widget: Pick<DisplayWidget, 'properties'>): number {
  const initial = numericProperty(widget.properties, 'initial', 0)
  return Number.isFinite(initial) ? Math.max(0, Math.min(DISPLAY_PICKER_HUE_MAX, Math.round(initial))) : 0
}

/**
 * The Colour Picker properties that reproduce a colour: its hue, and its
 * saturation and brightness to the inspector's two decimals. What a picker
 * wired to a colour input starts at, so wiring it keeps the colour that was
 * there, to within a step of each channel.
 */
export function displayPickerSeed(color: DisplayRgb): { initial: number; saturation: number; brightness: number } {
  const high = Math.max(color.r, color.g, color.b)
  const low = Math.min(color.r, color.g, color.b)
  const hundredths = (value: number) => Math.round(value * 100) / 100
  return {
    initial: displayColorHue(color),
    saturation: high > 0 ? hundredths((high - low) / high) : 0,
    brightness: hundredths(high / 255),
  }
}

/** The colour a Colour Picker reports at a hue. */
export function displayPickerColor(widget: Pick<DisplayWidget, 'properties'>, hue: number): DisplayRgb {
  const { saturation, brightness } = displayPickerTone(widget)
  return displayHueColor(hue, saturation, brightness)
}

/**
 * A Colour Picker's strip as seven stops, 60 degrees apart, red to red. Each
 * neighbouring pair is one segment of the LVGL strip and one leg of the
 * preview's gradient.
 */
export function displayPickerStops(widget: Pick<DisplayWidget, 'properties'>): DisplayRgb[] {
  return Array.from({ length: 7 }, (_, index) => displayPickerColor(widget, index * 60))
}

/**
 * The hue under a point on a Colour Picker, in whole degrees: the strip's
 * left edge is 0, its right edge 360. `left` and `width` are the strip's.
 * `_cdEvent` reads a press the same way on the glass.
 */
export function displayPickerHueAt(x: number, left: number, width: number): number {
  const unit = (x - left) / Math.max(1, width)
  return Math.round(Math.max(0, Math.min(1, unit)) * DISPLAY_PICKER_HUE_MAX)
}

/**
 * What a control's Output reports for the state a finger left it in.
 *
 * A Colour Picker holds a hue, so the touch store and the run surface deal in
 * one number like every other control, and the colour is derived here at the
 * port. Every other control reports its state as it is.
 */
export function displayControlOutput(
  widget: Pick<DisplayWidget, 'type' | 'properties'>,
  state: number | boolean,
): number | boolean | DisplayRgb {
  if (widget.type !== 'Colour Picker') return state
  return displayPickerColor(widget, typeof state === 'number' ? state : displayPickerStartHue(widget))
}

/**
 * The control state a graph value arriving on Set stands for: a colour on a
 * Colour Picker's Set is the hue it moves to, as `_cdColorHue` reads it on
 * the glass. Other controls take the value as it is.
 */
export function displayControlSetState(widget: Pick<DisplayWidget, 'type'>, value: unknown): unknown {
  if (widget.type !== 'Colour Picker') return value
  return isDisplayRgb(value) ? displayColorHue(value) : value
}

/**
 * How fast a Marquee's text travels, in panel pixels per second. The default
 * is LVGL's own label scroll speed (`LV_LABEL_DEF_SCROLL_SPEED`), so a Marquee
 * and a scrolling Text title beside it move together.
 */
export const DISPLAY_MARQUEE_DEFAULT_SPEED = 40
export const DISPLAY_MARQUEE_MIN_SPEED = 10
export const DISPLAY_MARQUEE_MAX_SPEED = 200

/** A Marquee's speed, held inside the range the inspector offers. */
export function displayMarqueeSpeed(widget: Pick<DisplayWidget, 'properties'>): number {
  const speed = widget.properties.speed
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return DISPLAY_MARQUEE_DEFAULT_SPEED
  return Math.round(Math.min(DISPLAY_MARQUEE_MAX_SPEED, Math.max(DISPLAY_MARQUEE_MIN_SPEED, speed)))
}

/**
 * The longest text a Text Entry holds, in bytes of UTF-8: what fits the
 * firmware's bounded string buffer with its terminator. The keyboard stops
 * there on the glass and the preview's field stops there too.
 */
export const DISPLAY_TEXT_ENTRY_MAX_BYTES = DISPLAY_TEXT_BUFFER_BYTES - 1

/**
 * The on-glass keyboard's own text size. One keyboard serves every Text Entry
 * on a panel, so it does not follow any one field's size.
 */
export const DISPLAY_KEYBOARD_FONT_SIZE = 16

/** The share of the screen's height the keyboard takes, at the bottom. */
export const DISPLAY_KEYBOARD_HEIGHT_RATIO = 0.45

/** The text a Text Entry holds before anyone types: its authored Text. */
export function displayTextEntryStart(widget: Pick<DisplayWidget, 'properties'>): string {
  const text = widget.properties.text
  return typeof text === 'string' ? displayTextEntryClamp(widget, text) : ''
}

/** How many characters this Text Entry takes, at most. */
export function displayTextEntryMaxLength(widget: Pick<DisplayWidget, 'properties'>): number {
  const length = widget.properties.maxLength
  return typeof length === 'number' && Number.isFinite(length)
    ? Math.max(1, Math.min(DISPLAY_TEXT_ENTRY_MAX_BYTES, Math.round(length)))
    : 32
}

/**
 * Typed text held to what the field takes: at most Maximum length
 * characters, then cut on a whole character to the byte budget, the way the
 * firmware's `_cdCopy` cuts it. Line breaks become spaces: the field is one line.
 */
export function displayTextEntryClamp(widget: Pick<DisplayWidget, 'properties'>, text: string): string {
  const characters = [...text.replace(/[\r\n]+/g, ' ')].slice(0, displayTextEntryMaxLength(widget))
  const encoder = new TextEncoder()
  while (characters.length > 0 && encoder.encode(characters.join('')).length > DISPLAY_TEXT_ENTRY_MAX_BYTES) characters.pop()
  return characters.join('')
}

export const DISPLAY_CHART_MIN_POINTS = 8
export const DISPLAY_CHART_MAX_POINTS = 64
export const DISPLAY_CHART_MIN_INTERVAL = 0.05
export const DISPLAY_CHART_MAX_INTERVAL = 600

/** How many readings a Chart keeps: its width in samples. */
export function displayChartPoints(widget: Pick<DisplayWidget, 'properties'>): number {
  const points = numericProperty(widget.properties, 'points', 32)
  return Math.max(DISPLAY_CHART_MIN_POINTS, Math.min(DISPLAY_CHART_MAX_POINTS, Math.round(points)))
}

/** Milliseconds between a Chart's readings, by the wall clock. */
export function displayChartIntervalMs(widget: Pick<DisplayWidget, 'properties'>): number {
  const seconds = numericProperty(widget.properties, 'interval', 0.5)
  return Math.round(Math.max(DISPLAY_CHART_MIN_INTERVAL, Math.min(DISPLAY_CHART_MAX_INTERVAL, seconds)) * 1000)
}

/**
 * A reading as the fraction of its range a Chart or Spectrum plots: held to
 * 0..1, nothing for a value that is not a number. `_cdScaled` is this rule.
 */
export function displayChartUnit(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(max > min)) return null
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

export const DISPLAY_SPECTRUM_MIN_BARS = 4
export const DISPLAY_SPECTRUM_MAX_BARS = 32
/** A Spectrum redraws at most this often, so a panel is not repainted every LED frame. */
export const DISPLAY_SPECTRUM_REFRESH_MS = 50

/** How many bars a Spectrum draws. */
export function displaySpectrumBars(widget: Pick<DisplayWidget, 'properties'>): number {
  const bars = numericProperty(widget.properties, 'bars', 16)
  return Math.max(DISPLAY_SPECTRUM_MIN_BARS, Math.min(DISPLAY_SPECTRUM_MAX_BARS, Math.round(bars)))
}

/**
 * The 32-bin analysis spectrum folded into `bars` bars, each the mean of the
 * bins under it and held to 0..1. Bar b covers bins [b*32/bars,
 * (b+1)*32/bars), at least one, which is the firmware's integer loop.
 */
export function displaySpectrumHeights(spectrum: readonly number[], bars: number): number[] {
  return Array.from({ length: bars }, (_, bar) => {
    const lo = Math.floor((bar * 32) / bars)
    const next = Math.floor(((bar + 1) * 32) / bars)
    const hi = next > lo ? next : lo + 1
    let sum = 0
    for (let bin = lo; bin < hi; bin++) {
      const value = spectrum[bin]
      sum += typeof value === 'number' && Number.isFinite(value) ? value : 0
    }
    return Math.max(0, Math.min(1, sum / (hi - lo)))
  })
}

/** Width of a Colour Picker's position marker, in pixels. */
export const DISPLAY_PICKER_MARKER_PX = 8

export const DISPLAY_WIDGET_LIBRARY: Readonly<Record<DisplayWidgetType, DisplayWidgetDefinition>> = {
  Text: {
    type: 'Text', label: 'Text', description: 'One or two lines of static or graph-driven text.',
    portRoles: input('string', 'Text'), defaultProperties: { text: '', align: 'left', fontSize: 16, color: '#f4f7ff', wrap: true, maxLines: 2, scroll: false },
    minimumVisualSize: { width: 48, height: 20 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'text', lvglEmitter: 'label',
    propertyInspector: [text('text', 'Text when unwired (optional)'), select('align', 'Alignment', ['left', 'center', 'right']), number('fontSize', 'Font size', 8, 96, 1, true), color('color', 'Text colour'), toggle('wrap', 'Wrap text'), number('maxLines', 'Maximum lines', 1, 4, 1, true), toggle('scroll', 'Scroll text that does not fit')],
    states: PASSIVE_STATES, assetSlots: NO_ASSETS, validateProperties: noPropertyIssues,
  },
  'Numeric Readout': {
    type: 'Numeric Readout', label: 'Numeric Readout', description: 'A formatted scalar with optional prefix and suffix.',
    portRoles: input('float'), defaultProperties: { decimals: 1, prefix: '', suffix: '', min: 0, max: 100 },
    minimumVisualSize: { width: 64, height: 28 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'numeric', lvglEmitter: 'label',
    propertyInspector: [number('decimals', 'Decimals', 0, 4, 1, true), text('prefix', 'Prefix', 16), text('suffix', 'Suffix', 16), number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01)],
    states: VALUE_STATES, assetSlots: NO_ASSETS, validateProperties: rangePropertyIssues,
  },
  Timecode: {
    type: 'Timecode', label: 'Timecode', description: 'Seconds formatted as M:SS or H:MM:SS.',
    portRoles: input('float', 'Seconds'), defaultProperties: { showHours: false },
    minimumVisualSize: { width: 64, height: 28 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'timecode', lvglEmitter: 'label',
    propertyInspector: [toggle('showHours', 'Always show hours')],
    states: VALUE_STATES, assetSlots: NO_ASSETS, validateProperties: noPropertyIssues,
  },
  Progress: {
    type: 'Progress', label: 'Progress', description: 'A clamped track or show progress bar.',
    portRoles: input('float'), defaultProperties: { min: 0, max: 1 },
    minimumVisualSize: { width: 64, height: 12 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'progress', lvglEmitter: 'bar',
    propertyInspector: [number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01)],
    states: VALUE_STATES, assetSlots: NO_ASSETS, validateProperties: rangePropertyIssues,
  },
  'Value Meter': {
    type: 'Value Meter', label: 'Value Meter', description: 'A ranged horizontal or vertical meter with warning zones.',
    portRoles: input('float'), defaultProperties: { min: 0, max: 1, orientation: 'horizontal', warningLow: 0, warningHigh: 0.8 },
    minimumVisualSize: { width: 48, height: 16 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'meter', lvglEmitter: 'bar',
    propertyInspector: [number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01), select('orientation', 'Orientation', ['horizontal', 'vertical']), number('warningLow', 'Warning low', -1000000, 1000000, 0.01), number('warningHigh', 'Warning high', -1000000, 1000000, 0.01)],
    states: VALUE_STATES, assetSlots: NO_ASSETS,
    validateProperties: (properties) => rangePropertyIssues(properties, { warnings: true }),
  },
  'Status Indicator': {
    type: 'Status Indicator', label: 'Status Indicator', description: 'An on/off light or short status badge.',
    portRoles: input('bool'), defaultProperties: { offLabel: 'OFF', onLabel: 'ON' },
    minimumVisualSize: { width: 40, height: 24 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'status', lvglEmitter: 'led',
    propertyInspector: [text('offLabel', 'Off label', 16), text('onLabel', 'On label', 16)],
    states: VALUE_STATES, assetSlots: NO_ASSETS, validateProperties: noPropertyIssues,
  },
  'Colour Swatch': {
    type: 'Colour Swatch', label: 'Colour Swatch', description: 'A graph-driven colour with optional value captions.',
    portRoles: input('color', 'Colour'), defaultProperties: { showHex: true, showRgb: false },
    minimumVisualSize: { width: 40, height: 40 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'swatch', lvglEmitter: 'swatch',
    propertyInspector: [toggle('showHex', 'Show hex'), toggle('showRgb', 'Show RGB')],
    states: VALUE_STATES, assetSlots: NO_ASSETS, validateProperties: noPropertyIssues,
  },
  'Pattern Browser': {
    type: 'Pattern Browser', label: 'Pattern Browser', description: 'The active and highlighted pattern with baked artwork.',
    portRoles: input('patternselect', 'Pattern'), defaultProperties: { showThumbnail: true, showOrdinal: true },
    minimumVisualSize: { width: 96, height: 72 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'pattern-browser', lvglEmitter: 'pattern-browser',
    propertyInspector: [toggle('showThumbnail', 'Show thumbnail'), toggle('showOrdinal', 'Show position')],
    states: VALUE_STATES, assetSlots: NO_ASSETS, validateProperties: noPropertyIssues,
  },
  'Image/Icon': {
    type: 'Image/Icon', label: 'Image / Icon', description: 'A validated baked image or semantic icon.',
    portRoles: [], defaultProperties: { tint: false, tintColor: '#f4f7ff' },
    minimumVisualSize: { width: 16, height: 16 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'image', lvglEmitter: 'image',
    propertyInspector: [asset('assetId', 'Asset', ['image', 'icon']), toggle('tint', 'Tint'), color('tintColor', 'Tint colour')],
    states: PASSIVE_STATES,
    assetSlots: [assetSlot('assetId', 'Image / icon', ['image', 'icon'], true, true)],
    validateProperties: requiredAssetIssues,
  },
  Button: {
    type: 'Button', label: 'Button', description: 'True while pressed; edge-triggered actions are detected by graph sinks.',
    portRoles: output('bool'), defaultProperties: { text: 'Button', assetId: '', presentation: 'text' },
    minimumVisualSize: { width: 48, height: 32 }, minimumTouchSize: { width: 48, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'button', lvglEmitter: 'button',
    propertyInspector: [text('text', 'Text', 32), asset('assetId', 'Icon', ['icon'], true), select('presentation', 'Presentation', ['text', 'icon', 'text+icon']), screen('goTo', 'Go to screen')],
    states: CONTROL_STATES,
    assetSlots: [assetSlot('assetId', 'Icon', ['icon'], false, true)], validateProperties: noPropertyIssues,
  },
  Toggle: {
    type: 'Toggle', label: 'Toggle', description: 'A local boolean latch with an optional graph-authoritative state.',
    portRoles: synchronized('bool'), defaultProperties: { offLabel: 'OFF', onLabel: 'ON', assetId: '', presentation: 'text' },
    minimumVisualSize: { width: 48, height: 32 }, minimumTouchSize: { width: 48, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'toggle', lvglEmitter: 'switch',
    propertyInspector: [text('offLabel', 'Off label', 16), text('onLabel', 'On label', 16), asset('assetId', 'Icon', ['icon'], true), select('presentation', 'Presentation', ['text', 'icon', 'text+icon'])],
    states: CONTROL_STATES,
    assetSlots: [assetSlot('assetId', 'Icon', ['icon'], false, true)], validateProperties: noPropertyIssues,
  },
  Slider: {
    type: 'Slider', label: 'Slider', description: 'A ranged continuous control with a wider touch region than its track.',
    portRoles: synchronized('float'), defaultProperties: { min: 0, max: 1, step: 0.01, orientation: 'horizontal' },
    minimumVisualSize: { width: 96, height: 20 }, minimumTouchSize: { width: 96, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'slider', lvglEmitter: 'slider',
    propertyInspector: [number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01), number('step', 'Step', 0.0001, 1000000, 0.0001), number('initial', 'Starts at', -1000000, 1000000, 0.01), select('orientation', 'Orientation', ['horizontal', 'vertical'])],
    states: CONTROL_STATES, assetSlots: NO_ASSETS,
    validateProperties: (properties) => rangePropertyIssues(properties, { step: true, initial: true }),
  },
  Dial: {
    type: 'Dial', label: 'Dial', description: 'A ranged control operated by vertical dragging, not circular tracing.',
    portRoles: synchronized('float'), defaultProperties: { min: 0, max: 1, step: 0.01 },
    minimumVisualSize: { width: 48, height: 48 }, minimumTouchSize: { width: 48, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'dial', lvglEmitter: 'arc',
    propertyInspector: [number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01), number('step', 'Step', 0.0001, 1000000, 0.0001), number('initial', 'Starts at', -1000000, 1000000, 0.01)],
    states: CONTROL_STATES, assetSlots: NO_ASSETS,
    validateProperties: (properties) => rangePropertyIssues(properties, { step: true, initial: true }),
  },
  'Choice Strip': {
    type: 'Choice Strip', label: 'Choice Strip', description: 'A row of two to six options; outputs the chosen one, counting the first as 0.',
    portRoles: synchronized('float'), defaultProperties: { options: 'One, Two, Three' },
    minimumVisualSize: { width: 96, height: 32 }, minimumTouchSize: { width: 144, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'choice', lvglEmitter: 'choice',
    propertyInspector: [text('options', 'Options (comma separated)', 120), number('initial', 'Starts at (first is 0)', 0, DISPLAY_CHOICE_MAX_OPTIONS - 1, 1, true)],
    states: CONTROL_STATES, assetSlots: NO_ASSETS, validateProperties: choicePropertyIssues,
  },
  'Step Control': {
    type: 'Step Control', label: 'Step Control', description: 'Minus and plus keys that move a ranged value one step at a time.',
    portRoles: synchronized('float'), defaultProperties: { min: 0, max: 10, step: 1 },
    minimumVisualSize: { width: 96, height: 32 }, minimumTouchSize: { width: 144, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'stepper', lvglEmitter: 'stepper',
    propertyInspector: [number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01), number('step', 'Step', 0.0001, 1000000, 0.0001), number('initial', 'Starts at', -1000000, 1000000, 0.01)],
    states: CONTROL_STATES, assetSlots: NO_ASSETS,
    validateProperties: (properties) => rangePropertyIssues(properties, { step: true, initial: true }),
  },
  'Colour Picker': {
    type: 'Colour Picker', label: 'Colour Picker', description: 'A hue strip; drag along it to pick a colour at a set saturation and brightness.',
    portRoles: synchronized('color'), defaultProperties: { saturation: 1, brightness: 1 },
    minimumVisualSize: { width: 96, height: 24 }, minimumTouchSize: { width: 144, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'colour-picker', lvglEmitter: 'colour-picker',
    propertyInspector: [number('initial', 'Starts at hue (degrees)', 0, DISPLAY_PICKER_HUE_MAX, 1, true), number('saturation', 'Saturation', 0, 1, 0.01), number('brightness', 'Brightness', 0, 1, 0.01)],
    states: CONTROL_STATES, assetSlots: NO_ASSETS,
    validateProperties: (properties) => (numericProperty(properties, 'brightness', 1) <= 0
      ? ['Brightness 0 picks black whatever the hue.']
      : []),
  },
  'Arc Gauge': {
    type: 'Arc Gauge', label: 'Arc Gauge', description: 'A ranged reading drawn as a 270 degree arc, with the number in the middle.',
    portRoles: input('float'), defaultProperties: { min: 0, max: 1, decimals: 2, prefix: '', suffix: '', showValue: true },
    minimumVisualSize: { width: 48, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'gauge', lvglEmitter: 'gauge',
    propertyInspector: [number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01), toggle('showValue', 'Show value'), number('decimals', 'Decimals', 0, 4, 1, true), text('prefix', 'Prefix', 16), text('suffix', 'Suffix', 16)],
    states: VALUE_STATES, assetSlots: NO_ASSETS, validateProperties: rangePropertyIssues,
  },
  Marquee: {
    type: 'Marquee', label: 'Marquee', description: 'One line of text that travels across continuously, entering on the right and leaving on the left.',
    portRoles: input('string', 'Text'), defaultProperties: { text: '', fontSize: 16, color: '#f4f7ff', speed: DISPLAY_MARQUEE_DEFAULT_SPEED },
    minimumVisualSize: { width: 48, height: 20 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'marquee', lvglEmitter: 'marquee',
    propertyInspector: [text('text', 'Text when unwired (optional)'), number('fontSize', 'Font size', 8, 96, 1, true), color('color', 'Text colour'), number('speed', 'Speed (pixels per second)', DISPLAY_MARQUEE_MIN_SPEED, DISPLAY_MARQUEE_MAX_SPEED, 1, true)],
    states: PASSIVE_STATES, assetSlots: NO_ASSETS, validateProperties: noPropertyIssues,
  },
  Container: {
    type: 'Container', label: 'Container', description: 'A framed panel. Widgets dropped inside it move, copy and delete with it, and are clipped to it.',
    portRoles: [], defaultProperties: {},
    minimumVisualSize: { width: 64, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'container', lvglEmitter: 'container',
    propertyInspector: [],
    states: PASSIVE_STATES, assetSlots: NO_ASSETS, validateProperties: noPropertyIssues,
  },
  'Text Entry': {
    type: 'Text Entry', label: 'Text Entry', description: 'A one-line text field; tapping it opens a keyboard, and the text it holds once confirmed is its output.',
    portRoles: synchronized('string'), defaultProperties: { text: '', placeholder: 'Tap to type', maxLength: 32, fontSize: 16 },
    minimumVisualSize: { width: 96, height: 32 }, minimumTouchSize: { width: 96, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'text-entry', lvglEmitter: 'text-entry',
    propertyInspector: [text('text', 'Starts with'), text('placeholder', 'Hint when empty', 32), number('maxLength', 'Maximum length (characters)', 1, DISPLAY_TEXT_BUFFER_BYTES - 1, 1, true), number('fontSize', 'Font size', 8, 48, 1, true)],
    states: CONTROL_STATES, assetSlots: NO_ASSETS, validateProperties: noPropertyIssues,
  },
  Chart: {
    type: 'Chart', label: 'Chart', description: 'A value plotted over time: a reading taken at a steady interval, newest on the right.',
    portRoles: input('float'), defaultProperties: { min: 0, max: 1, points: 32, interval: 0.5, style: 'line' },
    minimumVisualSize: { width: 96, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'chart', lvglEmitter: 'chart',
    propertyInspector: [number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01), number('points', 'Readings shown', DISPLAY_CHART_MIN_POINTS, DISPLAY_CHART_MAX_POINTS, 1, true), number('interval', 'Seconds between readings', DISPLAY_CHART_MIN_INTERVAL, DISPLAY_CHART_MAX_INTERVAL, 0.05), select('style', 'Style', ['line', 'bar'])],
    states: VALUE_STATES, assetSlots: NO_ASSETS, validateProperties: rangePropertyIssues,
  },
  Spectrum: {
    type: 'Spectrum', label: 'Spectrum', description: 'The live audio spectrum as bars, bass on the left.',
    portRoles: input('audio', 'Audio'), defaultProperties: { bars: 16 },
    minimumVisualSize: { width: 64, height: 32 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'spectrum', lvglEmitter: 'spectrum',
    propertyInspector: [number('bars', 'Bars', DISPLAY_SPECTRUM_MIN_BARS, DISPLAY_SPECTRUM_MAX_BARS, 1, true)],
    states: VALUE_STATES, assetSlots: NO_ASSETS, validateProperties: noPropertyIssues,
  },
}

/** Space between an Arc Gauge's border and its ring: the preview widget's own padding. */
export const DISPLAY_GAUGE_PAD_PX = 4

/**
 * Where an Arc Gauge's arc sits inside its box: inside the border and
 * `DISPLAY_GAUGE_PAD_PX`, centred, as wide as the shorter side left, its
 * stroke a tenth of that. The arc runs 270 degrees with the gap at the
 * bottom, as a Dial's does. Both renderers draw from this — LVGL insets an
 * arc by its padding alone, so `inset` is the padding the emitter sets — and
 * the value text sits in the ring it leaves.
 */
export function displayGaugeGeometry(
  width: number,
  height: number,
  borderWidth: number,
): { inset: number; size: number; stroke: number } {
  const inset = Math.max(0, borderWidth) + DISPLAY_GAUGE_PAD_PX
  const size = Math.max(1, Math.floor(Math.min(width, height) - 2 * inset))
  return { inset, size, stroke: Math.max(3, Math.round(size / 10)) }
}

/**
 * Whether a widget formats a number through the shared `formatNumberText`,
 * so a sketch holding one needs `_dsFormatNumber`.
 */
export function displayWidgetFormatsNumber(type: DisplayWidgetType): boolean {
  return type === 'Numeric Readout' || type === 'Arc Gauge'
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/

function sourceRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeNumber(value: number, control: Extract<DisplayWidgetPropertyControl, { control: 'number' }>): number {
  const clamped = Math.max(control.min, Math.min(control.max, value))
  return control.integer ? Math.round(clamped) : clamped
}

/** Validate and bound the declarative property bag at the import boundary. */
export function normalizeDisplayWidgetProperties(
  type: DisplayWidgetType,
  value: unknown,
  maximumStringLength: number,
  maximumPropertyCount: number,
): Record<string, DisplayWidgetProperty> {
  const source = sourceRecord(value)
  if (!source) return {}
  const result: Record<string, DisplayWidgetProperty> = {}
  const definitions = new Map(DISPLAY_WIDGET_LIBRARY[type].propertyInspector.map((item) => [item.key, item]))
  for (const [key, raw] of Object.entries(source).slice(0, maximumPropertyCount)) {
    if (key === 'controlRole') {
      // Not an inspector property either: a role is stamped by the template
      // that placed the widget, never typed by hand. It has to survive a save
      // or auto-wiring would silently stop recognising a reloaded screen's
      // controls, so it is kept — bounded to the declared set, so a foreign
      // document cannot introduce one nothing routes.
      const role = normalizeDisplayControlRole(raw)
      if (role) result[key] = role
      continue
    }
    if (key === 'source') {
      // Not an inspector property: which fields exist depends on what is wired
      // into the panel, and a document cannot see that. Checked against the
      // catalogue of every field any source offers, the way an asset id is
      // checked against the installed pack, so a foreign or retired id is
      // dropped here rather than persisted as a dangling binding.
      // A widget with a fixed field stores none: there is no choice to keep.
      const id = displayWidgetSourceOnlyField(type) ? '' : normalizeDisplaySource(raw)
      if (id) result[key] = id
      continue
    }
    if (key === 'showLabel') {
      // Widget-level, like Label itself: every type can caption itself, so it
      // is not restated in each inspector list. Missing means no caption, so
      // an imported document draws what it was drawn as.
      if (typeof raw === 'boolean') result[key] = raw
      continue
    }
    const definition = definitions.get(key)
    if (!definition) continue
    const control = definition.control
    if (control.control === 'toggle') {
      if (typeof raw === 'boolean') result[key] = raw
    } else if (control.control === 'number') {
      if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = normalizeNumber(raw, control)
    } else if (control.control === 'select') {
      if (typeof raw === 'string' && control.options.includes(raw)) result[key] = raw
    } else if (control.control === 'color') {
      if (typeof raw === 'string' && COLOR_RE.test(raw)) result[key] = raw.toLowerCase()
    } else if (control.control === 'screen') {
      // The shape of a screen id; whether the design has it is settled by the
      // document's own normalize, which can see its screens.
      if (typeof raw === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw.trim())) result[key] = raw.trim()
    } else if (control.control === 'asset') {
      // The asset registry is the only authority on what an id may be: a shape
      // test would happily persist a working-folder path that merely looks like
      // one. An id the installed pack does not have is dropped here, so a
      // document can never carry a dangling reference.
      if (typeof raw === 'string') {
        const id = normalizeDisplayAssetId(raw.trim())
        if (id.length > 0 || (control.optional && raw.trim() === '')) result[key] = id
      }
    } else if (typeof raw === 'string') {
      result[key] = [...raw].slice(0, Math.min(control.maxLength ?? maximumStringLength, maximumStringLength)).join('')
    }
  }
  return result
}

/** The pack's palette glyph for a widget type. Derived from the type the same
 * way the pack slugged its own files, so a new widget picks up its art by
 * being named rather than by being listed here. */
export function displayWidgetGlyphId(type: DisplayWidgetType): string {
  return `widget:${type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

export function displayWidgetDefinition(type: DisplayWidgetType): DisplayWidgetDefinition {
  return DISPLAY_WIDGET_LIBRARY[type]
}

export function displayWidgetPortId(widgetId: string, role: DisplayWidgetPortRoleId): string {
  return `widget:${widgetId}:${role}`
}

/**
 * The Touch node's trailing socket: drag from here, drop on a property row,
 * and the control that drives it is created there.
 *
 * It carries a dataType of its own so it is inert to the ordinary connect
 * path — `portsCompatible` matches nothing against it — and the only thing
 * that can act on it is the wire-first drop, which checks what the property
 * can actually take: the property being dropped on names the control.
 */
export const TOUCH_CONTROL_ADD_HANDLE = 'add-control'
export const TOUCH_CONTROL_ADD_DATA_TYPE = 'newcontrol'
export const TOUCH_CONTROL_ADD_LABEL = 'Add control…'

const WIDGET_PORT_ROLES: readonly DisplayWidgetPortRoleId[] = ['value', 'out', 'set']

/** Read a minted port id back into the widget and role it names. The port id is
 * the whole contract between a display document and anything that only sees the
 * node — the evaluator included — so it has to be reversible. */
export function parseDisplayWidgetPortId(
  portId: string,
): { widgetId: string; role: DisplayWidgetPortRoleId } | null {
  const parts = portId.split(':')
  if (parts.length !== 3 || parts[0] !== 'widget' || parts[1].length === 0) return null
  const role = WIDGET_PORT_ROLES.find((candidate) => candidate === parts[2])
  return role ? { widgetId: parts[1], role } : null
}

export function displayWidgetPorts(widget: Pick<DisplayWidget, 'id' | 'type' | 'label'>): ResolvedDisplayWidgetPort[] {
  const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
  const widgetLabel = widget.label.trim() || definition.label
  return definition.portRoles.map((port) => ({
    ...port,
    id: displayWidgetPortId(widget.id, port.role),
    label: definition.portRoles.length === 1 ? widgetLabel : `${widgetLabel} ${port.label}`,
    widgetId: widget.id,
    widgetType: widget.type,
  }))
}

/** Ports that graph values feed into the panel so it can draw widgets. */
export function displayWidgetInputPorts(widget: Pick<DisplayWidget, 'id' | 'type' | 'label' | 'properties'>): ResolvedDisplayWidgetPort[] {
  if (displayWidgetIsBound(widget)) return []
  return displayWidgetPorts(widget).filter((port) => port.direction === 'input')
}

/** Ports that finger-operated widgets publish through the paired Touch node. */
export function displayWidgetTouchOutputPorts(widget: Pick<DisplayWidget, 'id' | 'type' | 'label'>): ResolvedDisplayWidgetPort[] {
  return displayWidgetPorts(widget).filter((port) => port.direction === 'output')
}

/**
 * Readings no cable carries, by the widget data type that shows them.
 *
 * A pattern selection is published only inside a player's or slideshow's
 * `display` envelope, so a widget showing one always reads the panel's source.
 */
const SOURCE_ONLY_FIELDS: Partial<Record<DisplayWidgetPortDataType, string>> = {
  patternselect: DISPLAY_SELECTION_SOURCE_FIELD,
}

/** The one field this widget type can read, when no wire could carry it. */
export function displayWidgetSourceOnlyField(type: DisplayWidgetType): string | null {
  const port = DISPLAY_WIDGET_LIBRARY[type].portRoles.find((role) => role.direction === 'input')
  return (port && SOURCE_ONLY_FIELDS[port.dataType]) ?? null
}

/** The source field this widget reads, or null when it takes a cable. */
export function displayWidgetBoundField(widget: Pick<DisplayWidget, 'type' | 'properties'>): string | null {
  const fixed = displayWidgetSourceOnlyField(widget.type)
  if (fixed) return fixed
  const source = widget.properties?.source
  return typeof source === 'string' && source !== '' && source !== DISPLAY_SOURCE_FROM_GRAPH ? source : null
}

/**
 * Whether this widget reads its value from the source wired into the panel.
 *
 * A bound widget draws no cable, so it mints no input port. Its outputs are
 * untouched: binding is about where a reading comes from, and a control still
 * publishes what a finger did to it.
 */
export function displayWidgetIsBound(widget: Pick<DisplayWidget, 'type' | 'properties'>): boolean {
  return displayWidgetBoundField(widget) !== null
}

/**
 * Whether a finger can drive this widget, and so whether it wants a wire.
 *
 * Derived from the `out` role rather than listed, because that role *is* the
 * thing being asked about: Button, Toggle, Slider and Dial have one and
 * everything else either only reads a value or draws nothing but itself. Every
 * rule of the form "a control with no connection is inert" has to be asked
 * through this and no other way — applied to all widgets it would call most of
 * a finished screen broken, since a Label can never have a wire and a bound
 * readout deliberately mints no port at all.
 */
export function displayWidgetIsControl(type: DisplayWidgetType): boolean {
  return DISPLAY_WIDGET_LIBRARY[type].portRoles.some((port) => port.direction === 'output')
}

/** Whether this widget shows a reading at all, and so has something to bind. */
export function displayWidgetTakesValue(type: DisplayWidgetType): boolean {
  return DISPLAY_WIDGET_LIBRARY[type].portRoles.some((port) => port.direction === 'input')
}

/**
 * The fields of the panel's source this widget could actually show.
 *
 * Narrowed by data type, the same exact match the Player Controls picker uses and
 * for the same reason: a track title on a Progress bar and a pattern number on
 * a Text line are both wires that would connect and show nothing. A widget with
 * no input role offers nothing — a Button has no reading to take.
 */
export function displaySourceFieldsForWidget(
  kind: DisplaySignalKind | null | undefined,
  type: DisplayWidgetType,
): readonly DisplaySourceField[] {
  const accepted = new Set(DISPLAY_WIDGET_LIBRARY[type].portRoles
    .filter((port) => port.direction === 'input')
    .map((port) => port.dataType))
  if (accepted.size === 0) return []
  return displaySourceFields(kind).filter((field) => accepted.has(field.dataType))
}

/**
 * Which widgets read the panel's own source, as the panel node carries it.
 *
 * Evaluation and all three generators work from the node, and a bound widget
 * has no port to carry the fact, so this is projected onto the panel's
 * properties by the graph store on every edit. It lives here rather than inside
 * that store write because the compile fixtures build their graphs by hand and
 * need the identical projection — a second copy there would be free to drift
 * from the rule the app actually applies, and the fixtures are the evidence.
 *
 * The roles are the widget's own input roles rather than an assumed `value`:
 * a Slider shows its reading on `set`.
 */
export function displayWidgetSources(
  document: Pick<DisplayDocument, 'widgets'> | undefined,
): Record<string, { field: string; roles: string[] }> {
  const sources: Record<string, { field: string; roles: string[] }> = {}
  for (const widget of document?.widgets ?? []) {
    const field = displayWidgetBoundField(widget)
    if (!field) continue
    sources[widget.id] = {
      field,
      roles: displayWidgetPorts(widget)
        .filter((port) => port.direction === 'input')
        .map((port) => port.role),
    }
  }
  return sources
}

/** Graph-facing ports for the panel, derived only from stable widget ids and
 * registry roles. Editable labels affect presentation but never cable
 * identity, and a widget bound to the panel's own source has no input port to
 * draw a cable into. */
export function displayDocumentPorts(
  document: Pick<DisplayDocument, 'widgets'> & ScreenScope,
): { inputs: NodePort[]; outputs: NodePort[] } {
  return {
    inputs: displayDocumentInputPorts(document),
    outputs: displayDocumentTouchOutputPorts(document),
  }
}

/**
 * The panel's Screen input: a number choosing which screen of its design the
 * glass shows, counting the first as 0. Not a widget port, so
 * `parseDisplayWidgetPortId` does not read it, and offered only where there is
 * more than one screen to choose from.
 */
export const DISPLAY_SCREEN_INPUT_ID = 'screen'

/** Graph-facing widget inputs for the panel that owns this document. */
export function displayDocumentInputPorts(
  document: Pick<DisplayDocument, 'widgets'> & ScreenScope,
): NodePort[] {
  // Read off the list rather than through `displayScreens`, which would make
  // this module's import of the document module a value cycle.
  const inputs: NodePort[] = (document.screens?.length ?? 0) > 1
    ? [{ id: DISPLAY_SCREEN_INPUT_ID, label: 'Screen', dataType: 'float' }]
    : []
  for (const widget of document.widgets) {
    for (const port of displayWidgetInputPorts(widget)) {
      inputs.push({ id: port.id, label: port.label, dataType: port.dataType })
    }
  }
  return inputs
}

/** Graph-facing widget outputs for the Touch node paired with this document. */
export function displayDocumentTouchOutputPorts(
  document: Pick<DisplayDocument, 'widgets'>,
): NodePort[] {
  const outputs: NodePort[] = []
  for (const widget of document.widgets) {
    const carried = displayWidgetIsControl(widget.type)
      && normalizeDisplayControlRole(widget.properties?.controlRole) !== null
    for (const port of displayWidgetTouchOutputPorts(widget)) {
      outputs.push({
        id: port.id, label: port.label, dataType: port.dataType,
        ...(carried ? { carriedByControls: true } : {}),
      })
    }
  }
  return outputs
}

const RANGED_CONTROLS: ReadonlySet<DisplayWidgetType> = new Set(['Slider', 'Dial', 'Step Control'])

/**
 * Whether this control's range is authored as Minimum, Maximum and Step.
 *
 * These are the controls that can take a target property's range when wired
 * to it, carry a level on the Controls wire, and be offered a range repair. A
 * Choice Strip publishes a number too, but its range is its option count, so
 * a property's range has nothing to say to it.
 */
export function displayWidgetIsRangedControl(type: DisplayWidgetType): boolean {
  return RANGED_CONTROLS.has(type)
}

/** Whether a finger sets this widget to a number. */
export function displayWidgetIsNumericControl(type: DisplayWidgetType): boolean {
  return displayWidgetIsRangedControl(type) || type === 'Choice Strip'
}

/**
 * The range a numeric control moves in. A Choice Strip's is its option
 * indices; the ranged controls read their own properties, with a maximum
 * below the minimum held at the minimum and a missing step at 0.01.
 */
export function displayControlRange(
  widget: Pick<DisplayWidget, 'type' | 'properties'>,
): { min: number; max: number; step: number } {
  if (widget.type === 'Choice Strip') {
    return { min: 0, max: Math.max(0, displayChoiceOptions(widget).length - 1), step: 1 }
  }
  const min = numericProperty(widget.properties, 'min', 0)
  const max = Math.max(min, numericProperty(widget.properties, 'max', 1))
  const step = numericProperty(widget.properties, 'step', 0.01)
  return { min, max, step: step > 0 ? step : 0.01 }
}

/**
 * Width of each of a Step Control's two keys, in pixels: as wide as the
 * control is tall, so the keys are square, but never more than a third of
 * its width so the value between them keeps room to be read. Both renderers
 * and the run surface's hit test lay the keys out on this.
 */
export function displayStepKeyWidth(width: number, height: number): number {
  return Math.max(1, Math.min(Math.round(height), Math.floor(width / 3)))
}

/** Decimal places a Step Control shows: the step's own, at most four. */
export function displayStepDecimals(widget: Pick<DisplayWidget, 'type' | 'properties'>): number {
  const { step } = displayControlRange(widget)
  const fraction = String(step).split('.')[1] ?? ''
  return Math.min(4, fraction.length)
}

/**
 * The value a numeric control holds before a finger has moved it.
 *
 * Its own `initial` when set, otherwise its minimum, clamped into range. Read
 * by the preview evaluator, the live renderer and the LVGL emitter alike, so a
 * control starts in the same place on screen, in the graph and on the board —
 * which matters because a level on the Controls wire is absolute: a Brightness
 * slider starting at its minimum would black out the LEDs it commands.
 * `undefined` for anything that is not a numeric control.
 */
export function displayControlStartValue(widget: Pick<DisplayWidget, 'type' | 'properties'>): number | undefined {
  if (!displayWidgetIsNumericControl(widget.type)) return undefined
  const { min, max } = displayControlRange(widget)
  const initial = widget.properties.initial
  const start = typeof initial === 'number' && Number.isFinite(initial) ? initial : min
  return Math.max(min, Math.min(max, start))
}

export function defaultDisplayWidgetProperties(type: DisplayWidgetType): Record<string, DisplayWidgetProperty> {
  return { ...DISPLAY_WIDGET_LIBRARY[type].defaultProperties }
}

/**
 * Whether this widget draws its name on the glass as a caption of its own.
 *
 * Opt in, so a saved design and a shipped template render exactly as they
 * were authored and a freshly placed widget does not paint its own type name
 * on the screen. Missing therefore means no.
 */
export function displayWidgetShowsLabel(widget: Pick<DisplayWidget, 'properties'>): boolean {
  return widget.properties.showLabel === true
}

/**
 * The label is drawn once: as the widget's own content by default, or as a
 * caption above it when the author asks for one. These two are the halves of
 * that single rule, and nothing else may decide where a label goes — two
 * copies of the same word is what a reader takes for a fault.
 */
export function displayWidgetOnScreenCaption(
  widget: Pick<DisplayWidget, 'label' | 'properties'>,
): string {
  return displayWidgetShowsLabel(widget) ? widget.label.trim() : ''
}

/**
 * Label used as on-glass content when the widget has no other string. Empty
 * once the label has moved to a caption, so a wired Text reads as the value
 * it is being told rather than repeating its own caption while it waits.
 */
export function displayWidgetBodyFallback(
  widget: Pick<DisplayWidget, 'label' | 'properties'>,
): string {
  return displayWidgetShowsLabel(widget) ? '' : widget.label
}

/** Caption type scale, relative to the widget's own resolved text size. */
export const DISPLAY_CAPTION_SCALE = 0.72
export const DISPLAY_CAPTION_LINE_HEIGHT = 1.15
/** Blank rows between the caption and the widget's own box. */
export const DISPLAY_CAPTION_GAP = 2
/** A widget still has to be worth drawing under its caption. */
export const DISPLAY_CAPTION_MIN_BODY = 8

export interface DisplayCaptionLayout {
  text: string
  fontSize: number
  /** The caption row itself. */
  height: number
  gap: number
  /** Rows the caption takes off the top of the authored bounds. */
  offset: number
}

/**
 * Where the caption sits and what the widget has left, in pixels.
 *
 * The caption comes *out of* the widget's own box rather than floating over
 * it: a name painted across a slider's track is unreadable, and the box is
 * the only space the author gave us. Both renderers must therefore agree on
 * the exact strip, so the numbers are resolved here once — the DOM preview
 * lays the caption out in these pixels instead of ems, and the LVGL emitter
 * offsets the widget object by the same {@link DisplayCaptionLayout.offset}.
 * Returns null when there is no caption, or when the box cannot carry both.
 */
export function displayWidgetCaptionLayout(
  widget: Pick<DisplayWidget, 'label' | 'properties'>,
  fontSize: number,
  boxHeight?: number,
): DisplayCaptionLayout | null {
  const text = displayWidgetOnScreenCaption(widget)
  if (!text) return null
  const captionSize = Math.max(8, Math.round((Number.isFinite(fontSize) ? fontSize : 14) * DISPLAY_CAPTION_SCALE))
  const height = Math.ceil(captionSize * DISPLAY_CAPTION_LINE_HEIGHT)
  const offset = height + DISPLAY_CAPTION_GAP
  if (boxHeight !== undefined && boxHeight - offset < DISPLAY_CAPTION_MIN_BODY) return null
  return { text, fontSize: captionSize, height, gap: DISPLAY_CAPTION_GAP, offset }
}

/**
 * The widget's own drawing area: its bounds less any caption strip. Every
 * reader that means "how big is the thing itself" — the emitter's object, a
 * baked icon's height, a finger's target — asks this rather than the authored
 * bounds, or the caption is charged to nobody.
 */
export function displayWidgetContentBounds(
  widget: Pick<PlacedDisplayWidget, 'label' | 'properties' | 'bounds'>,
  fontSize: number,
): DisplayBounds {
  const caption = displayWidgetCaptionLayout(widget, fontSize, widget.bounds.height)
  if (!caption) return { ...widget.bounds }
  return {
    x: widget.bounds.x,
    y: widget.bounds.y + caption.offset,
    width: widget.bounds.width,
    height: widget.bounds.height - caption.offset,
  }
}

export function defaultDisplayWidgetBounds(type: DisplayWidgetType, x = 0, y = 0): DisplayBounds {
  const definition = DISPLAY_WIDGET_LIBRARY[type]
  return {
    x,
    y,
    width: Math.max(definition.minimumVisualSize.width, definition.minimumTouchSize?.width ?? 0),
    height: Math.max(definition.minimumVisualSize.height, definition.minimumTouchSize?.height ?? 0),
  }
}

/** A control a finger operates, and therefore one the touch-first geometry
 * rules apply to. Derived from the registry's touch minimum so a new control
 * joins the rule by declaring one. */
export function isDisplayTouchTarget(type: DisplayWidgetType): boolean {
  return DISPLAY_WIDGET_LIBRARY[type].minimumTouchSize !== undefined
}

/** The pointer region for a control: its drawn bounds grown symmetrically to
 * the registry touch minimum. It equals the bounds of a widget the editor
 * constrained and is larger for one that arrived through import, and it is
 * always the whole control rather than the thin track a slider paints. LVGL
 * takes the per-side difference as its extended click area. */
export function displayControlHitBounds(widget: Pick<PlacedDisplayWidget, 'type' | 'bounds'>): DisplayBounds {
  const touch = DISPLAY_WIDGET_LIBRARY[widget.type].minimumTouchSize
  if (!touch) return { ...widget.bounds }
  const width = Math.max(widget.bounds.width, touch.width)
  const height = Math.max(widget.bounds.height, touch.height)
  return {
    x: Math.round(widget.bounds.x - (width - widget.bounds.width) / 2),
    y: Math.round(widget.bounds.y - (height - widget.bounds.height) / 2),
    width,
    height,
  }
}

export function displayWidgetValidationIssues(
  widget: DisplayWidget,
  displayClass: DisplayClass,
): DisplayWidgetValidationIssue[] {
  const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
  const issues: DisplayWidgetValidationIssue[] = []
  if (!definition.allowedDisplayClasses.includes(displayClass)) {
    issues.push({ code: 'display-class', message: `${definition.label} is not supported on this display.` })
  }
  // A widget not yet placed has no size to be too small — the checks that
  // remain (its display class, its own properties) are true of it regardless.
  const bounds = widget.bounds
  if (bounds && (bounds.width < definition.minimumVisualSize.width || bounds.height < definition.minimumVisualSize.height)) {
    issues.push({
      code: 'visual-size',
      message: `${definition.label} needs at least ${definition.minimumVisualSize.width}×${definition.minimumVisualSize.height} px.`,
    })
  }
  const touch = definition.minimumTouchSize
  if (bounds && touch && (bounds.width < touch.width || bounds.height < touch.height)) {
    issues.push({
      code: 'touch-size',
      message: `${definition.label} needs a ${touch.width}×${touch.height} px touch target.`,
    })
  }
  // Each option is its own target, so the strip has to be wide enough for
  // all of them, not just for the default three.
  const options = widget.type === 'Choice Strip' ? displayChoiceOptions(widget).length : 0
  if (bounds && options > 0 && bounds.width < options * DISPLAY_TOUCH_TARGET_MIN_PX
    && !issues.some((issue) => issue.code === 'touch-size')) {
    issues.push({
      code: 'touch-size',
      message: `${options} options need a strip at least ${options * DISPLAY_TOUCH_TARGET_MIN_PX} px wide.`,
    })
  }
  issues.push(...definition.validateProperties(widget.properties).map((message) => ({ code: 'property' as const, message })))
  return issues
}

import type {
  DisplayBounds,
  DisplayDocument,
  DisplayWidget,
  DisplayWidgetProperty,
  DisplayWidgetType,
  PlacedDisplayWidget,
} from './displayDocument'
import { displayAsset, normalizeDisplayAssetId } from './displayAssets'
import type { NodePort } from '../types'
import {
  DISPLAY_SOURCE_FROM_GRAPH, displaySourceFields, normalizeDisplaySource, type DisplaySourceField,
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
  | 'patternConfirm'
  | 'outputBrightness'
  | 'outputBlackout'

export const TEMPLATE_CONTROL_ROLE_IDS: readonly TemplateControlRole[] = [
  'transportPrevious', 'transportPlayPause', 'transportNext', 'transportVolume',
  'patternConfirm', 'outputBrightness', 'outputBlackout',
]

/** A stored role, or null. The boundary check for an untrusted document — the
 *  same stance `normalizeDisplaySource` takes toward a bound field. */
export function normalizeDisplayControlRole(value: unknown): TemplateControlRole | null {
  return typeof value === 'string' && (TEMPLATE_CONTROL_ROLE_IDS as readonly string[]).includes(value)
    ? value as TemplateControlRole
    : null
}

export type DisplayWidgetPortRoleId = 'value' | 'out' | 'set'
export type DisplayWidgetPortDataType = 'string' | 'float' | 'bool' | 'color' | 'patternselect'
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
  | 'text' | 'numeric' | 'timecode' | 'progress' | 'meter' | 'status'
  | 'swatch' | 'pattern-browser' | 'image' | 'button' | 'toggle' | 'slider' | 'dial'

export type DisplayLvglEmitter =
  | 'label' | 'bar' | 'led' | 'swatch' | 'pattern-browser' | 'image'
  | 'button' | 'switch' | 'slider' | 'arc'

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
  dataType: 'float' | 'bool',
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
    propertyInspector: [text('text', 'Text', 32), asset('assetId', 'Icon', ['icon'], true), select('presentation', 'Presentation', ['text', 'icon', 'text+icon'])],
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
      const id = normalizeDisplaySource(raw)
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
 * can actually take. The same shape `PlayerControls` uses for `add-control`,
 * minus its picker: here the property being dropped on names the control.
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
 * Whether this widget reads its value from the source wired into the panel.
 *
 * A bound widget draws no cable, so it mints no input port. Its outputs are
 * untouched: binding is about where a reading comes from, and a control still
 * publishes what a finger did to it.
 */
export function displayWidgetIsBound(widget: Pick<DisplayWidget, 'properties'>): boolean {
  const source = widget.properties?.source
  return typeof source === 'string' && source !== '' && source !== DISPLAY_SOURCE_FROM_GRAPH
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
 * Narrowed by data type, the same exact match the Control Map picker uses and
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
    if (!displayWidgetIsBound(widget)) continue
    sources[widget.id] = {
      field: String(widget.properties?.source),
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
  document: Pick<DisplayDocument, 'widgets'>,
): { inputs: NodePort[]; outputs: NodePort[] } {
  return {
    inputs: displayDocumentInputPorts(document),
    outputs: displayDocumentTouchOutputPorts(document),
  }
}

/** Graph-facing widget inputs for the panel that owns this document. */
export function displayDocumentInputPorts(
  document: Pick<DisplayDocument, 'widgets'>,
): NodePort[] {
  const inputs: NodePort[] = []
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

/**
 * The value a Slider or Dial holds before a finger has moved it.
 *
 * Its own `initial` when set, otherwise its minimum, clamped into range. Read
 * by the preview evaluator, the live renderer and the LVGL emitter alike, so a
 * control starts in the same place on screen, in the graph and on the board —
 * which matters because a level on the Controls wire is absolute: a Brightness
 * slider starting at its minimum would black out the LEDs it commands.
 * `undefined` for anything that is not a ranged control.
 */
export function displayControlStartValue(widget: Pick<DisplayWidget, 'type' | 'properties'>): number | undefined {
  if (widget.type !== 'Slider' && widget.type !== 'Dial') return undefined
  const min = numericProperty(widget.properties, 'min', 0)
  const max = Math.max(min, numericProperty(widget.properties, 'max', 1))
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
  issues.push(...definition.validateProperties(widget.properties).map((message) => ({ code: 'property' as const, message })))
  return issues
}

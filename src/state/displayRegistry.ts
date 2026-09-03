import type {
  DisplayBounds,
  DisplayDocument,
  DisplayWidget,
  DisplayWidgetProperty,
  DisplayWidgetType,
} from './displayDocument'
import { displayAsset, normalizeDisplayAssetId } from './displayAssets'
import type { NodePort } from '../types'

export type DisplayClass = 'touch-tft'
export type DisplayWidgetPortDirection = 'input' | 'output'
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
  options: { step?: boolean; warnings?: boolean } = {},
): string[] {
  const min = numericProperty(properties, 'min', 0)
  const max = numericProperty(properties, 'max', 1)
  const issues: string[] = []
  if (max <= min) issues.push('Maximum must be greater than minimum.')
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
    portRoles: input('string', 'Text'), defaultProperties: { text: '', align: 'left', fontSize: 16, color: '#f4f7ff', wrap: true, maxLines: 2 },
    minimumVisualSize: { width: 48, height: 20 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'text', lvglEmitter: 'label',
    propertyInspector: [text('text', 'Fallback text'), select('align', 'Alignment', ['left', 'center', 'right']), number('fontSize', 'Font size', 8, 96, 1, true), color('color', 'Text colour'), toggle('wrap', 'Wrap text'), number('maxLines', 'Maximum lines', 1, 4, 1, true)],
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
    propertyInspector: [number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01), number('step', 'Step', 0.0001, 1000000, 0.0001), select('orientation', 'Orientation', ['horizontal', 'vertical'])],
    states: CONTROL_STATES, assetSlots: NO_ASSETS,
    validateProperties: (properties) => rangePropertyIssues(properties, { step: true }),
  },
  Dial: {
    type: 'Dial', label: 'Dial', description: 'A ranged control operated by vertical dragging, not circular tracing.',
    portRoles: synchronized('float'), defaultProperties: { min: 0, max: 1, step: 0.01 },
    minimumVisualSize: { width: 48, height: 48 }, minimumTouchSize: { width: 48, height: 48 }, allowedDisplayClasses: TOUCH_TFT,
    previewRenderer: 'dial', lvglEmitter: 'arc',
    propertyInspector: [number('min', 'Minimum', -1000000, 1000000, 0.01), number('max', 'Maximum', -1000000, 1000000, 0.01), number('step', 'Step', 0.0001, 1000000, 0.0001)],
    states: CONTROL_STATES, assetSlots: NO_ASSETS,
    validateProperties: (properties) => rangePropertyIssues(properties, { step: true }),
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

export function displayWidgetDefinition(type: DisplayWidgetType): DisplayWidgetDefinition {
  return DISPLAY_WIDGET_LIBRARY[type]
}

export function displayWidgetPortId(widgetId: string, role: DisplayWidgetPortRoleId): string {
  return `widget:${widgetId}:${role}`
}

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

/** Graph-facing ports for the outer Display node, derived only from stable
 * widget ids and registry roles. Editable labels affect presentation but never
 * cable identity. */
export function displayDocumentPorts(
  document: Pick<DisplayDocument, 'widgets'>,
): { inputs: NodePort[]; outputs: NodePort[] } {
  const inputs: NodePort[] = []
  const outputs: NodePort[] = []
  for (const widget of document.widgets) {
    for (const port of displayWidgetPorts(widget)) {
      const resolved = { id: port.id, label: port.label, dataType: port.dataType }
      if (port.direction === 'input') inputs.push(resolved)
      else outputs.push(resolved)
    }
  }
  return { inputs, outputs }
}

export function defaultDisplayWidgetProperties(type: DisplayWidgetType): Record<string, DisplayWidgetProperty> {
  return { ...DISPLAY_WIDGET_LIBRARY[type].defaultProperties }
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
export function displayControlHitBounds(widget: Pick<DisplayWidget, 'type' | 'bounds'>): DisplayBounds {
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
  if (widget.bounds.width < definition.minimumVisualSize.width || widget.bounds.height < definition.minimumVisualSize.height) {
    issues.push({
      code: 'visual-size',
      message: `${definition.label} needs at least ${definition.minimumVisualSize.width}×${definition.minimumVisualSize.height} px.`,
    })
  }
  const touch = definition.minimumTouchSize
  if (touch && (widget.bounds.width < touch.width || widget.bounds.height < touch.height)) {
    issues.push({
      code: 'touch-size',
      message: `${definition.label} needs a ${touch.width}×${touch.height} px touch target.`,
    })
  }
  issues.push(...definition.validateProperties(widget.properties).map((message) => ({ code: 'property' as const, message })))
  return issues
}

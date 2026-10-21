/*
 * The Web Remote: a phone control page the board serves over Wi-Fi.
 *
 * Its outputs are derived from a persisted list of controls, the way a Button
 * Bank derives its own from `buttons`, with a trailing "Add control…" socket.
 * Each control is one of the custom-screen control widgets and borrows that
 * widget's semantics from `displayRegistry.ts` rather than restating them: a
 * Button is true while held, a Toggle latches, a Slider and a Step Control
 * move in a ranged float, a Choice Strip reports an option index and a Colour
 * Picker holds a hue and reports a colour. So a control on the phone, a
 * control on a touch screen and a control minted by a wire all start at the
 * same value and report the same thing.
 *
 * Port ids derive from the control's stable id, never its label, so renaming a
 * control keeps its wires. See docs/design/web-remote.md.
 */

import type { NodePort } from '../../types'
import type { DisplayWidgetProperty, DisplayWidgetType } from '../displays/displayDocument'
import {
  displayChoiceOptions,
  displayControlOutput,
  displayControlRange,
  displayControlStartValue,
  displayPickerStartHue,
  displayPickerStops,
  displayTextEntryClamp,
  displayTextEntryMaxLength,
  displayTextEntryStart,
  displayWidgetDefinition,
  normalizeDisplayWidgetProperties,
  TOUCH_CONTROL_ADD_DATA_TYPE,
  TOUCH_CONTROL_ADD_HANDLE,
  TOUCH_CONTROL_ADD_LABEL,
  DISPLAY_PICKER_HUE_MAX,
  type DisplayRgb,
} from '../displays/displayRegistry'

export const WEB_REMOTE_NODE_TYPE = 'WebRemoteInput'

/**
 * The control widgets a phone page can draw, in the order the body offers
 * them. Each is a widget type, so its properties, range and output come from
 * the screen registry; adding a type here means giving it a `kind` below,
 * and the compiler then names every switch (page, firmware, body) that has to
 * learn it.
 */
export const WEB_REMOTE_CONTROL_TYPES = [
  'Button', 'Toggle', 'Slider', 'Step Control', 'Choice Strip', 'Colour Picker', 'Text Entry',
] as const satisfies readonly DisplayWidgetType[]

export type WebRemoteControlType = (typeof WEB_REMOTE_CONTROL_TYPES)[number]

/**
 * How a control behaves, which is all the page and the sketch need to know.
 *
 * `press` is momentary, `latch` a boolean, `range` a ranged number with a
 * slider or plus/minus keys, `choice` an option index, `hue` a Colour
 * Picker's hue in degrees, `text` a line of confirmed text.
 */
export type WebRemoteControlKind = 'press' | 'latch' | 'range' | 'choice' | 'hue' | 'text'

const KIND: Record<WebRemoteControlType, WebRemoteControlKind> = {
  Button: 'press',
  Toggle: 'latch',
  Slider: 'range',
  'Step Control': 'range',
  'Choice Strip': 'choice',
  'Colour Picker': 'hue',
  'Text Entry': 'text',
}

/** The widget properties a phone control keeps; the rest are screen-only. */
const KEPT_PROPERTIES: Record<WebRemoteControlType, readonly string[]> = {
  Button: ['text'],
  Toggle: ['offLabel', 'onLabel'],
  Slider: ['min', 'max', 'step', 'initial'],
  'Step Control': ['min', 'max', 'step', 'initial'],
  'Choice Strip': ['options', 'initial'],
  'Colour Picker': ['initial', 'saturation', 'brightness'],
  'Text Entry': ['text', 'placeholder', 'maxLength'],
}

/** Sixteen rows fit a phone without scrolling past the useful part. */
export const MAX_WEB_REMOTE_CONTROLS = 16
export const WEB_REMOTE_LABEL_MAX = 40
const PROPERTY_TEXT_MAX = 120

/** What a control holds: a press or latch, a number (a hue for a picker), or text. */
export type WebRemoteState = number | boolean | string

export interface WebRemoteControl {
  /** Stable identity, lower case letters, digits and hyphens. */
  id: string
  type: WebRemoteControlType
  label: string
  properties: Record<string, DisplayWidgetProperty>
}

export function isWebRemoteControlType(value: unknown): value is WebRemoteControlType {
  return typeof value === 'string' && (WEB_REMOTE_CONTROL_TYPES as readonly string[]).includes(value)
}

export function webRemoteControlKind(type: WebRemoteControlType): WebRemoteControlKind {
  return KIND[type]
}

/** The graph type a control's output carries, read off its widget's `out` role. */
export function webRemoteControlDataType(type: WebRemoteControlType): 'bool' | 'float' | 'color' | 'string' {
  const role = displayWidgetDefinition(type).portRoles.find((port) => port.direction === 'output')
  const dataType = role?.dataType
  return dataType === 'bool' || dataType === 'color' || dataType === 'string' ? dataType : 'float'
}

function safeControlId(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 32)
}

const ID_STEM: Record<WebRemoteControlType, string> = {
  Button: 'button',
  Toggle: 'toggle',
  Slider: 'slider',
  'Step Control': 'step',
  'Choice Strip': 'choice',
  'Colour Picker': 'colour',
  'Text Entry': 'text',
}

function cleanLabel(value: unknown, fallback: string): string {
  // Control characters would survive HTML escaping as invisible junk.
  const text = [...String(value ?? '')]
    .map((char) => (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f ? ' ' : char))
    .join('').trim()
  return [...text].slice(0, WEB_REMOTE_LABEL_MAX).join('') || fallback
}

function keptProperties(type: WebRemoteControlType, raw: unknown): Record<string, DisplayWidgetProperty> {
  const normalized = normalizeDisplayWidgetProperties(type, raw, PROPERTY_TEXT_MAX, 32)
  const kept: Record<string, DisplayWidgetProperty> = {}
  for (const key of KEPT_PROPERTIES[type]) {
    if (normalized[key] !== undefined) kept[key] = normalized[key]
  }
  return kept
}

/**
 * The saved control list, made safe: at most sixteen, each a known type with
 * a unique id and a bounded label, and only the properties its widget type
 * declares, each bounded by the widget's own inspector range.
 */
export function normalizeWebRemoteControls(value: unknown): WebRemoteControl[] {
  if (!Array.isArray(value)) return []
  const used = new Set<string>()
  const controls: WebRemoteControl[] = []
  for (const candidate of value) {
    if (controls.length >= MAX_WEB_REMOTE_CONTROLS) break
    if (!candidate || typeof candidate !== 'object') continue
    const raw = candidate as Partial<WebRemoteControl>
    if (!isWebRemoteControlType(raw.type)) continue
    const stem = safeControlId(raw.id) || ID_STEM[raw.type]
    let id = stem
    let suffix = 2
    while (used.has(id)) id = `${stem}-${suffix++}`
    used.add(id)
    const fallback = `${displayWidgetDefinition(raw.type).label} ${controls.length + 1}`
    controls.push({
      id,
      type: raw.type,
      label: cleanLabel(raw.label, fallback),
      properties: keptProperties(raw.type, raw.properties),
    })
  }
  return controls
}

const PORT_PREFIX = 'remote:'

export function webRemotePortId(controlId: string): string {
  return `${PORT_PREFIX}${controlId}`
}

/** The control id a port names, or null when it is not a Web Remote control port. */
export function parseWebRemotePortId(portId: string | null | undefined): string | null {
  if (!portId?.startsWith(PORT_PREFIX)) return null
  const id = portId.slice(PORT_PREFIX.length)
  return id && safeControlId(id) === id ? id : null
}

/** One output per control, then the "Add control…" invitation while there is room. */
export function webRemoteOutputs(value: unknown, includeAddHandle = true): NodePort[] {
  const controls = normalizeWebRemoteControls(value)
  const outputs: NodePort[] = controls.map((control) => ({
    id: webRemotePortId(control.id),
    label: control.label,
    dataType: webRemoteControlDataType(control.type),
  }))
  if (includeAddHandle && controls.length < MAX_WEB_REMOTE_CONTROLS) {
    outputs.push({ id: TOUCH_CONTROL_ADD_HANDLE, label: TOUCH_CONTROL_ADD_LABEL, dataType: TOUCH_CONTROL_ADD_DATA_TYPE })
  }
  return outputs
}

/** A fresh id for a new control of this type, unique on this remote. */
export function nextWebRemoteControlId(controls: readonly WebRemoteControl[], type: WebRemoteControlType): string {
  const used = new Set(controls.map((control) => control.id))
  const stem = ID_STEM[type]
  let id = stem
  let suffix = 2
  while (used.has(id)) id = `${stem}-${suffix++}`
  return id
}

/**
 * Append a control, or return the list unchanged when the remote is full.
 * The label and properties go through the same normalisation as a load.
 */
export function appendWebRemoteControl(
  value: unknown,
  type: WebRemoteControlType,
  label?: string,
  properties: Record<string, DisplayWidgetProperty> = displayWidgetDefinition(type).defaultProperties,
): { controls: WebRemoteControl[]; added: WebRemoteControl | null } {
  const controls = normalizeWebRemoteControls(value)
  if (controls.length >= MAX_WEB_REMOTE_CONTROLS) return { controls, added: null }
  const id = nextWebRemoteControlId(controls, type)
  const next = normalizeWebRemoteControls([
    ...controls,
    { id, type, label: label ?? `${displayWidgetDefinition(type).label} ${controls.length + 1}`, properties },
  ])
  return { controls: next, added: next[next.length - 1] ?? null }
}

/** Change one control's label or properties, keeping its id and type. */
export function patchWebRemoteControl(
  value: unknown,
  controlId: string,
  patch: { label?: string; properties?: Record<string, DisplayWidgetProperty> },
): WebRemoteControl[] {
  return normalizeWebRemoteControls(normalizeWebRemoteControls(value).map((control) => control.id === controlId
    ? {
        ...control,
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        properties: { ...control.properties, ...patch.properties },
      }
    : control))
}

/** The range a control's state moves in: its widget's, a hue's 0-360, or 0/1. */
export function webRemoteStateRange(control: Pick<WebRemoteControl, 'type' | 'properties'>): { min: number; max: number; step: number } {
  const kind = KIND[control.type]
  if (kind === 'press' || kind === 'latch') return { min: 0, max: 1, step: 1 }
  // A text control's range is its length in characters.
  if (kind === 'text') return { min: 0, max: displayTextEntryMaxLength(control), step: 1 }
  if (kind === 'hue') return { min: 0, max: DISPLAY_PICKER_HUE_MAX, step: 1 }
  return displayControlRange(control)
}

/** What a control holds before anyone has touched it: the screen widget's start. */
export function webRemoteStartState(control: Pick<WebRemoteControl, 'type' | 'properties'>): WebRemoteState {
  const kind = KIND[control.type]
  if (kind === 'press' || kind === 'latch') return false
  if (kind === 'text') return displayTextEntryStart(control)
  if (kind === 'hue') return displayPickerStartHue(control)
  return displayControlStartValue(control) ?? 0
}

/**
 * A value from the page made into this control's state: a switch at 0.5 for
 * the booleans, and for the rest clamped into range and snapped to the step
 * from the minimum. The sketch's `_wrQuantize` performs the same arithmetic,
 * so the phone, the preview and the board agree on where a drag lands.
 */
export function webRemoteQuantize(control: Pick<WebRemoteControl, 'type' | 'properties'>, value: unknown): WebRemoteState {
  const kind = KIND[control.type]
  // Text is held to the field's length and byte budget, one line, as the
  // sketch's `_wrSetText` cuts it.
  if (kind === 'text') return displayTextEntryClamp(control, typeof value === 'string' ? value : '')
  const number = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value)
  if (kind === 'press' || kind === 'latch') return Number.isFinite(number) && number >= 0.5
  const { min, max, step } = webRemoteStateRange(control)
  const finite = Number.isFinite(number) ? number : min
  const clamped = Math.max(min, Math.min(max, finite))
  const snapped = step > 0 ? min + Math.round((clamped - min) / step) * step : clamped
  // Rounded to the float a sketch would print, so 0.1 steps do not drift.
  return Math.max(min, Math.min(max, Math.round(snapped * 1e6) / 1e6))
}

/** The control's output for a state: the state itself, or a picker's colour. */
export function webRemoteControlOutput(
  control: Pick<WebRemoteControl, 'type' | 'properties'>,
  state: WebRemoteState,
): number | boolean | string | DisplayRgb {
  const kind = KIND[control.type]
  if (kind === 'text') return typeof state === 'string' ? state : displayTextEntryStart(control)
  if (kind === 'press' || kind === 'latch') return typeof state === 'boolean' ? state : Number(state) >= 0.5
  if (kind === 'hue') return displayControlOutput(control, typeof state === 'number' ? state : displayPickerStartHue(control))
  return typeof state === 'number' ? state : Number(state) || 0
}

/** A Choice Strip's options, as the screen widget splits them. */
export function webRemoteChoiceOptions(control: Pick<WebRemoteControl, 'properties'>): string[] {
  return displayChoiceOptions(control)
}

/** A Colour Picker's strip as seven `#rrggbb` stops, red to red. */
export function webRemoteHueStops(control: Pick<WebRemoteControl, 'properties'>): string[] {
  const hex = (channel: number) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')
  return displayPickerStops(control).map((rgb) => `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`)
}

/**
 * The name the board answers to as `<name>.local`: the hostname with
 * everything mDNS would reject removed. An empty result falls back rather
 * than announcing nothing.
 */
export function webRemoteMdnsName(hostname: unknown): string {
  const cleaned = String(hostname ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/g, '')
  return cleaned || 'fastled-remote'
}

/** The page's heading, bounded like a label. */
export function webRemoteTitle(value: unknown): string {
  return cleanLabel(value, 'LED Remote')
}

/**
 * The board test moved to networkCapability.ts, which also answers the
 * narrower "can it serve the page" question; re-exported so existing
 * imports keep working.
 */
export { fqbnHasWifi } from './networkCapability'

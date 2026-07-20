// Data model + pure helpers for the Performance Control Deck: pinning
// arbitrary node properties as large knobs/faders, saving/recalling
// parameter scenes, morphing between two scenes, and MIDI/keyboard bindings.
// No Zustand here — this mirrors workspacePersistence.ts's "plain types plus
// pure functions" shape; the store wiring lives in graphStore.ts (durable,
// per-project config) and performanceDeckSessionStore.ts (transient session
// state).

import { propertyMeta } from './nodeLibrary'

export type PinnedControlKind = 'knob' | 'fader' | 'toggle' | 'select'

/** A single pinned node property, rendered as a large control in the deck. */
export interface PinnedControl {
  id: string
  nodeId: string
  propertyKey: string
  /** User-renamable independent of the node's own label. */
  label: string
  kind: PinnedControlKind
  min?: number
  max?: number
  step?: number
  options?: readonly string[]
  createdAt: number
}

/** A named snapshot of every pinned control's value at save time. Scenes are
 *  deliberately not full-graph snapshots (that's what pattern/project saves
 *  are for) — just the pinned subset a performer cares about recalling. */
export interface ParameterScene {
  id: string
  name: string
  /** pinId -> value, at time of save. A pin removed later just makes that
   *  key inert on recall (skipped, not an error). */
  values: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export type DeckActionId =
  | { type: 'panic' }
  | { type: 'recallScene'; sceneId: string }
  | { type: 'pinNudge'; pinId: string; delta: number }

export type MidiMessageKind = 'cc' | 'note'

/** What a MIDI-learned binding drives: a pinned control's value, a named
 *  deck action, or the scene-morph crossfader directly. */
export type MidiBindingTarget =
  | { kind: 'pin'; pinId: string }
  | { kind: 'action'; action: DeckActionId }
  | { kind: 'morph' }

export interface MidiBinding {
  id: string
  target: MidiBindingTarget
  message: MidiMessageKind
  channel: number // 0-15, the exact channel captured at learn time
  number: number // CC number or note number, 0-127
  createdAt: number
}

export interface KeyBinding {
  id: string
  /** Serialized combo, e.g. "F7", "Shift+F7", "Ctrl+1" — produced by
   *  serializeKeyCombo so capture and lookup always agree. */
  combo: string
  action: DeckActionId
  createdAt: number
}

/** The full per-project performance-deck configuration. Lives inside
 *  PersistedWorkspace so it travels with project files/share links/autosave
 *  — pins reference nodeIds that only exist within one graph. */
export interface PerformanceDeckConfig {
  pins: PinnedControl[]
  scenes: ParameterScene[]
  midiBindings: MidiBinding[]
  keyBindings: KeyBinding[]
}

export function blankDeckConfig(): PerformanceDeckConfig {
  return { pins: [], scenes: [], midiBindings: [], keyBindings: [] }
}

// ── Structural keys that never make sense as a pinned live control ────────
// Mirrors StudioNode.tsx's inline `editable` denylist (font/image/code/etc.)
// rather than nodePresets.ts's `presettableProperties`, which blanket-
// excludes every input/output/hardware-category node's properties — that
// would wrongly exclude MatrixOutput.brightness, exactly the property
// "master brightness" needs to pin.
const STRUCTURAL_KEYS = new Set([
  'font',
  'image',
  'animation',
  'code',
  'globalCode',
  'clampInputs',
  'patternIds',
  'patternSections',
  'transitions',
  'previewHidden',
  'bypassed',
  'showInMainPreview',
  'usePsram',
  'psramMode',
  'width',
  'height',
  'paramId',
  'colors',
  'positions',
  'anchorA',
  'anchorB',
  'anchorC',
  'text',
  'r',
  'g',
  'b',
])

/** Whether a node property is sensible to pin as a live performance control.
 *  Deliberately property-shape-based (numbers/booleans/enum strings), not
 *  category-based — unlike nodePresets.ts's blanket input/output/hardware
 *  exclusion, MatrixOutput.brightness (an "output"-category node) must stay
 *  pinnable. */
export function isPinnableProperty(nodeType: string, key: string, value?: unknown): boolean {
  if (STRUCTURAL_KEYS.has(key)) return false
  if (value === undefined) return true
  const meta = propertyMeta(nodeType, key)
  if (meta) return true
  return typeof value === 'number' || typeof value === 'boolean'
}

/** Derive a PinnedControl's kind + slider/select bounds from the node's
 *  static property metadata and the current value's own type. */
export function deriveControlShape(
  nodeType: string,
  key: string,
  value: unknown,
): Pick<PinnedControl, 'kind' | 'min' | 'max' | 'step' | 'options'> {
  const meta = propertyMeta(nodeType, key)
  if (meta?.control === 'select') return { kind: 'select', options: meta.options }
  if (meta?.control === 'slider') return { kind: 'fader', min: meta.min, max: meta.max, step: meta.step }
  if (typeof value === 'boolean') return { kind: 'toggle' }
  return { kind: 'knob', min: 0, max: 1, step: 0.01 }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizePinnedControl(value: unknown): PinnedControl | null {
  if (!isPlainObject(value)) return null
  const { id, nodeId, propertyKey, label, kind, min, max, step, options, createdAt } = value
  if (typeof id !== 'string' || typeof nodeId !== 'string' || typeof propertyKey !== 'string') return null
  if (typeof label !== 'string') return null
  const validKind: PinnedControlKind = kind === 'fader' || kind === 'toggle' || kind === 'select' ? kind : 'knob'
  return {
    id,
    nodeId,
    propertyKey,
    label,
    kind: validKind,
    min: typeof min === 'number' ? min : undefined,
    max: typeof max === 'number' ? max : undefined,
    step: typeof step === 'number' ? step : undefined,
    options: Array.isArray(options) ? options.filter((o): o is string => typeof o === 'string') : undefined,
    createdAt: typeof createdAt === 'number' ? createdAt : Date.now(),
  }
}

function normalizeScene(value: unknown): ParameterScene | null {
  if (!isPlainObject(value)) return null
  const { id, name, values, createdAt, updatedAt } = value
  if (typeof id !== 'string' || typeof name !== 'string' || !isPlainObject(values)) return null
  return {
    id,
    name,
    values: { ...values },
    createdAt: typeof createdAt === 'number' ? createdAt : Date.now(),
    updatedAt: typeof updatedAt === 'number' ? updatedAt : Date.now(),
  }
}

function normalizeDeckAction(value: unknown): DeckActionId | null {
  if (!isPlainObject(value)) return null
  if (value.type === 'panic') return { type: 'panic' }
  if (value.type === 'recallScene' && typeof value.sceneId === 'string') {
    return { type: 'recallScene', sceneId: value.sceneId }
  }
  if (value.type === 'pinNudge' && typeof value.pinId === 'string' && typeof value.delta === 'number') {
    return { type: 'pinNudge', pinId: value.pinId, delta: value.delta }
  }
  return null
}

function normalizeMidiTarget(value: unknown): MidiBindingTarget | null {
  if (!isPlainObject(value)) return null
  if (value.kind === 'pin' && typeof value.pinId === 'string') return { kind: 'pin', pinId: value.pinId }
  if (value.kind === 'morph') return { kind: 'morph' }
  if (value.kind === 'action') {
    const action = normalizeDeckAction(value.action)
    if (action) return { kind: 'action', action }
  }
  return null
}

function normalizeMidiBinding(value: unknown): MidiBinding | null {
  if (!isPlainObject(value)) return null
  const { id, target, message, channel, number, createdAt } = value
  if (typeof id !== 'string') return null
  const normTarget = normalizeMidiTarget(target)
  if (!normTarget) return null
  if (message !== 'cc' && message !== 'note') return null
  if (typeof channel !== 'number' || typeof number !== 'number') return null
  return {
    id,
    target: normTarget,
    message,
    channel,
    number,
    createdAt: typeof createdAt === 'number' ? createdAt : Date.now(),
  }
}

function normalizeKeyBinding(value: unknown): KeyBinding | null {
  if (!isPlainObject(value)) return null
  const { id, combo, action, createdAt } = value
  if (typeof id !== 'string' || typeof combo !== 'string') return null
  const normAction = normalizeDeckAction(action)
  if (!normAction) return null
  return { id, combo, action: normAction, createdAt: typeof createdAt === 'number' ? createdAt : Date.now() }
}

/** Defensive normalizer for a loaded PersistedWorkspace's `performanceDeck`
 *  field — same role as projectStore's normalizeUploadTarget. Called on
 *  every load path (project switch, share link, JSON import, autosave
 *  restore); a missing, malformed, or future-shaped blob safely becomes an
 *  empty deck rather than crashing. */
export function normalizeDeckConfig(value: unknown): PerformanceDeckConfig {
  if (!isPlainObject(value)) return blankDeckConfig()
  const pins = Array.isArray(value.pins) ? value.pins.map(normalizePinnedControl).filter((p): p is PinnedControl => p != null) : []
  const scenes = Array.isArray(value.scenes) ? value.scenes.map(normalizeScene).filter((s): s is ParameterScene => s != null) : []
  const midiBindings = Array.isArray(value.midiBindings)
    ? value.midiBindings.map(normalizeMidiBinding).filter((b): b is MidiBinding => b != null)
    : []
  const keyBindings = Array.isArray(value.keyBindings)
    ? value.keyBindings.map(normalizeKeyBinding).filter((b): b is KeyBinding => b != null)
    : []
  return { pins, scenes, midiBindings, keyBindings }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function snapToStep(value: number, step?: number): number {
  if (!step || step <= 0) return value
  const snapped = Math.round(value / step) * step
  const decimals = Math.max(0, String(step).split('.')[1]?.length ?? 0)
  return Number(snapped.toFixed(decimals))
}

/** Interpolate every pin present in *both* scenes at progress t (0..1).
 *  Numeric values lerp (snapped to the pin's step); boolean/select/string
 *  values hard-switch at t >= 0.5 — there's no meaningful halfway point for
 *  a discrete parameter. A pin missing from either scene is skipped. */
export function interpolateScene(
  a: ParameterScene,
  b: ParameterScene,
  t: number,
  pins: PinnedControl[],
): Record<string, unknown> {
  const clampedT = Math.max(0, Math.min(1, t))
  const out: Record<string, unknown> = {}
  for (const pin of pins) {
    if (!(pin.id in a.values) || !(pin.id in b.values)) continue
    const va = a.values[pin.id]
    const vb = b.values[pin.id]
    if (typeof va === 'number' && typeof vb === 'number') {
      out[pin.id] = snapToStep(lerp(va, vb, clampedT), pin.step)
    } else {
      out[pin.id] = clampedT >= 0.5 ? vb : va
    }
  }
  return out
}

/** Scale a MIDI CC/note's normalized 0..1 value onto a pinned control's
 *  declared range: linear + step-snapped for a fader/knob, a 0.5 threshold
 *  for a toggle, and index-selection for a select-kind pin. */
export function scaleMidiValueToPin(pin: PinnedControl, normalized: number): unknown {
  const clamped = Math.max(0, Math.min(1, normalized))
  if (pin.kind === 'toggle') return clamped >= 0.5
  if (pin.kind === 'select' && pin.options && pin.options.length > 0) {
    const index = Math.min(pin.options.length - 1, Math.floor(clamped * pin.options.length))
    return pin.options[index]
  }
  const min = pin.min ?? 0
  const max = pin.max ?? 1
  return snapToStep(lerp(min, max, clamped), pin.step)
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Shift', 'Alt'])

/** Build a stable combo string like "Ctrl+Shift+F7" from a keydown event.
 *  Used both by binding capture and by lookup, so they always agree. Cmd
 *  (metaKey) on macOS is folded into the same "Ctrl" token as Windows/Linux
 *  Ctrl, matching how this app's existing shortcuts treat mod-keys. */
export function serializeKeyCombo(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): string {
  if (MODIFIER_KEYS.has(e.key)) return ''
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  parts.push(key)
  return parts.join('+')
}

/** Global shortcuts a user-defined key binding must never be allowed to
 *  shadow — mirrors App.tsx's hardcoded keydown branches. */
export const RESERVED_COMBOS = new Set([
  'Escape',
  'F1',
  '?',
  'F9',
  'F10',
  'F8',
  'Ctrl+Z',
  'Ctrl+Shift+Z',
  'Ctrl+Y',
  'Ctrl+S',
  'Ctrl+A',
  'Ctrl+C',
  'Ctrl+V',
  'Ctrl+D',
  'Ctrl+G',
])

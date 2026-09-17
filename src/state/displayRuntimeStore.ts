import { create } from 'zustand'
import type { DisplayWidgetPortRoleId } from './displayRegistry'

/*
 * Live, transient run-state for custom `Display` widgets: what a finger is
 * doing, what the graph published back by stable role, what still needs
 * redrawing, and what the preview could not resolve. Like the hardware input
 * and TransportDisplay touch stores it is neither persisted nor undo-tracked;
 * unlike them it is written on every evaluated frame, so value writes mutate
 * the map in place and never call Zustand's `set`. Renderers subscribe to a
 * lightweight per-display revision; diagnostics — which change when something
 * is wrong, not at animation rate — separately bump `diagnosticsVersion` for
 * React chrome.
 */

/** What a finger can produce: a latch or a ranged value. */
export type DisplayTouchValue = number | boolean

/** Whatever the role's graph data type carries — a scalar for string, float and
 * bool roles, and the structured value for colour and pattern selection.
 * Compared by identity for dirty tracking, so a producer that rebuilds a
 * structured value every frame redraws every frame. */
export type DisplayRuntimeValue = number | boolean | string | object

export interface DisplayWidgetRuntime {
  /** What the finger produced. Kept after release so the last touch is legible. */
  touchValue?: DisplayTouchValue
  /** True while the finger owns the control and the graph value must not win. */
  touchOwned: boolean
  /** A change not yet sampled by graph evaluation. This preserves a quick
   * press/release that occurs wholly between two evaluator passes. */
  touchPending: boolean
  /** Graph-driven values by the widget's stable registry roles. */
  roleValues: Map<DisplayWidgetPortRoleId, DisplayRuntimeValue>
  /** Set when anything the panel draws changed since the last redraw. */
  dirty: boolean
  /** Why this widget cannot be honoured in preview, if it cannot. */
  diagnostic?: string
}

export interface DisplayRuntimeDiagnostic {
  widgetId: string
  message: string
}

interface DisplayRuntimeState {
  displays: Map<string, Map<string, DisplayWidgetRuntime>>
  /** Monotonic per-display paint revision, polled by any number of renderers. */
  displayRevisions: Map<string, number>
  diagnosticsVersion: number
  touchDisplayWidget: (displayId: string, widgetId: string, value: DisplayTouchValue) => void
  releaseDisplayWidget: (displayId: string, widgetId: string) => void
  sampleDisplayWidgetOutput: (
    displayId: string,
    widgetId: string,
    fallback: DisplayTouchValue,
  ) => DisplayTouchValue
  publishDisplayRoleValue: (
    displayId: string,
    widgetId: string,
    role: DisplayWidgetPortRoleId,
    value: DisplayRuntimeValue,
  ) => void
  readDisplayWidget: (displayId: string, widgetId: string) => DisplayWidgetRuntime | undefined
  displayRevision: (displayId: string) => number
  subscribeDisplay: (displayId: string, listener: () => void) => () => void
  takeDirtyDisplayWidgets: (displayId: string) => string[]
  setDisplayWidgetDiagnostic: (displayId: string, widgetId: string, message?: string) => void
  displayRuntimeDiagnostics: (displayId: string) => DisplayRuntimeDiagnostic[]
  /**
   * Keep only the widgets still on a screen: any display absent from `live`
   * is dropped whole, and any widget absent from its display's list with it.
   *
   * Touch values outlive the designer on purpose, so nothing else clears
   * them, and a widget id is a deterministic stem (`slider`, `slider-2`) that
   * the next widget of that type is handed the moment the last one frees it.
   * Without this, deleting a control you had dragged to one end and adding a
   * fresh one gave the new control the old one's reading. Takes ids rather
   * than documents so this store still knows nothing about what a screen is.
   */
  retainDisplayWidgets: (live: Readonly<Record<string, readonly string[]>>) => void
  resetDisplayRuntime: (displayId?: string) => void
}

function emptyRuntime(): DisplayWidgetRuntime {
  return { touchOwned: false, touchPending: false, roleValues: new Map(), dirty: false }
}

/** The value a synchronized control draws after the input side of an
 * evaluator pass. Touch owns it while held; once released, a type-compatible
 * graph `set` value is authoritative. With no `set` value, the last local
 * value remains the control's state. */
export function resolvedDisplayControlValue(
  runtime: DisplayWidgetRuntime | undefined,
  fallback: DisplayTouchValue,
): DisplayTouchValue {
  if (!runtime) return fallback
  if (runtime.touchOwned) return runtime.touchValue ?? fallback
  const authoritative = runtime.roleValues.get('set')
  if (typeof authoritative === typeof fallback) return authoritative as DisplayTouchValue
  return runtime.touchValue ?? fallback
}

export const useDisplayRuntimeStore = create<DisplayRuntimeState>()((set, get) => {
  const displayListeners = new Map<string, Set<() => void>>()
  const bumpDisplayRevision = (displayId: string) => {
    const revisions = get().displayRevisions
    revisions.set(displayId, (revisions.get(displayId) ?? 0) + 1)
    displayListeners.get(displayId)?.forEach((listener) => listener())
  }
  const widgetRuntime = (displayId: string, widgetId: string): DisplayWidgetRuntime => {
    const displays = get().displays
    let widgets = displays.get(displayId)
    if (!widgets) {
      widgets = new Map()
      displays.set(displayId, widgets)
    }
    let runtime = widgets.get(widgetId)
    if (!runtime) {
      runtime = emptyRuntime()
      widgets.set(widgetId, runtime)
    }
    return runtime
  }

  return {
    displays: new Map(),
    displayRevisions: new Map(),
    diagnosticsVersion: 0,

    touchDisplayWidget: (displayId, widgetId, value) => {
      const runtime = widgetRuntime(displayId, widgetId)
      const changed = runtime.touchValue !== value || !runtime.touchOwned
      runtime.dirty = runtime.dirty || changed
      runtime.touchValue = value
      runtime.touchOwned = true
      runtime.touchPending = true
      if (changed) bumpDisplayRevision(displayId)
    },

    releaseDisplayWidget: (displayId, widgetId) => {
      const runtime = get().displays.get(displayId)?.get(widgetId)
      if (!runtime?.touchOwned) return
      runtime.touchOwned = false
      runtime.dirty = true
      bumpDisplayRevision(displayId)
    },

    sampleDisplayWidgetOutput: (displayId, widgetId, fallback) => {
      const runtime = get().displays.get(displayId)?.get(widgetId)
      if (!runtime) return fallback
      if (runtime.touchOwned || runtime.touchPending) {
        runtime.touchPending = false
        return runtime.touchValue ?? fallback
      }
      return resolvedDisplayControlValue(runtime, fallback)
    },

    publishDisplayRoleValue: (displayId, widgetId, role, value) => {
      const runtime = widgetRuntime(displayId, widgetId)
      if (runtime.roleValues.get(role) === value) return
      runtime.roleValues.set(role, value)
      runtime.dirty = true
      bumpDisplayRevision(displayId)
    },

    readDisplayWidget: (displayId, widgetId) => get().displays.get(displayId)?.get(widgetId),
    displayRevision: (displayId) => get().displayRevisions.get(displayId) ?? 0,
    subscribeDisplay: (displayId, listener) => {
      let listeners = displayListeners.get(displayId)
      if (!listeners) {
        listeners = new Set()
        displayListeners.set(displayId, listeners)
      }
      listeners.add(listener)
      return () => {
        listeners?.delete(listener)
        if (listeners?.size === 0) displayListeners.delete(displayId)
      }
    },

    takeDirtyDisplayWidgets: (displayId) => {
      const widgets = get().displays.get(displayId)
      if (!widgets) return []
      const dirty: string[] = []
      for (const [widgetId, runtime] of widgets) {
        if (!runtime.dirty) continue
        runtime.dirty = false
        dirty.push(widgetId)
      }
      return dirty
    },

    setDisplayWidgetDiagnostic: (displayId, widgetId, message) => {
      const runtime = widgetRuntime(displayId, widgetId)
      if (runtime.diagnostic === message) return
      runtime.diagnostic = message
      set({ diagnosticsVersion: get().diagnosticsVersion + 1 })
    },

    displayRuntimeDiagnostics: (displayId) => {
      const widgets = get().displays.get(displayId)
      if (!widgets) return []
      const diagnostics: DisplayRuntimeDiagnostic[] = []
      for (const [widgetId, runtime] of widgets) {
        if (runtime.diagnostic) diagnostics.push({ widgetId, message: runtime.diagnostic })
      }
      return diagnostics
    },

    retainDisplayWidgets: (live) => {
      const displays = get().displays
      const revisions = get().displayRevisions
      let changed = false
      for (const displayId of [...displays.keys()]) {
        const keep = live[displayId]
        if (!keep) {
          displays.delete(displayId)
          revisions.delete(displayId)
          displayListeners.get(displayId)?.forEach((listener) => listener())
          changed = true
          continue
        }
        const widgets = displays.get(displayId)
        if (!widgets) continue
        const wanted = new Set(keep)
        let dropped = false
        for (const widgetId of [...widgets.keys()]) {
          if (wanted.has(widgetId)) continue
          widgets.delete(widgetId)
          dropped = true
        }
        if (dropped) {
          bumpDisplayRevision(displayId)
          changed = true
        }
      }
      if (changed) set({ diagnosticsVersion: get().diagnosticsVersion + 1 })
    },

    resetDisplayRuntime: (displayId) => {
      const displays = get().displays
      const revisions = get().displayRevisions
      if (displayId === undefined) {
        const subscribedDisplays = [...displayListeners.keys()]
        displays.clear()
        revisions.clear()
        subscribedDisplays.forEach((id) => displayListeners.get(id)?.forEach((listener) => listener()))
      } else {
        displays.delete(displayId)
        bumpDisplayRevision(displayId)
      }
      set({ diagnosticsVersion: get().diagnosticsVersion + 1 })
    },
  }
})

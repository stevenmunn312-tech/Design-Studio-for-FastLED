import { create } from 'zustand'
import type { DisplayWidgetPortRoleId } from './displayRegistry'

/*
 * Live, transient run-state for custom `Display` widgets: what a finger is
 * doing, what the graph published back by stable role, what still needs
 * redrawing, and what the preview could not resolve. Like the hardware input
 * and TransportDisplay touch stores it is neither persisted nor undo-tracked;
 * unlike them it is written on every evaluated frame, so value writes mutate
 * the map in place and never call `set`. Only diagnostics — which change when
 * something is wrong, not at animation rate — bump `diagnosticsVersion` for
 * React chrome to subscribe to. Read values imperatively through
 * `getState()`; a component that renders them per frame already has its own
 * animation loop.
 */

export type DisplayRuntimeValue = number | boolean | string

export interface DisplayWidgetRuntime {
  /** What the finger produced. Kept after release so the last touch is legible. */
  touchValue?: DisplayRuntimeValue
  /** True while the finger owns the control and the graph value must not win. */
  touchOwned: boolean
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
  diagnosticsVersion: number
  touchDisplayWidget: (displayId: string, widgetId: string, value: DisplayRuntimeValue) => void
  releaseDisplayWidget: (displayId: string, widgetId: string) => void
  publishDisplayRoleValue: (
    displayId: string,
    widgetId: string,
    role: DisplayWidgetPortRoleId,
    value: DisplayRuntimeValue,
  ) => void
  readDisplayWidget: (displayId: string, widgetId: string) => DisplayWidgetRuntime | undefined
  takeDirtyDisplayWidgets: (displayId: string) => string[]
  setDisplayWidgetDiagnostic: (displayId: string, widgetId: string, message?: string) => void
  displayRuntimeDiagnostics: (displayId: string) => DisplayRuntimeDiagnostic[]
  resetDisplayRuntime: (displayId?: string) => void
}

function emptyRuntime(): DisplayWidgetRuntime {
  return { touchOwned: false, roleValues: new Map(), dirty: false }
}

export const useDisplayRuntimeStore = create<DisplayRuntimeState>()((set, get) => {
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
    diagnosticsVersion: 0,

    touchDisplayWidget: (displayId, widgetId, value) => {
      const runtime = widgetRuntime(displayId, widgetId)
      runtime.dirty = runtime.dirty || runtime.touchValue !== value || !runtime.touchOwned
      runtime.touchValue = value
      runtime.touchOwned = true
    },

    releaseDisplayWidget: (displayId, widgetId) => {
      const runtime = get().displays.get(displayId)?.get(widgetId)
      if (!runtime?.touchOwned) return
      runtime.touchOwned = false
      runtime.dirty = true
    },

    publishDisplayRoleValue: (displayId, widgetId, role, value) => {
      const runtime = widgetRuntime(displayId, widgetId)
      if (runtime.roleValues.get(role) === value) return
      runtime.roleValues.set(role, value)
      runtime.dirty = true
    },

    readDisplayWidget: (displayId, widgetId) => get().displays.get(displayId)?.get(widgetId),

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

    resetDisplayRuntime: (displayId) => {
      const displays = get().displays
      if (displayId === undefined) displays.clear()
      else displays.delete(displayId)
      set({ diagnosticsVersion: get().diagnosticsVersion + 1 })
    },
  }
})

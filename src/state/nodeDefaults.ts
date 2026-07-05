// Per-node-type default property overrides, persisted to localStorage. Some
// nodes (MicInput, MatrixOutput — see their "Set Default" checkbox in
// StudioNode.tsx) let the user pin their current settings as the starting
// point for future nodes of that type, since those properties are almost
// always hardware-specific (pins, chipset, board wiring) and rarely change
// once dialled in for a given rig.

import { create } from 'zustand'

const KEY = 'fastled-studio.node-defaults.v1'

function load(): Record<string, Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persist(overrides: Record<string, Record<string, unknown>>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides))
  } catch {
    // Quota exceeded or private-mode storage disabled — keep the in-memory copy.
  }
}

interface NodeDefaultsState {
  overrides: Record<string, Record<string, unknown>>
  setDefault: (nodeType: string, properties: Record<string, unknown>) => void
  clearDefault: (nodeType: string) => void
}

export const useNodeDefaults = create<NodeDefaultsState>((set) => ({
  overrides: load(),

  setDefault: (nodeType, properties) =>
    set((s) => {
      const overrides = { ...s.overrides, [nodeType]: { ...properties } }
      persist(overrides)
      return { overrides }
    }),

  clearDefault: (nodeType) =>
    set((s) => {
      if (!(nodeType in s.overrides)) return s
      const overrides = { ...s.overrides }
      delete overrides[nodeType]
      persist(overrides)
      return { overrides }
    }),
}))

/** Resolve the properties a newly created node of `nodeType` should start
 *  with: the saved custom default if one was pinned via "Set Default", else
 *  the library's hardcoded default. */
export function resolveDefaultProperties(
  nodeType: string,
  libraryDefault: Record<string, unknown> | undefined
): Record<string, unknown> {
  const override = useNodeDefaults.getState().overrides[nodeType]
  return override ? { ...override } : { ...(libraryDefault ?? {}) }
}

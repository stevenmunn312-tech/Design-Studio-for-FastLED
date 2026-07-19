// Per-node-type default property overrides, persisted to localStorage. Some
// nodes (MicInput, MatrixOutput — see their "Set Default" checkbox in
// StudioNode.tsx) let the user pin their current settings as the starting
// point for future nodes of that type, since those properties are almost
// always hardware-specific (pins, chipset, board wiring) and rarely change
// once dialled in for a given rig.

import { create } from 'zustand'

const KEY = 'design-studio-for-fastled.node-defaults.v1'

function sanitizeProperties(nodeType: string, properties: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...properties }
  // FastLED's audio pipeline owns the 44.1 kHz analysis rate. Older Studio
  // versions exposed a sample-rate field which never controlled either path,
  // so do not let a saved personal default bring it back on new nodes.
  if (nodeType === 'MicInput') delete sanitized.sampleRate
  return sanitized
}

function load(): Record<string, Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).map(([nodeType, properties]) => [
        nodeType,
        properties && typeof properties === 'object'
          ? sanitizeProperties(nodeType, properties as Record<string, unknown>)
          : {},
      ])
    )
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
      const overrides = { ...s.overrides, [nodeType]: sanitizeProperties(nodeType, properties) }
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
 *  the library's hardcoded default. A pinned override is layered *over* the
 *  library default so properties added to the library after the pin was saved
 *  still exist on new nodes. */
export function resolveDefaultProperties(
  nodeType: string,
  libraryDefault: Record<string, unknown> | undefined
): Record<string, unknown> {
  const override = useNodeDefaults.getState().overrides[nodeType]
  return sanitizeProperties(nodeType, { ...(libraryDefault ?? {}), ...(override ?? {}) })
}

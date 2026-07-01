// The persistent **pattern library** (Phase 1 of the generative-pattern-show
// workflow — see docs/development/design/generative-pattern-show.md). A saved
// pattern is a named group: its port signature plus its subgraph. Stored in
// localStorage so it survives across sessions and grows over time; the sidebar
// lists them and the canvas can instantiate copies. Later phases (Collection,
// Pattern Master) read the same store.

import { create } from 'zustand'
import { useGraphStore } from './graphStore'
import type { StudioNode, StudioEdge } from './graphStore'
import { listPatterns, savePatternToDisk, deletePatternFromDisk } from '../utils/backendClient'

interface Port { id: string; label: string; dataType: string }

export interface SavedPattern {
  id: string
  name: string
  createdAt: number
  /** The Group node's exposed parameter inputs + frame output(s). */
  inputs: Port[]
  outputs: Port[]
  /** The encapsulated subgraph (the group's contents). */
  subgraph: { nodes: StudioNode[]; edges: StudioEdge[] }
}

const KEY = 'fastled-studio.pattern-library.v1'

// Under Vitest the upload helper may actually be running, so skip the disk
// round-trip in tests — they assert against the in-memory + localStorage state,
// and must not create/delete real files in the "My Patterns" folder.
const DISK_SYNC = !import.meta.env.VITEST

function load(): SavedPattern[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(patterns: SavedPattern[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(patterns))
  } catch {
    // Quota exceeded or private-mode storage disabled — keep the in-memory copy.
  }
}

interface LibraryState {
  patterns: SavedPattern[]
  savePattern: (p: Omit<SavedPattern, 'id' | 'createdAt'>) => void
  renamePattern: (id: string, name: string) => void
  deletePattern: (id: string) => void
  /** Reconcile the in-memory library with the on-disk "My Patterns" folder:
   *  disk is authoritative, but any localStorage-only patterns are migrated up
   *  to disk so nothing is lost on the transition. No-op when the helper is
   *  offline (the localStorage copy stays in charge). */
  refreshFromDisk: () => Promise<void>
}

export const usePatternLibrary = create<LibraryState>((set, get) => ({
  patterns: load(),

  savePattern: (p) =>
    set((s) => {
      const item: SavedPattern = { ...p, id: `pat-${Date.now()}`, createdAt: Date.now() }
      const patterns = [...s.patterns, item]
      persist(patterns)
      if (DISK_SYNC) void savePatternToDisk(item)  // write-through; harmless if the helper is offline
      return { patterns }
    }),

  renamePattern: (id, name) =>
    set((s) => {
      const patterns = s.patterns.map((x) => (x.id === id ? { ...x, name } : x))
      persist(patterns)
      const renamed = patterns.find((x) => x.id === id)
      if (DISK_SYNC && renamed) void savePatternToDisk(renamed)  // rewrites the file (dedup by id drops the old name)
      return { patterns }
    }),

  deletePattern: (id) =>
    set((s) => {
      const patterns = s.patterns.filter((x) => x.id !== id)
      persist(patterns)
      if (DISK_SYNC) void deletePatternFromDisk(id)
      return { patterns }
    }),

  refreshFromDisk: async () => {
    if (!DISK_SYNC) return
    const disk = await listPatterns()
    if (!disk) return  // helper offline — keep the localStorage copy as-is
    const diskIds = new Set(disk.map((p) => p.id))
    const localOnly = get().patterns.filter((p) => !diskIds.has(p.id))
    // One-time migration: push any patterns that only existed in localStorage up
    // to disk so they become shareable files too.
    for (const p of localOnly) void savePatternToDisk(p)
    const patterns = [...disk, ...localOnly]
    persist(patterns)
    set({ patterns })
  },
}))

/** Save a Group node (a named pattern) into the persistent library so it can
 *  be re-used later. Reads the group's port signature + its subgraph from the
 *  graph store. Shared by the node context menu's "Save to Library" and the
 *  create-group dialog's "Save to library" checkbox. Returns the saved name,
 *  or null if `groupNodeId` isn't a Group node. */
export function saveGroupToLibrary(groupNodeId: string): string | null {
  const s = useGraphStore.getState()
  const node = s.nodes.find((n) => n.id === groupNodeId)
  const groupId = (node?.data.properties as { groupId?: string } | undefined)?.groupId
  const sub = groupId ? s.graphData[groupId] : undefined
  if (!node || !sub) return null
  const name = String(node.data.label ?? 'Pattern')
  usePatternLibrary.getState().savePattern({
    name,
    inputs: (node.data.inputs as Port[] | undefined) ?? [],
    outputs: (node.data.outputs as Port[] | undefined) ?? [],
    subgraph: { nodes: sub.nodes, edges: sub.edges },
  })
  return name
}

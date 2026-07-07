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

interface SavePatternOptions {
  replaceByName?: boolean
}

export interface SaveGroupToLibraryResult {
  name: string
  replaced: boolean
}

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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalize(entry)])
  )
}

function patternFingerprint(pattern: Omit<SavedPattern, 'id' | 'createdAt'>): string {
  return JSON.stringify(canonicalize({
    name: pattern.name.trim(),
    inputs: pattern.inputs,
    outputs: pattern.outputs,
    subgraph: pattern.subgraph,
  }))
}

function normalizedPatternName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

function dedupePatterns(patterns: SavedPattern[]) {
  const seenIds = new Set<string>()
  const seenFingerprints = new Set<string>()
  const deduped: SavedPattern[] = []
  const removedIds: string[] = []

  for (let i = patterns.length - 1; i >= 0; i -= 1) {
    const pattern = patterns[i]
    const fingerprint = patternFingerprint(pattern)
    if (seenIds.has(pattern.id) || seenFingerprints.has(fingerprint)) {
      removedIds.push(pattern.id)
      continue
    }
    seenIds.add(pattern.id)
    seenFingerprints.add(fingerprint)
    deduped.unshift(pattern)
  }

  return { patterns: deduped, removedIds, keptIds: seenIds }
}

function load(): SavedPattern[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    const { patterns } = dedupePatterns(parsed)
    if (patterns.length !== parsed.length) localStorage.setItem(KEY, JSON.stringify(patterns))
    return patterns
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
  savePattern: (p: Omit<SavedPattern, 'id' | 'createdAt'>, options?: SavePatternOptions) => void
  putPattern: (p: SavedPattern) => void
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

  savePattern: (p, options) =>
    set((s) => {
      const now = Date.now()
      const sameName = options?.replaceByName
        ? s.patterns.filter((pattern) => normalizedPatternName(pattern.name) === normalizedPatternName(p.name))
        : []
      const retained = sameName[sameName.length - 1]
      const item: SavedPattern = {
        ...p,
        id: retained?.id ?? `pat-${now}`,
        createdAt: now,
      }
      const basePatterns = options?.replaceByName
        ? s.patterns.filter((pattern) => !sameName.some((match) => match.id === pattern.id))
        : s.patterns
      const { patterns, removedIds, keptIds } = dedupePatterns([...basePatterns, item])
      const deletedIds = new Set([
        ...removedIds,
        ...sameName
          .filter((pattern) => pattern.id !== item.id)
          .map((pattern) => pattern.id),
      ])
      persist(patterns)
      if (DISK_SYNC) void savePatternToDisk(item)  // write-through; harmless if the helper is offline
      if (DISK_SYNC) {
        for (const id of deletedIds) {
          if (!keptIds.has(id)) void deletePatternFromDisk(id)
        }
      }
      return { patterns }
    }),

  putPattern: (item) =>
    set((s) => {
      const { patterns, removedIds, keptIds } = dedupePatterns([
        ...s.patterns.filter((pattern) => pattern.id !== item.id),
        item,
      ])
      persist(patterns)
      if (DISK_SYNC) void savePatternToDisk(item)
      if (DISK_SYNC) {
        for (const id of removedIds) {
          if (!keptIds.has(id)) void deletePatternFromDisk(id)
        }
      }
      return { patterns }
    }),

  renamePattern: (id, name) =>
    set((s) => {
      const renamedPatterns = s.patterns.map((x) => (x.id === id ? { ...x, name } : x))
      const { patterns, removedIds, keptIds } = dedupePatterns(renamedPatterns)
      persist(patterns)
      const renamed = patterns.find((x) => x.id === id)
      if (DISK_SYNC && renamed) void savePatternToDisk(renamed)  // rewrites the file (dedup by id drops the old name)
      if (DISK_SYNC) {
        for (const duplicateId of removedIds) {
          if (!keptIds.has(duplicateId)) void deletePatternFromDisk(duplicateId)
        }
      }
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
    const { patterns, removedIds, keptIds } = dedupePatterns([...localOnly, ...disk])
    persist(patterns)
    for (const id of removedIds) {
      if (!keptIds.has(id)) void deletePatternFromDisk(id)
    }
    set({ patterns })
  },
}))

/** Save a Group node (a named pattern) into the persistent library so it can
 *  be re-used later. Reads the group's port signature + its subgraph from the
 *  graph store. Shared by the node context menu's "Save to Library" and the
 *  create-group dialog's "Save to library" checkbox. Returns the saved name,
 *  or null if `groupNodeId` isn't a Group node. */
export function saveGroupToLibrary(
  groupNodeId: string,
  options?: SavePatternOptions,
): SaveGroupToLibraryResult | null {
  const s = useGraphStore.getState()
  const node = s.nodes.find((n) => n.id === groupNodeId)
  const groupId = (node?.data.properties as { groupId?: string } | undefined)?.groupId
  const sub = groupId ? s.graphData[groupId] : undefined
  if (!node || !sub) return null
  const name = String(node.data.label ?? 'Pattern')
  const replaced = options?.replaceByName
    && usePatternLibrary.getState().patterns.some((pattern) => normalizedPatternName(pattern.name) === normalizedPatternName(name))
  usePatternLibrary.getState().savePattern({
    name,
    inputs: (node.data.inputs as Port[] | undefined) ?? [],
    outputs: (node.data.outputs as Port[] | undefined) ?? [],
    subgraph: { nodes: sub.nodes, edges: sub.edges },
  }, options)
  return { name, replaced: !!replaced }
}

/** Import a pattern from a dropped/uploaded `.json` file's parsed contents
 *  (the same shape `savePatternToDisk` writes, so any file from a "My
 *  Patterns" folder round-trips). Rejects anything that isn't recognisably a
 *  saved pattern rather than polluting the library with garbage. Returns the
 *  imported name, or null if `data` doesn't look like a saved pattern. */
export function importPatternFile(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const p = data as Partial<SavedPattern>
  if (typeof p.name !== 'string' || !p.name.trim()) return null
  if (!p.subgraph || !Array.isArray(p.subgraph.nodes) || !Array.isArray(p.subgraph.edges)) return null
  usePatternLibrary.getState().putPattern({
    id: typeof p.id === 'string' && p.id.trim() ? p.id : `pat-${Date.now()}`,
    name: p.name.trim(),
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
    inputs: Array.isArray(p.inputs) ? p.inputs : [],
    outputs: Array.isArray(p.outputs) ? p.outputs : [],
    subgraph: { nodes: p.subgraph.nodes, edges: p.subgraph.edges },
  })
  return p.name
}

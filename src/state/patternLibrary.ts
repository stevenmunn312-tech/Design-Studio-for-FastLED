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
import {
  AUDIO_REACTIVE_CATEGORY_ID,
  BUNDLED_PATTERNS,
  STANDARD_CATEGORY_ID,
} from './bundledPatterns'

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
  /** Optional user shelf. Missing means the pattern appears in New & Unsorted. */
  categoryId?: string
  /** Curated release example: visible in the library but never disk-synced or edited. */
  bundled?: boolean
}

export interface PatternCategory {
  id: string
  name: string
  builtIn?: boolean
}

export const BUILT_IN_PATTERN_CATEGORIES: PatternCategory[] = [
  { id: STANDARD_CATEGORY_ID, name: 'Standard', builtIn: true },
  { id: AUDIO_REACTIVE_CATEGORY_ID, name: 'Audio Reactive', builtIn: true },
]

const KEY = 'design-studio-for-fastled.pattern-library.v1'
const SYNC_KEY = 'design-studio-for-fastled.pattern-library-sync.v1'
const CATEGORIES_KEY = 'design-studio-for-fastled.pattern-library-categories.v1'

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
    return withBundledPatterns(patterns)
  } catch {
    return [...BUNDLED_PATTERNS]
  }
}

function persist(patterns: SavedPattern[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(patterns.filter((pattern) => !pattern.bundled)))
  } catch {
    // Quota exceeded or private-mode storage disabled — keep the in-memory copy.
  }
}

function withBundledPatterns(patterns: SavedPattern[]): SavedPattern[] {
  return dedupePatterns([...patterns.filter((pattern) => !pattern.bundled), ...BUNDLED_PATTERNS]).patterns
}

function loadCategories(): PatternCategory[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CATEGORIES_KEY) ?? '[]') as unknown
    const custom = Array.isArray(raw)
      ? raw.filter((entry): entry is PatternCategory => {
          if (!entry || typeof entry !== 'object') return false
          const category = entry as Partial<PatternCategory>
          return typeof category.id === 'string'
            && typeof category.name === 'string'
            && !!category.id.trim()
            && !!category.name.trim()
            && !BUILT_IN_PATTERN_CATEGORIES.some((builtIn) => builtIn.id === category.id)
        }).map((category) => ({ id: category.id, name: category.name.trim() }))
      : []
    return [...BUILT_IN_PATTERN_CATEGORIES, ...custom]
  } catch {
    return [...BUILT_IN_PATTERN_CATEGORIES]
  }
}

function persistCategories(categories: PatternCategory[]) {
  try {
    localStorage.setItem(
      CATEGORIES_KEY,
      JSON.stringify(categories.filter((category) => !category.builtIn)),
    )
  } catch {
    // Organization remains available for this session when storage is unavailable.
  }
}

interface LibraryState {
  patterns: SavedPattern[]
  categories: PatternCategory[]
  savePattern: (p: Omit<SavedPattern, 'id' | 'createdAt'>, options?: SavePatternOptions) => void
  putPattern: (p: SavedPattern) => void
  renamePattern: (id: string, name: string) => void
  deletePattern: (id: string) => Promise<boolean>
  createCategory: (name: string) => string | null
  deleteCategory: (id: string) => void
  movePattern: (patternId: string, categoryId: string | null) => void
  /** Reconcile the in-memory library with the on-disk "My Patterns" folder.
   *  Disk is authoritative; a local journal retries only writes/deletes that
   *  the helper has not acknowledged. No-op while the helper is offline. */
  refreshFromDisk: () => Promise<void>
}

export const usePatternLibrary = create<LibraryState>((set, get) => ({
  patterns: load(),
  categories: loadCategories(),

  savePattern: (p, options) =>
    set((s) => {
      const now = Date.now()
      const sameName = options?.replaceByName
        ? s.patterns.filter((pattern) => !pattern.bundled && normalizedPatternName(pattern.name) === normalizedPatternName(p.name))
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
      queuePatternUpsert(item)
      if (DISK_SYNC) {
        for (const id of deletedIds) {
          if (!keptIds.has(id)) void queuePatternDelete(id)
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
      queuePatternUpsert(item)
      if (DISK_SYNC) {
        for (const id of removedIds) {
          if (!keptIds.has(id)) void queuePatternDelete(id)
        }
      }
      return { patterns }
    }),

  renamePattern: (id, name) =>
    set((s) => {
      if (s.patterns.find((pattern) => pattern.id === id)?.bundled) return s
      const renamedPatterns = s.patterns.map((x) => (x.id === id ? { ...x, name } : x))
      const { patterns, removedIds, keptIds } = dedupePatterns(renamedPatterns)
      persist(patterns)
      const renamed = patterns.find((x) => x.id === id)
      if (renamed) queuePatternUpsert(renamed)  // rewrites the file (dedup by id drops the old name)
      if (DISK_SYNC) {
        for (const duplicateId of removedIds) {
          if (!keptIds.has(duplicateId)) void queuePatternDelete(duplicateId)
        }
      }
      return { patterns }
    }),

  deletePattern: async (id) => {
    if (get().patterns.find((pattern) => pattern.id === id)?.bundled) return false
    set((s) => {
      const patterns = s.patterns.filter((x) => x.id !== id)
      persist(patterns)
      return { patterns }
    })
    return queuePatternDelete(id)
  },

  createCategory: (name) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const state = get()
    if (state.categories.some((category) => category.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      return null
    }
    const id = `category-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const categories = [...state.categories, { id, name: trimmed }]
    persistCategories(categories)
    set({ categories })
    return id
  },

  deleteCategory: (id) => {
    if (BUILT_IN_PATTERN_CATEGORIES.some((category) => category.id === id)) return
    set((state) => {
      if (!state.categories.some((category) => category.id === id)) return state
      const categories = state.categories.filter((category) => category.id !== id)
      const moved = state.patterns.map((pattern) => (
        pattern.categoryId === id ? { ...pattern, categoryId: undefined } : pattern
      ))
      persistCategories(categories)
      persist(moved)
      for (const pattern of moved) {
        if (!pattern.bundled && state.patterns.find((entry) => entry.id === pattern.id)?.categoryId === id) {
          queuePatternUpsert(pattern)
        }
      }
      return { categories, patterns: moved }
    })
  },

  movePattern: (patternId, categoryId) => {
    const state = get()
    const pattern = state.patterns.find((entry) => entry.id === patternId)
    if (!pattern || pattern.bundled) return
    if (categoryId && !state.categories.some((category) => category.id === categoryId)) return
    const patterns = state.patterns.map((entry) => (
      entry.id === patternId ? { ...entry, categoryId: categoryId ?? undefined } : entry
    ))
    persist(patterns)
    set({ patterns })
    const moved = patterns.find((entry) => entry.id === patternId)
    if (moved) queuePatternUpsert(moved)
  },

  refreshFromDisk: async () => {
    if (!DISK_SYNC) return
    const disk = await listPatterns()
    if (!disk) return  // helper offline — keep the localStorage copy as-is

    const local = get().patterns.filter((pattern) => !pattern.bundled)
    const initialJournal = loadSyncJournal()
    const deleteIds = new Set(initialJournal.pendingDeletes)

    // Replay deletions first and filter the already-fetched snapshot regardless
    // of request success, so a slow/offline retry never resurrects the row.
    for (const id of deleteIds) {
      if (await deletePatternFromDisk(id)) clearPendingDelete(id)
    }
    let nextDisk = disk.filter((pattern) => !deleteIds.has(pattern.id))

    // Retry only explicit local writes. Plain browser-only entries are stale
    // cache when the corresponding disk file was removed by the user.
    for (const id of loadSyncJournal().pendingUpserts) {
      const pattern = local.find((entry) => entry.id === id)
      if (!pattern) {
        clearPendingUpsert(id)
        continue
      }
      if (await savePatternToDisk(pattern)) {
        clearPendingUpsert(id)
        nextDisk = [...nextDisk.filter((entry) => entry.id !== id), pattern]
      }
    }

    const journal = loadSyncJournal()
    const patterns = reconcilePatternsFromDisk(
      nextDisk,
      local,
      journal.pendingUpserts,
      journal.pendingDeletes,
    )
    persist(patterns)
    set({ patterns: withBundledPatterns(patterns) })
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

interface PatternSyncJournal {
  pendingUpserts: string[]
  pendingDeletes: string[]
}

function loadSyncJournal(): PatternSyncJournal {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    const parsed = raw ? JSON.parse(raw) as Partial<PatternSyncJournal> : {}
    return {
      pendingUpserts: Array.isArray(parsed.pendingUpserts)
        ? [...new Set(parsed.pendingUpserts.filter((id): id is string => typeof id === 'string' && !!id))]
        : [],
      pendingDeletes: Array.isArray(parsed.pendingDeletes)
        ? [...new Set(parsed.pendingDeletes.filter((id): id is string => typeof id === 'string' && !!id))]
        : [],
    }
  } catch {
    return { pendingUpserts: [], pendingDeletes: [] }
  }
}

function persistSyncJournal(journal: PatternSyncJournal) {
  try {
    if (journal.pendingUpserts.length === 0 && journal.pendingDeletes.length === 0) {
      localStorage.removeItem(SYNC_KEY)
    } else {
      localStorage.setItem(SYNC_KEY, JSON.stringify(journal))
    }
  } catch {
    // The in-memory library still works when storage is unavailable.
  }
}

function updateSyncJournal(update: (journal: PatternSyncJournal) => PatternSyncJournal) {
  persistSyncJournal(update(loadSyncJournal()))
}

function markPendingUpsert(id: string) {
  updateSyncJournal((journal) => ({
    pendingUpserts: [...new Set([...journal.pendingUpserts, id])],
    pendingDeletes: journal.pendingDeletes.filter((entry) => entry !== id),
  }))
}

function clearPendingUpsert(id: string) {
  updateSyncJournal((journal) => ({
    ...journal,
    pendingUpserts: journal.pendingUpserts.filter((entry) => entry !== id),
  }))
}

function markPendingDelete(id: string) {
  updateSyncJournal((journal) => ({
    pendingUpserts: journal.pendingUpserts.filter((entry) => entry !== id),
    pendingDeletes: [...new Set([...journal.pendingDeletes, id])],
  }))
}

function clearPendingDelete(id: string) {
  updateSyncJournal((journal) => ({
    ...journal,
    pendingDeletes: journal.pendingDeletes.filter((entry) => entry !== id),
  }))
}

function queuePatternUpsert(pattern: SavedPattern) {
  if (!DISK_SYNC) return
  markPendingUpsert(pattern.id)
  void savePatternToDisk(pattern).then((saved) => {
    if (saved) clearPendingUpsert(pattern.id)
  })
}

function queuePatternDelete(id: string): Promise<boolean> {
  if (!DISK_SYNC) return Promise.resolve(true)
  markPendingDelete(id)
  return deletePatternFromDisk(id).then((deleted) => {
    if (deleted) clearPendingDelete(id)
    return deleted
  })
}

/** Disk is authoritative for established patterns: an entry missing from the
 *  folder is a deletion, not a reason to recreate the file from browser cache.
 *  Only explicitly journalled, unsynced local writes supplement the snapshot. */
export function reconcilePatternsFromDisk(
  disk: SavedPattern[],
  local: SavedPattern[],
  pendingUpserts: Iterable<string> = [],
  pendingDeletes: Iterable<string> = [],
): SavedPattern[] {
  const upsertIds = new Set(pendingUpserts)
  const deletedIds = new Set(pendingDeletes)
  const diskPatterns = disk.filter((pattern) => !deletedIds.has(pattern.id))
  const pendingPatterns = local.filter((pattern) => upsertIds.has(pattern.id) && !deletedIds.has(pattern.id))
  return dedupePatterns([...diskPatterns, ...pendingPatterns]).patterns
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

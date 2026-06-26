// The persistent **pattern library** (Phase 1 of the generative-pattern-show
// workflow — see docs/development/design/generative-pattern-show.md). A saved
// pattern is a named group: its port signature plus its subgraph. Stored in
// localStorage so it survives across sessions and grows over time; the sidebar
// lists them and the canvas can instantiate copies. Later phases (Collection,
// Pattern Master) read the same store.

import { create } from 'zustand'
import type { StudioNode, StudioEdge } from './graphStore'

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
}

export const usePatternLibrary = create<LibraryState>((set) => ({
  patterns: load(),

  savePattern: (p) =>
    set((s) => {
      const item: SavedPattern = { ...p, id: `pat-${Date.now()}`, createdAt: Date.now() }
      const patterns = [...s.patterns, item]
      persist(patterns)
      return { patterns }
    }),

  renamePattern: (id, name) =>
    set((s) => {
      const patterns = s.patterns.map((x) => (x.id === id ? { ...x, name } : x))
      persist(patterns)
      return { patterns }
    }),

  deletePattern: (id) =>
    set((s) => {
      const patterns = s.patterns.filter((x) => x.id !== id)
      persist(patterns)
      return { patterns }
    }),
}))

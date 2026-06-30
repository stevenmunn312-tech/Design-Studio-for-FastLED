import { create } from 'zustand'
import type { SongAnalysis, ShowFile } from '../types/showFile'
import { generateShow } from '../codegen/performanceGenerator'
import type { PerformanceOptions } from '../codegen/performanceGenerator'
import { useGraphStore } from './graphStore'

/**
 * The Pattern Collection wired into a Performance Generator's `patternset`
 * input: its ordered group `ids` and the per-pattern `sectionTags` (aligned by
 * index; `[]` = eligible in any section). Both empty when none is wired (the
 * built-in enum-pattern flow). Resolved live from the active graph, so
 * generation picks up the current collection regardless of which node body
 * triggered it.
 */
function wiredCollection(): { ids: string[]; sectionTags: string[][] } {
  const empty = { ids: [], sectionTags: [] }
  const { nodes, edges } = useGraphStore.getState()
  const typeOf = (n: { data: { nodeType?: string } }) => n.data.nodeType
  const gen = nodes.find((n) => typeOf(n) === 'PerformanceGenerator')
  if (!gen) return empty
  const link = edges.find((e) => e.target === gen.id && e.targetHandle === 'patternset')
  if (!link) return empty
  const coll = nodes.find((n) => n.id === link.source && typeOf(n) === 'PatternCollection')
  if (!coll) return empty
  const props = coll.data.properties as { patternIds?: string[]; patternSections?: Record<string, string[]> }
  const ids = props.patternIds ?? []
  const sections = props.patternSections ?? {}
  return { ids, sectionTags: ids.map((id) => sections[id] ?? []) }
}

async function analyzeWithEssentia(
  file: File,
  onProgress?: (p: number) => void,
): Promise<SongAnalysis> {
  const { analyzeSong } = await import('../audio/essentiaAnalyzer')
  return analyzeSong(file, onProgress)
}

export interface MusicEntry {
  id: string
  file: File
  analysis: SongAnalysis | null
  show:     ShowFile    | null
  status:   'pending' | 'analyzing' | 'done' | 'error'
  /** 0–1 analysis progress, set while `status === 'analyzing'`. */
  progress?: number
  /** True once the show has been hand-tweaked in the timeline editor, so the
   *  generator options no longer auto-regenerate over the manual edits. */
  edited?:  boolean
  error?:   string
}

interface MusicState {
  entries:   MusicEntry[]

  addFiles:       (files: File[]) => void
  analyzeAll:     (options?: Partial<PerformanceOptions>) => Promise<void>
  removeEntry:    (id: string) => void
  clearAll:       () => void
  regenerateShow: (id: string, options?: Partial<PerformanceOptions>) => void
  /** Replace an entry's show with a hand-edited one and mark it edited. */
  updateShow:     (id: string, show: ShowFile) => void
  /** Discard manual edits and regenerate from the analysis. */
  revertShow:     (id: string, options?: Partial<PerformanceOptions>) => void
}

export const useMusicStore = create<MusicState>((set, get) => ({
  entries: [],

  addFiles: (files) => {
    const newEntries: MusicEntry[] = files
      .filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|ogg|flac|m4a)$/i))
      .map(f => ({
        id:       crypto.randomUUID(),
        file:     f,
        analysis: null,
        show:     null,
        status:   'pending' as const,
      }))
    set(s => ({ entries: [...s.entries, ...newEntries] }))
  },

  analyzeAll: async (options = {}) => {
    const { entries } = get()
    for (const entry of entries) {
      if (entry.status === 'done') continue
      set(s => ({
        entries: s.entries.map(e =>
          e.id === entry.id ? { ...e, status: 'analyzing', progress: 0 } : e
        ),
      }))
      try {
        const onProgress = (p: number) => set(s => ({
          entries: s.entries.map(e =>
            e.id === entry.id ? { ...e, progress: p } : e
          ),
        }))
        const analysis = await analyzeWithEssentia(entry.file, onProgress)
        const { ids, sectionTags } = wiredCollection()
        const show     = generateShow(analysis, options, ids, sectionTags)
        set(s => ({
          entries: s.entries.map(e =>
            e.id === entry.id ? { ...e, analysis, show, status: 'done', progress: 1 } : e
          ),
        }))
      } catch (err) {
        set(s => ({
          entries: s.entries.map(e =>
            e.id === entry.id ? { ...e, status: 'error', error: String(err) } : e
          ),
        }))
      }
    }
  },

  removeEntry: (id) =>
    set(s => ({ entries: s.entries.filter(e => e.id !== id) })),

  clearAll: () => set({ entries: [] }),

  regenerateShow: (id, options = {}) => {
    const entry = get().entries.find(e => e.id === id)
    if (!entry?.analysis) return
    const { ids, sectionTags } = wiredCollection()
    const show = generateShow(entry.analysis, options, ids, sectionTags)
    set(s => ({
      entries: s.entries.map(e => e.id === id ? { ...e, show } : e),
    }))
  },

  updateShow: (id, show) =>
    set(s => ({
      entries: s.entries.map(e => e.id === id ? { ...e, show, edited: true } : e),
    })),

  revertShow: (id, options = {}) => {
    const entry = get().entries.find(e => e.id === id)
    if (!entry?.analysis) return
    const { ids, sectionTags } = wiredCollection()
    const show = generateShow(entry.analysis, options, ids, sectionTags)
    set(s => ({
      entries: s.entries.map(e => e.id === id ? { ...e, show, edited: false } : e),
    }))
  },
}))

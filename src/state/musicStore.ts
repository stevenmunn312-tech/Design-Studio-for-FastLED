import { create } from 'zustand'
import type { SongAnalysis, ShowFile } from '../types/showFile'
import { generateShow } from '../codegen/performanceGenerator'
import type { PerformanceOptions } from '../codegen/performanceGenerator'
import { useGraphStore } from './graphStore'
import { wiredPatternCollection } from './patternCollectionWiring'
import { recordPerfTask } from '../dev/perfMonitor'
import {
  loadMusicFile,
  registerMusicLibraryPersistence,
  saveMusicFile,
  type PersistedMusicEntry,
} from './musicLibraryPersistence'

/**
 * The Pattern Collection wired into a Performance Generator's `patternset`
 * input, resolved against the active graph.
 *
 * The pure resolution helper also serves upload and capacity measurement over
 * their filtered graph copies. Two definitions of "which patterns are in this
 * show" is exactly how measurement and upload end up disagreeing.
 */
function wiredCollection(): { ids: string[]; sectionTags: string[][] } {
  const { nodes, edges } = useGraphStore.getState()
  return wiredPatternCollection(nodes, edges)
}

/**
 * The TransitionSet wired into a Performance Generator's `transitions` input:
 * its pool of extra transition styles (empty when none is wired). Resolved
 * live from the graph, same as `wiredCollection`.
 */
function wiredTransitions(): string[] {
  const { nodes, edges } = useGraphStore.getState()
  const typeOf = (n: { data: { nodeType?: string } }) => n.data.nodeType
  const gen = nodes.find((n) => typeOf(n) === 'PerformanceGenerator')
  if (!gen) return []
  const link = edges.find((e) => e.target === gen.id && e.targetHandle === 'transitions')
  if (!link) return []
  const src = nodes.find((n) => n.id === link.source && typeOf(n) === 'TransitionSet')
  if (!src) return []
  return (src.data.properties as { transitions?: string[] } | undefined)?.transitions ?? []
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

  /** Adds songs and starts analysing them — there is no second step. */
  addFiles:       (files: File[], options?: Partial<PerformanceOptions>) => void
  analyzeAll:     (options?: Partial<PerformanceOptions>) => Promise<void>
  /** Re-queue every song whose analysis failed. */
  retryFailed:    (options?: Partial<PerformanceOptions>) => Promise<void>
  removeEntry:    (id: string) => void
  clearAll:       () => void
  regenerateShow: (id: string, options?: Partial<PerformanceOptions>) => void
  /** Replace an entry's show with a hand-edited one and mark it edited. */
  updateShow:     (id: string, show: ShowFile) => void
  /** Discard manual edits and regenerate from the analysis. */
  revertShow:     (id: string, options?: Partial<PerformanceOptions>) => void
}

/** Guards the analysis queue: one runner, however many drops. */
let analyzing = false

let restoreGeneration = 0

function persistedEntries(entries: MusicEntry[]): PersistedMusicEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.file.name,
    type: entry.file.type,
    size: entry.file.size,
    lastModified: entry.file.lastModified,
    analysis: entry.analysis,
    show: entry.show,
    status: entry.status === 'analyzing' ? 'pending' : entry.status,
    edited: entry.edited,
    error: entry.error,
  }))
}

export const useMusicStore = create<MusicState>((set, get) => ({
  entries: [],

  addFiles: (files, options = {}) => {
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
    for (const entry of newEntries) void saveMusicFile(entry.id, entry.file)
    // Dropping a song *is* the request to analyse it, so there is no second
    // step to remember. A run already in flight picks these up next pass.
    void get().analyzeAll(options)
  },

  analyzeAll: async (options = {}) => {
    /*
     * One runner at a time, re-reading state each pass rather than iterating a
     * snapshot.
     *
     * Analysis starts by itself when songs are added now, so a second drop can
     * land while the first batch is still going. The old shape captured
     * `entries` once and was safe only because a disabled button stopped it
     * being called twice — songs added mid-run would have been skipped by the
     * loop already running and picked up by nothing.
     */
    if (analyzing) return
    analyzing = true
    try {
      for (;;) {
        const entry = get().entries.find(e => e.status === 'pending')
        if (!entry) break

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
          const showStart = performance.now()
          const show = generateShow(analysis, options, ids, sectionTags, wiredTransitions())
          recordPerfTask('musicShow', performance.now() - showStart)
          set(s => ({
            entries: s.entries.map(e =>
              e.id === entry.id ? { ...e, analysis, show, status: 'done', progress: 1 } : e
            ),
          }))
        } catch (err) {
          // Left as 'error' rather than 'pending', so the loop moves on instead
          // of retrying the same unreadable file forever. Retrying is the
          // user's call.
          set(s => ({
            entries: s.entries.map(e =>
              e.id === entry.id ? { ...e, status: 'error', error: String(err) } : e
            ),
          }))
        }
      }
    } finally {
      analyzing = false
    }
  },

  retryFailed: async (options = {}) => {
    // Put the failures back in the queue and let the one runner take them.
    set(s => ({
      entries: s.entries.map(e =>
        e.status === 'error' ? { ...e, status: 'pending', error: undefined } : e
      ),
    }))
    await get().analyzeAll(options)
  },

  removeEntry: (id) =>
    set(s => ({ entries: s.entries.filter(e => e.id !== id) })),

  clearAll: () => set({ entries: [] }),

  regenerateShow: (id, options = {}) => {
    const entry = get().entries.find(e => e.id === id)
    if (!entry?.analysis) return
    const { ids, sectionTags } = wiredCollection()
    const show = generateShow(entry.analysis, options, ids, sectionTags, wiredTransitions())
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
    const show = generateShow(entry.analysis, options, ids, sectionTags, wiredTransitions())
    set(s => ({
      entries: s.entries.map(e => e.id === id ? { ...e, show, edited: false } : e),
    }))
  },
}))

registerMusicLibraryPersistence(
  () => persistedEntries(useMusicStore.getState().entries),
  async (persisted) => {
    const generation = ++restoreGeneration
    // Clear the previous project's library immediately; the resolved tracks
    // replace it together so a slower older restore cannot leak across a
    // rapid pair of project switches.
    useMusicStore.setState({ entries: [] })
    const restored = await Promise.all(persisted.map(async (entry): Promise<MusicEntry> => {
      const blob = await loadMusicFile(entry.id)
      const file = new File(blob ? [blob] : [], entry.name, {
        type: entry.type,
        lastModified: entry.lastModified,
      })
      if (!blob) {
        return {
          ...entry,
          file,
          status: 'error',
          error: 'The audio file is not available in this browser. Add the track again to restore playback and export.',
        }
      }
      return {
        ...entry,
        file,
        status: entry.status === 'error' ? 'error' : (entry.analysis ? 'done' : 'pending'),
      }
    }))
    if (generation !== restoreGeneration) return
    useMusicStore.setState({ entries: restored })
    if (restored.some((entry) => entry.status === 'pending')) {
      void useMusicStore.getState().analyzeAll()
    }
  },
)

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { useMusicStore?: typeof useMusicStore }).useMusicStore = useMusicStore
}

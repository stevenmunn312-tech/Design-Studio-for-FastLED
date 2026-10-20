import { create } from 'zustand'
import type { SongAnalysis, ShowFile, SongSection } from '../../types/showFile'
import { generateShow } from '../../codegen/performanceGenerator'
import type { PerformanceOptions } from '../../codegen/performanceGenerator'
import { useGraphStore } from '../graphStore'
import { wiredPatternCollection, wiredTransitionStyles } from '../patterns/patternCollectionWiring'
import {
  effectiveLocks, locksForEventChanges, normalizeLocks, regenerateKeepingLocks, type ShowLock,
} from './showLocks'
import { recordPerfTask } from '../../dev/perfMonitor'
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
function eventKey(event: ShowFile['events'][number]): string {
  return JSON.stringify([event.t, event.cmd, event.params])
}

function wiredProfiles() {
  const { nodes, edges } = useGraphStore.getState()
  return wiredPatternCollection(nodes, edges)
}

function freshShow(
  analysis: SongAnalysis,
  options: Partial<PerformanceOptions>,
  sections: SongSection[] | undefined,
): ShowFile {
  const profiles = wiredProfiles()
  const source = sections && sections.length > 0 ? { ...analysis, sections } : analysis
  return generateShow(source, options, profiles.ids, profiles.sectionTags, wiredTransitions(), {
    weights: profiles.weights,
    energy: profiles.energyTags,
  })
}

/**
 * The TransitionSet wired into a Performance Generator's `transitions` input:
 * its pool of extra transition styles (empty when none is wired). Resolved
 * live from the graph, same as `wiredCollection`.
 */
function wiredTransitions(): string[] {
  const { nodes, edges } = useGraphStore.getState()
  const gen = nodes.find((n) => n.data.nodeType === 'PerformanceGenerator')
  return gen ? wiredTransitionStyles(nodes, edges, gen.id) : []
}

export interface MusicEntry {
  id: string
  file: File
  analysis: SongAnalysis | null
  show:     ShowFile    | null
  status:   'pending' | 'analyzing' | 'done' | 'error'
  /** 0–1 analysis progress, set while `status === 'analyzing'`. */
  progress?: number
  /** True while a lock remains. Regeneration keeps those spans and rewrites the rest. */
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
  /** `auto` locks the sections an edit touched. An explicit list replaces the locks, including `[]` to unlock. */
  updateShow:     (id: string, show: ShowFile, locks?: 'auto' | readonly ShowLock[]) => void
  /** Discard manual edits and regenerate from the analysis. */
  revertShow:     (id: string, options?: Partial<PerformanceOptions>) => void
}

/** Guards the analysis queue: one runner, however many drops. */
let analyzing = false

let restoreGeneration = 0

/** Whether a saved analysis and show carry everything the current envelope
 *  bakes: stereo levels and the equalizer spectrum (AENV version 3). */
function hasCurrentAudio(analysis: SongAnalysis | null, show: ShowFile | null): boolean {
  if (analysis && (!Array.isArray(analysis.channelLevels) || typeof analysis.spectrum?.data !== 'string')) return false
  return !show?.audio || show.audio.version === 3
}

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
          const { analyzeSong } = await import('../../audio/songAnalyzer')
          const analysis = await analyzeSong(entry.file, onProgress)
          const showStart = performance.now()
          const show = freshShow(analysis, options, undefined)
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
    if (!entry.show) {
      const show = freshShow(entry.analysis, options, entry.analysis.sections)
      set(s => ({ entries: s.entries.map(e => e.id === id ? { ...e, show, edited: false } : e) }))
      return
    }
    const fresh = freshShow(entry.analysis, options, entry.show.sections ?? entry.analysis.sections)
    const locks = effectiveLocks(entry.show, !!entry.edited)
    const show = locks.length > 0 ? regenerateKeepingLocks(entry.show, fresh, locks) : fresh
    set(s => ({
      entries: s.entries.map(e => e.id === id ? { ...e, show, edited: locks.length > 0 } : e),
    }))
  },

  updateShow: (id, show, locks = 'auto') =>
    set(s => ({
      entries: s.entries.map(e => {
        if (e.id !== id) return e
        const previous = e.show
        const sections = show.sections ?? previous?.sections ?? e.analysis?.sections ?? []
        let nextLocks: ShowLock[]
        if (locks !== 'auto') {
          nextLocks = normalizeLocks(locks, show.durationMs)
        } else if (!previous) {
          nextLocks = show.durationMs > 0 ? [{ startMs: 0, endMs: show.durationMs }] : []
        } else {
          const changed = locksForEventChanges(previous, show, sections)
          const changedTimes = [
            ...show.events.filter((event) => !previous.events.some((old) => eventKey(old) === eventKey(event))),
            ...previous.events.filter((event) => !show.events.some((next) => eventKey(next) === eventKey(event))),
          ]
          const unmapped = changedTimes.some((event) => !sections.some((section) => event.t >= section.startMs && event.t < section.endMs))
          nextLocks = sections.length === 0 || unmapped
            ? [{ startMs: 0, endMs: Math.max(show.durationMs, 1) }]
            : normalizeLocks([...effectiveLocks(previous, !!e.edited), ...changed], show.durationMs)
        }
        const nextShow: ShowFile = { ...show }
        if (nextLocks.length > 0) nextShow.locks = nextLocks
        else if (locks !== 'auto') nextShow.locks = []
        else delete nextShow.locks
        return { ...e, show: nextShow, edited: nextLocks.length > 0 }
      }),
    })),

  revertShow: (id, options = {}) => {
    const entry = get().entries.find(e => e.id === id)
    if (!entry?.analysis) return
    const show = freshShow(entry.analysis, options, undefined)
    delete show.locks
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
      // An analysis or show from before stereo levels or the baked spectrum
      // existed cannot bake the envelope the player reads, so it is analysed
      // again rather than carried forward.
      if (!hasCurrentAudio(entry.analysis, entry.show)) {
        return { ...entry, file, analysis: null, show: null, edited: false, status: 'pending' }
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

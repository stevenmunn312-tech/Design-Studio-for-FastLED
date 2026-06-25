import { create } from 'zustand'
import type { SongAnalysis, ShowFile } from '../types/showFile'
import { analyzeSong as analyzeBuiltin } from '../audio/musicAnalyzer'
import { analyzeSong as analyzeEssentia } from '../audio/essentiaAnalyzer'
import { generateShow } from '../codegen/performanceGenerator'
import type { PerformanceOptions } from '../codegen/performanceGenerator'

// Offline analysis engine. 'essentia' (Essentia.js WASM) is the higher-quality
// default for the pre-planned export path; 'builtin' is the dependency-free DSP.
export type AnalyzerEngine = 'essentia' | 'builtin'
const ANALYZERS: Record<AnalyzerEngine, (file: File) => Promise<SongAnalysis>> = {
  essentia: analyzeEssentia,
  builtin:  analyzeBuiltin,
}

export interface MusicEntry {
  id: string
  file: File
  analysis: SongAnalysis | null
  show:     ShowFile    | null
  status:   'pending' | 'analyzing' | 'done' | 'error'
  error?:   string
}

interface MusicState {
  entries:   MusicEntry[]
  engine:    AnalyzerEngine

  addFiles:       (files: File[]) => void
  analyzeAll:     (options?: Partial<PerformanceOptions>) => Promise<void>
  removeEntry:    (id: string) => void
  clearAll:       () => void
  setEngine:      (e: AnalyzerEngine) => void
  regenerateShow: (id: string, options?: Partial<PerformanceOptions>) => void
}

export const useMusicStore = create<MusicState>((set, get) => ({
  entries: [],
  engine:  'essentia',

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
          e.id === entry.id ? { ...e, status: 'analyzing' } : e
        ),
      }))
      try {
        const analysis = await ANALYZERS[get().engine](entry.file)
        const show     = generateShow(analysis, options)
        set(s => ({
          entries: s.entries.map(e =>
            e.id === entry.id ? { ...e, analysis, show, status: 'done' } : e
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

  setEngine: (e) => set({ engine: e }),

  regenerateShow: (id, options = {}) => {
    const entry = get().entries.find(e => e.id === id)
    if (!entry?.analysis) return
    const show = generateShow(entry.analysis, options)
    set(s => ({
      entries: s.entries.map(e => e.id === id ? { ...e, show } : e),
    }))
  },
}))

import { create } from 'zustand'
import type { StatusLevel } from '../types'

export type AppTheme = 'dark' | 'solarized' | 'light'

const THEME_KEY  = 'fastled-studio-theme'
const MOTION_KEY = 'fastled-studio-reduced-motion'
const CONTRAST_KEY = 'fastled-studio-high-contrast'

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}

interface UiState {
  statusText: string
  statusLevel: StatusLevel
  sidebarOpen: boolean
  inspectorOpen: boolean
  fps: number
  sparkPort: { nodeId: string; portId: string } | null
  theme: AppTheme
  reducedMotion: boolean
  highContrast: boolean
  showUploadPanel: boolean
  setStatus: (text: string, level?: StatusLevel) => void
  clearStatus: () => void
  toggleSidebar: () => void
  toggleInspector: () => void
  setFps: (fps: number) => void
  setSparkPort: (port: { nodeId: string; portId: string } | null) => void
  setTheme: (theme: AppTheme) => void
  cycleTheme: () => void
  toggleReducedMotion: () => void
  toggleHighContrast: () => void
  setShowUploadPanel: (v: boolean) => void
}

const THEMES: AppTheme[] = ['dark', 'solarized', 'light']

export const useUiStore = create<UiState>((set, get) => ({
  statusText: 'Ready',
  statusLevel: 'idle',
  sidebarOpen: true,
  inspectorOpen: true,
  fps: 0,
  sparkPort: null,
  theme: load<AppTheme>(THEME_KEY, 'dark'),
  reducedMotion: load<boolean>(MOTION_KEY, false),
  highContrast: load<boolean>(CONTRAST_KEY, false),
  showUploadPanel: false,

  setStatus: (text, level = 'info') => {
    set({ statusText: text, statusLevel: level })
    if (level === 'success' || level === 'info') {
      setTimeout(() => set({ statusText: 'Ready', statusLevel: 'idle' }), 5000)
    }
  },

  clearStatus: () => set({ statusText: 'Ready', statusLevel: 'idle' }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setFps: (fps) => set({ fps }),
  setSparkPort: (port) => set({ sparkPort: port }),

  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme))
    set({ theme })
  },

  cycleTheme: () => {
    const { theme } = get()
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
    localStorage.setItem(THEME_KEY, JSON.stringify(next))
    set({ theme: next })
  },

  toggleReducedMotion: () => {
    const next = !get().reducedMotion
    localStorage.setItem(MOTION_KEY, JSON.stringify(next))
    set({ reducedMotion: next })
  },

  toggleHighContrast: () => {
    const next = !get().highContrast
    localStorage.setItem(CONTRAST_KEY, JSON.stringify(next))
    set({ highContrast: next })
  },

  setShowUploadPanel: (v) => set({ showUploadPanel: v }),
}))

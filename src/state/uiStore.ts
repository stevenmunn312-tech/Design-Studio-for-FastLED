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
  preview3d: boolean
  fps: number
  sparkPort: { nodeId: string; portId: string } | null
  theme: AppTheme
  reducedMotion: boolean
  highContrast: boolean
  setStatus: (text: string, level?: StatusLevel) => void
  clearStatus: () => void
  toggleSidebar: () => void
  toggleInspector: () => void
  togglePreview3d: () => void
  setFps: (fps: number) => void
  setSparkPort: (port: { nodeId: string; portId: string } | null) => void
  setTheme: (theme: AppTheme) => void
  cycleTheme: () => void
  toggleReducedMotion: () => void
  toggleHighContrast: () => void
}

const THEMES: AppTheme[] = ['dark', 'solarized', 'light']

// Tracks the pending status auto-clear so a newer message cancels the older
// timer instead of being wiped when a stale one fires.
let statusTimer: ReturnType<typeof setTimeout> | undefined

export const useUiStore = create<UiState>((set, get) => ({
  statusText: 'Ready',
  statusLevel: 'idle',
  sidebarOpen: true,
  // Node properties are edited inline on the nodes; the Inspector is an
  // opt-in panel (toggle from the menu bar).
  inspectorOpen: false,
  preview3d: false,
  fps: 0,
  sparkPort: null,
  theme: load<AppTheme>(THEME_KEY, 'dark'),
  reducedMotion: load<boolean>(MOTION_KEY, false),
  highContrast: load<boolean>(CONTRAST_KEY, false),

  setStatus: (text, level = 'info') => {
    if (statusTimer) clearTimeout(statusTimer)
    set({ statusText: text, statusLevel: level })
    // Every transient level (info/success/error) auto-clears after 5 s.
    if (level !== 'idle') {
      statusTimer = setTimeout(() => set({ statusText: 'Ready', statusLevel: 'idle' }), 5000)
    }
  },

  clearStatus: () => {
    if (statusTimer) clearTimeout(statusTimer)
    set({ statusText: 'Ready', statusLevel: 'idle' })
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  togglePreview3d: () => set((s) => ({ preview3d: !s.preview3d })),
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
}))

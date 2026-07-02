import { create } from 'zustand'
import type { StatusLevel } from '../types'
import type { PreviewStyle } from '../components/Preview/previewStyles'
import { nextPreviewStyle } from '../components/Preview/previewStyles'

export type AppTheme = 'dark' | 'solarized' | 'light'

const THEME_KEY  = 'fastled-studio-theme'
const MOTION_KEY = 'fastled-studio-reduced-motion'
const CONTRAST_KEY = 'fastled-studio-high-contrast'
const PREVIEW_STYLE_KEY = 'fastled-studio-preview-style'
const LEGACY_DIFFUSION_KEY = 'fastled-studio-preview-diffusion'

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}

function loadPreviewStyle(): PreviewStyle {
  try {
    const style = localStorage.getItem(PREVIEW_STYLE_KEY)
    if (style) {
      const parsed = JSON.parse(style) as PreviewStyle
      if (['standard', 'soft', 'dreamy', 'cyberpunk', 'neon', 'crt'].includes(parsed)) return parsed
    }
    const legacy = localStorage.getItem(LEGACY_DIFFUSION_KEY)
    if (legacy !== null) return JSON.parse(legacy) ? 'neon' : 'standard'
  } catch {
    // Ignore malformed preview-style storage and fall back to the default.
  }
  return 'standard'
}

interface UiState {
  statusText: string
  statusLevel: StatusLevel
  sidebarOpen: boolean
  inspectorOpen: boolean
  preview3d: boolean
  previewStyle: PreviewStyle
  fps: number
  sparkPort: { nodeId: string; portId: string } | null
  /** Sidebar node currently being dragged, used for canvas drop affordances. */
  draggingNodeType: string | null
  /** Centre of the visible canvas in flow coordinates — where click-to-add
   *  drops a node so it lands on screen wherever the user has panned. */
  viewCenter: { x: number; y: number }
  theme: AppTheme
  reducedMotion: boolean
  highContrast: boolean
  helpOpen: boolean
  setStatus: (text: string, level?: StatusLevel) => void
  clearStatus: () => void
  toggleSidebar: () => void
  toggleInspector: () => void
  togglePreview3d: () => void
  setPreviewStyle: (style: PreviewStyle) => void
  cyclePreviewStyle: () => void
  setFps: (fps: number) => void
  setSparkPort: (port: { nodeId: string; portId: string } | null) => void
  setDraggingNodeType: (nodeType: string | null) => void
  setViewCenter: (center: { x: number; y: number }) => void
  setTheme: (theme: AppTheme) => void
  cycleTheme: () => void
  toggleReducedMotion: () => void
  toggleHighContrast: () => void
  openHelp: () => void
  closeHelp: () => void
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
  previewStyle: loadPreviewStyle(),
  fps: 0,
  sparkPort: null,
  draggingNodeType: null,
  viewCenter: { x: 300, y: 250 },
  theme: load<AppTheme>(THEME_KEY, 'dark'),
  reducedMotion: load<boolean>(MOTION_KEY, false),
  highContrast: load<boolean>(CONTRAST_KEY, false),
  helpOpen: false,

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
  setPreviewStyle: (style) => {
    localStorage.setItem(PREVIEW_STYLE_KEY, JSON.stringify(style))
    set({ previewStyle: style })
  },
  cyclePreviewStyle: () => {
    const next = nextPreviewStyle(get().previewStyle)
    localStorage.setItem(PREVIEW_STYLE_KEY, JSON.stringify(next))
    set({ previewStyle: next })
  },
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setFps: (fps) => set({ fps }),
  setSparkPort: (port) => set({ sparkPort: port }),
  setDraggingNodeType: (draggingNodeType) => set({ draggingNodeType }),
  setViewCenter: (center) => set({ viewCenter: center }),

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

  openHelp: () => set({ helpOpen: true }),
  closeHelp: () => set({ helpOpen: false }),
}))

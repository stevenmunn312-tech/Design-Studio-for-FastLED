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
const TEST_SIGNAL_KEY = 'fastled-studio-test-signal'
const PERFORMANCE_MODE_KEY = 'fastled-studio-performance-mode'
const UI_EFFECTS_KEY = 'fastled-studio-ui-effects-enabled'
const SIGNAL_PATH_DIM_KEY = 'fastled-studio-signal-path-dim-enabled'

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
  previewPanelOpen: boolean
  /** Show-ready layout that gives the live matrix and transport the viewport. */
  stageMode: boolean
  /** Canvas-focused presentation mode that hushes chrome and emphasizes signal flow. */
  performanceMode: boolean
  uiEffectsEnabled: boolean
  /** When on, selecting a node dims everything outside its signal path. */
  signalPathDimEnabled: boolean
  preview3d: boolean
  previewStyle: PreviewStyle
  /** When on, audio-reactive nodes with no live mic run off a synthetic demo
   *  oscillation so their motion can be previewed without a microphone. */
  testSignal: boolean
  fps: number
  /** Browser JavaScript heap usage in MiB, when exposed by the runtime. */
  memoryMb: number | null
  sparkPort: { nodeId: string; portId: string } | null
  /** Sidebar node currently being dragged, used for canvas drop affordances. */
  draggingNodeType: string | null
  /** Centre of the visible canvas in flow coordinates — where click-to-add
   *  drops a node so it lands on screen wherever the user has panned. */
  viewCenter: { x: number; y: number }
  /** Monotonic fit-view request consumed by the canvas. */
  fitViewRequest: { nonce: number; nodeIds?: string[] }
  theme: AppTheme
  reducedMotion: boolean
  highContrast: boolean
  helpOpen: boolean
  recoverOpen: boolean
  setStatus: (text: string, level?: StatusLevel) => void
  clearStatus: () => void
  toggleSidebar: () => void
  togglePreviewPanel: () => void
  toggleStageMode: () => void
  setStageMode: (active: boolean) => void
  togglePerformanceMode: () => void
  setPerformanceMode: (active: boolean) => void
  toggleUiEffects: () => void
  toggleSignalPathDim: () => void
  togglePreview3d: () => void
  toggleTestSignal: () => void
  setPreviewStyle: (style: PreviewStyle) => void
  cyclePreviewStyle: () => void
  setFps: (fps: number) => void
  setMemoryMb: (memoryMb: number | null) => void
  setSparkPort: (port: { nodeId: string; portId: string } | null) => void
  setDraggingNodeType: (nodeType: string | null) => void
  setViewCenter: (center: { x: number; y: number }) => void
  requestFitView: (nodeIds?: string[]) => void
  setTheme: (theme: AppTheme) => void
  cycleTheme: () => void
  toggleReducedMotion: () => void
  toggleHighContrast: () => void
  openHelp: () => void
  closeHelp: () => void
  openRecover: () => void
  closeRecover: () => void
}

const THEMES: AppTheme[] = ['dark', 'solarized', 'light']

// Tracks the pending status auto-clear so a newer message cancels the older
// timer instead of being wiped when a stale one fires.
let statusTimer: ReturnType<typeof setTimeout> | undefined

export const useUiStore = create<UiState>((set, get) => ({
  statusText: 'Ready',
  statusLevel: 'idle',
  sidebarOpen: true,
  previewPanelOpen: true,
  stageMode: false,
  performanceMode: load<boolean>(PERFORMANCE_MODE_KEY, false),
  uiEffectsEnabled: load<boolean>(UI_EFFECTS_KEY, true),
  signalPathDimEnabled: load<boolean>(SIGNAL_PATH_DIM_KEY, true),
  preview3d: false,
  previewStyle: loadPreviewStyle(),
  testSignal: load<boolean>(TEST_SIGNAL_KEY, false),
  fps: 0,
  memoryMb: null,
  sparkPort: null,
  draggingNodeType: null,
  viewCenter: { x: 300, y: 250 },
  fitViewRequest: { nonce: 0 },
  theme: load<AppTheme>(THEME_KEY, 'dark'),
  reducedMotion: load<boolean>(MOTION_KEY, false),
  highContrast: load<boolean>(CONTRAST_KEY, false),
  helpOpen: false,
  recoverOpen: false,

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
  togglePreviewPanel: () => set((s) => ({ previewPanelOpen: !s.previewPanelOpen })),
  toggleStageMode: () => set((s) => ({ stageMode: !s.stageMode })),
  setStageMode: (stageMode) => set({ stageMode }),
  togglePerformanceMode: () => {
    const next = !get().performanceMode
    localStorage.setItem(PERFORMANCE_MODE_KEY, JSON.stringify(next))
    set({ performanceMode: next })
  },
  setPerformanceMode: (performanceMode) => {
    localStorage.setItem(PERFORMANCE_MODE_KEY, JSON.stringify(performanceMode))
    set({ performanceMode })
  },
  toggleUiEffects: () => {
    const next = !get().uiEffectsEnabled
    localStorage.setItem(UI_EFFECTS_KEY, JSON.stringify(next))
    set({ uiEffectsEnabled: next })
  },
  toggleSignalPathDim: () => {
    const next = !get().signalPathDimEnabled
    localStorage.setItem(SIGNAL_PATH_DIM_KEY, JSON.stringify(next))
    set({ signalPathDimEnabled: next })
  },
  togglePreview3d: () => set((s) => ({ preview3d: !s.preview3d })),
  toggleTestSignal: () => {
    const next = !get().testSignal
    localStorage.setItem(TEST_SIGNAL_KEY, JSON.stringify(next))
    set({ testSignal: next })
  },
  setPreviewStyle: (style) => {
    localStorage.setItem(PREVIEW_STYLE_KEY, JSON.stringify(style))
    set({ previewStyle: style })
  },
  cyclePreviewStyle: () => {
    const next = nextPreviewStyle(get().previewStyle)
    localStorage.setItem(PREVIEW_STYLE_KEY, JSON.stringify(next))
    set({ previewStyle: next })
  },
  setFps: (fps) => set({ fps }),
  setMemoryMb: (memoryMb) => set({ memoryMb }),
  setSparkPort: (port) => set({ sparkPort: port }),
  setDraggingNodeType: (draggingNodeType) => set({ draggingNodeType }),
  setViewCenter: (center) => set({ viewCenter: center }),
  requestFitView: (nodeIds) => set((state) => ({
    fitViewRequest: { nonce: state.fitViewRequest.nonce + 1, nodeIds },
  })),

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
  openRecover: () => set({ recoverOpen: true }),
  closeRecover: () => set({ recoverOpen: false }),
}))

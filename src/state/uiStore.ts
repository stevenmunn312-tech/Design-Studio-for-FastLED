import { create } from 'zustand'
import type { StatusLevel } from '../types'

interface UiState {
  statusText: string
  statusLevel: StatusLevel
  sidebarOpen: boolean
  inspectorOpen: boolean
  fps: number
  setStatus: (text: string, level?: StatusLevel) => void
  clearStatus: () => void
  toggleSidebar: () => void
  toggleInspector: () => void
  setFps: (fps: number) => void
}

export const useUiStore = create<UiState>((set) => ({
  statusText: 'Ready',
  statusLevel: 'idle',
  sidebarOpen: true,
  inspectorOpen: true,
  fps: 0,

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
}))

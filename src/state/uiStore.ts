import { create } from 'zustand'
import type { StatusLevel } from '../types'

interface UiState {
  statusText: string
  statusLevel: StatusLevel
  sidebarOpen: boolean
  inspectorOpen: boolean
  setStatus: (text: string, level?: StatusLevel) => void
  clearStatus: () => void
  toggleSidebar: () => void
  toggleInspector: () => void
}

export const useUiStore = create<UiState>((set) => ({
  statusText: 'Ready',
  statusLevel: 'idle',
  sidebarOpen: true,
  inspectorOpen: true,

  setStatus: (text, level = 'info') => {
    set({ statusText: text, statusLevel: level })
    if (level === 'success' || level === 'info') {
      setTimeout(() => set({ statusText: 'Ready', statusLevel: 'idle' }), 5000)
    }
  },

  clearStatus: () => set({ statusText: 'Ready', statusLevel: 'idle' }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
}))

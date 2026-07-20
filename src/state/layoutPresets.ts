export type LayoutPresetId = 'build' | 'tune' | 'preview'

export const DEFAULT_SIDEBAR_WIDTH = 280
export const DEFAULT_PREVIEW_WIDTH = 496
export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 420
export const MIN_PREVIEW_WIDTH = 320
export const MAX_PREVIEW_WIDTH = 720
export const MIN_CANVAS_WIDTH = 360

export interface LayoutPreset {
  sidebarWidth: number
  previewWidth: number
  sidebarOpen: boolean
  previewPanelOpen: boolean
}

export const LAYOUT_PRESETS: Record<LayoutPresetId, LayoutPreset> = {
  build: { sidebarWidth: 280, previewWidth: 380, sidebarOpen: true, previewPanelOpen: true },
  tune: { sidebarWidth: 220, previewWidth: 460, sidebarOpen: true, previewPanelOpen: true },
  preview: { sidebarWidth: 220, previewWidth: 640, sidebarOpen: false, previewPanelOpen: true },
}

export function clampPanelWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

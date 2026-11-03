import type { WorkspaceMode } from './uiStore'

/** The tab strip and View menu share the same workspace names and order. */
export const WORKSPACE_TABS: readonly { mode: WorkspaceMode; label: string }[] = [
  { mode: 'hardware', label: 'Hardware' },
  { mode: 'graph', label: 'Graph' },
  { mode: 'upload', label: 'Upload' },
  { mode: 'build', label: 'Build Diagram' },
]

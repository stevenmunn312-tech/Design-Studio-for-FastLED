import type { PersistedWorkspace } from './workspacePersistence'

export interface Snapshot {
  id: string
  timestamp: number
  nodeCount: number
  workspace: PersistedWorkspace
}

const SNAPSHOT_KEY = 'design-studio-for-fastled-snapshots'
export const MAX_SNAPSHOTS = 5

export function loadSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Prepend a new snapshot, capped to MAX_SNAPSHOTS. If the full write doesn't
 *  fit in the shared localStorage budget, drop older snapshots until it does
 *  (a rolling safety net degrading gracefully beats throwing it away). */
export function pushSnapshot(workspace: PersistedWorkspace): Snapshot[] {
  const existing = loadSnapshots()
  const snapshot: Snapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    nodeCount: workspace.nodes.length,
    workspace,
  }
  const next = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS)
  for (let keep = next.length; keep > 0; keep--) {
    const attempt = next.slice(0, keep)
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(attempt))
      return attempt
    } catch {
      continue
    }
  }
  return existing
}

export function clearSnapshots() {
  try { localStorage.removeItem(SNAPSHOT_KEY) } catch { /* ignore */ }
}

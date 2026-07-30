import { create } from 'zustand'
import { listProjects, saveProjectToDisk, deleteProjectFromDisk } from '../utils/backendClient'
import type { PersistedWorkspace } from './workspacePersistence'
import { blankWorkspace, cloneWorkspace } from './workspacePersistence'

export interface ProjectUploadTarget {
  selectedFqbn: string
  selectedPort: string
}

export interface SavedProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  workspace: PersistedWorkspace
  uploadTarget?: ProjectUploadTarget
}

interface PersistedState {
  currentProjectId: string
  projects: SavedProject[]
  recentProjectIds: string[]
}

interface PersistedCurrentWorkspace {
  projectId: string
  name?: string
  createdAt?: number
  updatedAt: number
  workspace: PersistedWorkspace
  uploadTarget?: ProjectUploadTarget
}

interface ProjectState {
  projects: SavedProject[]
  currentProjectId: string
  recentProjectIds: string[]
  createProject: (name: string, workspace?: PersistedWorkspace, options?: { uploadTarget?: ProjectUploadTarget }) => SavedProject
  upsertProject: (project: SavedProject) => SavedProject
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => SavedProject | null
  switchProject: (id: string) => SavedProject | null
  saveCurrentWorkspace: (workspace: PersistedWorkspace) => void
  setProjectUploadTarget: (uploadTarget: ProjectUploadTarget, id?: string) => void
  refreshFromDisk: () => Promise<void>
}

const KEY = 'design-studio-for-fastled.projects.v1'
const CURRENT_PROJECT_KEY = 'design-studio-for-fastled.current-project.v1'
const CURRENT_WORKSPACE_KEY = 'design-studio-for-fastled.current-workspace.v1'
const SYNC_KEY = 'design-studio-for-fastled.projects-sync.v1'
const LEGACY_AUTOSAVE_KEY = 'design-studio-for-fastled-graph'
const DISK_SYNC = !import.meta.env.VITEST
const RECENT_PROJECT_LIMIT = 6

// ── Helper sync journal ──────────────────────────────────────────────────────
// Mirrors the pattern library's journal (patternLibrary.ts). Disk is
// authoritative for projects the helper has confirmed it wrote, but a write it
// never acknowledged must not be mistaken for "the user deleted this file" —
// otherwise a browser-only session (helper never installed, every
// `saveProjectToDisk` silently failing) loses every project the first time the
// helper does come online and reports an empty folder.
interface ProjectSyncJournal {
  pendingUpserts: string[]
  pendingDeletes: string[]
}

function loadSyncJournal(): ProjectSyncJournal {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    const parsed = raw ? JSON.parse(raw) as Partial<ProjectSyncJournal> : {}
    const ids = (value: unknown) => Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === 'string' && !!id))]
      : []
    return { pendingUpserts: ids(parsed.pendingUpserts), pendingDeletes: ids(parsed.pendingDeletes) }
  } catch {
    return { pendingUpserts: [], pendingDeletes: [] }
  }
}

function persistSyncJournal(journal: ProjectSyncJournal) {
  try {
    if (journal.pendingUpserts.length === 0 && journal.pendingDeletes.length === 0) {
      localStorage.removeItem(SYNC_KEY)
    } else {
      localStorage.setItem(SYNC_KEY, JSON.stringify(journal))
    }
  } catch {
    // The in-memory project list still works when storage is unavailable.
  }
}

function updateSyncJournal(update: (journal: ProjectSyncJournal) => ProjectSyncJournal) {
  persistSyncJournal(update(loadSyncJournal()))
}

function markPendingUpsert(id: string) {
  updateSyncJournal((journal) => ({
    pendingUpserts: [...new Set([...journal.pendingUpserts, id])],
    pendingDeletes: journal.pendingDeletes.filter((entry) => entry !== id),
  }))
}

function clearPendingUpsert(id: string) {
  updateSyncJournal((journal) => ({
    ...journal,
    pendingUpserts: journal.pendingUpserts.filter((entry) => entry !== id),
  }))
}

function markPendingDelete(id: string) {
  updateSyncJournal((journal) => ({
    pendingUpserts: journal.pendingUpserts.filter((entry) => entry !== id),
    pendingDeletes: [...new Set([...journal.pendingDeletes, id])],
  }))
}

function clearPendingDelete(id: string) {
  updateSyncJournal((journal) => ({
    ...journal,
    pendingDeletes: journal.pendingDeletes.filter((entry) => entry !== id),
  }))
}

/** Write a project to disk, journalling it until the helper acknowledges. */
function queueProjectUpsert(project: SavedProject) {
  if (!DISK_SYNC) return
  markPendingUpsert(project.id)
  void saveProjectToDisk(project).then((saved) => {
    if (saved) clearPendingUpsert(project.id)
  })
}

/** Delete a project's file, journalling it until the helper acknowledges. */
function queueProjectDelete(id: string) {
  if (!DISK_SYNC) return
  markPendingDelete(id)
  void deleteProjectFromDisk(id).then((deleted) => {
    if (deleted) clearPendingDelete(id)
  })
}

function trimName(name: string): string {
  return name.trim().slice(0, 80)
}

function sortProjects(projects: SavedProject[]): SavedProject[] {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
}

function uniqueProjectName(existing: SavedProject[], preferred: string): string {
  const base = trimName(preferred) || 'Untitled Project'
  const used = new Set(existing.map((project) => project.name.toLocaleLowerCase()))
  if (!used.has(base.toLocaleLowerCase())) return base
  let suffix = 2
  for (;;) {
    const candidate = `${base} ${suffix}`
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
    suffix += 1
  }
}

function normalizeUploadTarget(value: unknown): ProjectUploadTarget | undefined {
  if (!value || typeof value !== 'object') return undefined
  const maybe = value as Partial<ProjectUploadTarget>
  return typeof maybe.selectedFqbn === 'string' && typeof maybe.selectedPort === 'string'
    ? { selectedFqbn: maybe.selectedFqbn, selectedPort: maybe.selectedPort }
    : undefined
}

function loadCurrentProjectHint(): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_PROJECT_KEY)
    return raw ? String(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function persistCurrentProjectHint(projectId: string): void {
  try {
    localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(projectId))
  } catch {
    // Keep running when storage is unavailable or full.
  }
}

function loadCurrentWorkspaceSnapshot(): SavedProject | null {
  try {
    const raw = localStorage.getItem(CURRENT_WORKSPACE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedCurrentWorkspace>
    if (typeof parsed?.projectId !== 'string' || typeof parsed?.updatedAt !== 'number') return null
    const workspace = parsed.workspace
    if (!workspace || !Array.isArray(workspace.nodes) || !Array.isArray(workspace.edges)) return null
    return {
      id: parsed.projectId,
      name: typeof parsed.name === 'string' ? (trimName(parsed.name) || 'Recovered Project') : 'Recovered Project',
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : parsed.updatedAt,
      updatedAt: parsed.updatedAt,
      workspace: cloneWorkspace(workspace),
      uploadTarget: normalizeUploadTarget(parsed.uploadTarget),
    }
  } catch {
    return null
  }
}

function persistCurrentWorkspaceSnapshot(project: SavedProject | undefined): void {
  if (!project) {
    // No current project: drop the snapshot too, so a deleted project can't
    // resurrect from it on the next load.
    try {
      localStorage.removeItem(CURRENT_WORKSPACE_KEY)
    } catch {
      // Keep running when storage is unavailable.
    }
    return
  }
  try {
    localStorage.setItem(CURRENT_WORKSPACE_KEY, JSON.stringify({
      projectId: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      workspace: project.workspace,
      uploadTarget: project.uploadTarget,
    }))
  } catch {
    // Keep running when storage is unavailable or full.
  }
}

function sameUploadTarget(a: ProjectUploadTarget | undefined, b: ProjectUploadTarget | undefined): boolean {
  return (a?.selectedFqbn ?? '') === (b?.selectedFqbn ?? '')
    && (a?.selectedPort ?? '') === (b?.selectedPort ?? '')
}

function makeProject(
  name: string,
  workspace: PersistedWorkspace = blankWorkspace(),
  uploadTarget?: ProjectUploadTarget,
): SavedProject {
  const now = Date.now()
  return {
    id: `proj-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimName(name) || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    workspace: cloneWorkspace(workspace),
    uploadTarget: normalizeUploadTarget(uploadTarget),
  }
}

function normalizeProject(project: SavedProject): SavedProject {
  return {
    id: project.id,
    name: trimName(project.name) || 'Untitled Project',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    workspace: cloneWorkspace(project.workspace),
    uploadTarget: normalizeUploadTarget(project.uploadTarget),
  }
}

function sanitizeRecentProjectIds(
  recentProjectIds: readonly string[],
  validIds: Set<string>,
  currentProjectId: string | null,
): string[] {
  const recent: string[] = []
  for (const entry of recentProjectIds) {
    if (entry === currentProjectId) continue
    if (!validIds.has(entry)) continue
    if (recent.includes(entry)) continue
    recent.push(entry)
    if (recent.length >= RECENT_PROJECT_LIMIT) break
  }
  return recent
}

function normalizeRecentProjectIds(
  value: unknown,
  projects: SavedProject[],
  currentProjectId: string | null,
): string[] {
  if (!Array.isArray(value)) return []
  return sanitizeRecentProjectIds(
    value.filter((entry): entry is string => typeof entry === 'string'),
    new Set(projects.map((project) => project.id)),
    currentProjectId,
  )
}

function rememberRecentProject(
  recentProjectIds: string[],
  projectId: string,
  validIds: Set<string>,
  currentProjectId?: string,
): string[] {
  if (!projectId || !validIds.has(projectId)) {
    return sanitizeRecentProjectIds(recentProjectIds, validIds, currentProjectId ?? null)
  }
  const next = sanitizeRecentProjectIds(recentProjectIds, validIds, currentProjectId ?? null)
    .filter((entry) => entry !== projectId)
  return [projectId, ...next].slice(0, RECENT_PROJECT_LIMIT)
}

function buildState(
  projects: SavedProject[],
  currentProjectId: string,
  recentProjectIds: string[],
): PersistedState {
  const validIds = new Set(projects.map((project) => project.id))
  return {
    currentProjectId,
    projects,
    recentProjectIds: sanitizeRecentProjectIds(recentProjectIds, validIds, currentProjectId),
  }
}

/** Disk is authoritative for projects the helper has acknowledged: an entry
 *  missing from the folder is a deletion, not a reason to recreate the file
 *  from browser cache. Projects whose write the helper never acknowledged
 *  (`pendingUpserts` — the whole browser-only case, where the helper was
 *  offline for every save) are the exception: dropping those would silently
 *  destroy work that only ever existed locally. `pendingDeletes` suppresses a
 *  disk entry whose deletion request has not gone through yet, so a slow retry
 *  never resurrects a removed project. */
export function reconcileProjectsFromDisk(
  diskProjects: SavedProject[],
  stateProjects: SavedProject[],
  pendingUpserts: Iterable<string> = [],
  pendingDeletes: Iterable<string> = [],
): { projects: SavedProject[]; projectsToSave: SavedProject[] } {
  const upsertIds = new Set(pendingUpserts)
  const deletedIds = new Set(pendingDeletes)
  const merged = new Map<string, SavedProject>()
  const projectsToSave: SavedProject[] = []
  for (const project of diskProjects) {
    if (deletedIds.has(project.id)) continue
    merged.set(project.id, project)
  }
  for (const project of stateProjects) {
    if (deletedIds.has(project.id)) continue
    const existing = merged.get(project.id)
    if (!existing) {
      // Never written to disk successfully — keep it and retry the write.
      if (upsertIds.has(project.id)) {
        merged.set(project.id, project)
        projectsToSave.push(project)
      }
      continue
    }
    if (project.updatedAt >= existing.updatedAt) {
      merged.set(project.id, project)
      if (project.updatedAt > existing.updatedAt) projectsToSave.push(project)
    }
  }
  return { projects: sortProjects([...merged.values()]), projectsToSave }
}

function normalizeState(parsed: Partial<PersistedState> | null | undefined): PersistedState {
  const currentWorkspace = loadCurrentWorkspaceSnapshot()
  const rawProjects = Array.isArray(parsed?.projects) ? parsed.projects : []
  const projects = rawProjects
    .filter((project): project is SavedProject =>
      !!project
      && typeof project.id === 'string'
      && typeof project.name === 'string'
      && typeof project.createdAt === 'number'
      && typeof project.updatedAt === 'number'
      && !!project.workspace
      && Array.isArray(project.workspace.nodes)
      && Array.isArray(project.workspace.edges))
    .map((project) => ({
      ...project,
      name: trimName(project.name) || 'Untitled Project',
      uploadTarget: normalizeUploadTarget(project.uploadTarget),
    }))
  const sorted = sortProjects(projects)
  const preferredProjectId =
    loadCurrentProjectHint()
    ?? (typeof parsed?.currentProjectId === 'string' ? parsed.currentProjectId : null)
    ?? currentWorkspace?.id
    ?? null
  const projectsWithSnapshot = currentWorkspace
    ? (() => {
        const existing = sorted.find((project) => project.id === currentWorkspace.id)
        if (!existing) return sortProjects([currentWorkspace, ...sorted])
        return sortProjects(sorted.map((project) =>
          project.id === currentWorkspace.id && currentWorkspace.updatedAt >= project.updatedAt
            ? currentWorkspace
            : project))
      })()
    : sorted
  if (projectsWithSnapshot.length === 0) {
    persistCurrentProjectHint('')
    persistCurrentWorkspaceSnapshot(undefined)
    return { currentProjectId: '', projects: [], recentProjectIds: [] }
  }
  const currentProjectId = projectsWithSnapshot.some((project) => project.id === preferredProjectId)
    ? String(preferredProjectId)
    : projectsWithSnapshot[0].id
  const recentProjectIds = normalizeRecentProjectIds(parsed?.recentProjectIds, projectsWithSnapshot, currentProjectId)
  persistCurrentProjectHint(currentProjectId)
  persistCurrentWorkspaceSnapshot(projectsWithSnapshot.find((project) => project.id === currentProjectId))
  return { currentProjectId, projects: projectsWithSnapshot, recentProjectIds }
}

function load(): PersistedState {
  try {
    // The pre-projects single-slot autosave is dead weight: it was only ever
    // read to mint an implicit "Main" project, which kept resurrecting an
    // ancient graph whenever the project blob failed to load. Projects are
    // only ever created by the user now, so drop the stale payload (and
    // reclaim its localStorage quota) permanently.
    localStorage.removeItem(LEGACY_AUTOSAVE_KEY)
  } catch {
    // Keep running when storage is unavailable.
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return normalizeState(undefined)
    return normalizeState(JSON.parse(raw) as Partial<PersistedState>)
  } catch {
    return normalizeState(undefined)
  }
}

function persist(state: PersistedState) {
  persistCurrentProjectHint(state.currentProjectId)
  persistCurrentWorkspaceSnapshot(state.projects.find((project) => project.id === state.currentProjectId))
  try {
    localStorage.setItem(KEY, JSON.stringify({
      currentProjectId: state.currentProjectId,
      projects: state.projects,
      recentProjectIds: state.recentProjectIds,
    }))
  } catch {
    // Keep the in-memory copy when storage is unavailable or full.
  }
}

const initial = load()

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: initial.projects,
  currentProjectId: initial.currentProjectId,
  recentProjectIds: initial.recentProjectIds,

  createProject: (name, workspace = blankWorkspace(), options) => {
    const state = get()
    const project = makeProject(uniqueProjectName(state.projects, name), workspace, options?.uploadTarget)
    const projects = sortProjects([project, ...state.projects])
    const next = buildState(
      projects,
      project.id,
      state.currentProjectId
        ? rememberRecentProject(state.recentProjectIds, state.currentProjectId, new Set(projects.map((entry) => entry.id)), project.id)
        : state.recentProjectIds,
    )
    persist(next)
    set(next)
    queueProjectUpsert(project)
    return project
  },

  upsertProject: (project) => {
    const state = get()
    const normalized = normalizeProject(project)
    const projects = sortProjects([
      normalized,
      ...state.projects.filter((entry) => entry.id !== normalized.id),
    ])
    const validIds = new Set(projects.map((entry) => entry.id))
    const recentProjectIds = state.currentProjectId && state.currentProjectId !== normalized.id
      ? rememberRecentProject(state.recentProjectIds, state.currentProjectId, validIds, normalized.id)
      : normalizeRecentProjectIds(state.recentProjectIds, projects, normalized.id)
    const next = buildState(projects, normalized.id, recentProjectIds)
    persist(next)
    set(next)
    queueProjectUpsert(normalized)
    return normalized
  },

  renameProject: (id, name) => {
    const nextName = trimName(name)
    if (!nextName) return
    const state = get()
    const projects = state.projects.map((project) =>
      project.id === id ? { ...project, name: nextName, updatedAt: Date.now() } : project)
    const next = buildState(sortProjects(projects), state.currentProjectId, state.recentProjectIds)
    persist(next)
    set(next)
    const renamed = next.projects.find((project) => project.id === id)
    if (renamed) queueProjectUpsert(renamed)
  },

  deleteProject: (id) => {
    const state = get()
    const projects = sortProjects(state.projects.filter((project) => project.id !== id))
    const currentProjectId = state.currentProjectId === id
      ? (projects[0]?.id ?? '')
      : state.currentProjectId
    const next = buildState(projects, currentProjectId, state.recentProjectIds.filter((entry) => entry !== id))
    persist(next)
    set(next)
    queueProjectDelete(id)
    return next.projects.find((project) => project.id === next.currentProjectId) ?? null
  },

  switchProject: (id) => {
    const state = get()
    const project = state.projects.find((entry) => entry.id === id) ?? null
    if (!project) return null
    const validIds = new Set(state.projects.map((entry) => entry.id))
    const recentProjectIds = state.currentProjectId && state.currentProjectId !== id
      ? rememberRecentProject(state.recentProjectIds, state.currentProjectId, validIds, id)
      : normalizeRecentProjectIds(state.recentProjectIds, state.projects, id)
    const next = buildState(state.projects, id, recentProjectIds)
    persist(next)
    set({ currentProjectId: id, recentProjectIds: next.recentProjectIds })
    return project
  },

  saveCurrentWorkspace: (workspace) => {
    const state = get()
    const now = Date.now()
    const snapshot = cloneWorkspace(workspace)
    const projects = state.projects.map((project) =>
      project.id === state.currentProjectId ? { ...project, workspace: snapshot, updatedAt: now } : project)
    const next = buildState(sortProjects(projects), state.currentProjectId, state.recentProjectIds)
    persist(next)
    set({ projects: next.projects })
    const current = next.projects.find((project) => project.id === next.currentProjectId)
    if (current) queueProjectUpsert(current)
  },

  setProjectUploadTarget: (uploadTarget, id) => {
    const state = get()
    const projectId = id ?? state.currentProjectId
    const current = state.projects.find((project) => project.id === projectId)
    const normalized = normalizeUploadTarget(uploadTarget)
    if (!current || sameUploadTarget(current.uploadTarget, normalized)) return
    const now = Date.now()
    const projects = state.projects.map((project) =>
      project.id === projectId ? { ...project, uploadTarget: normalized, updatedAt: now } : project)
    const next = buildState(sortProjects(projects), state.currentProjectId, state.recentProjectIds)
    persist(next)
    set({ projects: next.projects })
    const updated = next.projects.find((project) => project.id === projectId)
    if (updated) queueProjectUpsert(updated)
  },

  refreshFromDisk: async () => {
    if (!DISK_SYNC) return
    const disk = await listProjects()
    if (!disk) return  // helper offline — keep the localStorage copy as-is

    // Replay unacknowledged deletions first, and filter the already-fetched
    // snapshot regardless of whether the retry succeeded, so a slow or failing
    // request never resurrects a project the user removed.
    const deleteIds = loadSyncJournal().pendingDeletes
    for (const id of deleteIds) {
      if (await deleteProjectFromDisk(id)) clearPendingDelete(id)
    }
    let nextDisk = disk.filter((project) => !deleteIds.includes(project.id))

    // Retry unacknowledged writes, so a session that only ever ran without the
    // helper lands its projects on disk the first time one is available. A
    // successful retry has to be folded into the snapshot by hand — `disk` was
    // fetched before the write, so reconcile would otherwise see the project
    // as absent from disk with its journal entry already cleared.
    for (const id of loadSyncJournal().pendingUpserts) {
      const project = get().projects.find((entry) => entry.id === id)
      if (!project) {
        clearPendingUpsert(id)
        continue
      }
      if (await saveProjectToDisk(project)) {
        clearPendingUpsert(id)
        nextDisk = [...nextDisk.filter((entry) => entry.id !== id), project]
      }
    }

    // Re-read: an autosave may have landed while the retries were in flight.
    const state = get()
    const journal = loadSyncJournal()
    const { projects, projectsToSave } = reconcileProjectsFromDisk(
      nextDisk,
      state.projects,
      journal.pendingUpserts,
      [...deleteIds, ...journal.pendingDeletes],
    )
    const preferredProjectId = loadCurrentProjectHint() ?? state.currentProjectId
    const currentProjectId = projects.some((project) => project.id === preferredProjectId)
      ? preferredProjectId
      : (projects[0]?.id ?? '')
    const next = buildState(projects, currentProjectId, state.recentProjectIds)
    persist(next)
    set(next)
    for (const project of projectsToSave) queueProjectUpsert(project)
  },
}))

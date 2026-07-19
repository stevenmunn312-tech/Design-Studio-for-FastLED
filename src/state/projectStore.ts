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
const LEGACY_AUTOSAVE_KEY = 'design-studio-for-fastled-graph'
const DISK_SYNC = !import.meta.env.VITEST
const RECENT_PROJECT_LIMIT = 6

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

export function reconcileProjectsFromDisk(
  diskProjects: SavedProject[],
  stateProjects: SavedProject[],
): { projects: SavedProject[]; projectsToSave: SavedProject[] } {
  const merged = new Map<string, SavedProject>()
  const projectsToSave: SavedProject[] = []
  for (const project of diskProjects) merged.set(project.id, project)
  for (const project of stateProjects) {
    const existing = merged.get(project.id)
    if (!existing) {
      // If the file is gone from disk, treat that as an intentional delete
      // instead of silently recreating it from stale in-memory state.
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
    if (DISK_SYNC) void saveProjectToDisk(project)
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
    if (DISK_SYNC) void saveProjectToDisk(normalized)
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
    if (DISK_SYNC && renamed) void saveProjectToDisk(renamed)
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
    if (DISK_SYNC) void deleteProjectFromDisk(id)
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
    if (DISK_SYNC && current) void saveProjectToDisk(current)
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
    if (DISK_SYNC && updated) void saveProjectToDisk(updated)
  },

  refreshFromDisk: async () => {
    if (!DISK_SYNC) return
    const disk = await listProjects()
    if (!disk) return
    const state = get()
    const { projects, projectsToSave } = reconcileProjectsFromDisk(disk, state.projects)
    const preferredProjectId = loadCurrentProjectHint() ?? state.currentProjectId
    const currentProjectId = projects.some((project) => project.id === preferredProjectId)
      ? preferredProjectId
      : (projects[0]?.id ?? '')
    const next = buildState(projects, currentProjectId, state.recentProjectIds)
    persist(next)
    set(next)
    for (const project of projectsToSave) void saveProjectToDisk(project)
  },
}))

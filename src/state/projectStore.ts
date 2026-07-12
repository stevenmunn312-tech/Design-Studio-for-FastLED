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
}

interface PersistedCurrentWorkspace {
  projectId: string
  updatedAt: number
  workspace: PersistedWorkspace
}

interface ProjectState {
  projects: SavedProject[]
  currentProjectId: string
  createProject: (name: string, workspace?: PersistedWorkspace, options?: { uploadTarget?: ProjectUploadTarget }) => SavedProject
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => SavedProject
  switchProject: (id: string) => SavedProject | null
  saveCurrentWorkspace: (workspace: PersistedWorkspace) => void
  setProjectUploadTarget: (uploadTarget: ProjectUploadTarget, id?: string) => void
  refreshFromDisk: () => Promise<void>
}

const KEY = 'fastled-studio.projects.v1'
const CURRENT_PROJECT_KEY = 'fastled-studio.current-project.v1'
const CURRENT_WORKSPACE_KEY = 'fastled-studio.current-workspace.v1'
const LEGACY_AUTOSAVE_KEY = 'fastled-studio-graph'
const DISK_SYNC = !import.meta.env.VITEST

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

function loadCurrentWorkspaceSnapshot(): PersistedCurrentWorkspace | null {
  try {
    const raw = localStorage.getItem(CURRENT_WORKSPACE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedCurrentWorkspace>
    if (typeof parsed?.projectId !== 'string' || typeof parsed?.updatedAt !== 'number') return null
    const workspace = parsed.workspace
    if (!workspace || !Array.isArray(workspace.nodes) || !Array.isArray(workspace.edges)) return null
    return {
      projectId: parsed.projectId,
      updatedAt: parsed.updatedAt,
      workspace: cloneWorkspace(workspace),
    }
  } catch {
    return null
  }
}

function persistCurrentWorkspaceSnapshot(project: SavedProject | undefined): void {
  if (!project) return
  try {
    localStorage.setItem(CURRENT_WORKSPACE_KEY, JSON.stringify({
      projectId: project.id,
      updatedAt: project.updatedAt,
      workspace: project.workspace,
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

function migrateLegacyAutosave(): PersistedState {
  const fallback = makeProject('Main')
  try {
    const raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY)
    if (!raw) return { currentProjectId: fallback.id, projects: [fallback] }
    const parsed = JSON.parse(raw) as PersistedWorkspace
    return {
      currentProjectId: fallback.id,
      projects: [{ ...fallback, workspace: parsed }],
    }
  } catch {
    return { currentProjectId: fallback.id, projects: [fallback] }
  }
}

function normalizeState(parsed: Partial<PersistedState> | null | undefined): PersistedState {
  const fallback = migrateLegacyAutosave()
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
  if (projects.length === 0) return fallback
  const sorted = sortProjects(projects)
  const preferredProjectId = loadCurrentProjectHint() ?? (typeof parsed?.currentProjectId === 'string' ? parsed.currentProjectId : null)
  const currentProjectId = sorted.some((project) => project.id === preferredProjectId)
    ? String(preferredProjectId)
    : sorted[0].id
  const currentWorkspace = loadCurrentWorkspaceSnapshot()
  const projectsWithSnapshot = currentWorkspace
    ? sorted.map((project) =>
        project.id === currentWorkspace.projectId && currentWorkspace.updatedAt >= project.updatedAt
          ? { ...project, updatedAt: currentWorkspace.updatedAt, workspace: currentWorkspace.workspace }
          : project)
    : sorted
  persistCurrentProjectHint(currentProjectId)
  return { currentProjectId, projects: sortProjects(projectsWithSnapshot) }
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      const migrated = migrateLegacyAutosave()
      persistCurrentProjectHint(migrated.currentProjectId)
      return migrated
    }
    return normalizeState(JSON.parse(raw) as Partial<PersistedState>)
  } catch {
    const migrated = migrateLegacyAutosave()
    persistCurrentProjectHint(migrated.currentProjectId)
    return migrated
  }
}

function persist(state: PersistedState) {
  persistCurrentProjectHint(state.currentProjectId)
  persistCurrentWorkspaceSnapshot(state.projects.find((project) => project.id === state.currentProjectId))
  try {
    localStorage.setItem(KEY, JSON.stringify({
      currentProjectId: state.currentProjectId,
      projects: state.projects,
    }))
  } catch {
    // Keep the in-memory copy when storage is unavailable or full.
  }
}

const initial = load()

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: initial.projects,
  currentProjectId: initial.currentProjectId,

  createProject: (name, workspace = blankWorkspace(), options) => {
    const state = get()
    const project = makeProject(uniqueProjectName(state.projects, name), workspace, options?.uploadTarget)
    const projects = sortProjects([project, ...state.projects])
    const next = { currentProjectId: project.id, projects }
    persist(next)
    set(next)
    if (DISK_SYNC) void saveProjectToDisk(project)
    return project
  },

  renameProject: (id, name) => {
    const nextName = trimName(name)
    if (!nextName) return
    const state = get()
    const projects = state.projects.map((project) =>
      project.id === id ? { ...project, name: nextName, updatedAt: Date.now() } : project)
    const next = { currentProjectId: state.currentProjectId, projects: sortProjects(projects) }
    persist(next)
    set(next)
    const renamed = next.projects.find((project) => project.id === id)
    if (DISK_SYNC && renamed) void saveProjectToDisk(renamed)
  },

  deleteProject: (id) => {
    const state = get()
    const remaining = state.projects.filter((project) => project.id !== id)
    let projects = remaining
    let currentProjectId = state.currentProjectId
    if (projects.length === 0) {
      const replacement = makeProject('Main')
      projects = [replacement]
      currentProjectId = replacement.id
      if (DISK_SYNC) void saveProjectToDisk(replacement)
    } else if (currentProjectId === id) {
      currentProjectId = sortProjects(projects)[0].id
    }
    const next = { currentProjectId, projects: sortProjects(projects) }
    persist(next)
    set(next)
    if (DISK_SYNC) void deleteProjectFromDisk(id)
    return next.projects.find((project) => project.id === next.currentProjectId) ?? next.projects[0]
  },

  switchProject: (id) => {
    const project = get().projects.find((entry) => entry.id === id) ?? null
    if (!project) return null
    const next = { currentProjectId: id, projects: get().projects }
    persist(next)
    set({ currentProjectId: id })
    return project
  },

  saveCurrentWorkspace: (workspace) => {
    const state = get()
    const now = Date.now()
    const snapshot = cloneWorkspace(workspace)
    const projects = state.projects.map((project) =>
      project.id === state.currentProjectId ? { ...project, workspace: snapshot, updatedAt: now } : project)
    const next = { currentProjectId: state.currentProjectId, projects: sortProjects(projects) }
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
    const next = { currentProjectId: state.currentProjectId, projects: sortProjects(projects) }
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
    const merged = new Map<string, SavedProject>()
    for (const project of disk) merged.set(project.id, project)
    for (const project of state.projects) {
      const existing = merged.get(project.id)
      if (!existing) {
        merged.set(project.id, project)
        void saveProjectToDisk(project)
        continue
      }
      if (project.updatedAt >= existing.updatedAt) {
        merged.set(project.id, project)
        if (project.updatedAt > existing.updatedAt) void saveProjectToDisk(project)
      }
    }
    const projects = sortProjects([...merged.values()])
    const fallback = projects[0] ?? makeProject('Main')
    const preferredProjectId = loadCurrentProjectHint() ?? state.currentProjectId
    const currentProjectId = projects.some((project) => project.id === preferredProjectId)
      ? preferredProjectId
      : fallback.id
    const next = { currentProjectId, projects: projects.length ? projects : [fallback] }
    persist(next)
    set(next)
  },
}))
